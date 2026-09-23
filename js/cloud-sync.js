
const API_PATH = '/api/aq-sync';
const LEGACY_CLAIM_KEY = 'jaj_phase3_legacy_profile_claimed_v1';
const CACHE_PREFIX = 'jaj_profile_cache_v1:';
const META_PREFIX = 'jaj_profile_meta_v1:';
const GUEST_CACHE_PREFIX = 'jaj_guest_profile_cache_v1:';

let activeSession = null;
let syncTimer = null;
let syncing = false;
let pendingAfterSync = false;
let lastSyncedAt = 0;
let currentCloudState = 'offline';

const cloudStatusEl = document.getElementById('aq-cloud-status');

function tr(fr, en) {
    return document.documentElement.lang === 'en' ? en : fr;
}

function setCloudStatus(text, state = '') {
    currentCloudState = state || 'offline';

    if (cloudStatusEl) {
        cloudStatusEl.textContent = text;
        if (state) cloudStatusEl.dataset.state = state;
        else delete cloudStatusEl.dataset.state;
    }

    window.dispatchEvent(new CustomEvent('aq:cloud-status', {
        detail: {
            text,
            state: currentCloudState,
            lastSyncedAt: lastSyncedAt || 0,
            sessionType: activeSession?.type || null
        }
    }));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function cacheKey(session) {
    return CACHE_PREFIX + session.id;
}

function metaKey(session) {
    return META_PREFIX + session.id;
}

function guestCacheKey(session) {
    return GUEST_CACHE_PREFIX + session.id;
}

function readLocalJSON(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

function writeLocalJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getMeta(session) {
    return readLocalJSON(metaKey(session), {
        dirtyAt: 0,
        lastSyncedAt: 0
    });
}

function setMeta(session, next) {
    writeLocalJSON(metaKey(session), next);
}

function snapshotNow() {
    return window.AQPersistence?.exportSnapshot?.() || null;
}

function defaultSnapshot() {
    return window.AQPersistence?.getDefaultSnapshot?.() || null;
}

function applySnapshot(snapshot) {
    return window.AQPersistence?.applySnapshot?.(clone(snapshot));
}

function cacheCurrentState(session, markDirty = false) {
    const snapshot = snapshotNow();
    if (!snapshot || !session) return null;

    if (session.type === 'guest') {
        try {
            sessionStorage.setItem(guestCacheKey(session), JSON.stringify(snapshot));
        } catch (_) {}
        return snapshot;
    }

    writeLocalJSON(cacheKey(session), snapshot);
    if (markDirty) {
        const meta = getMeta(session);
        setMeta(session, {
            ...meta,
            dirtyAt: Date.now()
        });
    }
    return snapshot;
}

async function apiRequest(method, snapshot) {
    const options = {
        method,
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json'
        }
    };

    if (method === 'PUT') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify({ snapshot });
    }

    const response = await fetch(API_PATH, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(payload?.error || `AQ-NET sync failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return payload;
}

async function uploadSnapshot(snapshot = null) {
    if (!activeSession || activeSession.type !== 'user') return null;
    if (syncing) {
        pendingAfterSync = true;
        return null;
    }

    const current = snapshot || snapshotNow();
    if (!current) return null;

    syncing = true;
    setCloudStatus(tr('Cloud : synchronisation…', 'Cloud: syncing…'), 'syncing');

    try {
        const result = await apiRequest('PUT', current);
        writeLocalJSON(cacheKey(activeSession), current);
        lastSyncedAt = Date.parse(result.updatedAt || '') || Date.now();
        setMeta(activeSession, {
            dirtyAt: 0,
            lastSyncedAt
        });
        setCloudStatus(tr('Cloud : synchronisé', 'Cloud: synced'), 'synced');
        return result;
    } catch (error) {
        console.warn('[AQ Cloud] upload failed', error);
        cacheCurrentState(activeSession, true);
        setCloudStatus(tr('Cloud : sauvegarde locale', 'Cloud: local backup'), 'error');
        return null;
    } finally {
        syncing = false;
        if (pendingAfterSync) {
            pendingAfterSync = false;
            scheduleUpload(300);
        }
    }
}

function scheduleUpload(delay = 1200) {
    if (!activeSession || activeSession.type !== 'user') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncTimer = null;
        uploadSnapshot();
    }, delay);
}

async function prepareGuestSession(session) {
    let cached = null;
    try {
        cached = JSON.parse(sessionStorage.getItem(guestCacheKey(session)) || 'null');
    } catch (_) {}

    if (cached) {
        applySnapshot(cached);
    }

    activeSession = session;
    lastSyncedAt = 0;
    setCloudStatus(tr('Cloud : session locale', 'Cloud: local session'), 'local');
}

async function prepareUserSession(session) {
    setCloudStatus(tr('Cloud : connexion…', 'Cloud: connecting…'), 'syncing');

    const cache = readLocalJSON(cacheKey(session), null);
    const meta = getMeta(session);
    lastSyncedAt = Number(meta.lastSyncedAt || 0);

    try {
        const result = await apiRequest('GET');
        const remote = result?.snapshot || null;
        const remoteUpdatedAt = Date.parse(result?.updatedAt || remote?.updatedAt || '') || 0;

        if (remote) {
            if (cache && meta.dirtyAt && meta.dirtyAt > remoteUpdatedAt) {
                applySnapshot(cache);
                activeSession = session;
                await uploadSnapshot(cache);
                return;
            }

            applySnapshot(remote);
            writeLocalJSON(cacheKey(session), remote);
            lastSyncedAt = remoteUpdatedAt || Date.now();
            setMeta(session, {
                dirtyAt: 0,
                lastSyncedAt
            });
            activeSession = session;
            setCloudStatus(tr('Cloud : synchronisé', 'Cloud: synced'), 'synced');
            return;
        }

        let initial = cache;
        if (!initial) {
            const legacyAlreadyClaimed = localStorage.getItem(LEGACY_CLAIM_KEY) === '1';
            if (!legacyAlreadyClaimed) {
                initial = snapshotNow();
                localStorage.setItem(LEGACY_CLAIM_KEY, '1');
            } else {
                initial = defaultSnapshot();
            }
        }

        if (initial) applySnapshot(initial);
        activeSession = session;
        await uploadSnapshot(initial || snapshotNow());
    } catch (error) {
        console.warn('[AQ Cloud] remote profile unavailable', error);

        const fallback = cache || defaultSnapshot();
        if (fallback) applySnapshot(fallback);

        activeSession = session;
        cacheCurrentState(session, true);
        setCloudStatus(
            error?.status === 401 ? tr('Cloud : session non authentifiée', 'Cloud: unauthenticated session') : tr('Cloud : mode hors ligne', 'Cloud: offline mode'),
            'error'
        );
    }
}

async function activate(session) {
    clearTimeout(syncTimer);
    syncTimer = null;

    if (activeSession) {
        cacheCurrentState(activeSession, false);
    }

    activeSession = null;

    if (!session) {
        lastSyncedAt = 0;
        setCloudStatus(tr('Cloud : hors ligne', 'Cloud: offline'), '');
        return;
    }

    if (session.type === 'guest') {
        await prepareGuestSession(session);
        return;
    }

    await prepareUserSession(session);
}

async function flush() {
    clearTimeout(syncTimer);
    syncTimer = null;

    if (!activeSession) return;

    cacheCurrentState(activeSession, activeSession.type === 'user');

    if (activeSession.type === 'user') {
        await uploadSnapshot();
    }
}

function deactivate() {
    clearTimeout(syncTimer);
    syncTimer = null;
    if (activeSession) cacheCurrentState(activeSession, false);
    activeSession = null;
    lastSyncedAt = 0;
    setCloudStatus(tr('Cloud : hors ligne', 'Cloud: offline'), '');
}

window.addEventListener('aq:persistence-changed', () => {
    if (!activeSession) return;

    if (activeSession.type === 'guest') {
        cacheCurrentState(activeSession, false);
        return;
    }

    cacheCurrentState(activeSession, true);
    scheduleUpload();
});

window.addEventListener('pagehide', () => {
    if (!activeSession) return;
    cacheCurrentState(activeSession, activeSession.type === 'user');
});

async function syncNow() {
    if (!activeSession) return { ok: false, reason: 'no_session' };

    if (activeSession.type === 'guest') {
        cacheCurrentState(activeSession, false);
        setCloudStatus(tr('Cloud : session locale', 'Cloud: local session'), 'local');
        return { ok: true, localOnly: true, lastSyncedAt: 0 };
    }

    const result = await uploadSnapshot();
    return {
        ok: !!result,
        updatedAt: result?.updatedAt || null,
        lastSyncedAt: lastSyncedAt || 0
    };
}

function getStatus() {
    return {
        state: currentCloudState,
        lastSyncedAt: lastSyncedAt || 0,
        sessionType: activeSession?.type || null,
        syncing: !!syncing
    };
}

window.AQCloudSync = {
    activate,
    flush,
    syncNow,
    deactivate,
    getStatus,
    getActiveSession: () => activeSession
};

window.addEventListener('aq:language-changed', () => {
    if (!cloudStatusEl) return;
    const state = cloudStatusEl.dataset.state || '';
    if (state === 'syncing') cloudStatusEl.textContent = tr('Cloud : synchronisation…', 'Cloud: syncing…');
    else if (state === 'synced') cloudStatusEl.textContent = tr('Cloud : synchronisé', 'Cloud: synced');
    else if (state === 'error') cloudStatusEl.textContent = activeSession?.type === 'user'
        ? tr('Cloud : mode hors ligne', 'Cloud: offline mode')
        : tr('Cloud : sauvegarde locale', 'Cloud: local backup');
    else if (state === 'local') cloudStatusEl.textContent = tr('Cloud : session locale', 'Cloud: local session');
    else cloudStatusEl.textContent = tr('Cloud : hors ligne', 'Cloud: offline');
});
