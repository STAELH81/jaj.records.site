import { audioKey } from './publisher-media.mjs';

const GRACE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 10;

// Retirement is committed to the draft before deleting bytes. Concurrent saves either
// win the ETag race (and preserve their referenced files) or retry against retired IDs.
export async function cleanupAudio(store, canEdit, now = Date.now()) {
    const { blobs } = await store.list({ prefix: 'audio/' });
    let removed = 0, failed = 0, considered = 0, more = false;
    for (const item of blobs) {
        if (!item.key.endsWith('/manifest.json')) continue;
        const asset = await store.get(item.key, { type: 'json' });
        if (!asset) continue;
        const key = `drafts/${asset.draftId}.json`;
        const saved = await store.getWithMetadata(key, { type: 'json' });
        if (!saved || !canEdit(saved.data)) continue;
        const draft = saved.data;
        const used = [...(draft.tracks || []), ...(draft.publication?.tracks || [])]
            .some(track => track.audioAssetId === asset.id);
        if (used || (!draft.deletedAt && !(Date.parse(asset.createdAt) <= now - GRACE_MS))) continue;
        if (considered++ >= BATCH_SIZE) { more = true; break; }
        if (!saved.etag) { failed++; continue; }
        const retiredAudio = [...new Set([...(draft.retiredAudio || []), asset.id])];
        const result = await store.setJSON(key, { ...draft, retiredAudio }, { onlyIfMatch: saved.etag });
        if (!result.modified) { failed++; continue; }
        try {
            // Keep the manifest until every part is deleted so a failed batch can retry.
            const parts = await store.list({ prefix: `audio/${asset.id}/` });
            for (const part of parts.blobs) {
                if (part.key !== audioKey(asset.id)) await store.delete(part.key);
            }
            await store.delete(audioKey(asset.id));
            removed++;
        } catch (_) { failed++; }
    }
    return { removed, more: more || failed > 0, failed };
}
