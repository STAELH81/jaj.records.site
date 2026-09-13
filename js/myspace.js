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

function isLoggedIn() {
    return ms.session?.type === 'user';
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
        return new Intl.DateTimeFormat('fr-FR', {
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
    const name = session?.displayName || (session?.type === 'guest' ? 'Invité' : 'Hors ligne');
    const mail = session?.aquertyMail || '';
    const roles = session?.type === 'guest' ? ['guest'] : (session?.roles || []);

    if (sessionPill) {
        sessionPill.textContent = session
            ? `${name} // ${mail || 'session locale'}`
            : 'Aucune session';
    }
    if (selfName) selfName.textContent = name;
    if (selfMail) selfMail.textContent = mail || 'Lecture seule';
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
    setStatus('Connecte-toi avec un compte AQ-NEO pour publier, commenter ou réagir.', 'error');
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
    name.textContent = authorName || 'Utilisateur';
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
    ms.tab = 'feed';
    ms.profileUserId = null;
    ms.topicId = null;
    setActiveNav('feed');
    clearContent();
    setStatus('Chargement du bulletin MySpace…');

    const compose = document.createElement('div');
    compose.className = 'myspace-box myspace-compose';
    compose.innerHTML = '<div class="myspace-box-title orange">Bulletin Board</div>';
    const composeBody = document.createElement('div');
    composeBody.className = 'myspace-box-body';

    if (isLoggedIn()) {
        const textarea = document.createElement('textarea');
        textarea.maxLength = 800;
        textarea.placeholder = 'Quoi de neuf sur AQ-NET ?';

        const actions = document.createElement('div');
        actions.className = 'myspace-actions';
        const send = document.createElement('button');
        send.className = 'myspace-btn primary';
        send.type = 'button';
        send.textContent = 'Publier';

        send.addEventListener('click', async () => {
            const text = textarea.value.trim();
            if (!text) return;
            send.disabled = true;
            try {
                await requestPOST('create_post', { text });
                textarea.value = '';
                setStatus('Post publié.', 'ok');
                await loadFeed();
            } catch (error) {
                setStatus('Impossible de publier : ' + error.message, 'error');
            } finally {
                send.disabled = false;
            }
        });

        actions.appendChild(send);
        composeBody.append(textarea, actions);
    } else {
        const guest = document.createElement('div');
        guest.className = 'myspace-status';
        guest.textContent = 'Mode invité : tu peux lire MySpace, mais il faut un compte AQ-NEO pour participer.';
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
            welcome.innerHTML = '<div class="myspace-box-title">JAJ Network</div>';
            const body = document.createElement('div');
            body.className = 'myspace-box-body';
            body.textContent = 'Bienvenue sur AQ-MySpace. Le feed est vide : sois la première personne à poster quelque chose.';
            welcome.appendChild(body);
            content.appendChild(welcome);
            return;
        }

        posts.forEach((post) => content.appendChild(renderPost(post)));
    } catch (error) {
        setStatus('MySpace ne répond pas : ' + error.message, 'error');
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
                setStatus('Réaction impossible : ' + error.message, 'error');
                button.disabled = false;
            }
        });
        foot.appendChild(button);
    });

    const commentsBtn = document.createElement('button');
    commentsBtn.className = 'myspace-btn';
    commentsBtn.type = 'button';
    commentsBtn.textContent = `Commentaires (${post.commentCount || 0})`;
    foot.appendChild(commentsBtn);

    const comments = document.createElement('div');
    comments.className = 'myspace-comments';
    comments.hidden = true;

    commentsBtn.addEventListener('click', async () => {
        comments.hidden = !comments.hidden;
        if (comments.hidden || comments.dataset.loaded === '1') return;
        comments.textContent = 'Chargement…';
        try {
            const data = await requestGET('comments', { postId: post.id });
            renderComments(comments, post, data.comments || []);
            comments.dataset.loaded = '1';
        } catch (error) {
            comments.textContent = 'Impossible de charger les commentaires.';
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
        empty.textContent = 'Aucun commentaire pour le moment.';
        container.appendChild(empty);
    }

    comments.forEach((comment) => {
        const row = document.createElement('div');
        row.className = 'myspace-comment';

        const meta = document.createElement('div');
        meta.className = 'myspace-comment-meta';

        const author = document.createElement('span');
        author.className = 'myspace-author';
        author.textContent = comment.authorName || 'Utilisateur';
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
        textarea.placeholder = 'Ajouter un commentaire…';
        textarea.style.minHeight = '52px';

        const actions = document.createElement('div');
        actions.className = 'myspace-actions';
        const submit = document.createElement('button');
        submit.type = 'button';
        submit.className = 'myspace-btn primary';
        submit.textContent = 'Commenter';

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
                setStatus('Commentaire impossible : ' + error.message, 'error');
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
        empty.textContent = 'Aucun profil disponible en mode hors ligne.';
        content.appendChild(empty);
        return;
    }

    setStatus('Chargement du profil…');

    try {
        const data = await requestGET('profile', { userId: ms.profileUserId });
        setStatus('');
        renderProfile(data.profile, ms.profileUserId === ms.session?.id && isLoggedIn());
    } catch (error) {
        setStatus('Profil indisponible : ' + error.message, 'error');
    }
}

function renderProfile(profile, editable) {
    if (!profile) {
        const empty = document.createElement('div');
        empty.className = 'myspace-empty';
        empty.textContent = 'Ce profil MySpace n’a pas encore été configuré.';
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
    name.textContent = profile.displayName || 'Utilisateur';

    const headline = document.createElement('div');
    headline.className = 'myspace-profile-headline';
    headline.textContent = profile.headline || 'Pas encore de headline.';

    const badges = roleBadges(profile.roles || []);
    badges.style.justifyContent = 'flex-start';

    copy.append(name, headline, badges);
    header.append(avatar, copy);
    content.appendChild(header);

    const details = document.createElement('dl');
    details.className = 'myspace-profile-grid';
    const pairs = [
        ['AQ-Mail', profile.aquertyMail || '—'],
        ['Localisation', profile.location || '—'],
        ['Musique', profile.favoriteMusic || '—'],
        ['À propos', profile.bio || '—']
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
    editor.innerHTML = '<div class="myspace-box-title orange">Edit Profile</div>';

    const form = document.createElement('div');
    form.className = 'myspace-box-body myspace-form';

    const fields = [
        ['displayName', 'Nom affiché', 40, false],
        ['headline', 'Headline', 100, false],
        ['location', 'Localisation', 80, false],
        ['favoriteMusic', 'Musique / artistes favoris', 180, false],
        ['bio', 'À propos de moi', 700, true]
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
    save.textContent = 'Sauvegarder le profil';

    save.addEventListener('click', async () => {
        save.disabled = true;
        try {
            const payload = Object.fromEntries(
                Object.entries(inputs).map(([key, input]) => [key, input.value])
            );
            payload.aquertyMail = ms.session?.aquertyMail || profile.aquertyMail;
            const data = await requestPOST('save_profile', payload);
            setStatus('Profil sauvegardé.', 'ok');
            renderProfileRefresh(data.profile);
        } catch (error) {
            setStatus('Sauvegarde impossible : ' + error.message, 'error');
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

async function loadForums() {
    ms.tab = 'forums';
    ms.profileUserId = null;
    ms.topicId = null;
    setActiveNav('forums');
    clearContent();
    setStatus('Chargement des forums…');

    const create = document.createElement('div');
    create.className = 'myspace-box';
    create.innerHTML = '<div class="myspace-box-title orange">Nouveau topic</div>';
    const createBody = document.createElement('div');
    createBody.className = 'myspace-box-body';

    if (isLoggedIn()) {
        const form = document.createElement('div');
        form.className = 'myspace-form';
        const title = document.createElement('input');
        title.maxLength = 90;
        title.placeholder = 'Titre du topic';
        const body = document.createElement('textarea');
        body.maxLength = 2000;
        body.placeholder = 'Message…';

        const actions = document.createElement('div');
        actions.className = 'myspace-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'myspace-btn primary';
        button.textContent = 'Créer le topic';

        button.addEventListener('click', async () => {
            if (!title.value.trim() || !body.value.trim()) return;
            button.disabled = true;
            try {
                const data = await requestPOST('create_topic', {
                    title: title.value,
                    text: body.value
                });
                await openTopic(data.topic.id);
            } catch (error) {
                setStatus('Création impossible : ' + error.message, 'error');
            } finally {
                button.disabled = false;
            }
        });

        actions.appendChild(button);
        form.append(title, body, actions);
        createBody.appendChild(form);
    } else {
        createBody.textContent = 'Connecte-toi pour créer un topic ou répondre.';
    }

    create.appendChild(createBody);
    content.appendChild(create);

    try {
        const data = await requestGET('topics');
        setStatus('');
        const topics = Array.isArray(data.topics) ? data.topics : [];
        const box = document.createElement('div');
        box.className = 'myspace-box';
        box.innerHTML = '<div class="myspace-box-title">Forums AQ-NET</div>';

        if (!topics.length) {
            const empty = document.createElement('div');
            empty.className = 'myspace-empty';
            empty.textContent = 'Aucun topic pour le moment.';
            box.appendChild(empty);
        } else {
            topics.forEach((topic) => {
                const row = document.createElement('div');
                row.className = 'myspace-topic';

                const left = document.createElement('div');
                const title = document.createElement('div');
                title.className = 'myspace-topic-title';
                title.textContent = topic.title || 'Sans titre';
                const meta = document.createElement('div');
                meta.className = 'myspace-topic-meta';
                meta.textContent = `par ${topic.authorName || 'Utilisateur'} · ${formatDate(topic.lastActivityAt || topic.createdAt)}`;
                left.append(title, meta);

                const count = document.createElement('div');
                count.textContent = `${topic.replyCount || 0} rép.`;
                count.style.color = '#666';

                row.append(left, count);
                row.addEventListener('click', () => openTopic(topic.id));
                box.appendChild(row);
            });
        }

        content.appendChild(box);
    } catch (error) {
        setStatus('Forums indisponibles : ' + error.message, 'error');
    }
}

async function openTopic(topicId) {
    ms.tab = 'forums';
    ms.topicId = topicId;
    setActiveNav('forums');
    clearContent();
    setStatus('Ouverture du topic…');

    try {
        const data = await requestGET('topic', { topicId });
        setStatus('');

        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'myspace-btn myspace-thread-back';
        back.textContent = '← Retour aux forums';
        back.addEventListener('click', loadForums);
        content.appendChild(back);

        const topicBox = document.createElement('div');
        topicBox.className = 'myspace-box';
        const title = document.createElement('div');
        title.className = 'myspace-thread-title';
        title.textContent = data.topic.title || 'Topic';

        const head = document.createElement('div');
        head.className = 'myspace-post-head';
        head.append(makeMiniAvatar(data.topic.authorName), makeAuthor(data.topic.authorId, data.topic.authorName, data.topic.authorRoles));
        const meta = document.createElement('div');
        meta.className = 'myspace-post-meta';
        meta.textContent = formatDate(data.topic.createdAt);
        head.appendChild(meta);

        const body = document.createElement('div');
        body.className = 'myspace-topic-body';
        body.textContent = data.topic.text || '';

        topicBox.append(title, head, body);
        content.appendChild(topicBox);

        (data.replies || []).forEach((reply) => {
            const replyBox = document.createElement('div');
            replyBox.className = 'myspace-post';
            const replyHead = document.createElement('div');
            replyHead.className = 'myspace-post-head';
            replyHead.append(makeMiniAvatar(reply.authorName), makeAuthor(reply.authorId, reply.authorName, reply.authorRoles));
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
            replyForm.innerHTML = '<div class="myspace-box-title orange">Répondre</div>';
            const replyBody = document.createElement('div');
            replyBody.className = 'myspace-box-body';
            const textarea = document.createElement('textarea');
            textarea.maxLength = 1200;
            textarea.placeholder = 'Ta réponse…';
            const actions = document.createElement('div');
            actions.className = 'myspace-actions';
            const send = document.createElement('button');
            send.type = 'button';
            send.className = 'myspace-btn primary';
            send.textContent = 'Envoyer';

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
                    setStatus('Réponse impossible : ' + error.message, 'error');
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
        setStatus('Topic indisponible : ' + error.message, 'error');
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

updateSessionChrome();
