import { randomUUID } from 'node:crypto';
import { actor, json } from './publisher-media.mjs';
import { coverImage } from './artist-drafts.mjs';
import { artistIdFor, validArtistId, archiveArtists, artistAvatarUrl } from './artist-identity.mjs';

const editorView = ({ownerId,...profile}) => ({...profile,avatar:artistAvatarUrl(profile)});

async function editableArtists(store, who) {
    const artists = new Map(who.admin ? archiveArtists.map(a => [a.id, a]) : []);
    const { blobs } = await store.list({ prefix:'drafts/' });
    for (const item of blobs) {
        const draft = await store.get(item.key, { type:'json' });
        if (!draft || draft.deletedAt || (!who.admin && draft.ownerId !== who.id)) continue;
        for (const name of new Set([draft.artist, draft.publication?.artist].filter(Boolean))) {
            const id = artistIdFor(draft.ownerId, name);
            artists.set(id, { id, name, ownerId:draft.ownerId, ownerName:draft.ownerName });
        }
    }
    const profiles = await store.list({ prefix:'artist-profiles/' });
    for (const item of profiles.blobs) {
        const profile = await store.get(item.key, { type:'json' });
        if (profile && (who.admin || profile.ownerId === who.id)) {
            const { id, name, ownerId, ownerName } = profile;
            artists.set(id, { id, name, ownerId, ownerName, profile:editorView(profile) });
        }
    }
    return artists;
}

export function createArtistProfilesHandler(deps) {
    return async (request, context) => {
        try {
            if (!['GET','POST'].includes(request.method)) return json({error:'method_not_allowed'},405);
            const who = await actor(deps), store = deps.getStore(context);
            if (request.method === 'POST') {
                try { deps.verifyOrigin(request); } catch (_) { return json({error:'invalid_origin'},403); }
                if (!request.headers.get('content-type')?.includes('application/json')) return json({error:'invalid_json'},400);
            }
            const artists = await editableArtists(store, who);
            if (request.method === 'GET') return json({ artists:[...artists.values()].map(({ownerId,...a}) => a), isAdmin:who.admin });
            if (Number(request.headers.get('content-length')) > 1500000) return json({error:'too_large'},413);
            const raw = await request.text();
            if (Buffer.byteLength(raw) > 1500000) return json({error:'too_large'},413);
            let body; try { body = JSON.parse(raw); } catch (_) { return json({error:'invalid_json'},400); }
            if (!validArtistId(body?.artistId) || !artists.has(body.artistId)) return json({error:'not_found'},404);
            const artist = artists.get(body.artistId);
            const key = `artist-profiles/${artist.id}.json`;
            const saved = await store.getWithMetadata(key, {type:'json'});
            if ((saved?.data.revision || '') !== (body.revision || '')) return json({error:'conflict'},409);
            if (saved && !saved.etag) return json({error:'service_unavailable'},503);
            if (typeof body.profile?.bio !== 'string' || body.profile.bio.length > 2000) return json({error:'invalid_profile'},400);
            const profile = {
                id:artist.id, name:artist.name, ownerId:artist.ownerId, ownerName:artist.ownerName || '',
                bio:body.profile.bio.trim(), avatar:saved && body.profile.avatar === artistAvatarUrl(saved.data) ? saved.data.avatar : coverImage(body.profile.avatar),
                revision:randomUUID(), updatedAt:new Date().toISOString(),
            };
            const result = await store.setJSON(key, profile, saved ? {onlyIfMatch:saved.etag} : {onlyIfNew:true});
            if (!result.modified) return json({error:'conflict'},409);
            return json({profile:editorView(profile)});
        } catch (error) {
            if (error.status) return json({error:error.field || error.message}, error.status);
            console.error('[Artist profiles]',error);
            return json({error:'service_unavailable'},503);
        }
    };
}
