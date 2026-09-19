import { createHash } from 'node:crypto';
export const artistIdFor = (ownerId, name) => `artist-${createHash('sha256').update(`${ownerId}:${name.toLowerCase()}`).digest('hex').slice(0,20)}`;
export const validArtistId = id => id === 'cha' || /^artist-[a-f0-9]{20}$/.test(id || '');
// Bundled archive identities are editable only by administrators.
export const archiveArtists = [{ id:'cha', name:'Cha', ownerId:null, ownerName:'JAJ Records' }];
export const artistAvatarUrl = profile => profile?.avatar ? `/api/artist-avatar?id=${profile.id}&v=${profile.revision}` : '';
