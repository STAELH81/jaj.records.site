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
const accountGearBtn = document.getElementById('aq-account-gear-btn');
const accountPanel = document.getElementById('aq-account-panel');
const accountEmail = document.getElementById('aq-account-email');
const accountMail = document.getElementById('aq-account-mail');
const accountCloud = document.getElementById('aq-account-cloud');
const accountLastSync = document.getElementById('aq-account-last-sync');
const accountSyncNowBtn = document.getElementById('aq-account-sync-now');
const startSettingsLink = document.getElementById('aq-start-settings-link');
const startUpdatesLink = document.getElementById('aq-start-updates-link');
const accountWindowStatus = document.getElementById('aq-account-window-status');
const accountWindowAvatarPreview = document.getElementById('aq-account-avatar-preview');
const accountAvatarInput = document.getElementById('aq-account-avatar-input');
const accountAvatarRemove = document.getElementById('aq-account-avatar-remove');
const accountDisplayNameInput = document.getElementById('aq-account-display-name');
const accountWindowMail = document.getElementById('aq-account-window-mail');
const accountWindowRoles = document.getElementById('aq-account-window-roles');
const accountWindowCreated = document.getElementById('aq-account-window-created');
const accountProfileSave = document.getElementById('aq-account-profile-save');
const accountEmailInput = document.getElementById('aq-account-email-input');
const accountEmailPassword = document.getElementById('aq-account-email-password');
const accountEmailSave = document.getElementById('aq-account-email-save');
const accountCurrentPassword = document.getElementById('aq-account-current-password');
const accountNewPassword = document.getElementById('aq-account-new-password');
const accountConfirmPassword = document.getElementById('aq-account-confirm-password');
const accountPasswordSave = document.getElementById('aq-account-password-save');
const accountWindowCloud = document.getElementById('aq-account-window-cloud');
const accountWindowLastSync = document.getElementById('aq-account-window-last-sync');
const accountWindowSync = document.getElementById('aq-account-window-sync');

let currentIdentityUser = null;
let currentSession = null;
let busy = false;

function isEnglish() {
    return document.documentElement.lang === 'en';
}

function tr(fr, en) {
    return isEnglish() ? en : fr;
}

function applyAuthLanguage() {
    const q = (selector) => document.querySelector(selector);
    const set = (selector, value) => {
        const el = q(selector);
        if (el) el.textContent = value;
    };

    const welcomeTitle = q('.aq-welcome-brand h1');
    if (welcomeTitle) welcomeTitle.innerHTML = tr('Bienvenue sur <span>AQ-NEO</span>', 'Welcome to <span>AQ-NEO</span>');
    set('.aq-welcome-brand p', tr('Pour commencer, choisissez votre session.', 'To get started, choose your session.'));
    const zone = q('.aq-account-zone');
    if (zone) zone.setAttribute('aria-label', tr('Choix du compte', 'Account selection'));

    const guestCopy = document.querySelectorAll('#aq-guest-btn .aq-account-copy > *');
    if (guestCopy[0]) guestCopy[0].textContent = tr('Invité', 'Guest');
    if (guestCopy[1]) guestCopy[1].textContent = tr('Entrer sans compte', 'Enter without an account');

    const otherCopy = document.querySelectorAll('#aq-other-toggle .aq-account-copy > *');
    if (otherCopy[0]) otherCopy[0].textContent = tr('Autre compte', 'Other account');
    if (otherCopy[1]) otherCopy[1].textContent = tr('Adresse e-mail + mot de passe', 'Email address + password');

    const createCopy = document.querySelectorAll('#aq-create-toggle .aq-account-copy > *');
    if (createCopy[0]) createCopy[0].textContent = tr('Créer un compte', 'Create an account');
    if (createCopy[1]) createCopy[1].textContent = tr('Sauvegarde AQ-NEO et identité JAJ', 'AQ-NEO backup and JAJ identity');

    const loginLabels = document.querySelectorAll('#aq-login-form label > span');
    if (loginLabels[0]) loginLabels[0].textContent = 'E-mail';
    if (loginLabels[1]) loginLabels[1].textContent = tr('Mot de passe', 'Password');
    if (loginCancel) loginCancel.textContent = tr('Annuler', 'Cancel');
    const loginSubmit = q('#aq-login-form button[type="submit"]');
    if (loginSubmit) loginSubmit.textContent = tr('Connexion ›', 'Sign in ›');

    const signupLabels = document.querySelectorAll('#aq-signup-form label > span');
    if (signupLabels[0]) signupLabels[0].textContent = tr('Nom affiché', 'Display name');
    if (signupLabels[1]) signupLabels[1].textContent = tr('E-mail réel', 'Real email');
    if (signupLabels[2]) signupLabels[2].textContent = tr('Mot de passe', 'Password');
    const note = q('#aq-signup-form .aq-form-note');
    if (note) note.innerHTML = tr(
        'Ton adresse <strong>@aquerty.fr</strong> est fictive et sera générée automatiquement.',
        'Your <strong>@aquerty.fr</strong> address is fictional and will be generated automatically.'
    );
    if (signupCancel) signupCancel.textContent = tr('Annuler', 'Cancel');
    const signupSubmit = q('#aq-signup-form button[type="submit"]');
    if (signupSubmit) signupSubmit.textContent = tr('Créer ›', 'Create ›');

    set('#aq-welcome-network', tr('AQ-NET · prêt', 'AQ-NET · ready'));
    if (switchUserBtn) switchUserBtn.textContent = tr('Changer d’utilisateur', 'Switch user');
    if (logoutBtn) logoutBtn.textContent = tr('Déconnexion', 'Log out');
    if (startSettingsLink) startSettingsLink.textContent = tr('Settings', 'Settings');
    if (startUpdatesLink) startUpdatesLink.textContent = tr('Mises à jour', 'Updates');
    if (accountGearBtn) {
        accountGearBtn.title = tr('Mon compte AQ', 'My AQ account');
        accountGearBtn.setAttribute('aria-label', accountGearBtn.title);
    }
    const accountPanelTitle = accountPanel?.querySelector('.start-account-panel-title');
    if (accountPanelTitle) accountPanelTitle.textContent = tr('Mon compte AQ', 'My AQ account');
    const accountRows = accountPanel?.querySelectorAll('.start-account-row > span');
    if (accountRows?.[0]) accountRows[0].textContent = 'E-mail';
    if (accountRows?.[1]) accountRows[1].textContent = 'AQ-Mail';
    if (accountRows?.[2]) accountRows[2].textContent = 'Cloud';
    if (accountRows?.[3]) accountRows[3].textContent = tr('Dernière synchro', 'Last sync');
    if (accountSyncNowBtn) accountSyncNowBtn.textContent = tr('Synchroniser maintenant', 'Sync now');
    const accountWin = document.getElementById('win-account');
    if (accountWin) {
        const title = accountWin.querySelector('.title-bar > span');
        if (title) title.textContent = tr('Mon compte AQ', 'My AQ account');
        const sectionTitles = accountWin.querySelectorAll('.aq-account-section-title');
        if (sectionTitles[0]) sectionTitles[0].textContent = tr('Identité AQ-NEO', 'AQ-NEO identity');
        if (sectionTitles[1]) sectionTitles[1].textContent = tr('Connexion', 'Sign-in');
        if (sectionTitles[2]) sectionTitles[2].textContent = 'Cloud AQ-NEO';
    }

    renderRecentAccounts();
    updateDesktopSessionUI(currentSession);
}

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
    return metadata.display_name || metadata.full_name || user?.email?.split('@')[0] || tr('Utilisateur', 'User');
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
    const metadata = user?.user_metadata || {};
    return {
        type: 'user',
        id: user.id,
        email: user.email,
        displayName: getDisplayName(user),
        aquertyMail: buildAquertyMail(user),
        accountAvatar: metadata.aq_avatar || metadata.avatar_url || metadata.avatar || '',
        createdAt: user?.createdAt || user?.created_at || user?.confirmedAt || user?.confirmed_at || null,
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
            ? `${account.aquertyMail || maskEmail(account.email)} · ${tr('session active', 'active session')}`
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
                    <span>${tr('Mot de passe', 'Password')}</span>
                    <input type="password" autocomplete="current-password" required minlength="6">
                </label>
                <div class="aq-inline-actions">
                    <button type="button" class="aq-mini-btn aq-recent-cancel">${tr('Annuler', 'Cancel')}</button>
                    <button type="submit" class="aq-mini-btn aq-mini-btn-primary">${tr('Connexion ›', 'Sign in ›')}</button>
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
        displayName: tr('Invité', 'Guest'),
        aquertyMail: `guest-${guestId}@aquerty.fr`,
        roles: [],
        isArtist: false,
        isAdmin: false,
        primaryRole: 'guest'
    };
}

function formatAccountSyncTime(value) {
    const stamp = Number(value || 0);
    if (!stamp) return tr('Jamais', 'Never');
    try {
        return new Intl.DateTimeFormat(isEnglish() ? 'en-GB' : 'fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date(stamp));
    } catch (_) {
        return tr('Inconnue', 'Unknown');
    }
}


function setAccountWindowStatus(message = '', type = '') {
    if (!accountWindowStatus) return;
    accountWindowStatus.textContent = message;
    accountWindowStatus.className = 'aq-account-window-status' + (type ? ` ${type}` : '');
}

function applyAccountAvatarPreview(avatar, name = currentSession?.displayName || '?') {
    if (!accountWindowAvatarPreview) return;
    const safeAvatar = String(avatar || '');
    if (safeAvatar && (/^data:image\//i.test(safeAvatar) || /^https?:\/\//i.test(safeAvatar))) {
        accountWindowAvatarPreview.textContent = '';
        accountWindowAvatarPreview.style.backgroundImage = `url("${safeAvatar}")`;
        accountWindowAvatarPreview.style.backgroundSize = 'cover';
        accountWindowAvatarPreview.style.backgroundPosition = 'center';
        accountWindowAvatarPreview.style.backgroundRepeat = 'no-repeat';
    } else {
        accountWindowAvatarPreview.style.backgroundImage = '';
        accountWindowAvatarPreview.textContent = avatarInitial(name);
    }
}

function formatAccountCreatedAt(value) {
    if (!value) return '—';
    try {
        return new Intl.DateTimeFormat(isEnglish() ? 'en-GB' : 'fr-FR', {
            dateStyle: 'long'
        }).format(new Date(value));
    } catch (_) {
        return String(value);
    }
}

function refreshAccountWindow() {
    const session = currentSession;
    const user = currentIdentityUser;
    const isUser = session?.type === 'user';

    if (accountDisplayNameInput) {
        accountDisplayNameInput.value = session?.displayName || '';
        accountDisplayNameInput.disabled = !isUser;
    }
    if (accountEmailInput) {
        accountEmailInput.value = session?.email || '';
        accountEmailInput.disabled = !isUser;
    }
    if (accountWindowMail) accountWindowMail.textContent = session?.aquertyMail || '—';
    if (accountWindowRoles) {
        const roles = rolesForDisplay(session);
        accountWindowRoles.textContent = roles.map((role) => role.toUpperCase()).join(' + ') || '—';
    }
    if (accountWindowCreated) {
        accountWindowCreated.textContent = formatAccountCreatedAt(
            user?.createdAt || user?.created_at || session?.createdAt || null
        );
    }

    applyAccountAvatarPreview(session?.accountAvatar || '', session?.displayName || '?');

    [accountAvatarInput, accountAvatarRemove, accountProfileSave, accountEmailPassword,
     accountEmailSave, accountCurrentPassword, accountNewPassword, accountConfirmPassword,
     accountPasswordSave, accountWindowSync].forEach((el) => {
        if (el) el.disabled = !isUser;
    });

    setAccountWindowStatus(
        isUser
            ? tr('Compte AQ-NEO connecté.', 'AQ-NEO account connected.')
            : tr('Connecte-toi avec un compte AQ pour modifier ces informations.', 'Sign in with an AQ account to edit this information.'),
        isUser ? 'success' : ''
    );

    const cloud = window.AQCloudSync?.getStatus?.() || {};
    updateAccountCloudUI({
        text: cloud.state === 'synced'
            ? tr('Cloud : synchronisé', 'Cloud: synced')
            : cloud.state === 'syncing'
                ? tr('Cloud : synchronisation…', 'Cloud: syncing…')
                : cloud.state === 'local'
                    ? tr('Cloud : session locale', 'Cloud: local session')
                    : tr('Cloud : hors ligne', 'Cloud: offline'),
        state: cloud.state || '',
        lastSyncedAt: cloud.lastSyncedAt || 0
    });
}

async function fileToAccountAvatar(file) {
    if (!file) return currentSession?.accountAvatar || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('invalid_avatar');
    }
    if (file.size > 4 * 1024 * 1024) {
        throw new Error('avatar_source_too_large');
    }

    const bitmap = await createImageBitmap(file);
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const x = (size - width) / 2;
    const y = (size - height) / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(bitmap, x, y, width, height);

    let quality = 0.86;
    let dataUrl = canvas.toDataURL('image/webp', quality);
    while (dataUrl.length > 190000 && quality > 0.5) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/webp', quality);
    }
    if (dataUrl.length > 220000) throw new Error('avatar_too_large');
    return dataUrl;
}

async function applyUpdatedIdentityUser(user) {
    currentIdentityUser = user || currentIdentityUser;
    currentSession = sessionFromUser(currentIdentityUser);
    window.JAJSession = currentSession;
    rememberAccount(currentSession);
    updateDesktopSessionUI(currentSession);
    refreshAccountWindow();
    renderRecentAccounts();
    window.dispatchEvent(new CustomEvent('jaj:session-changed', { detail: currentSession }));
}

function updateAccountCloudUI(detail = {}) {
    if (accountCloud) {
        const raw = detail.text || tr('Hors ligne', 'Offline');
        accountCloud.textContent = String(raw).replace(/^Cloud\s*:\s*/i, '');
        accountCloud.dataset.state = detail.state || '';
    }
    if (accountLastSync) {
        accountLastSync.textContent = formatAccountSyncTime(detail.lastSyncedAt || 0);
    }
    if (accountWindowCloud) {
        accountWindowCloud.textContent = detail.text
            ? String(detail.text).replace(/^Cloud\s*:\s*/i, '')
            : tr('Hors ligne', 'Offline');
        accountWindowCloud.dataset.state = detail.state || '';
    }
    if (accountWindowLastSync) {
        accountWindowLastSync.textContent = formatAccountSyncTime(detail.lastSyncedAt || 0);
    }
    if (accountSyncNowBtn) {
        accountSyncNowBtn.disabled = !currentSession || currentSession.type !== 'user' || detail.state === 'syncing';
    }
    if (accountWindowSync) {
        accountWindowSync.disabled = !currentSession || currentSession.type !== 'user' || detail.state === 'syncing';
    }
}

function updateDesktopSessionUI(session) {
    const sessionName = document.getElementById('aq-session-name');
    const sessionAvatar = document.getElementById('aq-session-avatar');
    const sessionRole = document.getElementById('aq-session-role');

    if (sessionSummary) {
        sessionSummary.textContent = session
            ? session.aquertyMail
            : tr('Session : aucune', 'Session: none');
    }

    if (sessionName) {
        sessionName.textContent = session?.displayName || tr('Aucune session', 'No session');
    }

    if (sessionAvatar) {
        const accountAvatar = String(session?.accountAvatar || '');
        if (accountAvatar && (/^data:image\//i.test(accountAvatar) || /^https?:\/\//i.test(accountAvatar))) {
            sessionAvatar.textContent = '';
            sessionAvatar.style.backgroundImage = `url("${accountAvatar}")`;
            sessionAvatar.style.backgroundSize = 'cover';
            sessionAvatar.style.backgroundPosition = 'center';
        } else {
            sessionAvatar.style.backgroundImage = '';
            sessionAvatar.textContent = avatarInitial(session?.displayName || '?');
        }
    }

    if (accountEmail) accountEmail.textContent = session?.type === 'user' ? (session.email || '—') : '—';
    if (accountMail) accountMail.textContent = session?.aquertyMail || '—';
    if (accountGearBtn) accountGearBtn.disabled = !session;
    if (accountSyncNowBtn) accountSyncNowBtn.disabled = session?.type !== 'user';

    if (sessionRole) {
        const displayRoles = rolesForDisplay(session);
        const primaryRole = displayRoles[0] || 'none';
        sessionRole.dataset.role = primaryRole;
        sessionRole.textContent = displayRoles.length
            ? displayRoles.map((role) => role.toUpperCase()).join(' + ')
            : tr('HORS LIGNE', 'OFFLINE');
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
        setStatus(session?.type === 'user' ? tr('Synchronisation du profil AQ-NEO…', 'Syncing AQ-NEO profile…') : tr('Chargement de la session locale…', 'Loading local session…'));
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
    setStatus(tr('Connexion à AQ-NET…', 'Connecting to AQ-NET…'));
    try {
        await window.AQCloudSync?.flush?.();
        const result = await authApi('POST', {
            action: 'login',
            email: email.trim(),
            password
        });
        currentIdentityUser = result?.user || null;
        if (!currentIdentityUser) throw new Error(tr('Session AQ-NEO introuvable après connexion.', 'AQ-NEO session not found after sign-in.'));
        const session = sessionFromUser(currentIdentityUser);
        renderRecentAccounts();
        setStatus(tr('Session ouverte.', 'Session opened.'), 'success');
        await enterSession(session);
    } catch (error) {
        console.error('[JAJ Auth] login failed', error);
        setStatus(identityErrorMessage(error, tr('Connexion impossible.', 'Unable to sign in.')), 'error');
    } finally {
        setBusy(false);
    }
}

function identityErrorMessage(error, fallback) {
    const raw = String(error?.message || error || '');
    const lower = raw.toLowerCase();

    if (lower.includes('identity') && (lower.includes('404') || lower.includes('not found'))) {
        return tr('Netlify Identity n’est pas encore activé sur ce site.', 'Netlify Identity is not enabled on this site yet.');
    }
    if (lower.includes('confirm') || lower.includes('verified')) {
        return tr('Compte créé, mais ton e-mail doit encore être confirmé.', 'Account created, but your email still needs to be confirmed.');
    }
    if (lower.includes('invalid') || lower.includes('password') || lower.includes('credentials')) {
        return tr('E-mail ou mot de passe incorrect.', 'Incorrect email or password.');
    }
    if (lower.includes('fetch') || lower.includes('network')) {
        return tr('AQ-NET ne répond pas. En local, utilise Netlify Dev ou teste le site déployé.', 'AQ-NET is not responding. Locally, use Netlify Dev or test the deployed site.');
    }
    return raw ? `${fallback} ${raw}` : fallback;
}

accountGearBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!currentSession) return;
    refreshAccountWindow();
    window.openWindow?.('win-account', 'task-account');
    window.toggleStartMenu?.(false);
});

startSettingsLink?.addEventListener('click', () => {
    window.openWindow?.('win-settings', 'task-settings');
    window.toggleStartMenu?.(false);
});

startUpdatesLink?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('aq:updates-open'));
    window.toggleStartMenu?.(false);
});

accountSyncNowBtn?.addEventListener('click', async () => {
    if (!window.AQCloudSync || currentSession?.type !== 'user') return;
    accountSyncNowBtn.disabled = true;
    const previous = accountSyncNowBtn.textContent;
    accountSyncNowBtn.textContent = tr('Synchronisation…', 'Syncing…');
    try {
        const result = await window.AQCloudSync.syncNow();
        if (result?.ok) {
            updateAccountCloudUI({
                text: tr('Cloud : synchronisé', 'Cloud: synced'),
                state: 'synced',
                lastSyncedAt: result.lastSyncedAt || Date.parse(result.updatedAt || '') || Date.now()
            });
        }
    } finally {
        accountSyncNowBtn.textContent = previous;
        accountSyncNowBtn.disabled = false;
    }
});

accountWindowSync?.addEventListener('click', async () => {
    if (!window.AQCloudSync || currentSession?.type !== 'user') return;
    const previous = accountWindowSync.textContent;
    accountWindowSync.disabled = true;
    accountWindowSync.textContent = tr('Synchronisation…', 'Syncing…');
    setAccountWindowStatus(tr('Synchronisation du profil AQ-NEO…', 'Syncing AQ-NEO profile…'));
    try {
        const result = await window.AQCloudSync.syncNow();
        if (result?.ok) {
            updateAccountCloudUI({
                text: tr('Cloud : synchronisé', 'Cloud: synced'),
                state: 'synced',
                lastSyncedAt: result.lastSyncedAt || Date.parse(result.updatedAt || '') || Date.now()
            });
            setAccountWindowStatus(tr('Profil synchronisé.', 'Profile synced.'), 'success');
        } else {
            setAccountWindowStatus(tr('Synchronisation indisponible.', 'Sync unavailable.'), 'error');
        }
    } catch (error) {
        setAccountWindowStatus(tr('Erreur de synchronisation : ', 'Sync error: ') + error.message, 'error');
    } finally {
        accountWindowSync.textContent = previous;
        accountWindowSync.disabled = false;
    }
});

let pendingAccountAvatar = null;

accountAvatarInput?.addEventListener('change', async () => {
    const file = accountAvatarInput.files?.[0];
    if (!file) return;
    setAccountWindowStatus(tr('Préparation de la photo…', 'Preparing picture…'));
    try {
        pendingAccountAvatar = await fileToAccountAvatar(file);
        applyAccountAvatarPreview(pendingAccountAvatar, accountDisplayNameInput?.value || currentSession?.displayName);
        setAccountWindowStatus(tr('Photo prête à être enregistrée.', 'Picture ready to save.'), 'success');
    } catch (error) {
        pendingAccountAvatar = null;
        accountAvatarInput.value = '';
        const message = error.message === 'avatar_source_too_large'
            ? tr('Image trop lourde (4 Mo max avant compression).', 'Image too large (4 MB max before compression).')
            : tr('Impossible d’utiliser cette image.', 'Unable to use this image.');
        setAccountWindowStatus(message, 'error');
    }
});

accountAvatarRemove?.addEventListener('click', () => {
    pendingAccountAvatar = '';
    if (accountAvatarInput) accountAvatarInput.value = '';
    applyAccountAvatarPreview('', accountDisplayNameInput?.value || currentSession?.displayName);
    setAccountWindowStatus(tr('La photo sera retirée à l’enregistrement.', 'The picture will be removed when saved.'));
});

accountProfileSave?.addEventListener('click', async () => {
    if (currentSession?.type !== 'user') return;
    const displayName = accountDisplayNameInput?.value.trim() || '';
    if (!displayName) {
        setAccountWindowStatus(tr('Le nom affiché est obligatoire.', 'Display name is required.'), 'error');
        return;
    }

    const previous = accountProfileSave.textContent;
    accountProfileSave.disabled = true;
    accountProfileSave.textContent = tr('Enregistrement…', 'Saving…');
    try {
        const result = await authApi('POST', {
            action: 'update_profile',
            displayName,
            avatar: pendingAccountAvatar === null ? (currentSession.accountAvatar || '') : pendingAccountAvatar
        });
        if (result?.user) {
            pendingAccountAvatar = null;
            await applyUpdatedIdentityUser(result.user);
            setAccountWindowStatus(tr('Profil AQ enregistré.', 'AQ profile saved.'), 'success');
        }
    } catch (error) {
        const message = {
            avatar_too_large: tr('Photo trop lourde.', 'Picture too large.'),
            invalid_avatar: tr('Format de photo invalide.', 'Invalid picture format.')
        }[error.message] || error.message;
        setAccountWindowStatus(tr('Enregistrement impossible : ', 'Unable to save: ') + message, 'error');
    } finally {
        accountProfileSave.textContent = previous;
        accountProfileSave.disabled = false;
    }
});

accountEmailSave?.addEventListener('click', async () => {
    if (currentSession?.type !== 'user') return;
    const email = accountEmailInput?.value.trim() || '';
    const currentPassword = accountEmailPassword?.value || '';
    if (!email || !currentPassword) {
        setAccountWindowStatus(tr('Entre le nouvel e-mail et ton mot de passe actuel.', 'Enter the new email and your current password.'), 'error');
        return;
    }

    const previous = accountEmailSave.textContent;
    accountEmailSave.disabled = true;
    accountEmailSave.textContent = tr('Modification…', 'Changing…');
    try {
        const result = await authApi('POST', {
            action: 'change_email',
            email,
            currentPassword
        });
        if (result?.user) {
            if (accountEmailPassword) accountEmailPassword.value = '';
            await applyUpdatedIdentityUser(result.user);
            setAccountWindowStatus(
                tr('E-mail modifié. Utilise cette nouvelle adresse à la prochaine connexion.', 'Email changed. Use the new address next time you sign in.'),
                'success'
            );
        }
    } catch (error) {
        const message = error.message === 'current_password_invalid'
            ? tr('Mot de passe actuel incorrect.', 'Current password is incorrect.')
            : error.message === 'invalid_email'
                ? tr('Adresse e-mail invalide.', 'Invalid email address.')
                : error.message;
        setAccountWindowStatus(tr('Modification impossible : ', 'Unable to change: ') + message, 'error');
    } finally {
        accountEmailSave.textContent = previous;
        accountEmailSave.disabled = false;
    }
});

accountPasswordSave?.addEventListener('click', async () => {
    if (currentSession?.type !== 'user') return;
    const currentPassword = accountCurrentPassword?.value || '';
    const password = accountNewPassword?.value || '';
    const confirmation = accountConfirmPassword?.value || '';

    if (password.length < 8) {
        setAccountWindowStatus(tr('Le nouveau mot de passe doit faire au moins 8 caractères.', 'The new password must be at least 8 characters.'), 'error');
        return;
    }
    if (password !== confirmation) {
        setAccountWindowStatus(tr('Les deux nouveaux mots de passe ne correspondent pas.', 'The new passwords do not match.'), 'error');
        return;
    }

    const previous = accountPasswordSave.textContent;
    accountPasswordSave.disabled = true;
    accountPasswordSave.textContent = tr('Modification…', 'Changing…');
    try {
        const result = await authApi('POST', {
            action: 'change_password',
            currentPassword,
            password
        });
        if (result?.user) {
            if (accountCurrentPassword) accountCurrentPassword.value = '';
            if (accountNewPassword) accountNewPassword.value = '';
            if (accountConfirmPassword) accountConfirmPassword.value = '';
            setAccountWindowStatus(tr('Mot de passe modifié.', 'Password changed.'), 'success');
        }
    } catch (error) {
        const message = error.message === 'current_password_invalid'
            ? tr('Mot de passe actuel incorrect.', 'Current password is incorrect.')
            : error.message === 'password_too_short'
                ? tr('Le nouveau mot de passe est trop court.', 'The new password is too short.')
                : error.message;
        setAccountWindowStatus(tr('Modification impossible : ', 'Unable to change: ') + message, 'error');
    } finally {
        accountPasswordSave.textContent = previous;
        accountPasswordSave.disabled = false;
    }
});


window.addEventListener('aq:cloud-status', (event) => {
    updateAccountCloudUI(event.detail || {});
});

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
    setStatus(tr('Création du profil AQ-NEO…', 'Creating AQ-NEO profile…'));

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
            setStatus(tr('Compte créé.', 'Account created.'), 'success');
            await enterSession(session);
        } else {
            setStatus(
                tr('Compte créé. Vérifie ton e-mail pour le confirmer, puis reconnecte-toi.', 'Account created. Check your email to confirm it, then sign in again.'),
                'success'
            );
            closeInlineForms();
            loginEmail.value = email;
        }
    } catch (error) {
        console.error('[JAJ Auth] signup failed', error);
        setStatus(identityErrorMessage(error, tr('Création impossible.', 'Unable to create account.')), 'error');
    } finally {
        setBusy(false);
    }
});

switchUserBtn?.addEventListener('click', async () => {
    await window.AQCloudSync?.flush?.();
    showWelcome(tr('Choisis une autre session.', 'Choose another session.'));
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
        showWelcome(tr('Session fermée.', 'Session closed.'));
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

window.addEventListener('aq:language-changed', applyAuthLanguage);
applyAuthLanguage();

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
