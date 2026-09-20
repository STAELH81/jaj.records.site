const MYSPACE_API = '/api/myspace';

const ms = {
    session: window.JAJSession || null,
    tab: 'feed',
    profileUserId: null,
    topicId: null,
    selfAvatarData: '',
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
    if (nav[3]) nav[3].textContent = isAdmin()
        ? tr('Demandes de forum', 'Forum requests')
        : tr('Proposer un forum', 'Request a forum');

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

function makeMiniAvatar(name, avatarUrl = '') {
    const avatar = document.createElement('div');
    avatar.className = 'myspace-mini-avatar';
    applyAvatarElement(avatar, name, avatarUrl);
    return avatar;
}

async function loadFeed() {
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
        setStatus('');
        if (ms.profileUserId === ms.session?.id) {
            ms.selfAvatarData = data.profile?.avatar || '';
            updateSessionChrome();
        }
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
    applyAvatarElement(avatar, profile.displayName, profile.avatar);

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
    avatarRow.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;';

    const avatarPreview = document.createElement('div');
    avatarPreview.className = 'myspace-avatar';
    avatarPreview.style.cssText += ';width:72px;height:72px;margin:0;font-size:32px;flex:0 0 72px;';
    applyAvatarElement(avatarPreview, profile.displayName, avatarData);

    const avatarControls = document.createElement('div');
    avatarControls.style.flex = '1';

    const avatarInput = document.createElement('input');
    avatarInput.type = 'file';
    avatarInput.accept = 'image/png,image/jpeg,image/webp';
    avatarInput.style.width = '100%';

    const avatarHelp = document.createElement('div');
    avatarHelp.className = 'myspace-status';
    avatarHelp.style.marginTop = '5px';
    avatarHelp.textContent = tr('PNG, JPEG ou WebP · 1 Mo max.', 'PNG, JPEG or WebP · 1 MB max.');

    const removeAvatar = document.createElement('button');
    removeAvatar.type = 'button';
    removeAvatar.className = 'myspace-btn';
    removeAvatar.style.marginTop = '5px';
    removeAvatar.textContent = tr('Retirer la photo', 'Remove picture');
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
            payload.avatar = avatarData;
            const data = await requestPOST('save_profile', payload);
            ms.selfAvatarData = data.profile?.avatar || '';
            updateSessionChrome();
            setStatus(tr('Profil sauvegardé.', 'Profile saved.'), 'ok');
            renderProfileRefresh(data.profile);
        } catch (error) {
            const friendly = error.message === 'avatar_too_large'
                ? tr('La photo dépasse 1 Mo.', 'The picture exceeds 1 MB.')
                : error.message === 'invalid_avatar'
                    ? tr('Format de photo invalide.', 'Invalid picture format.')
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

function renderProfileRefresh(profile) {
    clearContent();
    renderProfile(profile, true);
}

function forumTitle(topic) {
    if (!topic) return tr('Sans titre', 'Untitled');
    return isEnglish() ? (topic.titleEn || topic.title || 'Untitled') : (topic.title || topic.titleEn || 'Sans titre');
}

function forumText(topic) {
    if (!topic) return '';
    return isEnglish() ? (topic.textEn || topic.text || '') : (topic.text || topic.textEn || '');
}

async function loadForums() {
    ms.tab = 'forums';
    ms.profileUserId = null;
    ms.topicId = null;
    setActiveNav('forums');
    clearContent();
    setStatus(tr('Chargement des forums…', 'Loading forums…'));

    try {
        const data = await requestGET('topics');
        setStatus('');
        const topics = Array.isArray(data.topics) ? data.topics : [];

        const intro = document.createElement('div');
        intro.className = 'myspace-box';
        intro.innerHTML = `<div class="myspace-box-title orange">${tr('Forums AQ-NET', 'AQ-NET Forums')}</div>`;
        const introBody = document.createElement('div');
        introBody.className = 'myspace-box-body';
        introBody.textContent = tr(
            'Choisis un forum pour discuter. Les nouveaux forums se proposent depuis l’onglet dédié.',
            'Choose a forum to chat. New forums can be requested from the dedicated tab.'
        );
        intro.appendChild(introBody);
        content.appendChild(intro);

        const box = document.createElement('div');
        box.className = 'myspace-box';
        box.innerHTML = `<div class="myspace-box-title">${tr('Communautés', 'Communities')}</div>`;

        if (!topics.length) {
            const empty = document.createElement('div');
            empty.className = 'myspace-empty';
            empty.textContent = tr('Aucun forum pour le moment.', 'No forums yet.');
            box.appendChild(empty);
        } else {
            topics.forEach((topic) => {
                const row = document.createElement('div');
                row.className = 'myspace-topic';

                const left = document.createElement('div');
                const title = document.createElement('div');
                title.className = 'myspace-topic-title';
                title.textContent = forumTitle(topic);

                const meta = document.createElement('div');
                meta.className = 'myspace-topic-meta';
                meta.textContent = topic.defaultForum
                    ? tr('Forum officiel AQ-NET', 'Official AQ-NET forum')
                    : `${tr('créé par', 'created by')} ${topic.authorName || tr('Utilisateur', 'User')} · ${formatDate(topic.lastActivityAt || topic.createdAt)}`;

                const description = document.createElement('div');
                description.style.cssText = 'margin-top:4px;color:#555;font-size:10px;';
                description.textContent = forumText(topic).slice(0, 180);

                left.append(title, meta, description);

                const count = document.createElement('div');
                count.textContent = `${topic.replyCount || 0} ${tr('rép.', 'repl.')}`;
                count.style.color = '#666';

                row.append(left, count);
                row.addEventListener('click', () => openTopic(topic.id));
                box.appendChild(row);
            });
        }

        content.appendChild(box);
    } catch (error) {
        setStatus(tr('Forums indisponibles : ', 'Forums unavailable: ') + error.message, 'error');
    }
}

async function loadForumRequests() {
    ms.tab = 'forum-request';
    ms.profileUserId = null;
    ms.topicId = null;
    setActiveNav('forum-request');
    clearContent();
    setStatus('');

    const create = document.createElement('div');
    create.className = 'myspace-box';
    create.innerHTML = `<div class="myspace-box-title orange">${isAdmin() ? tr('Créer un forum', 'Create forum') : tr('Proposer un forum', 'Request a forum')}</div>`;
    const createBody = document.createElement('div');
    createBody.className = 'myspace-box-body';

    if (isLoggedIn()) {
        const form = document.createElement('div');
        form.className = 'myspace-form';

        const explain = document.createElement('div');
        explain.className = 'myspace-status';
        explain.style.marginBottom = '8px';
        explain.textContent = isAdmin()
            ? tr('Compte ADMIN : le forum sera publié immédiatement.', 'ADMIN account: the forum will be published immediately.')
            : tr('Ta proposition sera envoyée aux ADMIN avant publication.', 'Your request will be sent to ADMIN users before publication.');

        const title = document.createElement('input');
        title.maxLength = 90;
        title.placeholder = tr('Nom du forum', 'Forum name');

        const body = document.createElement('textarea');
        body.maxLength = 2000;
        body.placeholder = tr('Description / message d’ouverture…', 'Description / opening message…');

        const actions = document.createElement('div');
        actions.className = 'myspace-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'myspace-btn primary';
        button.textContent = isAdmin() ? tr('Créer le forum', 'Create forum') : tr('Envoyer la demande', 'Send request');

        button.addEventListener('click', async () => {
            if (!title.value.trim() || !body.value.trim()) return;
            button.disabled = true;
            try {
                if (isAdmin()) {
                    const data = await requestPOST('create_topic', { title: title.value, text: body.value });
                    await openTopic(data.topic.id);
                    return;
                }
                await requestPOST('request_topic', { title: title.value, text: body.value });
                title.value = '';
                body.value = '';
                setStatus(tr('Demande de forum envoyée aux administrateurs.', 'Forum request sent to the administrators.'), 'ok');
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
        createBody.textContent = tr('Connecte-toi pour proposer un nouveau forum.', 'Sign in to request a new forum.');
    }

    create.appendChild(createBody);
    content.appendChild(create);

    if (!isAdmin()) return;

    try {
        const pending = await requestGET('forum_requests');
        const requests = Array.isArray(pending.requests) ? pending.requests : [];
        const moderation = document.createElement('div');
        moderation.className = 'myspace-box';
        moderation.innerHTML = `<div class="myspace-box-title">${tr('Demandes en attente', 'Pending requests')}</div>`;

        if (!requests.length) {
            const empty = document.createElement('div');
            empty.className = 'myspace-box-body';
            empty.textContent = tr('Aucune demande de forum.', 'No forum requests.');
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
                        const result = await requestPOST('moderate_topic_request', { requestId: request.id, decision });
                        if (decision === 'approve' && result.topic?.id) await openTopic(result.topic.id);
                        else await loadForumRequests();
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
        setStatus(tr('Impossible de charger les demandes : ', 'Unable to load requests: ') + error.message, 'error');
    }
}

async function openTopic(topicId) {
    ms.tab = 'forums';
    ms.topicId = topicId;
    setActiveNav('forums');
    clearContent();
    setStatus(tr('Ouverture du sujet…', 'Opening topic…'));

    try {
        const data = await requestGET('topic', { topicId });
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
        title.textContent = forumTitle(data.topic) || tr('Sujet', 'Topic');

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
    } else if (ms.tab === 'forums') {
        if (ms.topicId) openTopic(ms.topicId);
        else loadForums();
    } else if (ms.tab === 'forum-request') {
        loadForumRequests();
    } else {
        loadFeed();
    }
}

document.querySelectorAll('.myspace-nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (tab === 'profile') showProfile(ms.session?.id);
        else if (tab === 'forums') loadForums();
        else if (tab === 'forum-request') loadForumRequests();
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
