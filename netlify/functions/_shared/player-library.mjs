import { randomUUID } from 'node:crypto';

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const empty = () => ({ revision: '', playlists: [], favorites: [] });
function invalid() { throw Object.assign(new Error('invalid_library'), { status: 400 }); }
function tracks(value, limit) {
    if (!Array.isArray(value) || value.length > limit) invalid();
    const seen = new Set();
    return value.map(item => {
        if (!validId(item?.releaseId) || !validId(item?.trackId)) invalid();
        const key = `${item.releaseId}/${item.trackId}`;
        if (seen.has(key)) invalid();
        seen.add(key);
        // Never accept audio URLs or ownership information from the client.
        return { releaseId: item.releaseId, trackId: item.trackId };
    });
}
export function sanitizeLibrary(value) {
    if (!Array.isArray(value?.playlists) || value.playlists.length > 50) invalid();
    const ids = new Set();
    const playlists = value.playlists.map(item => {
        if (!validId(item?.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || !['private', 'public'].includes(item.visibility)) invalid();
        ids.add(item.id);
        return { id: item.id, name: item.name.trim(), visibility: item.visibility, tracks: tracks(item.tracks, 200) };
    });
    return { playlists, favorites: tracks(value.favorites, 500) };
}
export function createPlayerLibraryHandler({ getUser, verifyOrigin, getStore }) {
    return async (request, context) => {
        try {
            if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
            const url = new URL(request.url);
            const owner = url.searchParams.get('owner'), playlistId = url.searchParams.get('playlist');
            const store = getStore(context);
            if (request.method === 'GET' && (owner !== null || playlistId !== null)) {
                if (!validId(owner) || !validId(playlistId)) return json({ error: 'not_found' }, 404);
                const library = await store.get(`player-libraries/${owner}.json`, { type: 'json' });
                const playlist = library?.playlists.find(item => item.id === playlistId && item.visibility === 'public');
                if (!playlist) return json({ error: 'not_found' }, 404);
                return json({ playlist, ownerName: library.ownerName || 'AQ-NEO' });
            }
            const user = await getUser();
            if (!validId(user?.id)) return json({ error: 'unauthorized' }, 401);
            const key = `player-libraries/${user.id}.json`;
            if (request.method === 'GET') {
                const saved = await store.get(key, { type: 'json' });
                return json({ library: saved ? { revision: saved.revision, playlists: saved.playlists, favorites: saved.favorites } : empty() });
            }
            try { verifyOrigin(request); } catch { return json({ error: 'invalid_origin' }, 403); }
            if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'invalid_json' }, 400);
            if (Number(request.headers.get('content-length')) > 250000) return json({ error: 'too_large' }, 413);
            const raw = await request.text();
            if (Buffer.byteLength(raw) > 250000) return json({ error: 'too_large' }, 413);
            let body;
            try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
            const content = sanitizeLibrary(body?.library);
            const saved = await store.getWithMetadata(key, { type: 'json' });
            if ((saved?.data.revision || '') !== body.revision) return json({ error: 'conflict' }, 409);
            if (saved && !saved.etag) return json({ error: 'service_unavailable' }, 503);
            const library = { ...content, revision: randomUUID() };
            const ownerName = String(user.user_metadata?.display_name || user.userMetadata?.display_name || 'AQ-NEO').slice(0, 80);
            const result = await store.setJSON(key, { ...library, ownerName }, saved ? { onlyIfMatch: saved.etag } : { onlyIfNew: true });
            if (!result.modified) return json({ error: 'conflict' }, 409);
            return json({ library });
        } catch (error) {
            return json({ error: error.status ? error.message : 'service_unavailable' }, error.status || 503);
        }
    };
}
