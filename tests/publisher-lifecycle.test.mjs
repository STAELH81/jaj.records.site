import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './publisher-fixture.mjs';
import { createAudioHandler, audioKey } from '../netlify/functions/_shared/publisher-media.mjs';
import { createCatalogHandler } from '../netlify/functions/_shared/public-catalog.mjs';
const old = '2020-01-01T00:00:00.000Z';
async function draft(f) {
    const value={id:randomUUID(),revision:'',draft:{title:'Lifecycle',artist:'Cha',type:'ep',tracks:[{title:'Track',audioUrl:'https://example.com/audio.mp3'}]}};
    return (await (await f.call('POST',value)).json()).draft;
}
async function asset(f,d,createdAt=old) {
    const id=randomUUID();
    await f.store.setJSON(audioKey(id),{id,draftId:d.id,ownerId:d.ownerId,name:'audio.mp3',size:12,parts:1,complete:true,mime:'audio/mpeg',createdAt});
    await f.store.set(`audio/${id}/0`,new Uint8Array(12).buffer);
    return id;
}
async function save(f,d) {return (await (await f.call('POST',{id:d.id,revision:d.revision,draft:d})).json()).draft;}
async function act(f,d,action) {return f.call('POST',{action,id:d.id,revision:d.revision});}
const clean=f=>f.call('POST',{action:'cleanup'});

test('unpublish preserves private tracks; delete requires unpublication and cannot be undone by stale clients',async()=>{
    const f=fixture();let d=await draft(f);const id=await asset(f,d);
    d.tracks[0].audioAssetId=id;d=await save(f,d);
    d=(await (await act(f,d,'publish')).json()).draft;
    assert.equal((await act(f,d,'delete')).status,409);
    const publicAPI=createCatalogHandler(()=>f.store), audio=createAudioHandler(f.deps);
    const artist=f.identity.user;
    f.identity.user={id:'other',roles:['artist']};assert.equal((await act(f,d,'unpublish')).status,404);
    f.identity.user=artist;
    const stale=d;
    d=(await (await act(f,d,'unpublish')).json()).draft;
    assert.equal(d.publishedAt,'');assert.equal(d.tracks[0].audioAssetId,id);
    assert.equal((await act(f,stale,'publish')).status,409);
    assert.deepEqual((await (await publicAPI(new Request('https://site.test/api/catalog'),{})).json()).releases,[]);
    f.identity.user=null;
    assert.equal((await audio(new Request(`https://site.test/api/artist-audio?id=${id}`),{})).status,401);
    f.identity.user=artist;
    assert.equal((await audio(new Request(`https://site.test/api/artist-audio?id=${id}`),{})).status,200);
    assert.equal((await act(f,d,'delete')).status,200);
    assert.deepEqual((await (await f.call()).json()).drafts,[]);
    assert.equal((await f.call('GET',null,d.id)).status,404);
    assert.equal((await f.call('POST',{id:d.id,revision:'',draft:d})).status,404);
    assert.equal((await audio(new Request(`https://site.test/api/artist-audio?id=${id}`),{})).status,404);
    assert.equal((await (await clean(f)).json()).removed,1);
    assert.equal(await f.store.get(audioKey(id)),null);
});

test('cleanup keeps published, draft, recent and other-account files; retired IDs cannot be reattached',async()=>{
    const f=fixture();let d=await draft(f);
    const published=await asset(f,d), current=await asset(f,d), unused=await asset(f,d), recent=await asset(f,d,new Date().toISOString());
    d.tracks[0].audioAssetId=published;d=await save(f,d);d=(await (await act(f,d,'publish')).json()).draft;
    d.tracks[0].audioAssetId=current;d=await save(f,d);
    const artist=f.identity.user;f.identity.user={id:'other',roles:['artist']};const other=await draft(f),foreign=await asset(f,other);f.identity.user=artist;
    const result=await (await clean(f)).json();assert.equal(result.removed,1);
    for(const id of [published,current,recent,foreign])assert.ok(await f.store.get(audioKey(id)));
    assert.equal(await f.store.get(audioKey(unused)),null);
    const live=(await (await f.call('GET',null,d.id)).json()).draft;assert.equal(live.retiredAudio,undefined);
    // Simulate an in-flight completion recreating a retired manifest: retirement still wins.
    await f.store.setJSON(audioKey(unused),{id:unused,draftId:d.id,complete:true});
    live.tracks[0].audioAssetId=unused;assert.equal((await f.call('POST',{id:d.id,revision:live.revision,draft:live})).status,400);
    f.identity.user={id:'admin',roles:['admin']};assert.equal((await (await clean(f)).json()).removed,1);
    assert.equal(await f.store.get(audioKey(foreign)),null);
});

test('cleanup loses to a concurrent save referencing the candidate and never deletes its bytes',async()=>{
    const f=fixture();const d=await draft(f),id=await asset(f,d);
    const original=f.store.setJSON.bind(f.store);let race=true;
    f.store.setJSON=async(key,value,options)=>{
        if(race && value.retiredAudio?.includes(id)){
            race=false;d.tracks[0].audioAssetId=id;
            assert.ok((await save(f,d)).revision);
        }
        return original(key,value,options);
    };
    assert.equal((await (await clean(f)).json()).failed,1);
    assert.ok(await f.store.get(`audio/${id}/0`));
    assert.equal((await (await clean(f)).json()).removed,0);
});

test('cleanup retries partial failures, handles deleted-draft recent uploads and bounds batches',async()=>{
    const f=fixture();const d=await draft(f),id=await asset(f,d,new Date().toISOString());
    assert.equal((await (await clean(f)).json()).removed,0);
    await act(f,d,'delete');
    const original=f.store.delete;let fail=true;
    f.store.delete=async key=>{if(fail){fail=false;throw new Error('temporary');}return original(key);};
    const first=await (await clean(f)).json();assert.equal(first.failed,1);assert.equal(first.more,true);
    assert.ok(await f.store.get(audioKey(id)));
    assert.equal((await (await clean(f)).json()).removed,1);
    for(let i=0;i<11;i++)await asset(f,d);
    const batch=await (await clean(f)).json();assert.equal(batch.removed,10);assert.equal(batch.more,true);
    assert.equal((await (await clean(f)).json()).removed,1);
});
