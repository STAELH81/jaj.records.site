const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});try{
const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('ERROR',e.stack)});
await page.route('**/js/catalog.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('js/catalog.js','utf8').replace('const validation = validateCatalog();',`catalog.artists.push({id:'test-artist',name:'Test <Artist>'}); catalog.releases.push({id:'test-release',slug:'test-release',artistId:'test-artist',title:'Test <Release>',type:'ep',year:2026,tracks:[{id:'test-track',number:1,title:'Test track',availability:'full',audio:'medias/musique/sorti/01.mp3'}]}); const validation = validateCatalog();`)}));
await page.addInitScript(()=>{if(!localStorage.getItem('aquerty_settings_v1'))localStorage.setItem('aquerty_settings_v1',JSON.stringify({bootEnabled:false,systemPopups:false}));});
await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765');await page.waitForFunction(()=>window.AQVisualizer&&window.AQPlayerCatalog&&document.getElementById('player-skin-select')?.options.length===6);
await page.locator('#aq-guest-btn').click(); await page.evaluate(()=>{openWindow('win-ie','task-ie');setIEPage('info');});
assert.match(await page.locator('#ie-content-box').innerText(),/Test <Artist>/);
await page.locator('[data-catalog-page="release:test-release"]').click();await page.getByRole('button',{name:'Ouvrir dans AQ-Player',exact:true}).click();
assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentReleaseId()),'test-release');
await page.locator('[data-view="skin"]').click();await page.locator('#player-skin-select').selectOption('violet');
await page.locator('[data-view="visual"]').click();await page.locator('#aqmp-visual-preset').selectOption('3');
await page.locator('#aqmp-visual-auto').uncheck();
await page.evaluate(()=>{playTrackAtIndex(0,false);savePlayerState();updateSetting('desktopLanguage','en');});
await page.waitForTimeout(300);
assert.match(await page.locator('#ie-content-box').innerText(),/Open in AQ-Player/);
assert.equal(await page.locator('#aqmp-visual-preset option').count(),8);
assert.equal(await page.locator('#player-night-mode').count(),0);
await page.reload();await page.waitForFunction(()=>window.AQVisualizer&&document.getElementById('win-player')?.dataset.aqPlayerTheme==='violet');
await page.locator('#aq-guest-btn').click(); await page.waitForTimeout(300);
assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentReleaseId()),'test-release');
assert.equal(await page.evaluate(()=>AQVisualizer.getPreferences().preset),3);
assert.equal(await page.evaluate(()=>AQVisualizer.getPreferences().auto),false);
assert.equal(await page.evaluate(()=>myTracks[currentTrackIndex]?.id),'test-track');
assert.match(await page.locator('#ie-content-box').innerText(),/Test <Release>/);
await page.evaluate(()=>{openWindow('win-player','task-player');AQPlayerCatalog.showVisualizations();});await page.waitForTimeout(300);
await page.setViewportSize({width:390,height:844}); await page.evaluate(()=>updateSetting('clientMode','auto')); await page.evaluate(()=>{openWindow('win-ie','task-ie');setIEPage('release:test-release');});await page.waitForTimeout(300);

await page.getByRole('button',{name:'Open in AQ-Player',exact:true}).click();assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentReleaseId()),'test-release'); assert.ok(await page.evaluate(()=>document.getElementById('win-player').getBoundingClientRect().right <= innerWidth+1));
await page.locator('[data-view="visual"]').click(); 
await page.locator('[data-view="skin"]').click(); await page.locator('#player-skin-select').selectOption('lime');
await page.evaluate(()=>{openWindow('win-ie','task-ie');setIEPage('dual');});  assert.ok(await page.evaluate(()=>document.getElementById('win-ie').getBoundingClientRect().right <= innerWidth+1));
assert.ok(await page.locator('#ie-content-box').evaluate(el=>el.getBoundingClientRect().height>300));assert.deepEqual(errors,[]);console.log('PASS: dynamic artist/release, FR/EN, navigation, theme/preset/release/track restore, mobile action, no runtime errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});


