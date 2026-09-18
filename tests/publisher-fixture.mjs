import { randomUUID } from 'node:crypto';
import { createDraftHandler } from '../netlify/functions/_shared/artist-drafts.mjs';
export function fixture() {
    const records = new Map();
    const identity = { user: { id: 'artist-a', roles: ['artist'], user_metadata: { display_name: 'Artist A' } } };
    const store = {
        async delete(key) { records.delete(key); },
        async get(key) { return structuredClone(records.get(key)?.data ?? null); },
        async getWithMetadata(key) { return structuredClone(records.get(key) ?? null); },
        async list({ prefix }) { return { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; },
        async setJSON(key, data, options = {}) {
            const current = records.get(key);
            if ((options.onlyIfNew && current) || (options.onlyIfMatch && options.onlyIfMatch !== current?.etag)) return { modified: false };
            records.set(key, { data: structuredClone(data), etag: randomUUID(), metadata: options.metadata || {} });
            return { modified: true };
        },
    };
    store.set = store.setJSON;
    const deps = {
        getUser: async () => identity.user,
        liveUser: async () => identity.user,
        verifyOrigin: request => { if (request.headers.get('origin') !== 'https://site.test') throw new Error('origin'); },
        getStore: () => store,
    };
    const handler = createDraftHandler(deps);
    return { records, identity, store, deps, handler, call: (method = 'GET', body = null, id = '') => handler(new Request(`https://site.test/api/artist-drafts${id ? `?id=${id}` : ''}`, {
        method, headers: { 'content-type': 'application/json', origin: 'https://site.test' }, ...(body ? { body: JSON.stringify(body) } : {}),
    }), {}) };
}
