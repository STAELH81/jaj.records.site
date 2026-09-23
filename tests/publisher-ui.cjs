const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
    const { fixture } = await import('./publisher-fixture.mjs');
    const f = fixture();
    const { createAudioHandler } = await import('../netlify/functions/_shared/publisher-media.mjs');
    const { createCatalogHandler } = await import('../netlify/functions/_shared/public-catalog.mjs');
    const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        let failSave = false;
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await page.route('**/api/aq-auth', route => route.fulfill({ json: { authenticated: false, user: null } }));
        await page.route('**/api/artist-drafts**', async route => {
            const incoming = route.request();
            if (failSave && incoming.method() === 'POST') return route.fulfill({ status:503, json:{error:'service_unavailable'} });
            const url = new URL(incoming.url());
            const response = await f.handler(new Request(`https://site.test${url.pathname}${url.search}`, {
                method: incoming.method(), headers: { 'content-type':'application/json', origin:'https://site.test' },
                ...(incoming.postData() ? { body: incoming.postData() } : {}),
            }), {});
            await route.fulfill({ status: response.status, contentType:'application/json', body: await response.text() });
        });
        for (const [pattern, handler] of [
            ['**/api/artist-audio**', createAudioHandler(f.deps)],
            ['**/api/catalog**', createCatalogHandler(() => f.store)],
        ]) await page.route(pattern, async route => {
            const incoming = route.request(), url = new URL(incoming.url());
            const response = await handler(new Request(`https://site.test${url.pathname}${url.search}`, {
                method: incoming.method(), headers: { ...incoming.headers(), origin:'https://site.test' },
                ...(incoming.postDataBuffer() ? { body:incoming.postDataBuffer() } : {}),
            }), {});
            await route.fulfill({ status:response.status, headers:Object.fromEntries(response.headers), body:Buffer.from(await response.arrayBuffer()) });
        });
        await page.addInitScript(() => {
            if (!localStorage.getItem('aquerty_settings_v1')) localStorage.setItem('aquerty_settings_v1', JSON.stringify({ bootEnabled:false, systemPopups:false, crtEnabled:false }));
        });
        async function enter(user) {
            f.identity.user = user;
            await page.evaluate(user => {
                window.JAJSession = user ? { ...user, type:'user', displayName:user.user_metadata?.display_name || 'Test account' } : {type:'guest', roles:[]};
                window.dispatchEvent(new CustomEvent('jaj:session-changed', { detail:window.JAJSession }));
            }, user);
        }
        async function open() {
            await page.evaluate(() => openWindow('win-publisher','task-publisher'));
            await page.waitForFunction(() => document.querySelector('#publisher-status')?.textContent !== 'Chargement…');
        }
        await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765');
        await page.locator('#aq-guest-btn').click();
        assert.equal(await page.locator('[data-desktop-icon="publisher"]').isVisible(), false);
        await open();
        assert.match(await page.locator('#publisher-root').innerText(), /réservé/);
        const artist = { id:'artist-a', roles:['artist'], user_metadata:{display_name:'Cha'} };
        await enter(artist);
        await open();
        assert.equal(await page.locator('[data-desktop-icon="publisher"]').isVisible(), true);
        assert.match(await page.locator('[data-desktop-icon="publisher"] img').getAttribute('src'), /publisherimg\.png(?:\?.*)?$/);
        await page.locator('[data-action="new"]').first().click();
        await page.locator('[name="title"]').fill('Night sketches <demo>');
        await page.locator('[name="type"]').selectOption('ep');
        await page.locator('[name="releaseDate"]').fill('2026-11-20');
        await page.locator('#publisher-cover').setInputFiles(path.resolve('medias/img/exeimg.png'));
        await page.waitForFunction(() => !!document.querySelector('#publisher-preview img'));
        for (const title of ['First track', 'Second track']) {
            await page.locator('[data-action="add-track"]').click();
            await page.locator('[data-track-field="title"]').last().fill(title);
        }
        await page.locator('[data-track="1"] [data-action="up"]').click();
        assert.equal(await page.locator('[data-track-field="title"]').first().inputValue(), 'Second track');
        await page.getByRole('button', { name:'Enregistrer le brouillon', exact:true }).click();
        await page.waitForFunction(() => document.querySelector('#publisher-status')?.textContent === 'Brouillon enregistré.');
        assert.equal(f.records.size, 1);
        assert.ok(await page.evaluate(() => AQNotifications.getState().entries.some(item => item.source === 'publisher' && item.body === 'Brouillon enregistré.')));
        assert.equal([...f.records.values()][0].data.tracks[0].title, 'Second track');
        await page.reload();
        await page.locator('#aq-guest-btn').click();
        await enter(artist);
        await open();
        await page.locator('[data-draft-id]').click();
        assert.equal(await page.locator('[name="title"]').inputValue(), 'Night sketches <demo>');
        assert.equal(await page.locator('#publisher-preview img').count(), 1);
        await page.locator('[name="title"]').fill('Updated EP');
        failSave = true;
        await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#publisher-status')?.classList.contains('error'));
        assert.equal(await page.locator('[name="title"]').inputValue(), 'Updated EP');
        failSave = false;
        await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#publisher-status')?.textContent === 'Brouillon enregistré.');
        // Real WAV payload exercises browser decoding and seeking through the actual media handler.
        const pcmSize = 48000 * 2 * 2, wav = Buffer.alloc(44 + pcmSize);
        wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8,4); wav.write('WAVEfmt ',8);
        wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
        wav.writeUInt32LE(48000,24); wav.writeUInt32LE(96000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
        wav.write('data',36); wav.writeUInt32LE(pcmSize,40);
        for (let index=0; index<2; index++) {
            await page.locator('[data-audio-upload]').nth(index).setInputFiles({name:`song-${index}.wav`,mimeType:'audio/wav',buffer:wav});
            await page.waitForFunction(index => document.querySelectorAll('.publisher-audio-name').length === index+1, index);
        }
        await page.getByRole('button',{name:'Publier',exact:true}).click();
        assert.match(await page.locator('#publisher-status').innerText(), /Enregistre le brouillon/);
        await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#publisher-status')?.textContent === 'Brouillon enregistré.');
        await page.getByRole('button',{name:'Publier',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#publisher-status')?.textContent.startsWith('Sortie publiée'));
        assert.ok(await page.evaluate(() => AQNotifications.getState().entries.some(item => item.source === 'publisher' && item.body.startsWith('Sortie publiée'))));
        const id = await page.evaluate(() => AQCatalog.getReleases().find(r=>r.title==='Updated EP')?.id);
        assert.ok(id);
        await page.evaluate(id => { openWindow('win-ie','task-ie'); setIEPage(`release:${id}`); },id);
        await page.locator(`[data-player-release="${id}"]`).click();
        assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentReleaseId()),id);
        await page.evaluate(()=>playTrackAtIndex(0,true));
        await page.waitForFunction(()=>player.duration===2 && !player.paused);
        await page.evaluate(()=>{player.currentTime=1;player.pause();});
        await page.reload();
        await page.locator('#aq-guest-btn').click();
        await page.waitForFunction(id=>window.AQPlayerCatalog?.getCurrentReleaseId()===id,id);
        await enter(artist); await open(); await page.locator('[data-draft-id]').click();
        await page.waitForFunction(()=>document.querySelectorAll('.publisher-audio-name').length===2);
        await page.locator('[name="title"]').fill('Private next version');
        await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#publisher-status')?.textContent === 'Brouillon enregistré.');
        await page.evaluate(()=>AQCatalog.refresh());
        assert.equal(await page.evaluate(id=>AQCatalog.getRelease(id).title,id),'Updated EP');
        await page.getByRole('button',{name:'Republier',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#publisher-status')?.textContent.startsWith('Sortie publiée'));
        assert.equal(await page.evaluate(id=>AQCatalog.getRelease(id).title,id),'Private next version');
        await page.evaluate(() => updateSetting('desktopLanguage','en'));
        assert.equal(await page.getByRole('button',{name:'Save draft',exact:true}).count(), 1);
        assert.equal(await page.locator('[name="title"]').inputValue(), 'Private next version');
        if (process.env.QA_DIR) await page.screenshot({ path:path.join(process.env.QA_DIR,'publisher-desktop.png') });
        await page.setViewportSize({width:390,height:844});
        await page.waitForFunction(() => document.body.classList.contains('mobile-mode'));
        assert.ok(await page.locator('#win-publisher').evaluate(el => el.getBoundingClientRect().right <= innerWidth+1));
        assert.ok(await page.locator('#publisher-root').evaluate(el => el.scrollWidth <= el.clientWidth+1));
        await page.getByRole('button',{name:'Save draft',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#publisher-status')?.textContent === 'Draft saved.');
        if (process.env.QA_DIR) await page.screenshot({ path:path.join(process.env.QA_DIR,'publisher-mobile.png') });
        await enter({id:'artist-b',roles:['artist']});
        await open();
        await page.waitForFunction(() => !document.querySelector('#publisher-form'));
        assert.equal(await page.locator('[data-draft-id]').count(), 0);
        await enter({id:'admin',roles:['admin']});
        await open();
        await page.locator('[data-draft-id]').click();
        assert.match(await page.locator('#publisher-form').innerText(), /Owner account: Cha/);
        assert.equal(await page.getByRole('button',{name:'Delete draft',exact:true}).isDisabled(),true);
        page.removeAllListeners('dialog');
        page.on('dialog', dialog => dialog.dismiss());
        await page.getByRole('button',{name:'Unpublish',exact:true}).click();
        assert.ok(await page.evaluate(id=>AQCatalog.getRelease(id),id));
        page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
        await page.evaluate(id=>{setIEPage(`release:${id}`);AQPlayerCatalog.selectRelease(id);playTrackAtIndex(0,true);},id);
        await page.waitForFunction(()=>!player.paused);
        await page.getByRole('button',{name:'Unpublish',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#publisher-status')?.textContent.startsWith('Release unpublished'));
        await page.waitForFunction(id=>!AQCatalog.getRelease(id),id);
        assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentReleaseId()),'cha-dual-2026');
        assert.equal(await page.evaluate(()=>player.paused),true);
        assert.equal(await page.locator(`[data-player-release="${id}"]`).count(),0);
        assert.equal(await page.locator('.publisher-audio-name').count(),2);
        await page.getByRole('button',{name:'Publish',exact:true}).click();
        await page.waitForFunction(id=>!!AQCatalog.getRelease(id),id);
        await page.getByRole('button',{name:'Unpublish',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#publisher-status')?.textContent.startsWith('Release unpublished'));
        page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.dismiss());
        await page.getByRole('button',{name:'Delete draft',exact:true}).click();
        assert.equal(await page.locator('#publisher-form').count(),1);
        page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
        await page.getByRole('button',{name:'Delete draft',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#publisher-status')?.textContent.startsWith('Draft deleted'));
        assert.equal(await page.locator('[data-draft-id]').count(),0);
        await page.getByRole('button',{name:'Clean unused files',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#publisher-status')?.textContent.includes('2 file(s) removed'));
        assert.equal([...f.records.keys()].filter(key=>key.startsWith('audio/')).length,0);
        await enter(null);
        assert.equal(await page.locator('#publisher-form').count(), 0);
        assert.equal(await page.locator('#publisher-preview img').count(), 0);
        assert.deepEqual(errors, []);
        console.log('PASS: guest gate, artist draft create/save/reload/edit/cover/order, failure recovery, FR/EN, mobile, account isolation, admin view, audio import/decode/seek, publication/republish, Navigator, Player, persisted release, unpublish/republish/delete/cleanup and cancelled confirmations');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
