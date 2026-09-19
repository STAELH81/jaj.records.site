import { randomUUID } from 'node:crypto';
import { audioKey } from './publisher-media.mjs';
import { cleanupAudio } from './publisher-cleanup.mjs';

const MAX_BODY_BYTES = 1500000;
const MAX_COVER_BYTES = 1024 * 1024;
const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function invalid(field) {
    throw Object.assign(new Error('invalid_draft'), { status: 400, field });
}

function text(value, max, field, required = false) {
    if (typeof value !== 'string' || value.length > max) invalid(field);
    const result = value.trim();
    if (required && !result) invalid(field);
    return result;
}

function audioSource(value) {
    const source = text(value ?? '', 2048, 'tracks');
    if (!source) return '';
    if (/^\/?medias\/[a-zA-Z0-9_./% -]+$/.test(source) && !source.includes('..')) return source;
    try {
        const url = new URL(source);
        if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch (_) { /* Validation below. */ }
    invalid('audioUrl');
}

export function coverImage(value) {
    if (!value) return '';
    if (typeof value !== 'string') invalid('cover');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) invalid('cover');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_COVER_BYTES) invalid('coverSize');
    const valid = (match[1] === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
        || (match[1] === 'jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        || (match[1] === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!valid) invalid('cover');
    return value;
}

export function sanitizeDraft(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('draft');
    const title = text(value.title, 120, 'title', true);
    const artist = text(value.artist, 80, 'artist', true);
    if (!['album', 'ep', 'single'].includes(value.type)) invalid('type');
    const releaseDate = text(value.releaseDate ?? '', 10, 'releaseDate');
    if (releaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
        || !Number.isFinite(Date.parse(releaseDate)) || new Date(releaseDate).toISOString().slice(0, 10) !== releaseDate)) invalid('releaseDate');
    if (!Array.isArray(value.tracks) || value.tracks.length > 50) invalid('tracks');
    const tracks = value.tracks.map((track, index) => ({
        number: index + 1,
        title: text(track?.title, 160, 'tracks', true),
        audioUrl: audioSource(track?.audioUrl),
        audioAssetId: track?.audioAssetId ? (validId(track.audioAssetId) ? track.audioAssetId : invalid('audioAssetId')) : '',
    }));
    return { title, artist, type: value.type, releaseDate, cover: coverImage(value.cover), tracks };
}

const view = ({ publication, retiredAudio, ...draft }) => ({ ...draft, publishedAt: publication?.publishedAt || '', publishedRevision: publication?.revision || '' });
const summary = record => { const { cover, tracks, ...draft } = view(record); return { ...draft, trackCount: tracks.length, hasCover: !!cover }; };

// Dependency injection lets regression tests exercise the actual authorization and storage flow.
export function createDraftHandler({ getUser, liveUser, verifyOrigin, getStore }) {
    return async (request, context) => {
        try {
            if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
            const session = await getUser();
            if (!session?.id) return json({ error: 'unauthorized' }, 401);
            // Fresh server-controlled roles: fail closed if Identity is unavailable.
            const user = await liveUser(session.id);
            const rawRoles = user?.roles || user?.app_metadata?.roles || user?.appMetadata?.roles || [];
            const roles = Array.isArray(rawRoles) ? rawRoles.map(role => String(role).toLowerCase()) : [];
            const isAdmin = roles.includes('admin');
            if (!isAdmin && !roles.includes('artist')) return json({ error: 'forbidden' }, 403);
            const store = getStore(context);
            const canEdit = draft => isAdmin || draft.ownerId === session.id;
            if (request.method === 'GET') {
                const id = new URL(request.url).searchParams.get('id');
                if (id !== null) {
                    if (!validId(id)) return json({ error: 'not_found' }, 404);
                    const draft = await store.get(`drafts/${id}.json`, { type: 'json' });
                    if (!draft || draft.deletedAt || !canEdit(draft)) return json({ error: 'not_found' }, 404);
                    return json({ draft: view(draft) });
                }
                const { blobs } = await store.list({ prefix: 'drafts/' });
                const drafts = [];
                // Avoid fetching all image bodies concurrently for large catalogues.
                for (const item of blobs) {
                    const draft = await store.get(item.key, { type: 'json' });
                    if (draft && !draft.deletedAt && canEdit(draft)) drafts.push(summary(draft));
                }
                drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
                return json({ drafts, isAdmin });
            }
            try { verifyOrigin(request); } catch { return json({ error: 'invalid_origin' }, 403); }
            if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'invalid_json' }, 400);
            if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);
            const raw = await request.text();
            if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);
            let payload;
            try { payload = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
            if (payload?.action === 'cleanup') return json(await cleanupAudio(store, canEdit));
            if (!payload || !validId(payload.id)) return json({ error: 'invalid_draft', field: 'id' }, 400);
            const key = `drafts/${payload.id}.json`;
            const saved = await store.getWithMetadata(key, { type: 'json' });
            if (saved && (saved.data.deletedAt || !canEdit(saved.data))) return json({ error: 'not_found' }, 404);
            if (saved && !saved.etag) return json({ error: 'service_unavailable' }, 503);
            if ((saved?.data.revision || '') !== (payload.revision || '')) return json({ error: 'conflict' }, 409);
            const metadata = user?.user_metadata || user?.userMetadata || {};
            const now = new Date().toISOString();
            if (['unpublish', 'delete'].includes(payload.action)) {
                if (!saved) return json({ error: 'not_found' }, 404);
                if (payload.action === 'delete' && saved.data.publication) return json({ error: 'unpublish_first' }, 409);
                const draft = payload.action === 'delete'
                    ? { id: payload.id, ownerId: saved.data.ownerId, deletedAt: now, tracks: [], retiredAudio: saved.data.retiredAudio || [] }
                    : { ...saved.data };
                delete draft.publication;
                Object.assign(draft, { revision: randomUUID(), updatedAt: now, updatedBy: session.id });
                const result = await store.setJSON(key, draft, { onlyIfMatch: saved.etag });
                if (!result.modified) return json({ error: 'conflict' }, 409);
                return json(payload.action === 'delete' ? { deleted: true } : { draft: view(draft) });
            }
            if (payload.action && payload.action !== 'publish') return json({ error: 'invalid_action' }, 400);
            if (payload.action === 'publish' && !saved) return json({ error: 'not_found' }, 404);
            const content = sanitizeDraft(payload.action === 'publish' ? saved.data : payload.draft);
            for (const track of content.tracks) {
                if (!track.audioAssetId) continue;
                const asset = await store.get(audioKey(track.audioAssetId), { type: 'json' });
                if (!asset?.complete || asset.draftId !== payload.id || saved?.data.retiredAudio?.includes(track.audioAssetId)) return json({ error: 'invalid_audio' }, 400);
                track.audioName = asset.name;
                track.audioUrl = '';
            }
            if (payload.action === 'publish' && (!content.tracks.length || content.tracks.some(track => !track.audioAssetId && !track.audioUrl))) return json({ error: 'missing_audio' }, 400);
            const draft = {
                ...content,
                id: payload.id,
                ownerId: saved?.data.ownerId || session.id,
                ownerName: saved?.data.ownerName || String(metadata.display_name || metadata.full_name || 'Artist').slice(0, 80),
                status: 'draft',
                revision: randomUUID(),
                createdAt: saved?.data.createdAt || now,
                updatedAt: now,
                updatedBy: session.id,
                retiredAudio: saved?.data.retiredAudio || [],
                ...(saved?.data.publication ? { publication: saved.data.publication } : {}),
            };
            if (payload.action === 'publish') {
                draft.publication = { ...content, revision: draft.revision, publishedAt: now };
            }
            const result = await store.setJSON(key, draft, saved ? { onlyIfMatch: saved.etag } : { onlyIfNew: true });
            if (!result.modified) return json({ error: 'conflict' }, 409);
            return json({ draft: view(draft) }, saved ? 200 : 201);
        } catch (error) {
            if (error.status === 400) return json({ error: error.message, field: error.field }, 400);
            console.error('[Artist Publisher] request failed', error);
            return json({ error: 'service_unavailable' }, 503);
        }
    };
}
