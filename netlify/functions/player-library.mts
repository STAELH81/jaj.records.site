import { verifyRequestOrigin } from '@netlify/identity';
import { getSessionUser } from './_shared/identity-session.mts';
import type { Config } from '@netlify/functions';
import { publisherStore } from './_shared/publisher-store.mts';
import { createPlayerLibraryHandler } from './_shared/player-library.mjs';

export default createPlayerLibraryHandler({ getUser:getSessionUser, verifyOrigin: verifyRequestOrigin, getStore: publisherStore });
export const config: Config = { path: '/api/player-library' };
