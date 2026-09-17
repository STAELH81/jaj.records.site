import { getStore } from '@netlify/blobs';
import { admin, getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config, Context } from '@netlify/functions';
import { createDraftHandler } from './_shared/artist-drafts.mjs';

declare const Netlify: any;

export default createDraftHandler({
    getUser,
    liveUser: (id: string) => admin.getUser(id),
    verifyOrigin: verifyRequestOrigin,
    getStore: (context: Context) => {
        // Preview drafts survive redeploys but never share production storage.
        const scope = context.deploy.context === 'production' ? 'production'
            : `preview-${String(Netlify.env.get('BRANCH') || context.deploy.context).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32)}`;
        return getStore({ name: `aq-artist-drafts-v1-${scope}`, consistency: 'strong' });
    },
});

export const config: Config = { path: '/api/artist-drafts' };
