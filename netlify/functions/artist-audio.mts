import { withMigrationMaintenance } from './_shared/migration-maintenance.mjs';
import { admin, getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config } from '@netlify/functions';
import { publisherStore } from './_shared/publisher-store.mts';
import { createAudioHandler } from './_shared/publisher-media.mjs';
const migrationGuardedHandler = createAudioHandler({ getUser, liveUser:(id: string)=>admin.getUser(id), verifyOrigin:verifyRequestOrigin, getStore:publisherStore });
export default withMigrationMaintenance(migrationGuardedHandler);

export const config: Config = { path:'/api/artist-audio' };
