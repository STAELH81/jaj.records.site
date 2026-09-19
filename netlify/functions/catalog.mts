import type { Config } from '@netlify/functions';
import { publisherStore } from './_shared/publisher-store.mts';
import { createCatalogHandler } from './_shared/public-catalog.mjs';
export default createCatalogHandler(publisherStore);
export const config: Config = { path:['/api/catalog','/api/catalog-cover','/api/artist-avatar'] };
