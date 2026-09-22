import AQCatalog from './catalog.js';

const MYSPACE_API = '/api/myspace';

const ms = {
    session: window.JAJSession || null,
    tab: 'feed',
    profileUserId: null,
    topicId: null,
    chatPeerId: null,
    chatContacts: [],
    chatClient: null,
    chatChannel: null,
    chatTokenRefreshTimer: null,
    selfAvatarData: '',
    unreadCount: 0,
    unreadBySender: {},
    presenceTimer: null,
    socialPollTimer: null,
    friendRequestsInitialized: false,
    knownFriendRequestIds: new Set(),
    notificationTimer: null,
    viewEpoch: 0,
    loadedOnce: false
};

const root = document.getElementById('myspace-root');
const content = document.getElementById('myspace-content');
const statusEl = document.getElementById('myspace-status');
const sessionPill = document.getElementById('myspace-session-pill');
const selfName = document.getElementById('myspace-self-name');
const selfMail = document.getElementById('myspace-self-mail');
const selfAvatar = document.getElementById('myspace-self-avatar');
const selfRoles = document.getElementById('myspace-self-roles');

function isEnglish() {
    return document.documentElement.lang === 'en';
}

function tr(fr, en) {
    return isEnglish() ? en : fr;
}

function applyMySpaceLanguage() {
    const title = document.querySelector('#win-myspace .title-bar > span');
    if (title) title.textContent = tr('AQ-MySpace // Réseau JAJ', 'AQ-MySpace // JAJ Network');

    const brandSmall = document.querySelector('#win-myspace .myspace-brand small');
    if (brandSmall) brandSmall.textContent = tr(
        'Réseau social JAJ Records // propulsé par AQ-NET',
        'JAJ Records social network // powered by AQ-NET'
    );

    const navFeed = document.querySelector('#win-myspace .myspace-nav-btn[data-tab="feed"]');
    const navProfile = document.querySelector('#win-myspace .myspace-nav-btn[data-tab="profile"]');
    const navMessages = document.querySelector('#win-myspace .myspace-nav-btn[data-tab="messages"] .myspace-nav-label');
    const navFriends = document.querySelector('#win-myspace .myspace-nav-btn[data-tab="friends"]');
    const navForums = document.querySelector('#win-myspace .myspace-nav-btn[data-tab="forums"]');
    if (navFeed) navFeed.textContent = tr('Accueil', 'Home');
    if (navProfile) navProfile.textContent = tr('Mon profil', 'My profile');
    if (navMessages) navMessages.textContent = tr('Messages', 'Messages');
    if (navFriends) navFriends.textContent = tr('Amis', 'Friends');
    if (navForums) navForums.textContent = 'Forums';
    updateUnreadBadge(ms.unreadCount);

    const boxTitles = document.querySelectorAll('#win-myspace .myspace-sidebar .myspace-box-title');
    if (boxTitles[0]) boxTitles[0].textContent = tr('Mon AQ-ID', 'My AQ-ID');
    if (boxTitles[1]) boxTitles[1].textContent = tr('État AQ-NET', 'AQ-NET status');

    const netRows = document.querySelectorAll('#win-myspace .myspace-sidebar .myspace-box:nth-of-type(2) .myspace-box-body > div');
    if (netRows[0]) netRows[0].innerHTML = `<strong>${tr('Réseau :', 'Network:')}</strong> ${tr('en ligne', 'online')}`;
    if (netRows[1]) netRows[1].innerHTML = `<strong>${tr('Label :', 'Label:')}</strong> JAJ Records`;
    if (netRows[2]) netRows[2].innerHTML = `<strong>${tr('Client :', 'Client:')}</strong> AQ-NEO`;

    updateSessionChrome();
}

function isLoggedIn() {
    return ms.session?.type === 'user';
}

function isAdmin() {
    return isLoggedIn() && Array.isArray(ms.session?.roles) && ms.session.roles.includes('admin');
}

function initial(value) {
    return String(value || '?').trim().charAt(0).toUpperCase() || '?';
}

function applyAvatarElement(element, name, avatarUrl) {
    if (!element) return;
    const safeAvatar = typeof avatarUrl === 'string' && avatarUrl.startsWith('data:image/') ? avatarUrl : '';
    if (safeAvatar) {
        element.textContent = '';
        element.style.backgroundImage = `url("${safeAvatar}")`;
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = 'center';
        element.style.backgroundRepeat = 'no-repeat';
    } else {
        element.style.backgroundImage = '';
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        element.style.backgroundRepeat = '';
        element.textContent = initial(name);
    }
}

function setStatus(message = '', type = '') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'myspace-status' + (type ? ' ' + type : '');
    statusEl.style.display = message ? '' : 'none';
}

function formatDate(value) {
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat(isEnglish() ? 'en-GB' : 'fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date(value));
    } catch (_) {
        return String(value);
    }
}

function formatDateOnly(value) {
    if (!value) return '—';
    try {
        return new Intl.DateTimeFormat(isEnglish() ? 'en-GB' : 'fr-FR', {
            dateStyle: 'long'
        }).format(new Date(value));
    } catch (_) {
        return String(value);
    }
}

function formatLastSeen(value) {
    if (!value) return tr('hors ligne', 'offline');
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return tr('hors ligne', 'offline');

    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return tr('à l’instant', 'just now');
    if (minutes < 60) return tr(`il y a ${minutes} min`, `${minutes} min ago`);

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return tr(`il y a ${hours} h`, `${hours}h ago`);

    return formatDateOnly(value);
}

function presenceText(person) {
    if (person?.online) return tr('● En ligne', '● Online');
    return person?.lastSeenAt
        ? `${tr('Hors ligne · vu', 'Offline · seen')} ${formatLastSeen(person.lastSeenAt)}`
        : tr('○ Hors ligne', '○ Offline');
}

function updateUnreadBadge(count = 0) {
    const safe = Math.max(0, Number(count) || 0);
    ms.unreadCount = safe;

    const badge = document.getElementById('myspace-unread-badge');
    if (!badge) return;

    badge.textContent = safe > 99 ? '99+' : String(safe);
    badge.hidden = safe === 0;
}

function profileTrack(trackId) {
    const wanted = String(trackId || '');
    if (!wanted) return null;

    for (const release of AQCatalog.getReleases()) {
        const track = (release.tracks || []).find((item) => item.id === wanted);
        if (!track || !track.audio || !['full', 'snippet'].includes(track.availability)) continue;

        const artist = AQCatalog.getArtist(release.artistId);
        return {
            ...track,
            releaseId: release.id,
            releaseTitle: release.title,
            artistName: artist?.name || release.artistId || 'JAJ Records',
            cover: release.cover || 'medias/img/albumimg.png'
        };
    }

    return null;
}

function profileTrackOptions() {
    const rows = [];
    for (const release of AQCatalog.getReleases()) {
        const artist = AQCatalog.getArtist(release.artistId);
        (release.tracks || []).forEach((track) => {
            if (!track.audio || !['full', 'snippet'].includes(track.availability)) return;
            rows.push({
                id: track.id,
                label: `${artist?.name || release.artistId} — ${track.title} (${release.title})`
            });
        });
    }
    return rows;
}

function closeMySpaceNotification() {
    if (ms.notificationTimer) {
        clearTimeout(ms.notificationTimer);
        ms.notificationTimer = null;
    }

    const popup = document.querySelector('#system-popup-container .myspace-system-notification');
    popup?.remove();
}

function showMySpaceNotification(title, text, action = null) {
    const container = document.getElementById('system-popup-container');
    if (!container) return;

    closeMySpaceNotification();

    const popup = document.createElement('div');
    popup.className = 'system-popup myspace-system-notification';

    const head = document.createElement('div');
    head.className = 'system-popup-title';

    const heading = document.createElement('span');
    heading.textContent = title;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'retro-btn';
    close.style.padding = '0 5px';
    close.textContent = 'X';
    close.addEventListener('click', (event) => {
        event.stopPropagation();
        closeMySpaceNotification();
    });

    head.append(heading, close);

    const body = document.createElement('div');
    body.className = 'system-popup-body';

    const icon = document.createElement('div');
    icon.className = 'popup-icon';
    icon.textContent = 'M';

    const copy = document.createElement('div');
    copy.textContent = text;

    body.append(icon, copy);

    const actions = document.createElement('div');
    actions.className = 'system-popup-actions';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'retro-btn';
    open.textContent = tr('Ouvrir', 'Open');
    open.addEventListener('click', () => {
        closeMySpaceNotification();
        action?.();
    });

    actions.appendChild(open);
    popup.append(head, body, actions);
    container.appendChild(popup);

    try { window.playSystemSound?.('click'); } catch (_) {}

    ms.notificationTimer = setTimeout(closeMySpaceNotification, 9000);
}

async function refreshUnreadSummary({ notify = false } = {}) {
    if (!isLoggedIn()) {
        ms.unreadBySender = {};
        updateUnreadBadge(0);
        return;
    }

    try {
        const previous = ms.unreadCount;
        const summary = await requestGET('chat_summary');
        ms.unreadBySender = summary.bySender || {};
        updateUnreadBadge(summary.unreadCount || 0);

        if (notify && ms.unreadCount > previous) {
            const delta = ms.unreadCount - previous;
            showMySpaceNotification(
                'AQ-MySpace',
                delta === 1
                    ? tr('Tu as reçu un nouveau message.', 'You received a new message.')
                    : tr(`Tu as reçu ${delta} nouveaux messages.`, `You received ${delta} new messages.`),
                () => {
                    window.openWindow?.('win-myspace', 'task-myspace');
                    loadMessages();
                }
            );
        }
    } catch (error) {
        console.warn('[AQ MySpace] unread summary unavailable', error);
    }
}

async function pollFriendRequests({ notify = true } = {}) {
    if (!isLoggedIn()) {
        ms.friendRequestsInitialized = false;
        ms.knownFriendRequestIds = new Set();
        return;
    }

    try {
        const data = await requestGET('friend_requests');
        const requests = Array.isArray(data.requests) ? data.requests : [];
        const nextIds = new Set(requests.map((request) => request.id).filter(Boolean));

        if (ms.friendRequestsInitialized && notify) {
            requests
                .filter((request) => request.id && !ms.knownFriendRequestIds.has(request.id))
                .forEach((request) => {
                    showMySpaceNotification(
                        tr('Nouvelle demande d’ami', 'New friend request'),
                        tr(
                            `${request.senderName || 'Quelqu’un'} veut t’ajouter sur AQ-MySpace.`,
                            `${request.senderName || 'Someone'} wants to add you on AQ-MySpace.`
                        ),
                        () => {
                            window.openWindow?.('win-mail', 'task-mail');
                            window.AQMail?.refresh?.();
                        }
                    );
                });
        }

        ms.knownFriendRequestIds = nextIds;
        ms.friendRequestsInitialized = true;
    } catch (error) {
        console.warn('[AQ MySpace] friend request polling failed', error);
    }
}

async function sendPresenceHeartbeat() {
    if (!isLoggedIn()) return;
    try {
        await requestPOST('heartbeat');
    } catch (error) {
        console.warn('[AQ MySpace] presence heartbeat failed', error);
    }
}

function stopSocialPolling() {
    if (ms.presenceTimer) clearInterval(ms.presenceTimer);
    if (ms.socialPollTimer) clearInterval(ms.socialPollTimer);
    ms.presenceTimer = null;
    ms.socialPollTimer = null;
}

async function startSocialPolling() {
    stopSocialPolling();

    if (!isLoggedIn()) {
        updateUnreadBadge(0);
        return;
    }

    await sendPresenceHeartbeat();
    await Promise.all([
        refreshUnreadSummary({ notify: false }),
        pollFriendRequests({ notify: false })
    ]);

    ms.presenceTimer = setInterval(sendPresenceHeartbeat, 45 * 1000);
    ms.socialPollTimer = setInterval(() => {
        refreshUnreadSummary({ notify: true });
        pollFriendRequests({ notify: true });
    }, 15 * 1000);
}

function roleBadges(roles = []) {
    const wrap = document.createElement('span');
    wrap.className = 'myspace-role-list';
    const list = Array.isArray(roles) && roles.length ? roles : ['user'];
    list.forEach((role) => {
        const badge = document.createElement('span');
        badge.className = 'myspace-role';
        badge.dataset.role = String(role).toLowerCase();
        badge.textContent = String(role).toUpperCase();
        wrap.appendChild(badge);
    });
    return wrap;
}

function updateSessionChrome() {
    const session = ms.session;
    const name = session?.displayName || (session?.type === 'guest' ? tr('Invité', 'Guest') : tr('Hors ligne', 'Offline'));
    const mail = session?.aquertyMail || '';
    const roles = session?.type === 'guest' ? ['guest'] : (session?.roles || []);

    if (sessionPill) {
        sessionPill.textContent = session
            ? `${name} // ${mail || tr('session locale', 'local session')}`
            : tr('Aucune session', 'No session');
    }
    if (selfName) selfName.textContent = name;
    if (selfMail) selfMail.textContent = mail || tr('Lecture seule', 'Read only');
    applyAvatarElement(selfAvatar, name, ms.selfAvatarData);
    if (selfRoles) {
        selfRoles.innerHTML = '';
        selfRoles.appendChild(roleBadges(roles));
    }
}

async function refreshSelfAvatar() {
    if (!isLoggedIn() || !ms.session?.id) {
        ms.selfAvatarData = '';
        updateSessionChrome();
        return;
    }

    try {
        const data = await requestGET('profile', { userId: ms.session.id });
        ms.selfAvatarData = data.profile?.avatar || '';
        updateSessionChrome();
    } catch (_) {
        ms.selfAvatarData = '';
        updateSessionChrome();
    }
}

async function requestGET(view, params = {}) {
    const url = new URL(MYSPACE_API, window.location.origin);
    url.searchParams.set('view', view);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    const response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'request_failed');
    return data;
}

async function requestPOST(action, payload = {}) {
    const response = await fetch(MYSPACE_API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'request_failed');
    return data;
}

async function requestChatToken() {
    const response = await fetch('/api/myspace-chat-token', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'chat_token_failed');
    return data;
}

async function stopChatRealtime() {
    if (ms.chatTokenRefreshTimer) {
        clearInterval(ms.chatTokenRefreshTimer);
        ms.chatTokenRefreshTimer = null;
    }

    if (ms.chatClient && ms.chatChannel) {
        try {
            await ms.chatClient.removeChannel(ms.chatChannel);
        } catch (_) {}
    }

    ms.chatChannel = null;
    ms.chatClient = null;
}

async function ensureChatRealtime() {
    if (!isLoggedIn()) return;

    if (ms.chatClient && ms.chatChannel) return;

    const config = await requestChatToken();
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.117.0');

    const client = createClient(
        config.supabaseUrl,
        config.supabasePublishableKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    );

    client.realtime.setAuth(config.token);

    const channel = client
        .channel('aq-myspace-messages')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'myspace_messages'
            },
            (payload) => {
                const message = payload.new;
                const myId = ms.session?.id;
                const peerId = ms.chatPeerId;

                if (!myId) return;

                const belongsToOpenChat = peerId && (
                    (message.sender_id === myId && message.recipient_id === peerId) ||
                    (message.sender_id === peerId && message.recipient_id === myId)
                );

                if (belongsToOpenChat) {
                    appendChatMessage(message);

                    if (message.recipient_id === myId) {
                        requestGET('messages', { with: peerId })
                            .then(() => refreshUnreadSummary({ notify: false }))
                            .catch(() => {});
                    }
                    return;
                }

                if (message.recipient_id === myId) {
                    const sender = ms.chatContacts.find((contact) => contact.userId === message.sender_id);
                    showMySpaceNotification(
                        tr('Nouveau message MySpace', 'New MySpace message'),
                        tr(
                            `${sender?.displayName || 'Un ami'} t’a envoyé un message.`,
                            `${sender?.displayName || 'A friend'} sent you a message.`
                        ),
                        () => {
                            window.openWindow?.('win-myspace', 'task-myspace');
                            ms.chatPeerId = message.sender_id;
                            loadMessages();
                        }
                    );
                    refreshUnreadSummary({ notify: false });
                }
            }
        )
        .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
                setStatus(
                    tr('Le temps réel du chat a rencontré une erreur.', 'Realtime chat encountered an error.'),
                    'error'
                );
            }
        });

    ms.chatClient = client;
    ms.chatChannel = channel;

    ms.chatTokenRefreshTimer = setInterval(async () => {
        try {
            const fresh = await requestChatToken();
            client.realtime.setAuth(fresh.token);
        } catch (error) {
            console.warn('[AQ MySpace] chat token refresh failed', error);
        }
    }, 4 * 60 * 1000);
}

function chatContactById(userId) {
    return ms.chatContacts.find((contact) => contact.userId === userId) || null;
}

function appendChatMessage(message) {
    const list = document.getElementById('myspace-chat-messages');
    if (!list || !message?.id) return;

    if (list.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`)) {
        return;
    }

    const mine = message.sender_id === ms.session?.id;
    const row = document.createElement('div');
    row.className = 'myspace-chat-message ' + (mine ? 'mine' : 'theirs');
    row.dataset.messageId = String(message.id);

    const bubble = document.createElement('div');
    bubble.className = 'myspace-chat-bubble';

    const text = document.createElement('div');
    text.className = 'myspace-chat-text';
    text.textContent = message.body || '';

    const meta = document.createElement('div');
    meta.className = 'myspace-chat-meta';
    meta.textContent = formatDate(message.created_at);

    bubble.append(text, meta);
    row.appendChild(bubble);
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
}

async function openChat(peerId) {
    if (!isLoggedIn()) {
        setStatus(
            tr('Connecte-toi avec un compte AQ-NEO pour utiliser les messages.', 'Sign in with an AQ-NEO account to use messages.'),
            'error'
        );
        return;
    }

    const contact = chatContactById(peerId);
    if (!contact) return;

    ms.tab = 'messages';
    ms.chatPeerId = peerId;
    setActiveNav('messages');

    document.querySelectorAll('.myspace-chat-contact').forEach((button) => {
        button.classList.toggle('active', button.dataset.userId === peerId);
    });

    const panel = document.getElementById('myspace-chat-panel');
    if (!panel) return;

    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'myspace-chat-header';

    const headerAvatar = makeMiniAvatar(contact.displayName, contact.avatar);
    headerAvatar.classList.add('myspace-profile-link');

    const identity = document.createElement('div');
    identity.className = 'myspace-chat-header-copy myspace-profile-link';

    const name = document.createElement('div');
    name.className = 'myspace-chat-header-name';
    name.textContent = contact.displayName || tr('Utilisateur', 'User');

    const mail = document.createElement('div');
    mail.className = 'myspace-chat-header-mail';
    mail.textContent = contact.aquertyMail || '';

    const presence = document.createElement('div');
    presence.className = 'myspace-chat-header-presence' + (contact.online ? ' online' : '');
    presence.textContent = presenceText(contact);

    const openProfile = () => showProfile(contact.userId);
    headerAvatar.addEventListener('click', openProfile);
    identity.addEventListener('click', openProfile);

    identity.append(name, mail, presence);
    header.append(headerAvatar, identity);

    const messages = document.createElement('div');
    messages.id = 'myspace-chat-messages';
    messages.className = 'myspace-chat-messages';

    const composer = document.createElement('div');
    composer.className = 'myspace-chat-composer';

    const textarea = document.createElement('textarea');
    textarea.maxLength = 2000;
    textarea.rows = 2;
    textarea.placeholder = tr('Écrire un message…', 'Write a message…');

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'myspace-btn primary';
    send.textContent = tr('Envoyer', 'Send');

    const sendMessage = async () => {
        const text = textarea.value.trim();
        if (!text) return;

        send.disabled = true;
        textarea.disabled = true;

        try {
            const result = await requestPOST('send_message', {
                recipientId: peerId,
                text
            });

            textarea.value = '';
            appendChatMessage(result.message);
        } catch (error) {
            setStatus(
                tr('Impossible d’envoyer le message : ', 'Unable to send message: ') + error.message,
                'error'
            );
        } finally {
            send.disabled = false;
            textarea.disabled = false;
            textarea.focus();
        }
    };

    send.addEventListener('click', sendMessage);
    textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    composer.append(textarea, send);
    panel.append(header, messages, composer);

    setStatus(tr('Chargement de la conversation…', 'Loading conversation…'));

    try {
        const data = await requestGET('messages', { with: peerId });
        setStatus('');
        const rows = Array.isArray(data.messages) ? data.messages : [];
        rows.forEach(appendChatMessage);
        await refreshUnreadSummary({ notify: false });
        await ensureChatRealtime();
    } catch (error) {
        setStatus(
            tr('Conversation indisponible : ', 'Conversation unavailable: ') + error.message,
            'error'
        );
    }
}

async function loadMessages() {
    const viewEpoch = beginView('messages');
    ms.profileUserId = null;
    ms.topicId = null;

    if (!isLoggedIn()) {
        const empty = document.createElement('div');
        empty.className = 'myspace-empty';
        empty.textContent = tr(
            'Les messages privés sont disponibles après connexion à un compte AQ-NEO.',
            'Private messages are available after signing in to an AQ-NEO account.'
        );
        content.appendChild(empty);
        return;
    }

    setStatus(tr('Chargement des contacts…', 'Loading contacts…'));

    try {
        const [data, summary] = await Promise.all([
            requestGET('chat_contacts'),
            requestGET('chat_summary').catch(() => ({ unreadCount: ms.unreadCount, bySender: ms.unreadBySender }))
        ]);
        if (!isCurrentView(viewEpoch, 'messages')) return;
        ms.chatContacts = Array.isArray(data.contacts) ? data.contacts : [];
        ms.unreadBySender = summary.bySender || {};
        updateUnreadBadge(summary.unreadCount || 0);

        const shell = document.createElement('div');
        shell.className = 'myspace-chat-shell';

        const contacts = document.createElement('div');
        contacts.className = 'myspace-chat-contacts';

        const contactsTitle = document.createElement('div');
        contactsTitle.className = 'myspace-chat-contacts-title';
        contactsTitle.textContent = tr('Contacts', 'Contacts');
        contacts.appendChild(contactsTitle);

        if (!ms.chatContacts.length) {
            const empty = document.createElement('div');
            empty.className = 'myspace-chat-no-contacts';
            empty.textContent = tr(
                'Aucun ami pour le moment. Ajoute quelqu’un avec son adresse AQ-Mail.',
                'No friends yet. Add someone using their AQ-Mail address.'
            );
            contacts.appendChild(empty);
        } else {
            ms.chatContacts.forEach((contact) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'myspace-chat-contact';
                button.dataset.userId = contact.userId;

                const avatar = makeMiniAvatar(contact.displayName, contact.avatar);
                const copy = document.createElement('span');
                copy.className = 'myspace-chat-contact-copy';

                const name = document.createElement('strong');
                name.textContent = contact.displayName || tr('Utilisateur', 'User');

                const mail = document.createElement('span');
                mail.textContent = contact.aquertyMail || '';

                const presence = document.createElement('span');
                presence.className = 'myspace-chat-contact-presence' + (contact.online ? ' online' : '');
                presence.textContent = presenceText(contact);

                copy.append(name, mail, presence);
                button.append(avatar, copy);

                const unread = Number(ms.unreadBySender?.[contact.userId] || 0);
                if (unread > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'myspace-contact-unread';
                    badge.textContent = unread > 99 ? '99+' : String(unread);
                    button.appendChild(badge);
                }
                button.addEventListener('click', () => openChat(contact.userId));
                contacts.appendChild(button);
            });
        }

        const panel = document.createElement('div');
        panel.id = 'myspace-chat-panel';
        panel.className = 'myspace-chat-panel';

        const placeholder = document.createElement('div');
        placeholder.className = 'myspace-chat-placeholder';
        placeholder.textContent = tr(
            'Sélectionne un contact pour ouvrir une conversation.',
            'Select a contact to open a conversation.'
        );
        panel.appendChild(placeholder);

        shell.append(contacts, panel);
        content.appendChild(shell);
        setStatus('');

        await ensureChatRealtime();
        if (!isCurrentView(viewEpoch, 'messages')) return;

        if (ms.chatPeerId && chatContactById(ms.chatPeerId)) {
            await openChat(ms.chatPeerId);
        }
    } catch (error) {
        if (!isCurrentView(viewEpoch, 'messages')) return;
        setStatus(
            tr('Messagerie indisponible : ', 'Messaging unavailable: ') + error.message,
            'error'
        );
    }
}


async function loadFriends() {
    const viewEpoch = beginView('friends');
    ms.profileUserId = null;
    ms.topicId = null;

    if (!isLoggedIn()) {
        const empty = document.createElement('div');
        empty.className = 'myspace-empty';
        empty.textContent = tr(
            'Connecte-toi pour gérer tes amis MySpace.',
            'Sign in to manage your MySpace friends.'
        );
        content.appendChild(empty);
        return;
    }

    content.appendChild(makeFriendRequestBox());
    setStatus(tr('Chargement des amis…', 'Loading friends…'));

    try {
        const data = await requestGET('friends');
        if (!isCurrentView(viewEpoch, 'friends')) return;
        const friends = Array.isArray(data.friends) ? data.friends : [];
        let topFriendIds = Array.isArray(data.topFriendIds) ? [...data.topFriendIds] : [];

        const box = document.createElement('div');
        box.className = 'myspace-box myspace-friends-page';
        box.innerHTML = `<div class="myspace-box-title orange">${tr('Mes amis', 'My friends')} (${friends.length})</div>`;

        const body = document.createElement('div');
        body.className = 'myspace-box-body';

        if (!friends.length) {
            const empty = document.createElement('div');
            empty.className = 'myspace-empty';
            empty.textContent = tr(
                'Aucun ami pour le moment. Envoie une demande juste au-dessus.',
                'No friends yet. Send a request just above.'
            );
            body.appendChild(empty);
        } else {
            const topHint = document.createElement('div');
            topHint.className = 'myspace-status';
            topHint.textContent = tr(
                '★ Choisis jusqu’à 8 amis pour ton Top 8. Les flèches changent leur ordre sur ton profil.',
                '★ Pick up to 8 friends for your Top 8. The arrows change their order on your profile.'
            );
            body.appendChild(topHint);

            const grid = document.createElement('div');
            grid.className = 'myspace-friends-page-grid';

            const saveTop = async (nextIds) => {
                const result = await requestPOST('save_top_friends', { friendIds: nextIds });
                topFriendIds = Array.isArray(result.topFriendIds) ? result.topFriendIds : nextIds;
                await loadFriends();
            };

            friends.forEach((friend) => {
                const card = document.createElement('div');
                card.className = 'myspace-friends-page-card';

                const avatar = makeMiniAvatar(friend.displayName, friend.avatar);
                avatar.classList.add('myspace-friends-page-avatar');
                avatar.addEventListener('click', () => showProfile(friend.userId));

                const copy = document.createElement('div');
                copy.className = 'myspace-friends-page-copy';

                const name = document.createElement('button');
                name.type = 'button';
                name.className = 'myspace-friends-page-name';
                name.textContent = friend.displayName || tr('Utilisateur', 'User');
                name.addEventListener('click', () => showProfile(friend.userId));

                const mail = document.createElement('div');
                mail.className = 'myspace-friends-page-mail';
                mail.textContent = friend.aquertyMail || '';

                const presence = document.createElement('div');
                presence.className = 'myspace-friends-page-presence' + (friend.online ? ' online' : '');
                presence.textContent = presenceText(friend);

                copy.append(name, mail, presence);

                const controls = document.createElement('div');
                controls.className = 'myspace-friends-page-actions';

                const profileButton = document.createElement('button');
                profileButton.type = 'button';
                profileButton.className = 'myspace-btn';
                profileButton.textContent = tr('Profil', 'Profile');
                profileButton.addEventListener('click', () => showProfile(friend.userId));

                const messageButton = document.createElement('button');
                messageButton.type = 'button';
                messageButton.className = 'myspace-btn';
                messageButton.textContent = tr('Message', 'Message');
                messageButton.addEventListener('click', () => {
                    ms.chatPeerId = friend.userId;
                    loadMessages();
                });

                const topIndex = topFriendIds.indexOf(friend.userId);
                const topButton = document.createElement('button');
                topButton.type = 'button';
                topButton.className = 'myspace-btn' + (topIndex >= 0 ? ' primary' : '');
                topButton.textContent = topIndex >= 0 ? '★ Top 8' : '☆ Top 8';
                topButton.addEventListener('click', async () => {
                    let next = [...topFriendIds];
                    if (topIndex >= 0) {
                        next = next.filter((id) => id !== friend.userId);
                    } else {
                        if (next.length >= 8) {
                            setStatus(tr('Ton Top 8 est déjà complet.', 'Your Top 8 is already full.'), 'error');
                            return;
                        }
                        next.push(friend.userId);
                    }
                    await saveTop(next);
                });

                controls.append(profileButton, messageButton, topButton);

                if (topIndex >= 0) {
                    const up = document.createElement('button');
                    up.type = 'button';
                    up.className = 'myspace-btn';
                    up.textContent = '↑';
                    up.disabled = topIndex === 0;
                    up.addEventListener('click', async () => {
                        const next = [...topFriendIds];
                        [next[topIndex - 1], next[topIndex]] = [next[topIndex], next[topIndex - 1]];
                        await saveTop(next);
                    });

                    const down = document.createElement('button');
                    down.type = 'button';
                    down.className = 'myspace-btn';
                    down.textContent = '↓';
                    down.disabled = topIndex === topFriendIds.length - 1;
                    down.addEventListener('click', async () => {
                        const next = [...topFriendIds];
                        [next[topIndex], next[topIndex + 1]] = [next[topIndex + 1], next[topIndex]];
                        await saveTop(next);
                    });

                    controls.append(up, down);
                }

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'myspace-btn myspace-danger-btn';
                remove.textContent = tr('Retirer', 'Remove');
                remove.addEventListener('click', async () => {
                    const ok = window.confirm(
                        tr(
                            `Retirer ${friend.displayName || 'cet ami'} de tes amis ?`,
                            `Remove ${friend.displayName || 'this friend'} from your friends?`
                        )
                    );
                    if (!ok) return;
                    await requestPOST('remove_friend', { friendId: friend.userId });
                    window.dispatchEvent(new CustomEvent('aq:friends-changed'));
                    await loadFriends();
                });

                controls.appendChild(remove);
                card.append(avatar, copy, controls);
                grid.appendChild(card);
            });

            body.appendChild(grid);
        }

        box.appendChild(body);
        content.appendChild(box);
        setStatus('');
    } catch (error) {
        if (!isCurrentView(viewEpoch, 'friends')) return;
        setStatus(tr('Amis indisponibles : ', 'Friends unavailable: ') + error.message, 'error');
    }
}

function requireAccount() {
    if (isLoggedIn()) return true;
    setStatus(tr('Connecte-toi avec un compte AQ-NEO pour publier, commenter ou réagir.', 'Sign in with an AQ-NEO account to post, comment or react.'), 'error');
    return false;
}

function clearContent() {
    if (content) content.innerHTML = '';
}

function beginView(tab) {
    ms.tab = tab;
    ms.viewEpoch += 1;
    setActiveNav(tab);
    clearContent();
    return ms.viewEpoch;
}

function isCurrentView(epoch, tab) {
    return ms.viewEpoch === epoch && ms.tab === tab;
}

function makeFriendRequestBox() {
    const friendBox = document.createElement('div');
    friendBox.className = 'myspace-box myspace-friend-add';
    friendBox.innerHTML = `<div class="myspace-box-title orange">${tr('Ajouter un ami', 'Add a friend')}</div>`;

    const friendBody = document.createElement('div');
    friendBody.className = 'myspace-box-body';

    const friendForm = document.createElement('div');
    friendForm.className = 'myspace-friend-form';

    const friendInput = document.createElement('input');
    friendInput.type = 'email';
    friendInput.placeholder = tr('adresse@aquerty.fr', 'address@aquerty.fr');
    friendInput.autocomplete = 'off';

    const friendSend = document.createElement('button');
    friendSend.type = 'button';
    friendSend.className = 'myspace-btn primary';
    friendSend.textContent = tr('Envoyer la demande', 'Send request');

    const friendStatus = document.createElement('div');
    friendStatus.className = 'myspace-friend-status';
    friendStatus.hidden = true;

    const sendFriendRequest = async () => {
        const aquertyMail = friendInput.value.trim();
        if (!aquertyMail) return;

        friendSend.disabled = true;
        friendInput.disabled = true;
        friendStatus.hidden = true;

        try {
            await requestPOST('send_friend_request', { aquertyMail });
            friendInput.value = '';
            friendStatus.className = 'myspace-friend-status ok';
            friendStatus.textContent = tr(
                'Demande envoyée dans AQ-Mail.',
                'Friend request sent to AQ-Mail.'
            );
            friendStatus.hidden = false;
        } catch (error) {
            const messages = {
                friend_user_not_found: tr('Aucun compte AQ-NEO avec cette adresse.', 'No AQ-NEO account uses this address.'),
                already_friends: tr('Vous êtes déjà amis.', 'You are already friends.'),
                friend_request_already_pending: tr('Une demande est déjà en attente.', 'A request is already pending.'),
                incoming_friend_request_exists: tr('Cette personne t’a déjà envoyé une demande. Regarde AQ-Mail.', 'This person already sent you a request. Check AQ-Mail.'),
                cannot_friend_self: tr('Tu ne peux pas t’ajouter toi-même.', 'You cannot add yourself.'),
                invalid_aquerty_mail: tr('Entre une adresse AQ-Mail valide.', 'Enter a valid AQ-Mail address.')
            };
            friendStatus.className = 'myspace-friend-status error';
            friendStatus.textContent = messages[error.message] || (tr('Demande impossible : ', 'Unable to send request: ') + error.message);
            friendStatus.hidden = false;
        } finally {
            friendSend.disabled = false;
            friendInput.disabled = false;
            friendInput.focus();
        }
    };

    friendSend.addEventListener('click', sendFriendRequest);
    friendInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendFriendRequest();
        }
    });

    friendForm.append(friendInput, friendSend);
    friendBody.append(friendForm, friendStatus);
    friendBox.appendChild(friendBody);
    return friendBox;
}

function makeAuthor(authorId, authorName, authorRoles) {
    const box = document.createElement('div');
    box.style.minWidth = '0';

    const name = document.createElement('div');
    name.className = 'myspace-author';
    name.textContent = authorName || tr('Utilisateur', 'User');
    name.addEventListener('click', () => showProfile(authorId));

    box.appendChild(name);
    const badges = roleBadges(authorRoles || []);
    badges.style.justifyContent = 'flex-start';
    badges.style.marginTop = '2px';
    box.appendChild(badges);
    return box;
}

function makeMiniAvatar(name, avatarUrl = '') {
    const avatar = document.createElement('div');
    avatar.className = 'myspace-mini-avatar';
    applyAvatarElement(avatar, name, avatarUrl);
    return avatar;
}

async function loadFeed() {
    const viewEpoch = beginView('feed');
    ms.profileUserId = null;
    ms.topicId = null;
    setStatus(tr('Chargement du fil MySpace…', 'Loading MySpace feed…'));

    const compose = document.createElement('div');
    compose.className = 'myspace-box myspace-compose';
    compose.innerHTML = `<div class="myspace-box-title orange">${tr('Fil d’actualité', 'Activity feed')}</div>`;
    const composeBody = document.createElement('div');
    composeBody.className = 'myspace-box-body';

    if (isLoggedIn()) {
        const textarea = document.createElement('textarea');
        textarea.maxLength = 800;
        textarea.placeholder = tr('Quoi de neuf sur AQ-NET ?', 'What’s new on AQ-NET?');

        const actions = document.createElement('div');
        actions.className = 'myspace-actions';
        const send = document.createElement('button');
        send.className = 'myspace-btn primary';
        send.type = 'button';
        send.textContent = tr('Publier', 'Post');

        send.addEventListener('click', async () => {
            const text = textarea.value.trim();
            if (!text) return;
            send.disabled = true;
            try {
                await requestPOST('create_post', { text });
                textarea.value = '';
                setStatus(tr('Post publié.', 'Post published.'), 'ok');
                await loadFeed();
            } catch (error) {
                setStatus(tr('Impossible de publier : ', 'Unable to post: ') + error.message, 'error');
            } finally {
                send.disabled = false;
            }
        });

        actions.appendChild(send);
        composeBody.append(textarea, actions);
    } else {
        const guest = document.createElement('div');
        guest.className = 'myspace-status';
        guest.textContent = tr('Mode invité : tu peux lire MySpace, mais il faut un compte AQ-NEO pour participer.', 'Guest mode: you can read MySpace, but you need an AQ-NEO account to participate.');
        composeBody.appendChild(guest);
    }

    compose.appendChild(composeBody);
    content.appendChild(compose);

    try {
        const data = await requestGET('feed');
        if (!isCurrentView(viewEpoch, 'feed')) return;
        setStatus('');
        const posts = Array.isArray(data.posts) ? data.posts : [];

        if (!posts.length) {
            const welcome = document.createElement('div');
            welcome.className = 'myspace-box';
            welcome.innerHTML = `<div class="myspace-box-title">${tr('Réseau JAJ', 'JAJ Network')}</div>`;
            const body = document.createElement('div');
            body.className = 'myspace-box-body';
            body.textContent = tr('Bienvenue sur AQ-MySpace. Le fil est vide : sois la première personne à publier quelque chose.', 'Welcome to AQ-MySpace. The feed is empty: be the first person to post something.');
            welcome.appendChild(body);
            content.appendChild(welcome);
            return;
        }

        posts.forEach((post) => content.appendChild(renderPost(post)));
    } catch (error) {
        if (!isCurrentView(viewEpoch, 'feed')) return;
        setStatus(tr('MySpace ne répond pas : ', 'MySpace is not responding: ') + error.message, 'error');
    }
}

function renderPost(post) {
    const card = document.createElement('article');
    card.className = 'myspace-post';

    const head = document.createElement('div');
    head.className = 'myspace-post-head';
    head.appendChild(makeMiniAvatar(post.authorName, post.authorAvatar));
    head.appendChild(makeAuthor(post.authorId, post.authorName, post.authorRoles));

    const meta = document.createElement('div');
    meta.className = 'myspace-post-meta';
    meta.textContent = formatDate(post.createdAt);
    head.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'myspace-post-body';
    body.textContent = post.text || '';

    const foot = document.createElement('div');
    foot.className = 'myspace-post-foot';

    const reactionMap = [
        ['like', '👍'],
        ['heart', '❤️'],
        ['fire', '🔥']
    ];

    reactionMap.forEach(([type, emoji]) => {
        const button = document.createElement('button');
        button.className = 'myspace-reaction' + (post.myReaction === type ? ' active' : '');
        button.type = 'button';
        button.textContent = `${emoji} ${post.reactions?.[type] || 0}`;
        button.addEventListener('click', async () => {
            if (!requireAccount()) return;
            button.disabled = true;
            try {
                const data = await requestPOST('react', { postId: post.id, type });
                post.reactions = data.reactions;
                post.myReaction = data.myReaction;
                const fresh = renderPost(post);
                card.replaceWith(fresh);
            } catch (error) {
                setStatus(tr('Réaction impossible : ', 'Unable to react: ') + error.message, 'error');
                button.disabled = false;
            }
        });
        foot.appendChild(button);
    });

    const commentsBtn = document.createElement('button');
    commentsBtn.className = 'myspace-btn';
    commentsBtn.type = 'button';
    commentsBtn.textContent = `${tr('Commentaires', 'Comments')} (${post.commentCount || 0})`;
    foot.appendChild(commentsBtn);

    const comments = document.createElement('div');
    comments.className = 'myspace-comments';
    comments.hidden = true;

    commentsBtn.addEventListener('click', async () => {
        comments.hidden = !comments.hidden;
        if (comments.hidden || comments.dataset.loaded === '1') return;
        comments.textContent = tr('Chargement…', 'Loading…');
        try {
            const data = await requestGET('comments', { postId: post.id });
            renderComments(comments, post, data.comments || []);
            comments.dataset.loaded = '1';
        } catch (error) {
            comments.textContent = tr('Impossible de charger les commentaires.', 'Unable to load comments.');
        }
    });

    card.append(head, body, foot, comments);
    return card;
}

function renderComments(container, post, comments) {
    container.innerHTML = '';

    if (!comments.length) {
        const empty = document.createElement('div');
        empty.className = 'myspace-status';
        empty.textContent = tr('Aucun commentaire pour le moment.', 'No comments yet.');
        container.appendChild(empty);
    }

    comments.forEach((comment) => {
        const row = document.createElement('div');
        row.className = 'myspace-comment';

        const commentHead = document.createElement('div');
        commentHead.className = 'myspace-comment-head';
        commentHead.appendChild(makeMiniAvatar(comment.authorName, comment.authorAvatar));

        const meta = document.createElement('div');
        meta.className = 'myspace-comment-meta';

        const author = document.createElement('span');
        author.className = 'myspace-author';
        author.textContent = comment.authorName || tr('Utilisateur', 'User');
        author.addEventListener('click', () => showProfile(comment.authorId));

        meta.append(author, document.createTextNode(' · ' + formatDate(comment.createdAt)));
        commentHead.appendChild(meta);

        const body = document.createElement('div');
        body.className = 'myspace-comment-body';
        body.textContent = comment.text || '';

        row.append(commentHead, body);
        container.appendChild(row);
    });

    if (isLoggedIn()) {
        const form = document.createElement('div');
        form.className = 'myspace-form';
        const textarea = document.createElement('textarea');
        textarea.maxLength = 400;
        textarea.placeholder = tr('Ajouter un commentaire…', 'Add a comment…');
        textarea.style.minHeight = '52px';

        const actions = document.createElement('div');
        actions.className = 'myspace-actions';
        const submit = document.createElement('button');
        submit.type = 'button';
        submit.className = 'myspace-btn primary';
        submit.textContent = tr('Commenter', 'Comment');

        submit.addEventListener('click', async () => {
            const text = textarea.value.trim();
            if (!text) return;
            submit.disabled = true;
            try {
                const data = await requestPOST('comment', { postId: post.id, text });
                post.commentCount = data.commentCount;
                const refreshed = await requestGET('comments', { postId: post.id });
                renderComments(container, post, refreshed.comments || []);
            } catch (error) {
                setStatus(tr('Commentaire impossible : ', 'Unable to comment: ') + error.message, 'error');
            } finally {
                submit.disabled = false;
            }
        });

        actions.appendChild(submit);
        form.append(textarea, actions);
        container.appendChild(form);
    }
}

async function showProfile(userId) {
    const viewEpoch = beginView('profile');
    ms.profileUserId = userId || ms.session?.id || null;
    ms.topicId = null;

    if (!ms.profileUserId) {
        const empty = document.createElement('div');
        empty.className = 'myspace-empty';
        empty.textContent = tr('Aucun profil disponible en mode hors ligne.', 'No profile available while offline.');
        content.appendChild(empty);
        return;
    }

    setStatus(tr('Chargement du profil…', 'Loading profile…'));

    try {
        const data = await requestGET('profile', { userId: ms.profileUserId });
        if (!isCurrentView(viewEpoch, 'profile')) return;
        setStatus('');
        renderProfile(data, ms.profileUserId === ms.session?.id && isLoggedIn());
    } catch (error) {
        if (!isCurrentView(viewEpoch, 'profile')) return;
        setStatus(tr('Profil indisponible : ', 'Profile unavailable: ') + error.message, 'error');
    }
}

function renderProfile(data, editable) {
    const profile = data?.profile;
    const friends = Array.isArray(data?.friends) ? data.friends : [];
    const topFriends = Array.isArray(data?.topFriends) ? data.topFriends : friends.slice(0, 8);
    const wallComments = Array.isArray(data?.wallComments) ? data.wallComments : [];
    const friendCount = Number(data?.friendCount || friends.length || 0);

    if (!profile) {
        const empty = document.createElement('div');
        empty.className = 'myspace-empty';
        empty.textContent = tr('Ce profil MySpace n’a pas encore été configuré.', 'This MySpace profile has not been configured yet.');
        content.appendChild(empty);
        return;
    }

    const header = document.createElement('div');
    header.className = 'myspace-profile-header';
    header.dataset.profileStyle = profile.profileStyle || 'blue';

    const avatar = document.createElement('div');
    avatar.className = 'myspace-avatar';
    avatar.style.margin = '0';
    applyAvatarElement(avatar, profile.displayName, profile.avatar);

    const copy = document.createElement('div');
    copy.className = 'myspace-profile-copy';

    const name = document.createElement('div');
    name.className = 'myspace-profile-name';
    name.textContent = profile.displayName || tr('Utilisateur', 'User');

    const headline = document.createElement('div');
    headline.className = 'myspace-profile-headline';
    headline.textContent = profile.headline || tr('Pas encore de statut.', 'No status yet.');

    const mood = document.createElement('div');
    mood.className = 'myspace-profile-mood';
    mood.textContent = profile.mood
        ? `${tr('Humeur', 'Mood')} : ${profile.mood}`
        : tr('Humeur non renseignée', 'Mood not set');

    const presence = document.createElement('div');
    presence.className = 'myspace-profile-presence' + (profile.online ? ' online' : '');
    presence.textContent = presenceText(profile);

    const badges = roleBadges(profile.roles || []);
    badges.style.justifyContent = 'flex-start';

    copy.append(name, headline, mood, presence, badges);
    header.append(avatar, copy);
    content.appendChild(header);

    const details = document.createElement('dl');
    details.className = 'myspace-profile-grid';

    const rows = [
        { label: 'AQ-Mail', value: profile.aquertyMail || '—' },
        { label: tr('Membre depuis', 'Member since'), value: formatDateOnly(profile.joinedAt) },
        { label: tr('Localisation', 'Location'), value: profile.location || '—' },
        { label: tr('Centres d’intérêt', 'Interests'), value: profile.interests || '—' },
        { label: tr('Musique', 'Music'), value: profile.favoriteMusic || '—' },
        { label: tr('Top artistes', 'Top artists'), value: profile.topArtists || '—' },
        { label: tr('Site / lien', 'Website / link'), value: profile.website || '—', href: profile.website || '' },
        { label: tr('À propos', 'About'), value: profile.bio || '—' }
    ];

    rows.forEach(({ label, value, href }) => {
        const dt = document.createElement('dt');
        dt.textContent = label;

        const dd = document.createElement('dd');
        if (href) {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = value;
            dd.appendChild(link);
        } else {
            dd.textContent = value;
        }

        details.append(dt, dd);
    });

    content.appendChild(details);

    const selectedTrack = profileTrack(profile.profileTrackId);
    if (selectedTrack) {
        const musicBox = document.createElement('div');
        musicBox.className = 'myspace-box myspace-profile-music';
        musicBox.innerHTML = `<div class="myspace-box-title orange">${tr('Musique du profil', 'Profile music')}</div>`;

        const musicBody = document.createElement('div');
        musicBody.className = 'myspace-box-body myspace-profile-music-body';

        const cover = document.createElement('img');
        cover.className = 'myspace-profile-music-cover';
        cover.src = selectedTrack.cover;
        cover.alt = '';

        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'myspace-profile-music-play';
        play.textContent = '▶';
        play.setAttribute('aria-label', tr('Lire la musique du profil', 'Play profile music'));

        const musicCopy = document.createElement('div');
        musicCopy.className = 'myspace-profile-music-copy';

        const musicTitle = document.createElement('strong');
        musicTitle.textContent = selectedTrack.title;

        const musicMeta = document.createElement('span');
        musicMeta.textContent = `${selectedTrack.artistName} — ${selectedTrack.releaseTitle}`;

        const time = document.createElement('span');
        time.className = 'myspace-profile-music-time';
        time.textContent = '0:00';

        const audio = document.createElement('audio');
        audio.className = 'myspace-profile-audio';
        audio.preload = 'metadata';
        audio.src = selectedTrack.audio;

        const formatAudioTime = (seconds) => {
            if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${minutes}:${secs}`;
        };

        play.addEventListener('click', async () => {
            if (audio.paused) {
                document.querySelectorAll('.myspace-profile-audio').forEach((other) => {
                    if (other !== audio) {
                        other.pause();
                        const otherButton = other.closest('.myspace-profile-music-body')?.querySelector('.myspace-profile-music-play');
                        if (otherButton) otherButton.textContent = '▶';
                    }
                });

                try {
                    await audio.play();
                    play.textContent = 'Ⅱ';
                } catch (_) {
                    setStatus(tr('Lecture audio impossible.', 'Unable to play audio.'), 'error');
                }
            } else {
                audio.pause();
                play.textContent = '▶';
            }
        });

        audio.addEventListener('timeupdate', () => {
            const current = formatAudioTime(audio.currentTime);
            const total = Number.isFinite(audio.duration) ? ` / ${formatAudioTime(audio.duration)}` : '';
            time.textContent = current + total;
        });

        audio.addEventListener('ended', () => {
            play.textContent = '▶';
            time.textContent = Number.isFinite(audio.duration)
                ? `${formatAudioTime(audio.duration)} / ${formatAudioTime(audio.duration)}`
                : '0:00';
        });

        musicCopy.append(musicTitle, musicMeta, time);
        musicBody.append(cover, play, musicCopy, audio);
        musicBox.appendChild(musicBody);
        content.appendChild(musicBox);
    }

    const friendsBox = document.createElement('div');
    friendsBox.className = 'myspace-box myspace-profile-friends';
    friendsBox.innerHTML = `<div class="myspace-box-title">${tr('Top 8', 'Top 8')} · ${friendCount} ${tr('amis', 'friends')}</div>`;

    const friendsBody = document.createElement('div');
    friendsBody.className = 'myspace-box-body';

    if (!topFriends.length) {
        const emptyFriends = document.createElement('div');
        emptyFriends.className = 'myspace-profile-friends-empty';
        emptyFriends.textContent = tr(
            'Aucun ami affiché pour le moment.',
            'No friends to show yet.'
        );
        friendsBody.appendChild(emptyFriends);
    } else {
        const grid = document.createElement('div');
        grid.className = 'myspace-friends-grid';

        topFriends.slice(0, 8).forEach((friend) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'myspace-friend-card';
            card.title = friend.aquertyMail || friend.displayName || '';

            const friendAvatar = makeMiniAvatar(friend.displayName, friend.avatar);
            friendAvatar.classList.add('myspace-friend-avatar');

            const friendName = document.createElement('span');
            friendName.className = 'myspace-friend-name';
            friendName.textContent = friend.displayName || tr('Utilisateur', 'User');

            const friendPresence = document.createElement('span');
            friendPresence.className = 'myspace-friend-card-presence' + (friend.online ? ' online' : '');
            friendPresence.textContent = friend.online ? '●' : '○';

            card.append(friendAvatar, friendName, friendPresence);
            card.addEventListener('click', () => showProfile(friend.userId));
            grid.appendChild(card);
        });

        friendsBody.appendChild(grid);
    }

    if (editable) {
        const manageFriends = document.createElement('button');
        manageFriends.type = 'button';
        manageFriends.className = 'myspace-btn myspace-manage-friends';
        manageFriends.textContent = tr('Gérer mes amis / Top 8', 'Manage friends / Top 8');
        manageFriends.addEventListener('click', loadFriends);
        friendsBody.appendChild(manageFriends);
    }

    friendsBox.appendChild(friendsBody);
    content.appendChild(friendsBox);

    const wall = document.createElement('div');
    wall.className = 'myspace-box myspace-profile-wall';
    wall.innerHTML = `<div class="myspace-box-title">${tr('Mur', 'Wall')} (${wallComments.length})</div>`;

    const wallBody = document.createElement('div');
    wallBody.className = 'myspace-box-body';

    if (!wallComments.length) {
        const emptyWall = document.createElement('div');
        emptyWall.className = 'myspace-profile-wall-empty';
        emptyWall.textContent = tr(
            'Aucun message sur le mur pour le moment.',
            'No wall messages yet.'
        );
        wallBody.appendChild(emptyWall);
    } else {
        const wallList = document.createElement('div');
        wallList.className = 'myspace-wall-list';

        wallComments.forEach((comment) => {
            const row = document.createElement('div');
            row.className = 'myspace-wall-comment';

            const commentAvatar = makeMiniAvatar(comment.authorName, comment.authorAvatar);
            commentAvatar.addEventListener('click', () => showProfile(comment.authorId));

            const wallCopy = document.createElement('div');
            wallCopy.className = 'myspace-wall-comment-copy';

            const wallMeta = document.createElement('div');
            wallMeta.className = 'myspace-wall-comment-meta';

            const author = document.createElement('button');
            author.type = 'button';
            author.className = 'myspace-wall-author';
            author.textContent = comment.authorName || tr('Utilisateur', 'User');
            author.addEventListener('click', () => showProfile(comment.authorId));

            const date = document.createElement('span');
            date.textContent = ' · ' + formatDate(comment.createdAt);

            wallMeta.append(author, date);

            const wallText = document.createElement('div');
            wallText.className = 'myspace-wall-comment-text';
            wallText.textContent = comment.text || '';

            wallCopy.append(wallMeta, wallText);
            row.append(commentAvatar, wallCopy);
            wallList.appendChild(row);
        });

        wallBody.appendChild(wallList);
    }

    if (isLoggedIn()) {
        const wallForm = document.createElement('div');
        wallForm.className = 'myspace-wall-form';

        const textarea = document.createElement('textarea');
        textarea.maxLength = 500;
        textarea.placeholder = tr(
            'Laisser un message sur ce profil…',
            'Leave a message on this profile…'
        );

        const send = document.createElement('button');
        send.type = 'button';
        send.className = 'myspace-btn primary';
        send.textContent = tr('Publier sur le mur', 'Post to wall');

        send.addEventListener('click', async () => {
            const text = textarea.value.trim();
            if (!text) return;

            send.disabled = true;
            try {
                await requestPOST('wall_comment', {
                    targetUserId: profile.userId,
                    text
                });
                await showProfile(profile.userId);
            } catch (error) {
                setStatus(tr('Message de mur impossible : ', 'Unable to post wall message: ') + error.message, 'error');
            } finally {
                send.disabled = false;
            }
        });

        wallForm.append(textarea, send);
        wallBody.appendChild(wallForm);
    }

    wall.appendChild(wallBody);
    content.appendChild(wall);

    if (!editable) return;

    const editor = document.createElement('div');
    editor.className = 'myspace-box';
    editor.style.marginTop = '10px';
    editor.innerHTML = `<div class="myspace-box-title orange">${tr('Modifier le profil', 'Edit profile')}</div>`;

    const form = document.createElement('div');
    form.className = 'myspace-box-body myspace-form';

    let avatarData = profile.avatar || '';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'myspace-avatar-editor';

    const avatarLabel = document.createElement('div');
    avatarLabel.style.fontWeight = 'bold';
    avatarLabel.style.marginBottom = '5px';
    avatarLabel.textContent = tr('Photo de profil', 'Profile picture');

    const avatarRow = document.createElement('div');
    avatarRow.className = 'myspace-avatar-editor-row';

    const avatarPreview = document.createElement('div');
    avatarPreview.className = 'myspace-avatar myspace-avatar-preview';
    applyAvatarElement(avatarPreview, profile.displayName, avatarData);

    const avatarControls = document.createElement('div');
    avatarControls.className = 'myspace-avatar-controls';

    const avatarInput = document.createElement('input');
    avatarInput.type = 'file';
    avatarInput.accept = 'image/png,image/jpeg,image/webp';

    const avatarHelp = document.createElement('div');
    avatarHelp.className = 'myspace-status';
    avatarHelp.style.marginTop = '5px';
    avatarHelp.textContent = tr('PNG, JPEG ou WebP · 1 Mo max.', 'PNG, JPEG or WebP · 1 MB max.');

    const removeAvatar = document.createElement('button');
    removeAvatar.type = 'button';
    removeAvatar.className = 'myspace-btn';
    removeAvatar.style.marginTop = '5px';
    removeAvatar.textContent = tr('Retirer la photo', 'Remove picture');

    const inputs = {};

    removeAvatar.addEventListener('click', () => {
        avatarData = '';
        avatarInput.value = '';
        applyAvatarElement(avatarPreview, inputs.displayName?.value || profile.displayName, '');
    });

    avatarInput.addEventListener('change', () => {
        const file = avatarInput.files?.[0];
        if (!file) return;

        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            setStatus(tr('Choisis une image PNG, JPEG ou WebP.', 'Choose a PNG, JPEG or WebP image.'), 'error');
            avatarInput.value = '';
            return;
        }

        if (file.size > 1024 * 1024) {
            setStatus(tr('La photo de profil doit faire 1 Mo maximum.', 'The profile picture must be 1 MB or smaller.'), 'error');
            avatarInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            avatarData = String(reader.result || '');
            applyAvatarElement(avatarPreview, inputs.displayName?.value || profile.displayName, avatarData);
            setStatus('');
        };
        reader.readAsDataURL(file);
    });

    avatarControls.append(avatarInput, avatarHelp, removeAvatar);
    avatarRow.append(avatarPreview, avatarControls);
    avatarWrap.append(avatarLabel, avatarRow);
    form.appendChild(avatarWrap);

    const fields = [
        ['displayName', tr('Nom affiché', 'Display name'), 40, false],
        ['headline', tr('Statut / phrase de profil', 'Status / profile line'), 100, false],
        ['mood', tr('Humeur', 'Mood'), 60, false],
        ['location', tr('Localisation', 'Location'), 80, false],
        ['interests', tr('Centres d’intérêt', 'Interests'), 240, false],
        ['favoriteMusic', tr('Musique / artistes favoris', 'Favorite music / artists'), 180, false],
        ['topArtists', tr('Top artistes', 'Top artists'), 240, false],
        ['website', tr('Site / lien', 'Website / link'), 180, false],
        ['bio', tr('À propos de moi', 'About me'), 700, true]
    ];

    fields.forEach(([key, label, max, multiline]) => {
        const wrap = document.createElement('label');
        const title = document.createElement('span');
        title.textContent = label;

        const input = multiline ? document.createElement('textarea') : document.createElement('input');
        if (key === 'website') {
            input.type = 'url';
            input.placeholder = 'https://...';
        }

        input.maxLength = max;
        input.value = profile[key] || '';
        if (multiline) input.style.minHeight = '100px';

        inputs[key] = input;
        wrap.append(title, input);
        form.appendChild(wrap);
    });

    const trackWrap = document.createElement('label');
    const trackTitle = document.createElement('span');
    trackTitle.textContent = tr('Musique du profil (catalogue JAJ)', 'Profile music (JAJ catalog)');

    const trackSelect = document.createElement('select');

    const noTrack = document.createElement('option');
    noTrack.value = '';
    noTrack.textContent = tr('Aucune musique de profil', 'No profile music');
    trackSelect.appendChild(noTrack);

    profileTrackOptions().forEach((track) => {
        const option = document.createElement('option');
        option.value = track.id;
        option.textContent = track.label;
        option.selected = track.id === profile.profileTrackId;
        trackSelect.appendChild(option);
    });

    trackWrap.append(trackTitle, trackSelect);
    form.appendChild(trackWrap);

    const styleWrap = document.createElement('label');
    const styleTitle = document.createElement('span');
    styleTitle.textContent = tr('Couleur du profil', 'Profile color');

    const styleSelect = document.createElement('select');
    [
        ['blue', tr('Bleu MySpace', 'MySpace blue')],
        ['orange', tr('Orange', 'Orange')],
        ['purple', tr('Violet', 'Purple')],
        ['green', tr('Vert', 'Green')],
        ['black', tr('Noir', 'Black')]
    ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        if ((profile.profileStyle || 'blue') === value) option.selected = true;
        styleSelect.appendChild(option);
    });

    styleWrap.append(styleTitle, styleSelect);
    form.appendChild(styleWrap);

    const actions = document.createElement('div');
    actions.className = 'myspace-actions';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'myspace-btn primary';
    save.textContent = tr('Sauvegarder le profil', 'Save profile');

    save.addEventListener('click', async () => {
        save.disabled = true;

        try {
            const payload = Object.fromEntries(
                Object.entries(inputs).map(([key, input]) => [key, input.value])
            );

            payload.aquertyMail = ms.session?.aquertyMail || profile.aquertyMail;
            payload.avatar = avatarData;
            payload.profileStyle = styleSelect.value;
            payload.profileTrackId = trackSelect.value;

            const saved = await requestPOST('save_profile', payload);
            ms.selfAvatarData = saved.profile?.avatar || '';
            updateSessionChrome();

            const refreshed = await requestGET('profile', {
                userId: ms.session?.id || profile.userId
            });

            clearContent();
            renderProfile(refreshed, true);
            setStatus(tr('Profil sauvegardé.', 'Profile saved.'), 'ok');
        } catch (error) {
            const friendly = error.message === 'avatar_too_large'
                ? tr('La photo dépasse 1 Mo.', 'The picture exceeds 1 MB.')
                : error.message === 'invalid_avatar'
                    ? tr('Format de photo invalide.', 'Invalid picture format.')
                    : error.message === 'invalid_website'
                        ? tr('Le lien du site n’est pas valide.', 'The website link is invalid.')
                        : error.message;

            setStatus(tr('Sauvegarde impossible : ', 'Unable to save: ') + friendly, 'error');
        } finally {
            save.disabled = false;
        }
    });

    actions.appendChild(save);
    form.appendChild(actions);
    editor.appendChild(form);
    content.appendChild(editor);
}

function forumTitle(topic) {
    if (!topic) return tr('Sans titre', 'Untitled');
    return isEnglish()
        ? (topic.titleEn || topic.title || 'Untitled')
        : (topic.title || topic.titleEn || 'Sans titre');
}

function forumText(topic) {
    if (!topic) return '';
    return isEnglish()
        ? (topic.textEn || topic.text || '')
        : (topic.text || topic.textEn || '');
}

async function loadForums() {
    const viewEpoch = beginView('forums');
    ms.profileUserId = null;
    ms.topicId = null;
    setStatus(tr('Chargement des forums…', 'Loading forums…'));

    const create = document.createElement('div');
    create.className = 'myspace-box';
    create.innerHTML = `<div class="myspace-box-title orange">${isAdmin() ? tr('Créer un sujet', 'Create topic') : tr('Demander un sujet', 'Request a topic')}</div>`;
    const createBody = document.createElement('div');
    createBody.className = 'myspace-box-body';

    if (isLoggedIn()) {
        const form = document.createElement('div');
        form.className = 'myspace-form';

        const explain = document.createElement('div');
        explain.className = 'myspace-status';
        explain.style.marginBottom = '8px';
        explain.textContent = isAdmin()
            ? tr('Compte ADMIN : tu peux créer directement un sujet public.', 'ADMIN account: you can create a public topic directly.')
            : tr('Pour éviter le bazar, les membres proposent un sujet. Un ADMIN doit l’approuver avant sa publication.', 'To keep things organized, members request a topic. An ADMIN must approve it before publication.');

        const title = document.createElement('input');
        title.maxLength = 90;
        title.placeholder = tr('Titre du sujet', 'Topic title');

        const body = document.createElement('textarea');
        body.maxLength = 2000;
        body.placeholder = isAdmin() ? tr('Message d’ouverture…', 'Opening message…') : tr('Décris le sujet que tu voudrais ouvrir…', 'Describe the topic you would like to open…');

        const actions = document.createElement('div');
        actions.className = 'myspace-actions';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'myspace-btn primary';
        button.textContent = isAdmin() ? tr('Créer le sujet', 'Create topic') : tr('Envoyer la demande', 'Send request');

        button.addEventListener('click', async () => {
            if (!title.value.trim() || !body.value.trim()) return;
            button.disabled = true;
            try {
                if (isAdmin()) {
                    const data = await requestPOST('create_topic', {
                        title: title.value,
                        text: body.value
                    });
                    await openTopic(data.topic.id);
                    return;
                }

                await requestPOST('request_topic', {
                    title: title.value,
                    text: body.value
                });
                title.value = '';
                body.value = '';
                setStatus(tr('Demande envoyée aux administrateurs.', 'Request sent to the administrators.'), 'ok');
            } catch (error) {
                setStatus(tr('Action impossible : ', 'Action failed: ') + error.message, 'error');
            } finally {
                button.disabled = false;
            }
        });

        actions.appendChild(button);
        form.append(explain, title, body, actions);
        createBody.appendChild(form);
    } else {
        createBody.textContent = tr('Connecte-toi pour demander un sujet ou répondre aux discussions.', 'Sign in to request a topic or reply to discussions.');
    }

    create.appendChild(createBody);
    content.appendChild(create);

    if (isAdmin()) {
        try {
            const pending = await requestGET('forum_requests');
            if (!isCurrentView(viewEpoch, 'forums')) return;
            const requests = Array.isArray(pending.requests) ? pending.requests : [];

            const moderation = document.createElement('div');
            moderation.className = 'myspace-box';
            moderation.innerHTML = `<div class="myspace-box-title">${tr('Demandes en attente', 'Pending requests')}</div>`;

            if (!requests.length) {
                const empty = document.createElement('div');
                empty.className = 'myspace-box-body';
                empty.textContent = tr('Aucune demande de sujet.', 'No topic requests.');
                moderation.appendChild(empty);
            } else {
                requests.forEach((request) => {
                    const row = document.createElement('div');
                    row.className = 'myspace-forum-request';

                    const copy = document.createElement('div');
                    copy.className = 'myspace-forum-request-copy';

                    const title = document.createElement('div');
                    title.className = 'myspace-topic-title';
                    title.textContent = request.title || tr('Sans titre', 'Untitled');

                    const meta = document.createElement('div');
                    meta.className = 'myspace-topic-meta';
                    meta.textContent = `${tr('Demandé par', 'Requested by')} ${request.requesterName || tr('Utilisateur', 'User')} · ${formatDate(request.createdAt)}`;

                    const text = document.createElement('div');
                    text.className = 'myspace-forum-request-text';
                    text.textContent = request.text || '';

                    copy.append(title, meta, text);

                    const actions = document.createElement('div');
                    actions.className = 'myspace-forum-request-actions';

                    const approve = document.createElement('button');
                    approve.type = 'button';
                    approve.className = 'myspace-btn primary';
                    approve.textContent = tr('Approuver', 'Approve');

                    const reject = document.createElement('button');
                    reject.type = 'button';
                    reject.className = 'myspace-btn';
                    reject.textContent = tr('Refuser', 'Reject');

                    const decide = async (decision) => {
                        approve.disabled = true;
                        reject.disabled = true;
                        try {
                            const result = await requestPOST('moderate_topic_request', {
                                requestId: request.id,
                                decision
                            });
                            if (decision === 'approve' && result.topic?.id) {
                                await openTopic(result.topic.id);
                            } else {
                                await loadForums();
                            }
                        } catch (error) {
                            setStatus(tr('Modération impossible : ', 'Moderation failed: ') + error.message, 'error');
                            approve.disabled = false;
                            reject.disabled = false;
                        }
                    };

                    approve.addEventListener('click', () => decide('approve'));
                    reject.addEventListener('click', () => decide('reject'));
                    actions.append(approve, reject);
                    row.append(copy, actions);
                    moderation.appendChild(row);
                });
            }

            content.appendChild(moderation);
        } catch (error) {
            if (!isCurrentView(viewEpoch, 'forums')) return;
            setStatus(tr('Impossible de charger les demandes : ', 'Unable to load requests: ') + error.message, 'error');
        }
    }

    try {
        const data = await requestGET('topics');
        if (!isCurrentView(viewEpoch, 'forums')) return;
        setStatus('');
        const topics = Array.isArray(data.topics) ? data.topics : [];
        const box = document.createElement('div');
        box.className = 'myspace-box';
        box.innerHTML = '<div class="myspace-box-title">Forums AQ-NET</div>';

        if (!topics.length) {
            const empty = document.createElement('div');
            empty.className = 'myspace-empty';
            empty.textContent = tr('Aucun sujet pour le moment.', 'No topics yet.');
            box.appendChild(empty);
        } else {
            topics.forEach((topic) => {
                const row = document.createElement('div');
                row.className = 'myspace-topic';

                const forumIdentity = document.createElement('div');
                forumIdentity.className = 'myspace-topic-identity';

                const topicAvatar = makeMiniAvatar(topic.authorName || 'AQ-NET', topic.authorAvatar);

                const left = document.createElement('div');
                const title = document.createElement('div');
                title.className = 'myspace-topic-title';
                title.textContent = forumTitle(topic);

                const meta = document.createElement('div');
                meta.className = 'myspace-topic-meta';
                meta.textContent = `${tr('par', 'by')} ${topic.authorName || tr('Utilisateur', 'User')} · ${formatDate(topic.lastActivityAt || topic.createdAt)}`;

                left.append(title, meta);
                forumIdentity.append(topicAvatar, left);

                const count = document.createElement('div');
                count.textContent = `${topic.replyCount || 0} ${tr('rép.', 'repl.')}`;
                count.style.color = '#666';

                row.append(forumIdentity, count);
                row.addEventListener('click', () => openTopic(topic.id));
                box.appendChild(row);
            });
        }

        content.appendChild(box);
    } catch (error) {
        if (!isCurrentView(viewEpoch, 'forums')) return;
        setStatus(tr('Forums indisponibles : ', 'Forums unavailable: ') + error.message, 'error');
    }
}

async function openTopic(topicId) {
    const viewEpoch = beginView('forums');
    ms.topicId = topicId;
    setStatus(tr('Ouverture du sujet…', 'Opening topic…'));

    try {
        const data = await requestGET('topic', { topicId });
        if (!isCurrentView(viewEpoch, 'forums') || ms.topicId !== topicId) return;
        setStatus('');

        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'myspace-btn myspace-thread-back';
        back.textContent = tr('← Retour aux forums', '← Back to forums');
        back.addEventListener('click', loadForums);
        content.appendChild(back);

        const topicBox = document.createElement('div');
        topicBox.className = 'myspace-box';
        const title = document.createElement('div');
        title.className = 'myspace-thread-title';
        title.textContent = forumTitle(data.topic);

        const head = document.createElement('div');
        head.className = 'myspace-post-head';
        head.append(makeMiniAvatar(data.topic.authorName, data.topic.authorAvatar), makeAuthor(data.topic.authorId, data.topic.authorName, data.topic.authorRoles));
        const meta = document.createElement('div');
        meta.className = 'myspace-post-meta';
        meta.textContent = formatDate(data.topic.createdAt);
        head.appendChild(meta);

        const body = document.createElement('div');
        body.className = 'myspace-topic-body';
        body.textContent = forumText(data.topic);

        topicBox.append(title, head, body);
        content.appendChild(topicBox);

        (data.replies || []).forEach((reply) => {
            const replyBox = document.createElement('div');
            replyBox.className = 'myspace-post';
            const replyHead = document.createElement('div');
            replyHead.className = 'myspace-post-head';
            replyHead.append(makeMiniAvatar(reply.authorName, reply.authorAvatar), makeAuthor(reply.authorId, reply.authorName, reply.authorRoles));
            const replyMeta = document.createElement('div');
            replyMeta.className = 'myspace-post-meta';
            replyMeta.textContent = formatDate(reply.createdAt);
            replyHead.appendChild(replyMeta);
            const replyBody = document.createElement('div');
            replyBody.className = 'myspace-post-body';
            replyBody.textContent = reply.text || '';
            replyBox.append(replyHead, replyBody);
            content.appendChild(replyBox);
        });

        if (isLoggedIn()) {
            const replyForm = document.createElement('div');
            replyForm.className = 'myspace-box myspace-form';
            replyForm.innerHTML = `<div class="myspace-box-title orange">${tr('Répondre', 'Reply')}</div>`;
            const replyBody = document.createElement('div');
            replyBody.className = 'myspace-box-body';
            const textarea = document.createElement('textarea');
            textarea.maxLength = 1200;
            textarea.placeholder = tr('Ta réponse…', 'Your reply…');
            const actions = document.createElement('div');
            actions.className = 'myspace-actions';
            const send = document.createElement('button');
            send.type = 'button';
            send.className = 'myspace-btn primary';
            send.textContent = tr('Envoyer', 'Send');

            send.addEventListener('click', async () => {
                if (!textarea.value.trim()) return;
                send.disabled = true;
                try {
                    await requestPOST('reply_topic', {
                        topicId,
                        text: textarea.value
                    });
                    await openTopic(topicId);
                } catch (error) {
                    setStatus(tr('Réponse impossible : ', 'Unable to reply: ') + error.message, 'error');
                } finally {
                    send.disabled = false;
                }
            });

            actions.appendChild(send);
            replyBody.append(textarea, actions);
            replyForm.appendChild(replyBody);
            content.appendChild(replyForm);
        }
    } catch (error) {
        if (!isCurrentView(viewEpoch, 'forums') || ms.topicId !== topicId) return;
        setStatus(tr('Sujet indisponible : ', 'Topic unavailable: ') + error.message, 'error');
    }
}

function setActiveNav(tab) {
    document.querySelectorAll('.myspace-nav-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
    });
}

function refreshCurrentView() {
    if (!root) return;
    if (ms.tab === 'profile') {
        showProfile(ms.profileUserId || ms.session?.id);
    } else if (ms.tab === 'messages') {
        loadMessages();
    } else if (ms.tab === 'friends') {
        loadFriends();
    } else if (ms.tab === 'forums') {
        if (ms.topicId) openTopic(ms.topicId);
        else loadForums();
    } else {
        loadFeed();
    }
}

document.querySelectorAll('.myspace-nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (tab === 'profile') showProfile(ms.session?.id);
        else if (tab === 'messages') loadMessages();
        else if (tab === 'friends') loadFriends();
        else if (tab === 'forums') loadForums();
        else loadFeed();
    });
});

window.addEventListener('jaj:session-changed', async (event) => {
    await stopChatRealtime();
    ms.chatPeerId = null;
    ms.chatContacts = [];
    ms.session = event.detail || null;
    ms.selfAvatarData = '';
    ms.friendRequestsInitialized = false;
    ms.knownFriendRequestIds = new Set();
    updateSessionChrome();
    await refreshSelfAvatar();
    await startSocialPolling();
    if (document.getElementById('win-myspace')?.style.display === 'block') {
        refreshCurrentView();
    }
});

window.addEventListener('aq:myspace-open', async () => {
    ms.session = window.JAJSession || ms.session;
    updateSessionChrome();
    await refreshSelfAvatar();
    await sendPresenceHeartbeat();
    await refreshUnreadSummary({ notify: false });
    refreshCurrentView();
});

window.addEventListener('aq:friends-changed', () => {
    if (document.getElementById('win-myspace')?.style.display !== 'block') return;
    if (ms.tab === 'messages') loadMessages();
    if (ms.tab === 'friends') loadFriends();
    if (ms.tab === 'profile') showProfile(ms.profileUserId || ms.session?.id);
});

window.addEventListener('aq:language-changed', () => {
    applyMySpaceLanguage();
    if (document.getElementById('win-myspace')?.style.display === 'block') refreshCurrentView();
});

applyMySpaceLanguage();
updateSessionChrome();
refreshSelfAvatar();
startSocialPolling();

window.addEventListener('beforeunload', stopSocialPolling);
