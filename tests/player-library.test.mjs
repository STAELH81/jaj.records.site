import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './publisher-fixture.mjs';
import { createPlayerLibraryHandler } from '../netlify/functions/_shared/player-library.mjs';

export function playerFixture() {
    const f = fixture();
    const handler = createPlayerLibraryHandler(f.deps);
    const call = (body = null, query = '', headers = {}) => handler(new Request(`https://site.test/api/player-library${query}`, {
        method:body ? 'PUT' : 'GET', headers:{ origin:'https://site.test', 'content-type':'application/json', ...headers }, ...(body ? {body:JSON.stringify(body)} : {}),
    }), {});
    return {...f, handler, call};
}
const library = () => ({playlists:[{id:'mix', name:'Night drive', visibility:'private', tracks:[{releaseId:'album',trackId:'song'}]}], favorites:[{releaseId:'secret',trackId:'favorite'}]});

test('private libraries require login; clients cannot choose another owner', async () => {
    const f = playerFixture();
    f.identity.user = null;
    assert.equal((await f.call()).status,401);
    assert.equal((await f.call({revision:'',library:library()})).status,401);
    f.identity.user = {id:'alice'};
    assert.equal((await f.call({revision:'', ownerId:'bob',library:library()})).status,200);
    f.identity.user = {id:'bob'};
    assert.deepEqual((await (await f.call()).json()).library.playlists,[]);
    assert.equal((await f.call(null,'?owner=alice&playlist=mix')).status,404);
});
test('public shares expose only the selected playlist and are revoked immediately', async () => {
    const f = playerFixture(); f.identity.user = {id:'alice',user_metadata:{display_name:'Alice'}};
    const content = library(); content.playlists[0].visibility='public';
    const saved = (await (await f.call({revision:'',library:content})).json()).library;
    f.identity.user = null;
    const shared = await (await f.call(null,'?owner=alice&playlist=mix')).json();
    assert.equal(shared.ownerName,'Alice');
    assert.equal(shared.playlist.name,'Night drive');
    assert.equal('favorites' in shared,false); assert.equal('revision' in shared,false);
    f.identity.user = {id:'alice'}; saved.playlists[0].visibility='private';
    assert.equal((await f.call({revision:saved.revision,library:saved})).status,200);
    f.identity.user = null;
    assert.equal((await f.call(null,'?owner=alice&playlist=mix')).status,404);
});
test('atomic revisions reject stale and simultaneous saves without lost data', async () => {
    const f = playerFixture();
    const payload = {revision:'',library:library()};
    const responses = await Promise.all([f.call(payload),f.call(payload)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal((await f.call(payload)).status,409);
    const saved = (await (await f.call()).json()).library;
    saved.playlists=[];
    assert.equal((await f.call({revision:saved.revision,library:saved})).status,200);
    assert.deepEqual((await (await f.call()).json()).library.playlists,[]);
});
test('rejects cross-origin writes, invalid references, duplicates, and oversized collections', async () => {
    const f = playerFixture();
    assert.equal((await f.call({revision:'',library:library()},'',{origin:'https://evil.test'})).status,403);
    for (const change of [
        x=>{x.playlists[0].name=' ';}, x=>{x.playlists[0].tracks[0].releaseId='../escape';},
        x=>{x.playlists.push(x.playlists[0]);}, x=>{x.playlists[0].tracks.push(x.playlists[0].tracks[0]);},
        x=>{x.favorites=Array.from({length:501},(_,i)=>({releaseId:'a',trackId:String(i)}));},
        x=>{x.playlists[0].visibility='friends';},
    ]) { const value=library();change(value);assert.equal((await f.call({revision:'',library:value})).status,400); }
    assert.equal((await f.call(null,'?owner=../escape&playlist=mix')).status,404);
});
