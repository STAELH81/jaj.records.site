import { publisherStore } from './_shared/publisher-store.mts';
import { admin, getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config } from '@netlify/functions';
import { createDraftHandler } from './_shared/artist-drafts.mjs';



export default createDraftHandler({
    getUser,
    liveUser: (id: string) => admin.getUser(id),
    verifyOrigin: verifyRequestOrigin,
    getStore: publisherStore,
});

export const config: Config = { path: '/api/artist-drafts' };
