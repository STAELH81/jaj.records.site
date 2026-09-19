import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './publisher-fixture.mjs';
import { createAudioHandler, CHUNK_SIZE, MAX_AUDIO_SIZE } from '../netlify/functions/_shared/publisher-media.mjs';
import { createCatalogHandler } from '../netlify/functions/_shared/public-catalog.mjs';
const input = () => ({ id:randomUUID(), revision:'', draft:{title:'EP <new>',artist:'A',type:'ep',releaseDate:'',cover:'',tracks:[{title:'One',audioUrl:''}]} });
function media(f) {
    const handler=createAudioHandler(f.deps);
    return (query,body=null,headers={})=>handler(new Request(`https://site.test/api/artist-audio?${query}`,{method:body===null?'GET':'POST',headers:{origin:'https://site.test',...headers},...(body===null?{}:{body:typeof body==='object'&&!ArrayBuffer.isView(body)?JSON.stringify(body):body})}),{});
}
async function create(f) { const value=input(); return (await (await f.call('POST',value)).json()).draft; }
async function upload(f,draft,bytes) {
    const call=media(f);
    const start=await call('action=start',{draftId:draft.id,name:'song.mp3',size:bytes.length});
    assert.equal(start.status,201);
    const {id}=await start.json();
    for(let offset=0,part=0;offset<bytes.length;offset+=CHUNK_SIZE,part++) assert.equal((await call(`action=chunk&id=${id}&part=${part}`,bytes.subarray(offset,offset+CHUNK_SIZE))).status,200);
    assert.equal((await call(`action=complete&id=${id}`,{})).status,200);
    return id;
}
const mp3=size=>{const b=Buffer.alloc(size,35);b.write('ID3');return b;};

test('chunked audio remains private until an atomic publication; ranges cross chunk boundaries',async()=>{
    const f=fixture(), call=media(f), draft=await create(f), bytes=mp3(CHUNK_SIZE+42);
    const id=await upload(f,draft,bytes);
    assert.deepEqual(Buffer.from(await (await call(`id=${id}`)).arrayBuffer()),bytes);
    const range=await call(`id=${id}`,null,{range:`bytes=${CHUNK_SIZE-3}-${CHUNK_SIZE+3}`});
    assert.equal(range.status,206);assert.equal(range.headers.get('content-length'),'7');
    assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(CHUNK_SIZE-3,CHUNK_SIZE+4));
    const suffix=await call(`id=${id}`,null,{range:'bytes=-3'});assert.equal((await suffix.arrayBuffer()).byteLength,3);
    assert.equal((await call(`id=${id}`,null,{range:'bytes=99999999-'})).status,416);
    assert.equal((await call(`action=chunk&id=${id}&part=0`,mp3(CHUNK_SIZE))).status,409);
    const artist=f.identity.user;f.identity.user=null;
    assert.equal((await call(`id=${id}`)).status,401);
    const catalog=createCatalogHandler(()=>f.store);
    assert.deepEqual((await (await catalog(new Request('https://site.test/api/catalog'),{})).json()).releases,[]);
    f.identity.user={id:'artist-b',roles:['artist']};assert.equal((await call(`id=${id}`)).status,404);
    f.identity.user=artist;
    draft.tracks[0].audioAssetId=id;
    const saved=(await (await f.call('POST',{id:draft.id,revision:draft.revision,draft})).json()).draft;
    const published=(await (await f.call('POST',{action:'publish',id:draft.id,revision:saved.revision})).json()).draft;
    assert.ok(published.publishedAt);assert.equal(published.publication,undefined);
    f.identity.user=null;
    assert.equal((await call(`id=${id}`)).status,200);
    const publicData=await (await catalog(new Request('https://site.test/api/catalog'),{})).json();
    assert.equal(publicData.releases[0].tracks[0].audio,`/api/artist-audio?id=${id}`);
    assert.equal(publicData.releases[0].title,draft.title);
    assert.ok(!JSON.stringify(publicData).includes('ownerId'));
    f.identity.user=artist;
    published.title='Private edit';
    const edited=(await (await f.call('POST',{id:draft.id,revision:published.revision,draft:published})).json()).draft;
    assert.equal((await (await catalog(new Request('https://site.test/api/catalog'),{})).json()).releases[0].title,draft.title);
    assert.equal((await f.call('POST',{action:'publish',id:draft.id,revision:published.revision})).status,409);
    const results=await Promise.all([f.call('POST',{action:'publish',id:draft.id,revision:edited.revision}),f.call('POST',{id:draft.id,revision:edited.revision,draft:edited})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});

test('publication rejects missing, incomplete and cross-draft assets; upload enforces ownership and size',async()=>{
    const f=fixture(),call=media(f),draft=await create(f);
    assert.equal((await f.call('POST',{action:'publish',id:draft.id,revision:draft.revision})).status,400);
    assert.equal((await call('action=start',{draftId:draft.id,name:'x.mp3',size:MAX_AUDIO_SIZE+1})).status,400);
    const {id}=await (await call('action=start',{draftId:draft.id,name:'x.mp3',size:20})).json();
    assert.equal((await call(`action=complete&id=${id}`,{})).status,400);
    assert.equal((await call(`action=chunk&id=${id}&part=0`,Buffer.alloc(19))).status,400);
    assert.equal((await call(`action=chunk&id=${id}&part=0`,Buffer.alloc(20))).status,200);
    assert.equal((await call(`action=chunk&id=${id}&part=0`,Buffer.alloc(20))).status,200);
    assert.equal((await call(`action=chunk&id=${id}&part=0`,mp3(20))).status,409);
    assert.equal((await call(`action=complete&id=${id}`,{})).status,400);
    draft.tracks[0].audioAssetId=id;
    assert.equal((await f.call('POST',{id:draft.id,revision:draft.revision,draft})).status,400);
    const goodId=await upload(f,draft,mp3(20));
    const other=await create(f);other.tracks[0].audioAssetId=goodId;
    assert.equal((await f.call('POST',{id:other.id,revision:other.revision,draft:other})).status,400);
    f.identity.user={id:'b',roles:['artist']};
    assert.equal((await call('action=start',{draftId:draft.id,name:'x.mp3',size:20})).status,404);
    assert.equal((await call(`action=complete&id=${goodId}`,{})).status,404);
    f.identity.user={id:'a',roles:['user']};assert.equal((await call('action=start',{})).status,403);
});

test('covers and metadata expose the published snapshot only',async()=>{
    const f=fixture(),draft=await create(f),catalog=createCatalogHandler(()=>f.store);
    const cover=Buffer.from([137,80,78,71,13,10,26,10]);
    draft.cover=`data:image/png;base64,${cover.toString('base64')}`;draft.tracks[0].audioUrl='https://example.com/music.mp3';
    let result=(await (await f.call('POST',{id:draft.id,revision:draft.revision,draft})).json()).draft;
    const req=new Request(`https://site.test/api/catalog-cover?id=${draft.id}`);
    assert.equal((await catalog(req,{})).status,404);
    result=(await (await f.call('POST',{action:'publish',id:draft.id,revision:result.revision})).json()).draft;
    assert.deepEqual(Buffer.from(await (await catalog(req,{})).arrayBuffer()),cover);
    result.cover='';
    await f.call('POST',{id:draft.id,revision:result.revision,draft:result});
    assert.deepEqual(Buffer.from(await (await catalog(req,{})).arrayBuffer()),cover);
    const list=await (await f.call()).json();assert.equal(list.drafts[0].publication,undefined);
    assert.equal(list.drafts[0].cover,undefined);
});
