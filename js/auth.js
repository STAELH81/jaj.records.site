import './cloud-sync.js';
const AUTH_API_PATH = '/api/aq-auth';

async function authApi(method = 'GET', payload = null) {
    const options = {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
    };

    if (payload) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
    }

    const response = await fetch(AUTH_API_PATH, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data?.message || data?.error || `AQ Auth failed (${response.status})`);
        error.status = response.status;
        throw error;
    }

    return data;
}

const RECENT_ACCOUNTS_KEY = 'jaj_recent_accounts_v1';
const GUEST_SESSION_KEY = 'jaj_guest_session_v1';
const MAX_RECENT_ACCOUNTS = 4;

const welcomeEl = document.getElementById('account-welcome');
const statusEl = document.getElementById('aq-auth-status');
const recentRoot = document.getElementById('aq-recent-accounts');
const guestBtn = document.getElementById('aq-guest-btn');
const otherCard = document.getElementById('aq-other-card');
const otherToggle = document.getElementById('aq-other-toggle');
const loginForm = document.getElementById('aq-login-form');
const loginEmail = document.getElementById('aq-login-email');
const loginPassword = document.getElementById('aq-login-password');
const loginCancel = document.getElementById('aq-login-cancel');
const createCard = document.getElementById('aq-create-card');
const createToggle = document.getElementById('aq-create-toggle');
const signupForm = document.getElementById('aq-signup-form');
const signupName = document.getElementById('aq-signup-name');
const signupEmail = document.getElementById('aq-signup-email');
const signupPassword = document.getElementById('aq-signup-password');
const signupCancel = document.getElementById('aq-signup-cancel');
const switchUserBtn = document.getElementById('aq-switch-user-btn');
const logoutBtn = document.getElementById('aq-logout-btn');
const sessionSummary = document.getElementById('aq-session-summary');

let currentIdentityUser = null;
let currentSession = null;
let busy = false;

function setStatus(message = '', type = '') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'aq-auth-status' + (type ? ` ${type}` : '');
}

function setBusy(value) {
    busy = !!value;
    document.querySelectorAll('#account-welcome button, #account-welcome input').forEach((el) => {
        el.disabled = busy;
    });
}

function slugify(value) {
    return String(value || 'user')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 18) || 'user';
}

function shortToken(size = 4) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (n) => (n % 36).toString(36)).join('');
}

function getDisplayName(user) {
    const metadata = user?.user_metadata || {};
    return metadata.display_name || metadata.full_name || user?.email?.split('@')[0] || 'Utilisateur';
}

function buildAquertyMail(user) {
    const metadata = user?.user_metadata || {};
    if (metadata.aquerty_mail) return metadata.aquerty_mail;
    const idPart = String(user?.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase();
    return `${slugify(getDisplayName(user))}.${idPart || 'neo'}@aquerty.fr`;
}

function normalizeRoleList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(
        value
            .map((role) => String(role).trim().toLowerCase())
            .filter(Boolean)
    )];
}

function normalizeRoles(user) {
    if (Array.isArray(user?.roles)) return normalizeRoleList(user.roles);
    if (Array.isArray(user?.app_metadata?.roles)) return normalizeRoleList(user.app_metadata.roles);
    if (Array.isArray(user?.appMetadata?.roles)) return normalizeRoleList(user.appMetadata.roles);
    return [];
}

async function refreshUserFromServer(user) {
    try {
        const result = await authApi('GET');
        if (!result?.authenticated || !result?.user) return user || null;
        return result.user;
    } catch (error) {
        console.warn('[JAJ Auth] live user refresh failed', error);
        return user || null;
    }
}

function rankRoles(roles) {
    const priority = ['admin', 'artist'];
    return [...roles].sort((a, b) => {
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);
        if (ai !== -1 || bi !== -1) {
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        }
        return a.localeCompare(b);
    });
}

function rolesForDisplay(session) {
    if (!session) return [];
    if (session.type === 'guest') return ['guest'];
    const roles = rankRoles(normalizeRoleList(session.roles));
    return roles.length ? roles : ['user'];
}

function sessionFromUser(user) {
    const roles = normalizeRoles(user);
    const isAdmin = roles.includes('admin');
    const isArtist = roles.includes('artist');
    const ranked = rankRoles(roles);
    return {
        type: 'user',
        id: user.id,
        email: user.email,
        displayName: getDisplayName(user),
        aquertyMail: buildAquertyMail(user),
        roles,
        isArtist,
        isAdmin,
        primaryRole: ranked[0] || 'user'
    };
}

function loadRecentAccounts() {
    try {
        const parsed = JSON.parse(localStorage.getItem(RECENT_ACCOUNTS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveRecentAccounts(accounts) {
    localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, MAX_RECENT_ACCOUNTS)));
}

function rememberAccount(session) {
    if (!session || session.type !== 'user' || !session.email) return;
    const email = session.email.toLowerCase();
    const next = loadRecentAccounts().filter((item) => String(item.email).toLowerCase() !== email);
    next.unshift({
        email: session.email,
        displayName: session.displayName,
        aquertyMail: session.aquertyMail,
        roles: normalizeRoleList(session.roles),
        isArtist: !!session.isArtist,
        isAdmin: !!session.isAdmin,
        primaryRole: session.primaryRole || rankRoles(normalizeRoleList(session.roles))[0] || 'user',
        lastUsed: Date.now()
    });
    saveRecentAccounts(next);
}

function maskEmail(email) {
    const [name = '', domain = ''] = String(email || '').split('@');
    if (!domain) return email || '';
    const visible = name.slice(0, Math.min(3, name.length));
    return `${visible}${name.length > 3 ? '•••' : ''}@${domain}`;
}

function avatarInitial(name) {
    const first = String(name || '?').trim().charAt(0);
    return first ? first.toUpperCase() : '?';
}

function closeInlineForms() {
    if (loginForm) loginForm.hidden = true;
    if (signupForm) signupForm.hidden = true;
    otherCard?.classList.remove('active');
    createCard?.classList.remove('active');
    document.querySelectorAll('.aq-recent-login').forEach((form) => form.remove());
    document.querySelectorAll('.aq-account-card.recent').forEach((card) => card.classList.remove('active'));
}

function renderRecentAccounts() {
    if (!recentRoot) return;
    recentRoot.innerHTML = '';

    const recent = loadRecentAccounts();
    const currentEmail = currentIdentityUser?.email?.toLowerCase();

    if (currentIdentityUser) {
        const session = sessionFromUser(currentIdentityUser);
        const freshAccount = {
            email: session.email,
            displayName: session.displayName,
            aquertyMail: session.aquertyMail,
            roles: [...session.roles],
            isArtist: session.isArtist,
            isAdmin: session.isAdmin,
            primaryRole: session.primaryRole,
            lastUsed: Date.now()
        };
        const existingIndex = recent.findIndex((item) => String(item.email).toLowerCase() === currentEmail);
        if (existingIndex >= 0) {
            recent[existingIndex] = { ...recent[existingIndex], ...freshAccount };
        } else {
            recent.unshift(freshAccount);
        }
    }

    recent.slice(0, MAX_RECENT_ACCOUNTS).forEach((account) => {
        const card = document.createElement('div');
        card.className = 'aq-account-card recent';
        const isCurrent = currentEmail && String(account.email).toLowerCase() === currentEmail;
        if (isCurrent) card.classList.add('current');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'aq-account-select';

        const avatar = document.createElement('span');
        avatar.className = 'aq-avatar';
        avatar.textContent = avatarInitial(account.displayName);

        const copy = document.createElement('span');
        copy.className = 'aq-account-copy';

        const title = document.createElement('strong');
        title.textContent = account.displayName || account.email;

        let accountRoles = normalizeRoleList(account.roles);
        if (!accountRoles.length) {
            // Migrate old locally remembered account cards that predate exact role storage.
            if (account.isAdmin) accountRoles = ['admin'];
            else if (account.isArtist) accountRoles = ['artist'];
        }
        const displayRoles = accountRoles.length ? rankRoles(accountRoles) : ['user'];
        displayRoles.forEach((role) => {
            const badge = document.createElement('span');
            badge.className = 'aq-account-badge';
            badge.dataset.role = role;
            badge.textContent = role.toUpperCase();
            title.appendChild(badge);
        });

        const sub = document.createElement('small');
        sub.textContent = isCurrent
            ? `${account.aquertyMail || maskEmail(account.email)} · session active`
            : (account.aquertyMail || maskEmail(account.email));

        const arrow = document.createElement('span');
        arrow.className = 'aq-account-arrow';
        arrow.textContent = '›';

        copy.append(title, sub);
        button.append(avatar, copy, arrow);
        card.append(button);
        recentRoot.append(card);

        button.addEventListener('click', async () => {
            if (busy) return;
            closeInlineForms();

            if (isCurrent && currentIdentityUser) {
                setBusy(true);
                try {
                    currentIdentityUser = await refreshUserFromServer(currentIdentityUser);
                    renderRecentAccounts();
                    await enterSession(sessionFromUser(currentIdentityUser));
                } finally {
                    setBusy(false);
                }
                return;
            }

            card.classList.add('active');
            const form = document.createElement('form');
            form.className = 'aq-inline-form aq-recent-login';
            form.innerHTML = `
                <label>
                    <span>Mot de passe</span>
                    <input type="password" autocomplete="current-password" required minlength="6">
                </label>
                <div class="aq-inline-actions">
                    <button type="button" class="aq-mini-btn aq-recent-cancel">Annuler</button>
                    <button type="submit" class="aq-mini-btn aq-mini-btn-primary">Connexion ›</button>
                </div>
            `;
            card.append(form);
            const passwordInput = form.querySelector('input');
            passwordInput.focus();

            form.querySelector('.aq-recent-cancel').addEventListener('click', closeInlineForms);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                await doLogin(account.email, passwordInput.value);
            });
        });
    });
}

function makeGuestSession() {
    let guestId = sessionStorage.getItem(GUEST_SESSION_KEY);
    if (!guestId) {
        guestId = shortToken(6);
        sessionStorage.setItem(GUEST_SESSION_KEY, guestId);
    }
    return {
        type: 'guest',
        id: `guest-${guestId}`,
        email: null,
        displayName: 'Invité',
        aquertyMail: `guest-${guestId}@aquerty.fr`,
        roles: [],
        isArtist: false,
        isAdmin: false,
        primaryRole: 'guest'
    };
}

function updateDesktopSessionUI(session) {
    const sessionName = document.getElementById('aq-session-name');
    const sessionAvatar = document.getElementById('aq-session-avatar');
    const sessionRole = document.getElementById('aq-session-role');

    if (sessionSummary) {
        sessionSummary.textContent = session
            ? session.aquertyMail
            : 'Session : aucune';
    }

    if (sessionName) {
        sessionName.textContent = session?.displayName || 'Aucune session';
    }

    if (sessionAvatar) {
        sessionAvatar.textContent = avatarInitial(session?.displayName || '?');
    }

    if (sessionRole) {
        const displayRoles = rolesForDisplay(session);
        const primaryRole = displayRoles[0] || 'none';
        sessionRole.dataset.role = primaryRole;
        sessionRole.textContent = displayRoles.length
            ? displayRoles.map((role) => role.toUpperCase()).join(' + ')
            : 'OFFLINE';
    }

    if (logoutBtn) {
        logoutBtn.style.display = session?.type === 'user' ? '' : 'none';
    }
}

async function enterSession(session) {
    currentSession = session;
    window.JAJSession = session;
    if (session?.type === 'user') rememberAccount(session);
    updateDesktopSessionUI(session);

    if (window.AQCloudSync) {
        setStatus(session?.type === 'user' ? 'Synchronisation du profil AQ-NEO…' : 'Chargement de la session locale…');
        await window.AQCloudSync.activate(session);
    }

    window.dispatchEvent(new CustomEvent('jaj:session-changed', { detail: session }));
    hideWelcome();
}

function showWelcome(message = '') {
    if (!welcomeEl) return;
    closeInlineForms();
    renderRecentAccounts();
    setStatus(message);
    document.body.classList.add('aq-session-pending');
    welcomeEl.classList.add('is-visible');
    welcomeEl.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => welcomeEl.classList.add('is-ready'));
}

function hideWelcome() {
    if (!welcomeEl) return;
    welcomeEl.classList.remove('is-ready');
    setTimeout(() => {
        welcomeEl.classList.remove('is-visible');
        welcomeEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('aq-session-pending');
    }, 170);
}

async function doLogin(email, password) {
    if (!email || !password || busy) return;
    setBusy(true);
    setStatus('Connexion à AQ-NET…');
    try {
        await window.AQCloudSync?.flush?.();
        const result = await authApi('POST', {
            action: 'login',
            email: email.trim(),
            password
        });
        currentIdentityUser = result?.user || null;
        if (!currentIdentityUser) throw new Error('Session AQ-NEO introuvable après connexion.');
        const session = sessionFromUser(currentIdentityUser);
        renderRecentAccounts();
        setStatus('Session ouverte.', 'success');
        await enterSession(session);
    } catch (error) {
        console.error('[JAJ Auth] login failed', error);
        setStatus(identityErrorMessage(error, 'Connexion impossible.'), 'error');
    } finally {
        setBusy(false);
    }
}

function identityErrorMessage(error, fallback) {
    const raw = String(error?.message || error || '');
    const lower = raw.toLowerCase();

    if (lower.includes('identity') && (lower.includes('404') || lower.includes('not found'))) {
        return 'Netlify Identity n’est pas encore activé sur ce site.';
    }
    if (lower.includes('confirm') || lower.includes('verified')) {
        return 'Compte créé, mais ton e-mail doit encore être confirmé.';
    }
    if (lower.includes('invalid') || lower.includes('password') || lower.includes('credentials')) {
        return 'E-mail ou mot de passe incorrect.';
    }
    if (lower.includes('fetch') || lower.includes('network')) {
        return 'AQ-NET ne répond pas. En local, utilise Netlify Dev ou teste le site déployé.';
    }
    return raw ? `${fallback} ${raw}` : fallback;
}

guestBtn?.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
        await enterSession(makeGuestSession());
    } finally {
        setBusy(false);
    }
});

otherToggle?.addEventListener('click', () => {
    if (busy) return;
    closeInlineForms();
    otherCard.classList.add('active');
    loginForm.hidden = false;
    setStatus('');
    setTimeout(() => loginEmail?.focus(), 0);
});

loginCancel?.addEventListener('click', closeInlineForms);

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await doLogin(loginEmail.value, loginPassword.value);
});

createToggle?.addEventListener('click', () => {
    if (busy) return;
    closeInlineForms();
    createCard.classList.add('active');
    signupForm.hidden = false;
    setStatus('');
    setTimeout(() => signupName?.focus(), 0);
});

signupCancel?.addEventListener('click', closeInlineForms);

signupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const displayName = signupName.value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    if (!displayName || !email || password.length < 8) return;

    setBusy(true);
    setStatus('Création du profil AQ-NEO…');

    const provisionalMail = `${slugify(displayName)}.${shortToken(4)}@aquerty.fr`;

    try {
        await window.AQCloudSync?.flush?.();
        const result = await authApi('POST', {
            action: 'signup',
            email,
            password,
            displayName,
            aquertyMail: provisionalMail
        });

        if (result?.authenticated && result?.user) {
            currentIdentityUser = result.user;
            const session = sessionFromUser(currentIdentityUser);
            renderRecentAccounts();
            setStatus('Compte créé.', 'success');
            await enterSession(session);
        } else {
            setStatus(
                'Compte créé. Vérifie ton e-mail pour le confirmer, puis reconnecte-toi.',
                'success'
            );
            closeInlineForms();
            loginEmail.value = email;
        }
    } catch (error) {
        console.error('[JAJ Auth] signup failed', error);
        setStatus(identityErrorMessage(error, 'Création impossible.'), 'error');
    } finally {
        setBusy(false);
    }
});

switchUserBtn?.addEventListener('click', async () => {
    await window.AQCloudSync?.flush?.();
    showWelcome('Choisis une autre session.');
    if (typeof window.toggleStartMenu === 'function') window.toggleStartMenu(false);
});

logoutBtn?.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
        await window.AQCloudSync?.flush?.();
        await authApi('POST', { action: 'logout' });
    } catch (error) {
        console.warn('[JAJ Auth] logout warning', error);
    } finally {
        window.AQCloudSync?.deactivate?.();
        currentIdentityUser = null;
        currentSession = null;
        window.JAJSession = null;
        updateDesktopSessionUI(null);
        window.dispatchEvent(new CustomEvent('jaj:session-changed', { detail: null }));
        renderRecentAccounts();
        setBusy(false);
        showWelcome('Session fermée.');
        if (typeof window.toggleStartMenu === 'function') window.toggleStartMenu(false);
    }
});

async function initializeIdentity() {
    try {
        const result = await authApi('GET');
        currentIdentityUser = result?.authenticated ? (result.user || null) : null;
    } catch (error) {
        // Guest mode remains fully usable if Identity isn't enabled or AQ Auth is unavailable.
        console.info('[JAJ Auth] Identity unavailable in this environment', error);
        currentIdentityUser = null;
    }

    renderRecentAccounts();
}

function waitForBoot() {
    if (window.__AQ_BOOT_DONE__) return Promise.resolve();
    return new Promise((resolve) => {
        window.addEventListener('aq:boot-complete', resolve, { once: true });
    });
}

window.AQAuth = {
    showWelcome,
    getSession: () => currentSession,
    getIdentityUser: () => currentIdentityUser
};

window.AQPermissions = {
    hasRole(role) {
        const wanted = String(role || '').toLowerCase();
        return !!currentSession?.roles?.includes(wanted);
    },
    isArtist() {
        return !!currentSession?.roles?.includes('artist');
    },
    isAdmin() {
        return !!currentSession?.roles?.includes('admin');
    },
    canPublish() {
        return !!currentSession && (
            currentSession.roles?.includes('artist') ||
            currentSession.roles?.includes('admin')
        );
    }
};

await initializeIdentity();
await waitForBoot();
showWelcome();

window.addEventListener('aq:boot-complete', () => {
    if (!welcomeEl.classList.contains('is-visible')) showWelcome();
});
