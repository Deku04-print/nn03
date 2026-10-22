'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function client() {
    const mod = { exports: {} };
    const vscode = { workspace: { getConfiguration: () => ({ get: () => 'http://localhost:8000' }) }, window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/api/worklensApi.js'), 'utf8'), {
        module: mod, require: name => name === 'vscode' ? vscode : require(name),
        setTimeout, clearTimeout, Buffer,
    });
    const secrets = new Map([['worklens.jwt.access', 'stored-access']]);
    return new mod.exports.WorklensApi({ secrets: { get: async k => secrets.get(k), store: async (k, v) => secrets.set(k, v), delete: async k => secrets.delete(k) } });
}
test('troubleshooting carries context and response IDs; late results cannot replace a new conversation', async () => {
    const api = client(); api.resumeSession('session-1', 'problem-1');
    let complete;
    api._fetchWithTimeout = async (url, opts) => {
        const body = JSON.parse(opts.body);
        assert.equal(body.problem_id, 'problem-1'); assert.equal(body.session_id, 'session-1');
        assert.match(body.client_turn_id, /^[a-f0-9-]{36}$/);
        assert.equal(opts.headers.Authorization, 'Bearer stored-access');
        return new Promise(resolve => { complete = () => resolve({ ok: true, json: async () => ({ success: true, problem_id: 'problem-1', session_id: 'session-1', response: {} }) }); });
    };
    const promise = api.send('hint', {});
    await new Promise(resolve => setImmediate(resolve));
    api.resetSession(); complete();
    await assert.rejects(promise, e => e.staleConversation === true);
    assert.equal(api._problemId, null);
});
test('existing autonomous generators retain authenticated access after backend hardening', async () => {
    const api = client(); const urls = [];
    api._fetchWithTimeout = async (url, opts) => {
        assert.equal(opts.headers.Authorization, 'Bearer stored-access'); urls.push(url);
        return { ok: true, status: 200, json: async () => ({ success: true }) };
    };
    await api.generateDocs({}); await api.generateTests({}); await api.generateInfra({}); await api.generateCommand({});
    assert.equal(urls.length, 4);
});
