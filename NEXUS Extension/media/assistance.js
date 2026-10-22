(function (root) {
    'use strict';
    const explicitHumanHelp = text => /\b(human|expert|colleague)\b.{0,30}\b(help|assist|support|please)\b|\b(talk|speak|connect|escalate)\b.{0,30}\b(human|expert|person)\b|\b(human help|human api)\b/i.test(text || '');
    function eligible(data, text) {
        return !!(data?.problem_id && data?.problem_context_id && (data.human_api_suggested || explicitHumanHelp(text)));
    }
    if (typeof module !== 'undefined') module.exports = { eligible, explicitHumanHelp };
    if (!root.document) return;
    root.createAssistanceUI = function (vscode) {
        let context = null, cta = null, notifications = [], busy = false;
        const bell = document.getElementById('wl-notification-bell');
        const badge = document.getElementById('wl-notification-badge');
        const menu = document.getElementById('wl-notification-menu');
        const feedbackRows = new Map();
        function showCTA(data, text) {
            if (context && data?.problem_id !== context.problem_id) { cta?.remove(); cta = null; }
            context = data;
            if (!eligible(data, text) || cta) return;
            cta = document.createElement('div'); cta.className = 'wl-human-cta';
            const note = document.createElement('span'); note.textContent = 'Need another perspective?';
            const button = document.createElement('button'); button.textContent = 'Human API'; button.type = 'button';
            button.addEventListener('click', () => vscode.postMessage({ type: 'open_human_api', problem_id: context.problem_id }));
            cta.append(note, button);
            document.getElementById('wl-conversation')?.after(cta);
        }
        function feedback(body, response) {
            const id = response._nexusResponseId;
            if (!id) return;
            const row = document.createElement('div'); row.className = 'wl-ai-feedback';
            row.dataset.responseId = id;
            row.dataset.selected = String(response._nexusFeedback || 0);
            const label = document.createElement('span'); label.setAttribute('role', 'status');
            [1, -1].forEach(value => {
                const button = document.createElement('button'); button.type = 'button';
                button.title = value === 1 ? 'Helpful response' : 'Unhelpful response';
                button.setAttribute('aria-label', button.title); button.setAttribute('aria-pressed', String(response._nexusFeedback === value));
                button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ${value === -1 ? 'style="transform:rotate(180deg)"' : ''}><path d="M7 10v11H3V10h4Zm0 0 5-8c2 0 3 2 2 5l-1 3h6c2 0 2 2 2 3l-2 7c0 1-1 1-2 1H7"/></svg>`;
                button.dataset.value = String(value);
                button.addEventListener('click', () => {
                    if (row.dataset.pending === 'true' || row.dataset.selected === String(value)) return;
                    row.dataset.pending = 'true'; label.textContent = 'Saving…'; row.querySelectorAll('button').forEach(b => b.disabled = true);
                    vscode.postMessage({ type: 'ai_feedback', response_id: id, value });
                }); row.append(button);
            });
            row.append(label); body.append(row);
            const list = feedbackRows.get(id) || []; list.push({ row, response }); feedbackRows.set(id, list);
        }
        function renderNotifications() {
            menu.replaceChildren();
            if (!notifications.length) { menu.textContent = 'No notifications yet.'; return; }
            notifications.forEach(n => {
                const item = document.createElement('div'); item.className = 'wl-notification-row';
                const button = document.createElement('button'); button.textContent = `${n.read_at ? '' : '● '}${n.title}`;
                button.addEventListener('click', () => { menu.classList.add('wl-hidden'); vscode.postMessage({ type: 'open_human_api', notification_id: n.id }); });
                item.append(button);
                if (!n.read_at) {
                    const read = document.createElement('button'); read.textContent = 'Mark read'; read.addEventListener('click', () => vscode.postMessage({ type: 'read_notification', id: n.id })); item.append(read);
                }
                menu.append(item);
            });
        }
        bell?.addEventListener('click', () => {
            menu.classList.toggle('wl-hidden'); bell.setAttribute('aria-expanded', String(!menu.classList.contains('wl-hidden')));
            vscode.postMessage({ type: 'load_notifications' });
        });
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'ai_feedback_result') {
                (feedbackRows.get(msg.response_id) || []).forEach(({ row, response }) => {
                    row.dataset.pending = 'false'; row.querySelectorAll('button').forEach(b => b.disabled = false);
                    row.querySelector('[role=status]').textContent = msg.error || 'Saved';
                    if (!msg.error) { row.dataset.selected = String(msg.value); response._nexusFeedback = msg.value; row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.value) === msg.value))); }
                });
                if (!msg.error) window.dispatchEvent(new Event('nexus-feedback-saved'));
            } else if (msg.type === 'assistance_notifications') {
                notifications = msg.notifications || []; badge.textContent = msg.unread_count || ''; badge.classList.toggle('wl-hidden', !msg.unread_count); renderNotifications();
            } else if (msg.type === 'assistance_notifications_error') {
                menu.textContent = `Notifications unavailable: ${msg.message}. Reopen to retry.`;
            } else if (msg.type === 'auth_status') {
                if (msg.signedIn) vscode.postMessage({ type: 'load_notifications' });
                else { notifications = []; badge.classList.add('wl-hidden'); menu.classList.add('wl-hidden'); menu.replaceChildren(); }
            }
        });
        return { feedback, showCTA, explicitHumanHelp,
            reset() { cta?.remove(); cta = null; context = null; feedbackRows.clear(); },
            explicit(text) { if (context && explicitHumanHelp(text)) showCTA({ ...context, human_api_suggested: true }, text); },
        };
    };
})(typeof window === 'undefined' ? globalThis : window);
