import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDraftHandler } from '../netlify/functions/_shared/artist-drafts.mjs';

import { fixture } from './publisher-fixture.mjs';

const input = () => ({ id: randomUUID(), revision: '', draft: { title: 'New release', artist: 'Artist A', type: 'ep', releaseDate: '2026-10-01', cover: '', tracks: [{ title: 'Track one', audioUrl: 'https://example.com/one.mp3' }] } });

test('only authenticated artists and admins can access drafts', async () => {
    const f = fixture();
    f.identity.user = null;
    assert.equal((await f.call()).status, 401);
    assert.equal((await f.call('POST', input())).status, 401);
    f.identity.user = { id: 'listener', roles: ['user'], user_metadata: { roles: ['admin'] } };
    assert.equal((await f.call()).status, 403);
    assert.equal((await f.call('POST', input())).status, 403);
});

test('save/reopen/edit preserves ownership and private draft status', async () => {
    const f = fixture();
    const value = input();
    value.draft.ownerId = 'another-user';
    value.draft.status = 'published';
    const created = await f.call('POST', value);
    assert.equal(created.status, 201);
    const { draft } = await created.json();
    assert.equal(draft.ownerId, 'artist-a');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.tracks[0].number, 1);
    assert.deepEqual((await (await f.call('GET', null, value.id)).json()).draft, draft);
    f.identity.user = { id: 'artist-b', roles: ['artist'] };
    assert.deepEqual((await (await f.call()).json()).drafts, []);
    assert.equal((await f.call('GET', null, value.id)).status, 404);
    assert.equal((await f.call('POST', { ...value, revision: draft.revision })).status, 404);
    f.identity.user = { id: 'admin', app_metadata: { roles: ['ADMIN'] } };
    assert.equal((await (await f.call()).json()).drafts.length, 1);
    value.draft.title = 'Admin edit';
    const edited = await f.call('POST', { ...value, revision: draft.revision });
    assert.equal(edited.status, 200);
    const next = (await edited.json()).draft;
    assert.equal(next.ownerId, 'artist-a');
    assert.equal(next.updatedBy, 'admin');
    assert.equal(next.title, 'Admin edit');
});

test('stale and concurrent saves cannot overwrite another edit', async () => {
    const f = fixture();
    const value = input();
    const { draft } = await (await f.call('POST', value)).json();
    assert.equal((await f.call('POST', value)).status, 409);
    const results = await Promise.all([f.call('POST', { ...value, revision: draft.revision }), f.call('POST', { ...value, revision: draft.revision })]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});

test('rejects invalid origin, fields, media and oversized bodies', async () => {
    const f = fixture();
    assert.equal((await f.handler(new Request('https://site.test/api/artist-drafts', { method:'POST', body:'{}', headers:{origin:'https://evil.test'} }), {})).status, 403);
    for (const change of [{ title:'' }, { releaseDate:'2026-02-30' }, { type:'other' }, { cover:'data:image/svg+xml;base64,PHN2Zz4=' }, { tracks:[{ title:'Track', audioUrl:'javascript:alert(1)' }] }, { tracks:Array(51).fill({title:'Track'}) }]) {
        const value = input(); Object.assign(value.draft, change);
        assert.equal((await f.call('POST', value)).status, 400);
    }
    const value = input(); value.draft.cover = 'x'.repeat(1600000);
    assert.equal((await f.call('POST', value)).status, 413);
    assert.equal(f.records.size, 0);
});

test('fresh roles override cached permissions and lookup failures deny access', async () => {
    const f = fixture();
    const handler = createDraftHandler({ getUser: async () => ({id:'old-admin',roles:['admin']}), liveUser: async () => ({id:'old-admin',roles:['user']}), verifyOrigin:()=>{}, getStore:()=>f.store });
    assert.equal((await handler(new Request('https://site.test'), {})).status, 403);
});
