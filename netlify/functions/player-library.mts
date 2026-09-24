import { withMigrationMaintenance } from './_shared/migration-maintenance.mjs';
import { getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config } from '@netlify/functions';
import { publisherStore } from './_shared/publisher-store.mts';
import { createPlayerLibraryHandler } from './_shared/player-library.mjs';

const migrationGuardedHandler = createPlayerLibraryHandler({ getUser, verifyOrigin: verifyRequestOrigin, getStore: publisherStore });
export default withMigrationMaintenance(migrationGuardedHandler);

export const config: Config = { path: '/api/player-library' };
