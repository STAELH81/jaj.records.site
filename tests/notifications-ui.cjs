const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
(async () => {
    const server = process.env.BASE_URL ? null : http.createServer((req, res) => {
        const file = path.join(__dirname, '..', decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
        fs.readFile(file, (error, data) => { res.statusCode = error ? 404 : 200; res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(file)] || 'application/octet-stream'); res.end(error ? '' : data); });
    }).listen(8765, '127.0.0.1');
    const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        let mails = [{ id:'m1', folder:'inbox', unread:true, subject:'Test <message>', from:'friend@aquerty.fr', body:'Hello' }];
        let messages = [{id:'chat1', senderId:'friend'}];
        await page.route('**/api/**', async route => {
            const url = new URL(route.request().url());
            let data = {};
            if (url.pathname === '/api/artist-drafts') data = {drafts:[]};
            if (url.pathname === '/api/aq-auth') data = { authenticated:false, user:null };
            if (url.pathname === '/api/aq-mail') {
                if (route.request().method() === 'POST') mails[0].unread = false;
                data = { messages:mails, address:'test@aquerty.fr' };
            }
            if (url.pathname === '/api/myspace') {
                const view = url.searchParams.get('view');
                if (view === 'chat_summary') data = { unreadCount:messages.length, bySender:messages.length ? {friend:1} : {}, notifications:messages };
                if (view === 'friend_requests') data = { requests:[{id:'f1', senderId:'friend', senderName:'Ami'}] };
                if (view === 'chat_contacts') data = {contacts:[{userId:'friend', displayName:'Ami'}]};
                if (view === 'messages') { messages = []; data = {messages:[]}; }
            }
            await route.fulfill({ json:data });
        });
        await page.route('**/data/aq-updates.json*', route => route.fulfill({json:{latestVersion:'99.0.0', notes:[]}}));
        await page.addInitScript(() => localStorage.setItem('aquerty_settings_v1', JSON.stringify({bootEnabled:false, systemPopups:false, crtEnabled:false})));
        await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8765');
        await page.locator('#aq-guest-btn').click();
        async function session(id) {
            await page.evaluate(id => { window.JAJSession = {id, type:'user', roles:['artist'], aquertyMail:'test@aquerty.fr'}; window.dispatchEvent(new CustomEvent('jaj:session-changed', {detail:window.JAJSession})); }, id);
        }
        await session('test-a');
        await page.waitForFunction(() => AQNotifications.getState().counts.mail === 1 && AQNotifications.getState().counts.myspace === 1 && AQNotifications.getState().counts.friends === 1);
        await page.evaluate(() => AQUpdate.check());
        await page.locator('#tray-notifications-btn').click();
        assert.equal(await page.locator('#aq-notifications').isVisible(), true);
        assert.equal(await page.locator('.aq-notification').count(), 4);
        if (process.env.SCREENSHOT_PATH) await page.screenshot({path:process.env.SCREENSHOT_PATH});
        await page.locator('.aq-notification-open').filter({hasText:'AQ Update'}).click();
        assert.equal(await page.locator('#win-updates').isVisible(), true);
        await page.locator('#tray-notifications-btn').click();
        await page.locator('.aq-notification-open').filter({hasText:'Demande d’ami'}).click();
        assert.equal(await page.locator('#win-mail').isVisible(), true);
        await page.locator('#tray-notifications-btn').click();
        await page.evaluate(() => AQMail.refresh());
        assert.equal(await page.locator('.aq-notification').count(), 4);
        await page.locator('.aq-notification-open').filter({hasText:'Test <message>'}).click();
        await page.waitForFunction(() => AQNotifications.getState().counts.mail === 0);
        assert.equal(await page.locator('#win-mail').isVisible(), true);
        await page.locator('#tray-notifications-btn').click();
        await page.locator('.aq-notification-open').filter({hasText:'Nouveau message privé'}).click();
        await page.waitForFunction(() => AQNotifications.getState().counts.myspace === 0);
        await page.locator('#tray-notifications-btn').click();
        await page.getByRole('button', {name:'Tout marquer comme lu'}).click();
        assert.equal(await page.locator('.aq-notification.unread').count(), 0);
        await page.evaluate(() => AQNotifications.push({id:'pub-test',source:'publisher',title:'Artist Publisher',body:'Sortie publiée'}));
        await page.locator('.aq-notification-open').filter({hasText:'Artist Publisher'}).click();
        assert.equal(await page.locator('#win-publisher').isVisible(), true);
        await session('test-b');
        assert.equal(await page.evaluate(() => AQNotifications.getState().entries.some(e => e.id === 'pub-test')), false);
        await session('test-a');
        assert.equal(await page.evaluate(() => AQNotifications.getState().entries.some(e => e.id === 'pub-test')), true);
        await page.locator('#tray-notifications-btn').click();
        await page.getByRole('button', {name:'Vider l’historique'}).click();
        await page.evaluate(() => AQMail.refresh());
        assert.equal(await page.locator('.aq-notification').count(), 0);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#aq-notifications').isVisible(), false);
        await page.setViewportSize({width:390,height:844});
        await page.locator('#mobile-notifications-btn').click();
        const box = await page.locator('#aq-notifications').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= 390);
        await page.reload();
        await page.locator('#aq-guest-btn').click();
        await session('test-a');
        await page.waitForFunction(() => AQNotifications.getState().counts.friends === 1);
        assert.equal(await page.evaluate(() => AQNotifications.getState().entries.length), 0);
        assert.deepEqual(errors, []);
        console.log('Notification UI passed: sources, routing, counts, deduplication, account isolation, clear, keyboard, mobile.');
    } finally { await browser.close(); server?.close(); }
})().catch(error => { console.error(error); process.exit(1); });
