import { mountForums, unmountForums } from './forums.js';
let viewGeneration=0;
const MYSPACE_API = '/api/myspace';

const ms = {
    session: window.JAJSession || null,
    tab: 'feed',
    profileUserId: null,
    topicId: null,
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

    const nav = document.querySelectorAll('#win-myspace .myspace-nav-btn');
    if (nav[0]) nav[0].textContent = tr('Accueil', 'Home');
    if (nav[1]) nav[1].textContent = tr('Mon profil', 'My profile');
    if (nav[2]) nav[2].textContent = 'Forums';

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
    if (selfAvatar) selfAvatar.textContent = initial(name);
    if (selfRoles) {
        selfRoles.innerHTML = '';
        selfRoles.appendChild(roleBadges(roles));
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

function requireAccount() {
    if (isLoggedIn()) return true;
    setStatus(tr('Connecte-toi avec un compte AQ-NEO pour publier, commenter ou réagir.', 'Sign in with an AQ-NEO account to post, comment or react.'), 'error');
    return false;
}

function clearContent() {
    if (content) content.innerHTML = '';
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

function makeMiniAvatar(name) {
    const avatar = document.createElement('div');
    avatar.className = 'myspace-mini-avatar';
    avatar.textContent = initial(name);
    return avatar;
}

async function loadFeed() {
    const token=++viewGeneration;
    ms.tab = 'feed';
    ms.profileUserId = null;
    ms.topicId = null;
    setActiveNav('feed');
    clearContent();
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
        if(token!==viewGeneration)return;
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
        setStatus(tr('MySpace ne répond pas : ', 'MySpace is not responding: ') + error.message, 'error');
    }
}

function renderPost(post) {
    const card = document.createElement('article');
    card.className = 'myspace-post';

    const head = document.createElement('div');
    head.className = 'myspace-post-head';
    head.appendChild(makeMiniAvatar(post.authorName));
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

        const meta = document.createElement('div');
        meta.className = 'myspace-comment-meta';

        const author = document.createElement('span');
        author.className = 'myspace-author';
        author.textContent = comment.authorName || tr('Utilisateur', 'User');
        author.addEventListener('click', () => showProfile(comment.authorId));

        meta.append(author, document.createTextNode(' · ' + formatDate(comment.createdAt)));

        const body = document.createElement('div');
        body.className = 'myspace-comment-body';
        body.textContent = comment.text || '';

        row.append(meta, body);
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
    const token=++viewGeneration;
    ms.tab = 'profile';
    ms.profileUserId = userId || ms.session?.id || null;
    ms.topicId = null;
    setActiveNav('profile');
    clearContent();

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
        if(token!==viewGeneration)return;
        setStatus('');
        renderProfile(data.profile, ms.profileUserId === ms.session?.id && isLoggedIn());
    } catch (error) {
        setStatus(tr('Profil indisponible : ', 'Profile unavailable: ') + error.message, 'error');
    }
}

function renderProfile(profile, editable) {
    if (!profile) {
        const empty = document.createElement('div');
        empty.className = 'myspace-empty';
        empty.textContent = tr('Ce profil MySpace n’a pas encore été configuré.', 'This MySpace profile has not been configured yet.');
        content.appendChild(empty);
        return;
    }

    const header = document.createElement('div');
    header.className = 'myspace-profile-header';

    const avatar = document.createElement('div');
    avatar.className = 'myspace-avatar';
    avatar.style.margin = '0';
    avatar.textContent = initial(profile.displayName);

    const copy = document.createElement('div');
    copy.className = 'myspace-profile-copy';

    const name = document.createElement('div');
    name.className = 'myspace-profile-name';
    name.textContent = profile.displayName || tr('Utilisateur', 'User');

    const headline = document.createElement('div');
    headline.className = 'myspace-profile-headline';
    headline.textContent = profile.headline || tr('Pas encore de statut.', 'No status yet.');

    const badges = roleBadges(profile.roles || []);
    badges.style.justifyContent = 'flex-start';

    copy.append(name, headline, badges);
    header.append(avatar, copy);
    content.appendChild(header);

    const details = document.createElement('dl');
    details.className = 'myspace-profile-grid';
    const pairs = [
        ['AQ-Mail', profile.aquertyMail || '—'],
        [tr('Localisation', 'Location'), profile.location || '—'],
        [tr('Musique', 'Music'), profile.favoriteMusic || '—'],
        [tr('À propos', 'About'), profile.bio || '—']
    ];
    pairs.forEach(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        details.append(dt, dd);
    });
    content.appendChild(details);

    if (!editable) {
        if(isLoggedIn() && profile.userId!==ms.session.id){const mail=document.createElement('button');mail.className='myspace-btn';mail.textContent=tr('Écrire sur AQ-Mail','Write on AQ-Mail');mail.addEventListener('click',()=>window.AQMail?.compose({toId:profile.userId}));content.append(mail);}
        return;
    }

    const editor = document.createElement('div');
    editor.className = 'myspace-box';
    editor.style.marginTop = '10px';
    editor.innerHTML = `<div class="myspace-box-title orange">${tr('Modifier le profil', 'Edit profile')}</div>`;

    const form = document.createElement('div');
    form.className = 'myspace-box-body myspace-form';

    const fields = [
        ['displayName', tr('Nom affiché', 'Display name'), 40, false],
        ['headline', tr('Statut / phrase de profil', 'Status / profile line'), 100, false],
        ['location', tr('Localisation', 'Location'), 80, false],
        ['favoriteMusic', tr('Musique / artistes favoris', 'Favorite music / artists'), 180, false],
        ['bio', tr('À propos de moi', 'About me'), 700, true]
    ];

    const inputs = {};
    fields.forEach(([key, label, max, multiline]) => {
        const wrap = document.createElement('label');
        const title = document.createElement('span');
        title.textContent = label;
        const input = multiline ? document.createElement('textarea') : document.createElement('input');
        input.maxLength = max;
        input.value = profile[key] || '';
        if (multiline) input.style.minHeight = '100px';
        inputs[key] = input;
        wrap.append(title, input);
        form.appendChild(wrap);
    });

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
            const data = await requestPOST('save_profile', payload);
            setStatus(tr('Profil sauvegardé.', 'Profile saved.'), 'ok');
            renderProfileRefresh(data.profile);
        } catch (error) {
            setStatus(tr('Sauvegarde impossible : ', 'Unable to save: ') + error.message, 'error');
        } finally {
            save.disabled = false;
        }
    });

    actions.appendChild(save);
    form.appendChild(actions);
    editor.appendChild(form);
    content.appendChild(editor);
}

function renderProfileRefresh(profile) {
    clearContent();
    renderProfile(profile, true);
}

function loadForums() {
    viewGeneration++;
    ms.tab = 'forums'; ms.topicId = null;
    setActiveNav('forums'); setStatus('');
    mountForums(content);
}

function setActiveNav(tab) {
    if (tab !== 'forums') unmountForums();
    document.querySelectorAll('.myspace-nav-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
    });
}

function refreshCurrentView() {
    if (!root) return;
    if (ms.tab === 'profile') {
        showProfile(ms.profileUserId || ms.session?.id);
    } else if (ms.tab === 'forums') {
        loadForums();
    } else {
        loadFeed();
    }
}

document.querySelectorAll('.myspace-nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (tab === 'profile') showProfile(ms.session?.id);
        else if (tab === 'forums') loadForums();
        else loadFeed();
    });
});

window.addEventListener('jaj:session-changed', (event) => {
    ms.session = event.detail || null;
    updateSessionChrome();
    if (document.getElementById('win-myspace')?.style.display === 'block') {
        refreshCurrentView();
    }
});

window.addEventListener('aq:myspace-open', () => {
    ms.session = window.JAJSession || ms.session;
    updateSessionChrome();
    refreshCurrentView();
});

window.addEventListener('aq:language-changed', () => {
    applyMySpaceLanguage();
    if (document.getElementById('win-myspace')?.style.display === 'block') refreshCurrentView();
});

applyMySpaceLanguage();
updateSessionChrome();
