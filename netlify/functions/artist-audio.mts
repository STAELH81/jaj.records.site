import { admin, verifyRequestOrigin } from '@netlify/identity';
import { getSessionUser } from './_shared/identity-session.mts';
import type { Config } from '@netlify/functions';
import { publisherStore } from './_shared/publisher-store.mts';
import { createAudioHandler } from './_shared/publisher-media.mjs';
export default createAudioHandler({ getUser:getSessionUser, liveUser:(id: string)=>admin.getUser(id), verifyOrigin:verifyRequestOrigin, getStore:publisherStore });
export const config: Config = { path:'/api/artist-audio' };
