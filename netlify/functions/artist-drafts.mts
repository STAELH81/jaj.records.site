import { publisherStore } from './_shared/publisher-store.mts';
import { admin, verifyRequestOrigin } from '@netlify/identity';
import { getSessionUser } from './_shared/identity-session.mts';
import type { Config } from '@netlify/functions';
import { createDraftHandler } from './_shared/artist-drafts.mjs';



export default createDraftHandler({
    getUser: getSessionUser,
    liveUser: (id: string) => admin.getUser(id),
    verifyOrigin: verifyRequestOrigin,
    getStore: publisherStore,
});

export const config: Config = { path: '/api/artist-drafts' };
