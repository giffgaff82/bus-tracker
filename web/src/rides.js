// ---------- ride log ----------
// Rides are kept on this phone only. A ride is logged from the Now screen ("Caught it"), or from the
// "Did you catch…?" prompt that appears for 20 minutes after a recommended bus has left.
const RIDES = 'bw2-rides', RECENT = 'bw2-recent';
// localStorage can drop its last few writes if the app is closed straight away, so rides and the
// recent-bus memory are mirrored to IndexedDB (which confirms each write) and restored from it on start.
const durable = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const q = indexedDB.open('which-stop', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }));
  return {
    put: (k, v) => open().then(db => new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; })).catch(() => {}),
    get: k => open().then(db => new Promise(res => { const g = db.transaction('kv').objectStore('kv').get(k); g.onsuccess = () => res(g.result); g.onerror = () => res(undefined); })).catch(() => undefined)
  };
})();
function keep(lsKey, idbKey, list){ const at = Date.now(); store.set(lsKey, list); store.set(lsKey + '-at', at); durable.put(idbKey, { at, list }); }
const rides = { all: () => store.get(RIDES, []), save: list => keep(RIDES, 'rides', list) };
(async () => {
  let changed = false;
  for (const [k, name] of [[RIDES, 'rides'], [RECENT, 'recent']]) {
    const d = await durable.get(name);
    if (d && Array.isArray(d.list) && d.at > store.get(k + '-at', 0)) { store.set(k, d.list); store.set(k + '-at', d.at); changed = true; }
  }
  if (changed) refreshAll();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
})();
const rideKey = (date, atco, line, aimed) => `${date}|${atco}|${line}|${Math.round(aimed)}`;
const isLogged = key => rides.all().some(r => r.key === key);

// Remember what we recommended, so it can still be logged once you're on board.
function rememberPick(b, s, key){
  const now = londonNow(), j = cfg.journeys[key];
  const k = rideKey(now.date, b.stop.atco, b.line, b.aimed);
  let list = store.get(RECENT, []).filter(x => x.date === now.date && now.mins - x.expected < 40);
  let x = list.find(r => r.key === k);
  if (!x) { x = { key: k, date: now.date, dir: key, line: b.line, atco: b.stop.atco, aimed: b.aimed, target: key === 'out' ? toMins(j.arriveBy) : null }; list.push(x); }
  Object.assign(x, { stop: stopParts(b.stop, j).main, expected: b.expected, arrive: b.arrive, live: b.live, delay: Math.round(b.delay || 0), ran: x.ran || s.cls === 'run' });
  keep(RECENT, 'recent', list.slice(-8));
  return x;
}
function snapshot(b, s, key){ return rememberPick(b, s, key); }

function logRide(x){
  if (isLogged(x.key)) return null;
  const list = rides.all();
  const r = { key: x.key, ts: Date.now(), date: x.date, dir: x.dir, line: x.line, atco: x.atco, stop: x.stop,
    aimed: x.aimed, expected: x.expected, arrive: x.arrive, live: !!x.live, delay: x.delay || 0, ran: !!x.ran, target: x.target };
  list.push(r); rides.save(list);
  return r;
}
function undoRide(key){ rides.save(rides.all().filter(r => r.key !== key)); refreshAll(); }
function refreshAll(){ lastHTML.delete($('hero')); lastHTML.delete($('caught')); lastHTML.delete($('list')); if (view === 'now') renderNow(); if (view === 'stats') renderStats(); }

function checkIcon(){
  const t = document.createElement('template');
  t.innerHTML = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  return t.content.firstElementChild;
}
// ---------- celebration ----------
let celebrateTimer = null;
function caught(x){
  const r = logRide(x); if (!r) { refreshAll(); return; }
  const all = rides.all(), n = all.length, sameLine = all.filter(y => y.line === r.line).length;
  const ord = k => k + (['th', 'st', 'nd', 'rd'][(k % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][k % 100] || 'th');
  const lines = [];
  if (r.ran) lines.push('You ran for it, and made it.');
  if (r.dir === 'out' && r.target != null) lines.push(r.arrive <= r.target ? `On track for ${hhmm(r.arrive)}, ${Math.round(r.target - r.arrive)} min to spare.` : `Arriving about ${hhmm(r.arrive)}.`);
  else lines.push(`Home about ${hhmm(r.arrive)}.`);
  const ov = $('celebrate');
  ov.replaceChildren(
    el('div', { class: 'cel-art' }, svgNode(confettiSVG()), svgNode(busTickSVG({ size: 150 }))),
    el('div', { class: 'cel-title', text: 'Caught it!' }),
    el('p', { class: 'cel-sub', text: `Ride ${n} · your ${ord(sameLine)} on the ${r.line}` }),
    el('p', { class: 'muted cel-line', text: lines.join(' ') }),
    el('div', { class: 'actions', style: 'justify-content:center' },
      el('button', { class: 'btn', type: 'button', text: 'Nice', onclick: closeCelebrate }),
      el('button', { class: 'btn ghost', type: 'button', text: 'Undo', onclick: () => { closeCelebrate(); undoRide(r.key); } })));
  ov.hidden = false;
  if (reduceMotion) ov.querySelectorAll('svg').forEach(s => { if (s.pauseAnimations) { s.pauseAnimations(); s.setCurrentTime(5); } });  // final frame: bus with its tick
  if (navigator.vibrate) try { navigator.vibrate([18, 40, 18]); } catch {}
  clearTimeout(celebrateTimer); celebrateTimer = setTimeout(closeCelebrate, 4500);
  refreshAll();
}
function closeCelebrate(){ clearTimeout(celebrateTimer); const ov = $('celebrate'); ov.hidden = true; ov.replaceChildren(); }
$('celebrate').addEventListener('click', e => { if (e.target === e.currentTarget) closeCelebrate(); });
function svgNode(markup){ const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstElementChild; }

// ---------- stats ----------
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wdOf = date => (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const fmtDate = d => shortDate.format(new Date(d + 'T12:00:00Z'));
let clearArmed = false;

function bars(rows, total){ // [{label, badge?, n}]
  return el('ul', { class: 'bars' + (rows.some(r => r.label) ? ' stacked' : '') }, ...rows.map(r => el('li', {},
    r.badge ? el('span', { class: 'badge', text: r.badge }) : el('span', { class: 'bl', text: r.label }),
    el('span', { class: 'track' }, el('span', { class: 'fill', style: `width:${Math.max(4, Math.round(100 * r.n / total))}%` })),
    el('span', { class: 'bn', text: String(r.n) }))));
}
function renderStats(){
  const list = rides.all().slice().sort((a, b) => a.ts - b.ts);
  const root = $('stats-body'), n = list.length;
  if (!n) {
    swap(root, [el('section', { class: 'hero' },
      el('div', { class: 'stats-empty' }, svgNode(busTickSVG({ size: 110, still: true }))),
      el('div', { class: 'hero-stop', text: 'No rides yet' }),
      el('p', { class: 'muted', text: 'When you get on a bus, tap "Caught it" while tracking it. Your rides, favourite buses and stops will build up here.' }))]);
    
    return;
  }
  const today = londonNow().date, wk0 = addDays(today, -wdOf(today));
  const thisWeek = list.filter(r => r.date >= wk0);
  const out = list.filter(r => r.dir === 'out'), back = list.filter(r => r.dir === 'back');
  const count = (arr, f) => { const m = new Map(); for (const r of arr) m.set(f(r), (m.get(f(r)) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const lines = count(list, r => r.line).slice(0, 5), stops = count(list, r => r.stop).slice(0, 4);
  const ran = list.filter(r => r.ran).length;
  const timed = out.filter(r => r.target != null), onTime = timed.filter(r => r.arrive <= r.target).length;
  const days = count(list, r => wdOf(r.date));
  const tied = days.length > 1 && days[1][1] === days[0][1];
  const favDay = !days.length ? '–' : tied ? 'Even' : WD[days[0][0]];
  const perDay = WD.map((d, i) => thisWeek.filter(r => wdOf(r.date) === i).length), maxDay = Math.max(1, ...perDay);

  const tile = (big, label, sub) => el('div', { class: 'tile' }, el('span', { class: 'tb', text: big }), el('span', { class: 'tl', text: label }), sub ? el('span', { class: 'ts', text: sub }) : null);
  const recent = list.slice(-8).reverse();
  swap(root, [
    el('section', { class: 'hero' },
      el('div', { class: 'hero-row' }, el('span', { class: 'hero-num', text: String(n) }),
        el('div', { class: 'hero-side' }, el('span', { text: n === 1 ? 'ride' : 'rides' }), el('span', { class: 'muted', text: `since ${fmtDate(list[0].date)}` })))),
    el('div', { class: 'panel' },
      el('h3', { text: 'To and from' }),
      el('div', { class: 'split' },
        el('span', { class: 'sa', style: `flex:${out.length || 0.0001}` }), el('span', { class: 'sb', style: `flex:${back.length || 0.0001}` })),
      el('div', { class: 'split-l' },
        el('span', {}, el('b', { text: String(out.length) }), ` to ${destName().toLowerCase()}`),
        el('span', {}, el('b', { text: String(back.length) }), ' home'))),
    el('div', { class: 'tiles' },
      tile(String(thisWeek.length), 'this week'),
      tile(timed.length ? `${Math.round(100 * onTime / timed.length)}%` : '–', `on time to ${destName().toLowerCase()}`, timed.length ? `${onTime} of ${timed.length}` : 'no rides yet'),
      tile(String(ran), 'ran for it', ran ? 'and made it' : 'all calm so far'),
      tile(favDay, 'busiest day', tied ? 'no clear favourite yet' : `${days[0][1]} rides`)),
    el('div', { class: 'panel' }, el('h3', { text: 'This week' }),
      el('div', { class: 'week' }, ...WD.map((d, i) => el('div', { class: 'wd' + (i === wdOf(today) ? ' today' : '') },
        el('span', { class: 'wb' }, el('span', { class: 'wf', style: `height:${perDay[i] ? Math.max(12, Math.round(100 * perDay[i] / maxDay)) : 0}%` })),
        el('span', { class: 'wn', text: perDay[i] ? String(perDay[i]) : '' }), el('span', { class: 'wl', text: d[0] }))))),
    el('div', { class: 'panel' }, el('h3', { text: 'Most caught' }), bars(lines.map(([l, k]) => ({ badge: l, n: k })), lines[0][1])),
    el('div', { class: 'panel' }, el('h3', { text: 'Your stops' }), bars(stops.map(([l, k]) => ({ label: l, n: k })), stops[0][1])),
    el('div', { class: 'section-h' }, el('span', { text: 'Recent rides' })),
    el('ul', { class: 'list' }, ...recent.map(r => el('li', { class: 'card ride' },
      el('span', { class: 'eyebrow', text: `${fmtDate(r.date)} · ${r.dir === 'out' ? 'to ' + destName().toLowerCase() : 'home'}${r.ran ? ' · ran' : ''}` }),
      el('span', { class: 'name' }, el('span', { class: 'badge', text: r.line }), el('span', { text: r.stop })),
      el('span', { class: 'time' }, hhmm(r.expected), el('button', { class: 'linkbtn', type: 'button', text: 'Remove', 'aria-label': `Remove the ${r.line} on ${fmtDate(r.date)}`, onclick: () => undoRide(r.key) }))))),
    el('div', { class: 'actions', style: 'margin-top:6px' }, el('button', { class: 'btn ghost', type: 'button', id: 'clear-rides', text: clearArmed ? 'Tap again to delete all rides' : 'Clear all rides',
      onclick: () => { if (!clearArmed) { clearArmed = true; lastHTML.delete($('stats-body')); renderStats(); setTimeout(() => { clearArmed = false; if (view === 'stats') { lastHTML.delete($('stats-body')); renderStats(); } }, 4000); } else { clearArmed = false; rides.save([]); refreshAll(); } } })),
    el('p', { class: 'note', text: 'Your rides are stored on this phone only.' })
  ]);
}
