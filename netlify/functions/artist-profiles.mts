import { admin, getUser, verifyRequestOrigin } from '@netlify/identity';
import type { Config } from '@netlify/functions';
import { publisherStore } from './_shared/publisher-store.mts';
import { createArtistProfilesHandler } from './_shared/artist-profiles.mjs';
export default createArtistProfilesHandler({ getUser, liveUser:(id:string)=>admin.getUser(id), verifyOrigin:verifyRequestOrigin, getStore:publisherStore });
export const config: Config = { path:'/api/artist-profiles' };
