// Android app reminders, with the Android bits faked in the browser. Usage: node tests/android-reminders.test.js
const { chromium } = require('playwright');
const { config, at, serve, out } = require('./helpers');
(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.clock.setFixedTime(at('07:25'));
  await p.addInitScript(c => {
    if (!localStorage.getItem('bw2-config')) localStorage.setItem('bw2-config', c);
    window.__log = [];
    const LN = {
      checkPermissions: async () => (window.__log.push('check'), { display: window.__perm || 'prompt' }),
      requestPermissions: async () => (window.__log.push('request'), { display: 'granted' }),
      schedule: async o => (window.__log.push('schedule ' + JSON.stringify(o.notifications.map(n => [n.id, n.title, n.body, new Date(n.schedule.at).toISOString()]))), {}),
      cancel: async o => (window.__log.push('cancel ' + o.notifications[0].id), {}),
    };
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: LN } };
  }, config());
  await p.goto(srv.url);
  await p.waitForFunction(() => document.querySelector('.hero-stop') && !document.querySelector('.hero-stop').textContent.includes('Checking'), null, { timeout: 90000 });
  await p.locator('#list li.card.tap').last().click();
  await p.waitForSelector('#view-track:not([hidden]) .route', { timeout: 30000 }); await p.waitForTimeout(800);
  console.log('before:', await p.textContent('.btn.remind'), '| notes:', await p.$$eval('#track-body .note', n => n.map(x => x.textContent)));
  await p.click('.btn.remind'); await p.waitForTimeout(600);
  console.log('after:', await p.textContent('.btn.remind'), '| notes:', await p.$$eval('#track-body .note', n => n.map(x => x.textContent)));
  console.log('LOG', await p.evaluate(() => window.__log));
  const T = await p.evaluate(() => JSON.parse(localStorage.getItem('bw2-track'))); console.log('T', T.line, T.stop, T.remind);
  await p.screenshot({ path: out('n1-remind.png') });
  await p.click('.btn.remind'); await p.waitForTimeout(300);
  console.log('off LOG', await p.evaluate(() => window.__log.slice(-2)), await p.textContent('.btn.remind'));
  await b.close(); srv.close();
})();
