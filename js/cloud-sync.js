const API_PATH = '/api/aq-sync';
const LEGACY_CLAIM_KEY = 'jaj_phase3_legacy_profile_claimed_v1';
const CACHE_PREFIX = 'jaj_profile_cache_v1:';
const META_PREFIX = 'jaj_profile_meta_v1:';
const GUEST_CACHE_PREFIX = 'jaj_guest_profile_cache_v1:';

let activeSession = null;
let syncTimer = null;
let syncing = false;
let pendingAfterSync = false;

const cloudStatusEl = document.getElementById('aq-cloud-status');

function setCloudStatus(text, state = '') {
    if (!cloudStatusEl) return;
    cloudStatusEl.textContent = text;
    if (state) cloudStatusEl.dataset.state = state;
    else delete cloudStatusEl.dataset.state;
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
    setCloudStatus('Cloud : synchronisation…', 'syncing');

    try {
        const result = await apiRequest('PUT', current);
        writeLocalJSON(cacheKey(activeSession), current);
        setMeta(activeSession, {
            dirtyAt: 0,
            lastSyncedAt: Date.parse(result.updatedAt || '') || Date.now()
        });
        setCloudStatus('Cloud : synchronisé', 'synced');
        return result;
    } catch (error) {
        console.warn('[AQ Cloud] upload failed', error);
        cacheCurrentState(activeSession, true);
        setCloudStatus('Cloud : sauvegarde locale', 'error');
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
    setCloudStatus('Cloud : session locale', 'local');
}

async function prepareUserSession(session) {
    setCloudStatus('Cloud : connexion…', 'syncing');

    const cache = readLocalJSON(cacheKey(session), null);
    const meta = getMeta(session);

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
            setMeta(session, {
                dirtyAt: 0,
                lastSyncedAt: remoteUpdatedAt || Date.now()
            });
            activeSession = session;
            setCloudStatus('Cloud : synchronisé', 'synced');
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
            error?.status === 401 ? 'Cloud : session non authentifiée' : 'Cloud : mode hors ligne',
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
        setCloudStatus('Cloud : hors ligne', '');
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
    setCloudStatus('Cloud : hors ligne', '');
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

window.AQCloudSync = {
    activate,
    flush,
    deactivate,
    getActiveSession: () => activeSession
};
