import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './publisher-fixture.mjs';
import { createArtistProfilesHandler } from '../netlify/functions/_shared/artist-profiles.mjs';
import { createCatalogHandler } from '../netlify/functions/_shared/public-catalog.mjs';
import { artistIdFor } from '../netlify/functions/_shared/artist-identity.mjs';
async function setup() {
    const f=fixture();
    const draft=(await (await f.call('POST',{id:randomUUID(),revision:'',draft:{title:'Private release',artist:'Cha',type:'ep',tracks:[]}})).json()).draft;
    const handler=createArtistProfilesHandler(f.deps);
    return {...f,draft,id:artistIdFor(draft.ownerId,draft.artist),callProfile:body=>handler(new Request('https://site.test/api/artist-profiles',{method:body?'POST':'GET',headers:{origin:'https://site.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{})};
}
const input=(id,revision='')=>({artistId:id,revision,profile:{bio:'Biography <script>not HTML</script>\nSecond line',avatar:''}});

test('profile ownership is derived server-side; matching names cannot claim another artist or the archive',async()=>{
    const f=await setup(),artist=f.identity.user;
    assert.equal((await f.callProfile(input('cha'))).status,404);
    assert.equal((await f.callProfile(input(f.id))).status,200);
    f.identity.user={id:'artist-b',roles:['artist']};
    await f.call('POST',{id:randomUUID(),revision:'',draft:{title:'Other',artist:'Cha',type:'single',tracks:[]}});
    const list=(await (await f.callProfile()).json()).artists;
    assert.equal(list.length,1);assert.notEqual(list[0].id,f.id);
    assert.equal((await f.callProfile(input(f.id))).status,404);
    f.identity.user=null;assert.equal((await f.callProfile()).status,401);
    f.identity.user={id:'listener',roles:['user']};assert.equal((await f.callProfile(input(f.id))).status,403);
    f.identity.user={id:'admin',roles:['admin']};
    const all=(await (await f.callProfile()).json()).artists;
    assert.ok(all.some(a=>a.id==='cha'));assert.ok(all.some(a=>a.id===f.id));
    const profile=all.find(a=>a.id===f.id).profile;
    assert.equal((await f.callProfile(input(f.id,profile.revision))).status,200);
    assert.equal((await f.store.get(`artist-profiles/${f.id}.json`)).ownerId,artist.id);
});

test('public profiles and avatars exclude private drafts and owner data; draft deletion does not erase a published profile',async()=>{
    const f=await setup(),catalog=createCatalogHandler(()=>f.store);
    const req=new Request('https://site.test/api/catalog');
    assert.deepEqual((await (await catalog(req,{})).json()).artists,[]);
    const value=input(f.id);const bytes=Buffer.from([137,80,78,71,13,10,26,10]);value.profile.avatar=`data:image/png;base64,${bytes.toString('base64')}`;
    await f.callProfile(value);
    const editor=(await (await f.callProfile()).json()).artists[0].profile;
    assert.ok(editor.avatar.startsWith('/api/artist-avatar?'));
    assert.equal(editor.ownerId,undefined);
    assert.equal((await f.callProfile({artistId:f.id,revision:editor.revision,profile:editor})).status,200);
    const data=await (await catalog(req,{})).json();
    assert.equal(data.artists[0].bio,value.profile.bio);assert.equal(data.releases.length,0);
    assert.equal(data.artists[0].ownerId,undefined);assert.ok(!JSON.stringify(data).includes('Private release'));
    const avatar=await catalog(new Request(`https://site.test${data.artists[0].avatar}`),{});
    assert.equal(avatar.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await avatar.arrayBuffer()),bytes);
    await f.call('POST',{action:'delete',id:f.draft.id,revision:f.draft.revision});
    assert.equal((await (await f.callProfile()).json()).artists[0].id,f.id);
    assert.equal((await (await catalog(req,{})).json()).artists.length,1);
});

test('invalid bios and avatars fail without mutation; simultaneous edits conflict',async()=>{
    const f=await setup();
    for(const profile of [{bio:'a'.repeat(2001),avatar:''},{bio:'x',avatar:'data:image/svg+xml;base64,PHN2Zz4='},{bio:'x',avatar:`data:image/png;base64,${Buffer.alloc(1024*1024+1).toString('base64')}`}]){
        assert.equal((await f.callProfile({artistId:f.id,revision:'',profile})).status,400);
    }
    const results=await Promise.all([f.callProfile(input(f.id)),f.callProfile(input(f.id))]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await f.callProfile(input(f.id))).status,409);
    const p=(await (await f.callProfile()).json()).artists[0].profile;
    const value=input(f.id,p.revision);value.profile.avatar='';value.profile.bio='';
    assert.equal((await f.callProfile(value)).status,200);
    assert.equal((await f.store.get(`artist-profiles/${f.id}.json`)).bio,'');
});
