// Account-scoped, local notification history. Source unread counts stay authoritative.
const tr = (fr, en) => document.documentElement.lang === 'en' ? en : fr;
const account = () => window.JAJSession?.type === 'user' ? window.JAJSession.id : 'guest';
let owner = account(), entries = [], seen = {}, counts = { mail: 0, myspace: 0, friends: 0 };
const key = () => `aq_notifications_v1:${owner}`;
function restore() {
    try { const data = JSON.parse(localStorage.getItem(key()) || '{}'); entries = Array.isArray(data.entries) ? data.entries.slice(0, 200) : []; seen = data.seen || {}; }
    catch { entries = []; seen = {}; }
}
function save() {
    try { localStorage.setItem(key(), JSON.stringify({ entries: entries.slice(0, 200), seen })); } catch { /* History remains usable when storage is full. */ }
    render();
}
function push(item, persist = true) {
    if (!item.id || seen[item.id]) return false;
    seen[item.id] = Date.now();
    entries.unshift({ ...item, at: Date.now(), read: false });
    entries = entries.slice(0, 200);
    if (persist) save();
    return true;
}
function reconcile(source, items) {
    if (owner === 'guest') return;
    const count = items.reduce((n, item) => n + (item.count || 1), 0);
    let changed = counts[source] !== count;
    counts[source] = count;
    const ids = new Set(items.map(item => item.id));
    entries.forEach(item => { if (item.source === source && !ids.has(item.id) && !item.read) { item.read = true; changed = true; } });
    items.forEach(item => { if (push({ ...item, source }, false)) changed = true; });
    if (changed) save();
}
const button = document.createElement('button');
button.id = 'tray-notifications-btn';
button.className = 'tray-icon';
button.type = 'button';
button.setAttribute('aria-controls', 'aq-notifications');
button.setAttribute('aria-expanded', 'false');
document.getElementById('tray-icons').prepend(button);
const mobileButton = button.cloneNode();
mobileButton.id = 'mobile-notifications-btn';
mobileButton.className = 'retro-btn';
document.body.append(mobileButton);
const panel = document.createElement('section');
panel.id = 'aq-notifications';
panel.hidden = true;
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-label', 'Notifications AQ-NEO');
document.body.append(panel);
let opener = button;
function close() { panel.hidden = true; [button, mobileButton].forEach(node => node.setAttribute('aria-expanded', 'false')); }
[button, mobileButton].forEach(node => node.addEventListener('click', () => { opener = node; panel.hidden = !panel.hidden; [button, mobileButton].forEach(btn => btn.setAttribute('aria-expanded', String(!panel.hidden))); if (!panel.hidden) panel.querySelector('button')?.focus(); }));
document.addEventListener('click', event => { if (![panel, button, mobileButton].some(node => event.composedPath().includes(node))) close(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { close(); opener.focus(); } });
function el(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function action(text, callback) { const node = el('button', text, 'retro-btn'); node.type = 'button'; node.addEventListener('click', callback); return node; }
function badge(selector, count) {
    document.querySelectorAll(selector).forEach(target => {
        let node = target.querySelector('.aq-app-badge');
        if (!node) { node = el('span', '', 'aq-app-badge'); target.append(node); }
        node.textContent = count > 99 ? '99+' : String(count); node.hidden = !count;
    });
}
async function open(item) {
    item.read = true; save(); close();
    if (item.source === 'mail' || item.source === 'friends') {
        window.openWindow?.('win-mail', 'task-mail');
        await window.AQMail?.open?.(item.target);
    } else if (item.source === 'myspace') {
        window.dispatchEvent(new CustomEvent('aq:notification-messages', { detail: item.target }));
    } else if (item.source === 'updates') window.AQUpdate?.open();
    else if (item.source === 'publisher') window.openWindow?.('win-publisher', 'task-publisher');
}
function render() {
    const unread = entries.filter(item => !item.read).length;
    button.textContent = `▣ ${unread > 99 ? '99+' : unread}`;
    button.title = tr('Centre de notifications', 'Notification center');
    button.setAttribute('aria-label', `${button.title} (${unread})`);
    mobileButton.textContent = button.textContent;
    mobileButton.title = button.title;
    mobileButton.setAttribute('aria-label', button.getAttribute('aria-label'));
    badge('[data-desktop-icon="mail"], #task-mail', counts.mail + counts.friends);
    badge('[data-desktop-icon="myspace"], #task-myspace', counts.myspace + counts.friends);
    panel.replaceChildren();
    const head = el('div', '', 'title-bar');
    head.append(el('strong', tr('Centre de notifications', 'Notification center')), action('×', () => { close(); opener.focus(); }));
    const toolbar = el('div', '', 'aq-notification-toolbar');
    toolbar.append(action(tr('Tout marquer comme lu', 'Mark all as read'), () => { entries.forEach(item => { item.read = true; }); save(); }), action(tr('Vider l’historique', 'Clear history'), () => { entries = []; save(); }));
    panel.append(head, el('p', `AQ-Mail: ${counts.mail} · MySpace: ${counts.myspace} · ${tr('Amis', 'Friends')}: ${counts.friends}`, 'aq-notification-counts'), toolbar);
    const list = el('div', '', 'aq-notification-list');
    if (!entries.length) list.append(el('p', tr('Aucune notification. Tout est calme sur AQ-NEO.', 'No notifications. All quiet on AQ-NEO.')));
    entries.forEach(item => {
        const row = el('article', '', `aq-notification${item.read ? '' : ' unread'}`);
        const link = action('', () => void open(item));
        link.className = 'aq-notification-open';
        link.append(el('strong', item.title), el('span', item.body), el('small', new Date(item.at).toLocaleString(document.documentElement.lang || 'fr')));
        row.append(link);
        if (!item.read) row.append(action(tr('Lu', 'Read'), () => { item.read = true; save(); }));
        list.append(row);
    });
    panel.append(list, el('small', tr('Historique local · Les badges des apps comptent les éléments non lus.', 'Local history · App badges count unread items.'), 'aq-notification-footer'));
}
restore(); render();
window.AQNotifications = { push, reconcile, getState: () => ({ owner, entries: structuredClone(entries), counts: { ...counts } }) };
window.addEventListener('jaj:session-changed', () => {
    if (owner === account()) return;
    owner = account(); counts = { mail: 0, myspace: 0, friends: 0 }; restore(); close(); render();
});
window.addEventListener('storage', event => { if (event.key === key()) { restore(); render(); } });
window.addEventListener('aq:language-changed', render);
