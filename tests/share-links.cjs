const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/aq-auth',r=>r.fulfill({json:{authenticated:false,user:null}}));await page.route('**/api/catalog',r=>r.fulfill({json:{artists:[],releases:[]}}));
 await page.addInitScript(()=>{localStorage.setItem('aquerty_settings_v1',JSON.stringify({bootEnabled:false,systemPopups:false,crtEnabled:false}));});
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
 for(const [kind,id] of [['artist','cha'],['release','cha-dual-2026']]){
  await page.goto(`${base}?${kind}=${id}`);await page.locator('#aq-guest-btn').click();
  await page.waitForFunction(key=>currentIEPage===key,`${kind}:${id}`);
  assert.equal(await page.evaluate(()=>player.paused),true);
  await page.locator(`[data-share-kind="${kind}"]`).click();
  assert.equal(await page.locator('#aq-share-dialog input').inputValue(),`${base}?${kind}=${id}`);
  await page.locator('#aq-share-dialog [data-copy]').click();
  await page.waitForFunction(()=>document.querySelector('#aq-share-dialog [role=status]').textContent.length>0);
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),`${base}?${kind}=${id}`);
  await page.locator('#aq-share-dialog form button').click();
 }
 await page.locator('[data-player-release]').click();await page.locator('#aq-player-share').click();
 assert.equal(await page.locator('#aq-share-dialog input').inputValue(),`${base}?release=cha-dual-2026`);
 await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:async()=>{throw new Error('denied');}}));
 await page.locator('#aq-share-dialog [data-copy]').click();
 await page.waitForFunction(()=>document.querySelector('#aq-share-dialog [role=status]').textContent.includes('Ctrl+C'));
 assert.equal(await page.locator('#aq-share-dialog input').evaluate(el=>el.selectionEnd-el.selectionStart),`${base}?release=cha-dual-2026`.length);
 await page.locator('#aq-share-dialog form button').click();
 await page.evaluate(()=>updateSetting('desktopLanguage','en'));
 assert.equal(await page.locator('#aq-player-share').innerText(),'Share');
 await page.setViewportSize({width:390,height:844});await page.goto(`${base}?release=cha-dual-2026`);await page.locator('#aq-guest-btn').click();
 await page.waitForFunction(()=>currentIEPage==='release:cha-dual-2026');await page.locator('[data-player-release]').click();
 assert.equal(await page.evaluate(()=>AQPlayerCatalog.getCurrentReleaseId()),'cha-dual-2026');
 await page.goto(`${base}?release=missing`);await page.locator('#aq-guest-btn').click();await page.locator('#aq-share-dialog').waitFor();
 assert.match(await page.locator('#aq-share-dialog p').innerText(),/introuvable|unavailable/);
 await page.goto(`${base}?release=cha-dual-2026&artist=cha`);await page.locator('#aq-guest-btn').click();await page.locator('#aq-share-dialog').waitFor();
 assert.equal(await page.locator('#aq-share-dialog input').isVisible(),false);assert.deepEqual(errors,[]);
 await page.goto(`${base}?release=cha-dual-2026&release=missing`);await page.locator('#aq-guest-btn').click();await page.locator('#aq-share-dialog').waitFor();
 assert.equal(await page.locator('#aq-share-dialog input').isVisible(),false);
 console.log('PASS: artist/release deep links, guest session, copyable URL, Player sharing, FR/EN, mobile, invalid/ambiguous URLs, no autoplay');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
