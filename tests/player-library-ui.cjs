const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
    const { fixture } = await import('./publisher-fixture.mjs');
    const { createPlayerLibraryHandler } = await import('../netlify/functions/_shared/player-library.mjs');
    const f = fixture(), handler = createPlayerLibraryHandler(f.deps);
    f.identity.user = null;
    const server = process.env.BASE_URL ? null : require('./static-server.cjs').start();
    const browser = await chromium.launch({headless:true, channel:process.env.BROWSER_CHANNEL || 'msedge'});
    try {
        const page = await browser.newPage({viewport:{width:1280,height:900}});
        const errors=[]; page.on('pageerror',error=>errors.push(error.message));
        page.on('dialog',dialog=>dialog.accept());
        let failSave=false, publicPosts=0, withdraw=false;
        await page.route('**/api/**', async route => {
            const request=route.request(), url=new URL(request.url());
            let data={};
            if (url.pathname === '/api/player-library') {
                if (failSave && request.method()==='PUT') return route.fulfill({status:503,json:{error:'service_unavailable'}});
                const response=await handler(new Request('https://site.test'+url.pathname+url.search,{method:request.method(),headers:{origin:'https://site.test','content-type':'application/json'},...(request.postData()?{body:request.postData()}: {})}),{});
                return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
            }
            if (url.pathname==='/api/aq-auth') data={authenticated:false,user:null};
            if (url.pathname==='/api/aq-mail') data={messages:[]};
            if (url.pathname==='/api/artist-drafts') data={drafts:[]};
            if (url.pathname==='/api/myspace' && request.method()==='POST' && request.postDataJSON()?.action==='create_post') publicPosts++;
            if (url.pathname==='/api/catalog') data={artists:[{id:'tester',name:'Test Artist'}],releases:withdraw?[]:[{id:'test-album',artistId:'tester',title:'Other album',type:'ep',year:2026,tracks:[{id:'test-song',number:1,title:'Cross album song',availability:'full',audio:'medias/musique/sorti/03.mp3'}]}]};
            await route.fulfill({json:data});
        });
        await page.addInitScript(()=>localStorage.setItem('aquerty_settings_v1',JSON.stringify({bootEnabled:false,systemPopups:false,crtEnabled:false})));
        await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765');
        await page.locator('#aq-guest-btn').click();
        const view=page.locator('#aqmp-playlists-view');
        async function open() { await page.evaluate(()=>{openWindow('win-player','task-player');AQPlayerCatalog.showPlaylists();}); }
        async function enter(id) {
            f.identity.user=id?{id,roles:[],user_metadata:{display_name:id}}:null;
            await page.evaluate(id=>{window.JAJSession=id?{id,type:'user',roles:[],aquertyMail:id+'@aquerty.fr'}:{type:'guest'};window.dispatchEvent(new CustomEvent('jaj:session-changed',{detail:window.JAJSession}));},id);
            if(id) await page.waitForFunction(()=>AQPlayerLibrary.getState().loaded && !AQPlayerLibrary.getState().busy);
        }
        async function saved() { await page.waitForFunction(()=>!AQPlayerLibrary.getState().busy); }
        await open();
        assert.equal(await view.getByRole('button',{name:'+ Créer',exact:true}).isDisabled(),true);
        await enter('alice'); await open();
        await view.getByRole('textbox',{name:'Nom de la playlist',exact:true}).fill('Night <mix>');
        await view.getByRole('button',{name:'+ Créer',exact:true}).click(); await saved();
        await page.waitForFunction(()=>AQPlayerLibrary.getState().selected!=='favorites');
        const id=await page.evaluate(()=>AQPlayerLibrary.getState().selected);
        assert.equal(await view.locator('h2').innerText(),'Night <mix>');
        assert.match(await view.locator('.aqpl-meta').innerText(),/Privé/);
        await view.locator('.aqpl-result').filter({hasText:'Feelings Of Nostalgia'}).getByRole('button',{name:'+',exact:true}).click(); await saved();
        await view.locator('.aqpl-result').filter({hasText:'Cross album song'}).getByRole('button',{name:'+',exact:true}).click(); await saved();
        assert.equal(await view.locator('.aqpl-tracks li').count(),2);
        await view.locator('.aqpl-tracks li').nth(1).getByRole('button',{name:'↑',exact:true}).click(); await saved();
        assert.match(await view.locator('.aqpl-tracks li').first().innerText(),/Cross album song/);
        await view.locator('.aqpl-tracks li').first().getByRole('button',{name:/Favori/}).click(); await saved();
        assert.equal(await page.evaluate(()=>AQPlayerLibrary.getState().library.favorites.length),1);
        await view.getByRole('button',{name:'▶ Écouter',exact:true}).click();
        assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentTrack().releaseId),'test-album');
        await page.evaluate(()=>nextTrack());
        assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentTrack().releaseId),'cha-dual-2026');
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aquerty_player_state_v1')||'{}').currentTrackIndex),-1);
        await open();
        await view.getByRole('button',{name:'Rendre partageable',exact:true}).click(); await saved();
        const link=await view.getByRole('textbox',{name:'Lien de partage'}).inputValue();
        assert.equal(new URL(link).searchParams.get('aqPlaylist'),'alice/'+id);
        await view.getByRole('button',{name:'Partager sur MySpace'}).click();
        await page.waitForFunction(()=>document.querySelector('.myspace-compose textarea')?.value.includes('aqPlaylist='));
        assert.equal(publicPosts,0,'Sharing prepares a draft; it never posts without a user click');
        await open();
        await view.getByRole('textbox',{name:'Renommer la playlist'}).fill('Renamed mix');
        failSave=true; await view.getByRole('button',{name:'Renommer',exact:true}).click(); await saved();
        assert.equal(await view.locator('h2').innerText(),'Night <mix>');
        assert.match(await view.locator('[role=status]').innerText(),/indisponible/);
        failSave=false;
        await view.getByRole('textbox',{name:'Renommer la playlist'}).fill('Renamed mix');
        await view.getByRole('button',{name:'Renommer',exact:true}).click(); await saved();
        await page.reload(); await page.locator('#aq-guest-btn').click(); await enter('alice'); await open();
        await view.locator('.aqpl-nav').getByRole('button',{name:'Renamed mix',exact:true}).click();
        assert.equal(await view.locator('.aqpl-tracks li').count(),2);
        if(process.env.SCREENSHOT_PATH) { await view.evaluate(node=>{node.scrollTop=0;}); await page.screenshot({path:process.env.SCREENSHOT_PATH}); }
        await enter('bob'); await open();
        assert.equal(await page.evaluate(()=>AQPlayerLibrary.getState().library.playlists.length),0);
        await page.evaluate(value=>AQPlayerLibrary.openShared(value),'alice/'+id);
        await view.getByRole('button',{name:'Copier dans mes playlists'}).click(); await saved();
        assert.equal(await page.evaluate(()=>AQPlayerLibrary.getState().library.playlists[0].visibility),'private');
        await enter(null);
        await page.goto(link); await page.locator('#aq-guest-btn').click();
        await page.waitForFunction(()=>AQPlayerLibrary.getState().shared);
        assert.equal(await view.getByRole('button',{name:'Copier dans mes playlists'}).isDisabled(),true);
        await view.getByRole('button',{name:'▶ Écouter',exact:true}).click();
        withdraw=true; await page.evaluate(()=>AQCatalog.refresh());
        assert.equal(await page.evaluate(()=>AQPlayerCatalog.isCustomQueue()),false);
        await enter('alice'); await open();
        await view.locator('.aqpl-nav').getByRole('button',{name:'Renamed mix',exact:true}).click();
        assert.match(await view.locator('.aqpl-tracks li').first().innerText(),/indisponible/i);
        await view.getByRole('button',{name:'Rendre privée'}).click(); await saved();
        await enter('bob'); await page.evaluate(value=>AQPlayerLibrary.openShared(value),'alice/'+id);
        assert.match(await view.locator('[role=status]').innerText(),/privée/);
        await page.evaluate(()=>updateSetting('desktopLanguage','en'));
        await open(); assert.match(await view.innerText(),/Playlists|My favorites/);
        await page.setViewportSize({width:390,height:844});
        assert.ok(await view.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
        await view.locator('.aqpl-nav').getByRole('button',{name:'Renamed mix',exact:true}).click();
        await view.locator('.aqpl-tracks li').first().getByRole('button',{name:'Remove',exact:true}).click(); await saved();
        assert.equal(await view.locator('.aqpl-tracks li').count(),1);
        await view.getByRole('button',{name:'Delete',exact:true}).click(); await saved();
        assert.equal(await page.evaluate(()=>AQPlayerLibrary.getState().library.playlists.length),0);
        assert.deepEqual(errors,[]);
        console.log('PASS: playlists CRUD, cloud reload, favorites, mixed queue, private/public/copy/revoke, MySpace draft, failure recovery, isolation, withdrawn tracks, EN and mobile.');
    } finally {await browser.close();server?.close();}
})().catch(error=>{console.error(error);process.exit(1)});
