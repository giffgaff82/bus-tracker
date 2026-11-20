// Tracker: Now screen → track a bus → reminder → "did you catch it?". Usage: node tests/track.test.js [light|dark]
const { chromium } = require('playwright');
const { config, at, serve, out } = require('./helpers');
const scheme = process.argv[2] || 'light';
(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.grantPermissions(['notifications'], { origin: srv.url.replace(/\/$/, '') });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
  await p.clock.setFixedTime(at('07:50'));
  await p.addInitScript(c => { if (!localStorage.getItem('bw2-config')) localStorage.setItem('bw2-config', c); }, config());
  await p.goto(srv.url);
  const ready = () => p.waitForFunction(() => document.querySelector('.hero-stop') && !document.querySelector('.hero-stop').textContent.includes('Checking'), null, { timeout: 90000 });
  await ready(); await p.waitForTimeout(500);
  console.log('NOW:', (await p.textContent('#hero')).replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: out(`t1-now-${scheme}.png`) });
  await p.click('#hero .catch-row .btn');
  await p.waitForSelector('#view-track:not([hidden]) .route', { timeout: 30000 }); await p.waitForTimeout(800);
  console.log('TRACK:', (await p.textContent('#track-body')).replace(/\s+/g, ' ').slice(0, 300));
  await p.screenshot({ path: out(`t2-track-${scheme}.png`), fullPage: true });
  await p.click('.btn.remind'); await p.waitForTimeout(500);
  console.log('REMIND BTN:', await p.textContent('.btn.remind'), '| SW:', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  const T = await p.evaluate(() => JSON.parse(localStorage.getItem('bw2-track')));
  console.log('TRACKED:', T.line, T.stop, 'aimed', T.aimed, 'remind', T.remind);
  await p.screenshot({ path: out(`t3-remind-${scheme}.png`) });
  // back to Now: banner
  await p.click('#track-body .round'); await p.waitForTimeout(400);
  console.log('BANNER:', (await p.textContent('#caught')).replace(/\s+/g, ' '));
  // jump to 10 min before leaving -> reminder fires on open
  const leave = T.aimed - T.walk - 0.5; const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  await p.waitForTimeout(1500);
  await p.clock.setFixedTime(at(hm(leave - 9.5))); await p.reload(); await p.waitForTimeout(3000);
  console.log('TOAST at', hm(leave - 9.5), ':', await p.isVisible('#toast'), (await p.textContent('#toast')).replace(/\s+/g, ' '));
  const notes = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (await r.getNotifications()).map(n => n.title + ' | ' + n.body) : 'no reg'; });
  console.log('SYSTEM NOTIFICATIONS:', notes);
  await p.screenshot({ path: out(`t4-toast-${scheme}.png`) });
  // after the bus has left: did you catch it?
  await p.waitForTimeout(1500);
  await p.clock.setFixedTime(at(hm(T.aimed + 4))); await p.reload(); await p.waitForTimeout(3500);
  console.log('AFTER DEPARTURE BANNER:', (await p.textContent('#caught')).replace(/\s+/g, ' '));
  await p.screenshot({ path: out(`t5-didyou-${scheme}.png`) });
  await p.click('#caught .btn:not(.ghost)'); await p.waitForTimeout(600);
  console.log('CELEBRATE:', (await p.textContent('#celebrate')).replace(/\s+/g, ' ').slice(0, 80));
  await p.click('#celebrate .btn:not(.ghost)');
  console.log('RIDES:', await p.evaluate(() => JSON.parse(localStorage.getItem('bw2-rides')).map(r => r.line + '@' + r.expected)));
  // Plan ahead -> tap a card -> tomorrow's trip
  await p.click('#nav [data-view=plan]');
  await p.waitForFunction(() => !document.querySelector('#plan-hero').textContent.includes('Checking'), null, { timeout: 90000 });
  await p.click('#plan-list .card.tap >> nth=0');
  await p.waitForSelector('#view-track:not([hidden]) .route', { timeout: 30000 }); await p.waitForTimeout(500);
  console.log('PLAN->TRACK:', (await p.textContent('#track-body')).replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: out(`t6-plantrack-${scheme}.png`), fullPage: true });
  await b.close(); srv.close();
})();
