import { getStore } from '@netlify/blobs';
import type { Context } from '@netlify/functions';
declare const Netlify: any;

export function publisherStore(context: Context) {
    const scope = context.deploy.context === 'production' ? 'production'
        : `preview-${String(Netlify.env.get('BRANCH') || context.deploy.context).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32)}`;
    return getStore({ name: `aq-artist-drafts-v1-${scope}`, consistency: 'strong' });
}
