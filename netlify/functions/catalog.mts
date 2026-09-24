import { withMigrationMaintenance } from './_shared/migration-maintenance.mjs';
import type { Config } from '@netlify/functions';
import { publisherStore } from './_shared/publisher-store.mts';
import { createCatalogHandler } from './_shared/public-catalog.mjs';
const migrationGuardedHandler = createCatalogHandler(publisherStore);
export default withMigrationMaintenance(migrationGuardedHandler);

export const config: Config = { path:['/api/catalog','/api/catalog-cover','/api/artist-avatar'] };
