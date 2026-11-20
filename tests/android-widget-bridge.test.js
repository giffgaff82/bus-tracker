// What the web app hands the Android widget, with the Android bits faked. Usage: node tests/android-widget-bridge.test.js
const { chromium } = require('playwright');
const { config, at, serve, out } = require('./helpers');
(async () => {
  const srv = await serve();
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.clock.setFixedTime(at('07:25'));
  await p.addInitScript(c => {
    if (!localStorage.getItem('bw2-config')) localStorage.setItem('bw2-config', c);
    window.__w = [];
    const rec = m => async d => { window.__w.push([m, JSON.parse(JSON.stringify(d))]); return {}; };
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      LocalNotifications: { checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }), schedule: async () => ({}), cancel: async () => ({}) },
      WidgetBridge: { setConfig: rec('setConfig'), setTracked: rec('setTracked'), setLive: rec('setLive'), consumeLaunch: async () => ({ view: 'track' }) } } };
  }, config());
  await p.goto(srv.url);
  await p.waitForFunction(() => document.querySelector('.hero-stop') && !document.querySelector('.hero-stop').textContent.includes('Checking'), null, { timeout: 90000 });
  await p.locator('#list li.card.tap').last().click();
  await p.waitForSelector('#view-track:not([hidden]) .route', { timeout: 30000 }); await p.waitForTimeout(1500);
  const w = await p.evaluate(() => window.__w);
  for (const [m, d] of w) console.log(m, JSON.stringify(d).slice(0, 200)); 
  // simulate widget tap event to Now
  await p.evaluate(() => window.dispatchEvent(Object.assign(new Event('whichstopWidget'), { view: 'now' })));
  await p.waitForTimeout(300); console.log('view after event:', await p.evaluate(() => [...document.querySelectorAll('section[id^=view-]')].filter(s => !s.hidden).map(s => s.id)));
  await b.close(); srv.close();
})();
