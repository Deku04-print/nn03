'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { eligible, explicitHumanHelp } = require('../media/assistance');

test('threshold uses backend successful-response count and requires problem/context IDs', () => {
    for (let count = 0; count < 6; count++) {
        assert.equal(eligible({ problem_id: 'p', problem_context_id: 'c', human_api_suggested: count >= 4 }, ''), count >= 4);
    }
    assert.equal(eligible({ human_api_suggested: true }, ''), false);
    assert.equal(eligible({ problem_id: 'p', problem_context_id: 'c' }, 'I want human help'), true);
    assert.equal(explicitHumanHelp('Can I speak to an expert?'), true);
    assert.equal(explicitHumanHelp('Explain useState'), false);
});

class Element {
    constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.textContent = ''; this.className = ''; this.disabled = false;
        this.classList = { toggle: (key, yes) => { this.attributes[key] = yes ?? !this.attributes[key]; }, add: key => { this.attributes[key] = true; }, contains: key => !!this.attributes[key] }; }
    append(...elements) { this.children.push(...elements); }
    after(element) { this.sibling = element; }
    replaceChildren(...elements) { this.children = elements; this.textContent = ''; }
    remove() { this.removed = true; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.events[key] = fn; }
    click() { this.events.click?.(); }
    querySelectorAll(selector) { return this.children.filter(e => selector === 'button' ? e.tag === 'button' : false); }
    querySelector(selector) { return this.children.find(e => selector === '[role=status]' && e.attributes.role === 'status'); }
}
function harness() {
    const elements = Object.fromEntries(['wl-notification-bell', 'wl-notification-badge', 'wl-notification-menu', 'wl-conversation'].map(id => [id, new Element()]));
    const handlers = [], sent = [];
    const document = { createElement: tag => { const el = new Element(); el.tag = tag; return el; }, getElementById: id => elements[id] };
    const window = { document, addEventListener: (event, fn) => { if (event === 'message') handlers.push(fn); }, dispatchEvent() {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../media/assistance.js'), 'utf8'), { window, document, Event: class {} });
    const ui = window.createAssistanceUI({ postMessage: msg => sent.push(JSON.parse(JSON.stringify(msg))) });
    return { ui, elements, sent, emit: data => handlers.forEach(fn => fn({ data })) };
}

test('one CTA per problem and button sends the exact originating problem', () => {
    const { ui, elements, sent } = harness();
    const data = { problem_id: 'problem-1', problem_context_id: 'context-1', human_api_suggested: true };
    ui.showCTA(data, ''); const cta = elements['wl-conversation'].sibling;
    ui.showCTA(data, ''); assert.equal(elements['wl-conversation'].sibling, cta);
    cta.children[1].click(); assert.deepEqual(sent[0], { type: 'open_human_api', problem_id: 'problem-1' });
    ui.showCTA({ problem_id: 'problem-2', problem_context_id: 'context-2' }, ''); assert.equal(cta.removed, true);
    ui.reset(); ui.showCTA(data, ''); assert.notEqual(elements['wl-conversation'].sibling, cta);
});

test('feedback controls align separately, deduplicate pending clicks, and show real failure/success', () => {
    const { ui, sent, emit } = harness();
    const body = new Element(), response = { _nexusResponseId: 'response-1' };
    ui.feedback(body, response);
    const row = body.children[0]; assert.equal(row.className, 'wl-ai-feedback');
    const [up, down, label] = row.children;
    up.click(); down.click(); assert.equal(sent.length, 1); assert.equal(up.disabled, true);
    emit({ type: 'ai_feedback_result', response_id: 'response-1', error: 'Network failed' });
    assert.equal(label.textContent, 'Network failed'); assert.equal(up.attributes['aria-pressed'], 'false');
    down.click(); assert.equal(sent.length, 2);
    emit({ type: 'ai_feedback_result', response_id: 'response-1', value: -1 });
    assert.equal(down.attributes['aria-pressed'], 'true'); assert.equal(response._nexusFeedback, -1);
    down.click(); assert.equal(sent.length, 2);
});

test('notification bell badge reflects only supplied current-user records and clears on logout', () => {
    const { emit, elements, sent } = harness();
    emit({ type: 'assistance_notifications', unread_count: 1, notifications: [{ id: 'mine', title: 'Request waiting', read_at: null }] });
    assert.equal(elements['wl-notification-badge'].textContent, 1);
    elements['wl-notification-menu'].children[0].children[0].click();
    assert.deepEqual(sent[0], { type: 'open_human_api', notification_id: 'mine' });
    emit({ type: 'auth_status', signedIn: false });
    assert.equal(elements['wl-notification-menu'].children.length, 0);
    assert.equal(elements['wl-notification-badge'].attributes['wl-hidden'], true);
});

test('every extension image/script asset exists and no missing PNG references remain', () => {
    const root = path.join(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(fs.existsSync(path.join(root, manifest.icon)), true);
    for (const asset of ['worklens-icon.svg', 'nexus-placeholder.svg', 'worklens.js', 'assistance.js', 'worklens.css']) assert.equal(fs.existsSync(path.join(root, 'media', asset)), true);
    const panel = fs.readFileSync(path.join(root, 'src/ui/worklensPanel.js'), 'utf8');
    assert.equal(/logo1\.png|name_tag\.png/.test(panel), false);
});

test('all local extension require imports resolve, including command activation dependencies', () => {
    const root = path.join(__dirname, '..');
    function inspect(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules') continue;
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) inspect(file);
            else if (file.endsWith('.js')) {
                const text = fs.readFileSync(file, 'utf8');
                for (const [, ref] of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
                    const target = path.resolve(path.dirname(file), ref);
                    assert.ok([target, target + '.js', target + '.json', path.join(target, 'index.js')].some(p => fs.existsSync(p)), `${file}: missing ${ref}`);
                }
            }
        }
    }
    inspect(root);
});
