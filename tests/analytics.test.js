// Usage stats: checks the consent question, what is sent to Google Analytics, and that
// nothing is sent after "No thanks". Pretends to be on iangifford.com and blocks the real
// Google script, so nothing reaches Google. Usage: node tests/analytics.test.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { config, at, out } = require('./helpers');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'web', 'dist', 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const run = async (choice) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await p.clock.setFixedTime(at('07:50'));
    await p.addInitScript(c => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      if (!localStorage.getItem('bw2-config')) localStorage.setItem('bw2-config', c);
    }, config());
    let gtagLoaded = 0;
    await p.route('https://iangifford.com/bus/**', r => r.fulfill({ contentType: 'text/html', body: HTML }));
    await p.route('https://www.googletagmanager.com/**', r => { gtagLoaded++; r.fulfill({ contentType: 'text/javascript', body: '' }); });
    await p.goto('https://iangifford.com/bus/');
    await p.waitForTimeout(1500);
    const card = await p.isVisible('#consent');
    await p.screenshot({ path: out(`analytics-card.png`) });
    if (choice) await p.click(choice === 'granted' ? '#consent-yes' : '#consent-no');
    await p.click('#nav [data-view=stats]'); await p.waitForTimeout(300);
    await p.click('#nav [data-view=settings]'); await p.waitForTimeout(300);
    const settingsShown = await p.isVisible('#stats-panel');
    await p.screenshot({ path: out(`analytics-settings-${choice || 'none'}.png`), fullPage: true });
    const dl = await p.evaluate(() => window.dataLayer.map(a => Array.from(a)));
    const html = JSON.stringify(dl);
    const leaks = ['bw2', 'atco', '"stop"', 'lat', 'lon', 'postcode'].filter(w => html.toLowerCase().includes(w.toLowerCase()));
    console.log(`\n== choice: ${choice || 'not answered'} | card shown: ${card} | gtag.js requested: ${gtagLoaded} | settings panel: ${settingsShown}`);
    for (const a of dl) console.log('  ', JSON.stringify(a).slice(0, 160));
    console.log('   personal words in data sent:', leaks.length ? leaks : 'none');
    console.log('   card after answering:', await p.isVisible('#consent'));
    await ctx.close();
  };
  await run(null); await run('granted'); await run('denied');
  // and on any other host (the preview site, tests): nothing at all
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await p.route('https://giffgaff82.github.io/**', r => r.fulfill({ contentType: 'text/html', body: HTML }));
  let hit = 0; await p.route('https://www.googletagmanager.com/**', r => { hit++; r.abort(); });
  await p.goto('https://giffgaff82.github.io/bus-tracker/'); await p.waitForTimeout(800);
  console.log(`\n== preview site: gtag.js requested ${hit}, dataLayer entries ${await p.evaluate(() => window.dataLayer.length)}`);
  await b.close();
})();
