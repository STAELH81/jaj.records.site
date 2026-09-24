import { withMigrationMaintenance } from './_shared/migration-maintenance.mjs';
import { publisherStore } from './_shared/publisher-store.mts';
import { admin, getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config } from '@netlify/functions';
import { createDraftHandler } from './_shared/artist-drafts.mjs';



const migrationGuardedHandler = createDraftHandler({
    getUser,
    liveUser: (id: string) => admin.getUser(id),
    verifyOrigin: verifyRequestOrigin,
    getStore: publisherStore,
});

export default withMigrationMaintenance(migrationGuardedHandler);

export const config: Config = { path: '/api/artist-drafts' };
