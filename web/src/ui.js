// =====================================================================
// v2 UI
// =====================================================================
const PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
let here = null; // {lon, lat, pc, district} from "Use my location"

function status(id, text, bad){ const s = $(id); s.textContent = text || ''; s.classList.toggle('bad', !!bad); }

// One box: "24 Street Name, AB1 2CD", "EF3 4GH", or "Street Name, Town"
async function place(text){
  text = String(text || '').trim();
  if (!text) throw new Error('Fill in both places.');
  const m = text.match(PC_RE);
  if (m) {
    const line = text.replace(m[0], '').replace(/^[\s,]+|[\s,]+$/g, '');
    const p = await geocode(line, `${m[1]} ${m[2]}`);
    p.line = line;
    return p;
  }
  let r = null;
  try { r = await nominatim({ q: text }); } catch {}
  if (!r) throw new Error(`We couldn't find "${text}". Try adding the postcode.`);
  let pc = '', district = '';
  try {
    const j = await getJSON(`https://api.postcodes.io/postcodes?lon=${r.lon}&lat=${r.lat}&radius=1000&limit=1`);
    if (j.result && j.result[0]) { pc = j.result[0].postcode; district = j.result[0].admin_district || ''; }
  } catch {}
  return { pc, lon: r.lon, lat: r.lat, label: text, exact: true, district, line: text, free: true };
}

$('locate').addEventListener('click', e => {
  const btn = e.currentTarget;
  if (!navigator.geolocation) { status('s1-status', 'This browser can\'t share your location. Type your postcode instead.', true); return; }
  btn.disabled = true; btn.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(async pos => {
    const lon = pos.coords.longitude, lat = pos.coords.latitude;
    let pc = '', district = '';
    try { const j = await getJSON(`https://api.postcodes.io/postcodes?lon=${lon}&lat=${lat}&radius=500&limit=1`); if (j.result && j.result[0]) { pc = j.result[0].postcode; district = j.result[0].admin_district || ''; } } catch {}
    here = { lon, lat, pc, district };
    $('home').value = pc ? `My location (${pc})` : 'My location';
    btn.disabled = false; btn.textContent = 'Use my location';
  }, () => {
    btn.disabled = false; btn.textContent = 'Use my location';
    status('s1-status', 'Location wasn\'t shared. Type your postcode instead.', true);
  }, { enableHighAccuracy: true, timeout: 15000 });
});
$('home').addEventListener('input', () => { here = null; });

// ---------- views ----------
let view = null;
function show(v){
  view = v;
  for (const k of ['now', 'stops', 'plan', 'stats', 'settings', 'setup', 'track']) $('view-' + k).hidden = k !== v;
  $('nav').hidden = v === 'setup' || v === 'track';
  document.querySelectorAll('#nav button').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  if (v === 'settings') buildSettings();
  if (v === 'plan') { if (!plan.key) planDefaults(); planControls(); runPlan(); }
  else if (v === 'stats') { renderStats(); }
  else if (v === 'track') { lastHTML.delete($('track-body')); renderTrack(); loadTrack(); }
  else if (v !== 'setup') { render(); refresh(); }
}
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
function step(s){ document.querySelectorAll('.step').forEach(x => x.hidden = x.dataset.step != s); window.scrollTo(0, 0); }

// ---------- setup ----------
async function findBuses(){
  const say = t => {
    status('busy-status', t);
    const m = String(t).match(/(\d+) of (\d+)/);
    $('busy-n').textContent = m ? `${Math.round(100 * m[1] / m[2])}%` : '…';
  };
  status('s1-status', 'Finding your places…');
  let home;
  if (here && $('home').value.startsWith('My location')) home = { pc: here.pc, lon: here.lon, lat: here.lat, label: 'your location', exact: true, district: here.district, line: '', gps: true };
  else home = await place($('home').value);
  const work = await place($('dest').value);
  home.input = $('home').value.trim(); work.input = $('dest').value.trim();
  work.name = $('dest-name').value.trim() || 'Work';
  if (dist([home.lon, home.lat], [work.lon, work.lat]) < 500) throw new Error('Those two places are a short walk apart. Check them and try again.');
  status('s1-status', '');
  const arriveBy = $('arrive').value || '09:00';
  const wantBack = $('want-back').checked, leaveAt = $('leave').value || '17:00';
  const w = work.name.toLowerCase();
  step('busy');
  try {
    approxWalks = false;
    const out = await analyse({ from: home, to: work, fromWord: 'home', toWord: w, time: toMins(arriveBy), mode: 'arrive', say });
    out.arriveBy = arriveBy;
    let back = null;
    if (wantBack) {
      back = await analyse({ from: work, to: home, fromWord: w, toWord: 'home', time: toMins(leaveAt), mode: 'leave', say: t => say(`Journey home: ${t.charAt(0).toLowerCase()}${t.slice(1)}`) });
      back.leaveAt = leaveAt;
    }
    found = { home, work, journeys: { out, back }, approx: approxWalks };
  } catch (e) { step(1); throw e; }
  renderOptions();
  step(2);
}

function optionList(jKey, title, options){
  const prevJ = cfg && cfg.journeys && cfg.journeys[jKey];
  const prev = new Set(prevJ ? prevJ.stops.flatMap(s => s.services.map(v => `${s.atco}|${v.id}`)) : []);
  const fastest = options[0].best.total;
  const best = el('ul', { class: 'pick' }), more = el('ul', { class: 'pick', style: 'margin-top:10px' });
  let nBest = 0; const shown = new Set();
  for (const o of options) {
    const good = o.best.total <= fastest + 8 && nBest < 6 && !shown.has(o.svc.id);
    if (good) shown.add(o.svc.id);
    const checked = prev.size ? prev.has(o.key) : good;
    const freq = o.perDay >= 40 ? 'frequent' : `about ${o.perDay} a day`;
    const li = el('li', {}, el('label', {},
      el('input', { type: 'checkbox', value: o.key, 'data-j': jKey, checked }),
      el('div', {},
        el('div', { class: 't' }, el('span', { class: 'badge', text: o.svc.line_name }), el('span', { text: o.stop.name })),
        el('div', { class: 'm', text: `${fmtMin(o.stop.walk)} walk${o.stop.indicator ? ' · ' + o.stop.indicator : ''} · ${freq}` }),
        el('div', { class: 'm', text: `Off at ${o.best.off}, ${fmtMin(o.best.walk)} walk` })),
      el('div', { class: 'big' }, `${Math.round(o.best.total)}`, el('small', { text: 'min total' }))));
    if (good) { best.append(li); nBest++; } else more.append(li);
  }
  const sec = el('section', { class: 'wrap' }, el('h2', { class: 'jtitle', text: title }), best);
  if (more.children.length) sec.append(el('details', {}, el('summary', { text: `${more.children.length} more, slower or further to walk` }), more));
  return sec;
}
function renderOptions(){
  const { home, work, journeys } = found;
  const nm = (p, fallback) => p.gps ? 'your location' : p.exact ? (p.input || p.label) : `the middle of ${p.pc}`;
  $('places').textContent = `From ${nm(home)} to ${nm(work)}.`;
  $('s2-approx').hidden = !found.approx;
  const box = $('opt-sections'); box.textContent = '';
  box.append(optionList('out', `To ${work.name.toLowerCase()} · by ${journeys.out.arriveBy}`, journeys.out.options));
  if (journeys.back) box.append(optionList('back', `Home · from ${journeys.back.leaveAt}`, journeys.back.options));
}
async function guarded(btn, id, fn){
  btn.disabled = true;
  try { await fn(); } catch (e) { status(id, e.message || String(e), true); } finally { btn.disabled = false; }
}
$('s1-next').addEventListener('click', e => guarded(e.currentTarget, 's1-status', findBuses));
$('want-back').addEventListener('change', () => $('leave-field').hidden = !$('want-back').checked);
$('back1').addEventListener('click', () => step(1));

function buildJourney(jKey, j){
  const keys = new Set([...document.querySelectorAll(`#opt-sections input[data-j="${jKey}"]:checked`)].map(i => i.value));
  const stops = new Map();
  for (const o of j.options) {
    if (!keys.has(o.key)) continue;
    const s = stops.get(o.stop.atco) || { atco: o.stop.atco, name: o.stop.name, indicator: o.stop.indicator, lon: o.stop.lon, lat: o.stop.lat, walk: o.stop.walk, services: [] };
    s.services.push({ id: o.svc.id, line: o.svc.line_name, heads: o.heads });
    stops.set(o.stop.atco, s);
  }
  return { stops: [...stops.values()].sort((a, b) => a.walk - b.walk), alight: j.alight };
}
$('save').addEventListener('click', () => {
  const out = buildJourney('out', found.journeys.out);
  if (!out.stops.length) { status('s2-status', `Tick at least one bus to ${found.work.name.toLowerCase()}.`, true); return; }
  out.arriveBy = found.journeys.out.arriveBy;
  let back = null;
  if (found.journeys.back) {
    back = buildJourney('back', found.journeys.back);
    if (!back.stops.length) { status('s2-status', 'Tick at least one bus home, or go back and untick "And back home".', true); return; }
    back.leaveAt = found.journeys.back.leaveAt;
  }
  const strip = p => ({ pc: p.pc, lon: p.lon, lat: p.lat, label: p.label, exact: p.exact, district: p.district, line: p.line, input: p.input, name: p.name });
  cfg = { v: 3, home: strip(found.home), work: strip(found.work), run: (cfg && cfg.run) || 0.5, journeys: { out, back } };
  store.set(KEY, cfg);
  manualJourney = null; shownKey = null; buses = []; lastOk = null;
  show('now');
});

// ---------- setup codes & sharing ----------
const encode = c => 'WS3.' + btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decode(code){
  const s = String(code || '').trim().replace(/^.*#setup=/, '').replace(/^WS\d\./, '').replace(/-/g, '+').replace(/_/g, '/');
  const c = migrate(JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(s))))));
  if (!c) throw new Error('bad');
  return c;
}
const shareLink = () => `${location.origin === 'null' || location.protocol === 'file:' ? location.href.split('#')[0] : location.origin + location.pathname}#setup=${encode(cfg)}`;
$('use-code').addEventListener('click', () => {
  try { cfg = decode($('code-in').value); store.set(KEY, cfg); status('code-status', ''); show('now'); }
  catch { status('code-status', 'That doesn\'t look like a setup code. Copy the whole thing and try again.', true); }
});
$('copy-code').addEventListener('click', async e => {
  const b = e.currentTarget, code = encode(cfg), out = $('code-out');
  out.value = code; out.hidden = false;
  try { await navigator.clipboard.writeText(code); b.textContent = 'Copied'; } catch { out.focus(); out.select(); b.textContent = 'Selected below'; }
  setTimeout(() => b.textContent = 'Copy code', 2500);
});
$('share').addEventListener('click', async e => {
  const url = shareLink(), b = e.currentTarget;
  if (navigator.share) { try { await navigator.share({ title: 'Which stop?', text: 'My bus setup', url }); return; } catch (err) { if (err && err.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); b.textContent = 'Link copied'; } catch { $('code-out').value = url; $('code-out').hidden = false; }
  setTimeout(() => b.textContent = 'Share my setup', 2500);
});
$('redo').addEventListener('click', () => {
  here = null;
  const val = p => p.input || [p.line, p.pc].filter(Boolean).join(', ');
  $('home').value = val(cfg.home); $('dest').value = val(cfg.work); $('dest-name').value = destName();
  $('arrive').value = cfg.journeys.out.arriveBy;
  $('want-back').checked = !!cfg.journeys.back; $('leave-field').hidden = !cfg.journeys.back;
  if (cfg.journeys.back) $('leave').value = cfg.journeys.back.leaveAt;
  step(1); show('setup');
});

// ---------- which journey ----------
// Stop names. Official names are "Area-Stop name" ("Westgate Road-High Street").
// We show the part people say out loud, big ("High Street"), with the area and road side as detail.
const tidyName = s => String(s || '').replace(/\s(And|Of|The|On|In|At|By|To|For)(?=\s)/g, m => m.toLowerCase()).replace(/\s+/g, ' ').trim();
const SIDES = { opp: 'opposite side', adj: 'adjacent', 'o/s': 'outside', nr: 'near', os: 'outside' };
function sideOf(ind){
  ind = String(ind || '').trim(); if (!ind) return '';
  const b = ind.match(/^(?:-?>\s*)?(N|S|E|W|NE|NW|SE|SW)(?:[\s-]*bound)?$/i);
  if (b) return `${b[1].toUpperCase()}-bound side`;
  if (SIDES[ind.toLowerCase()]) return SIDES[ind.toLowerCase()];
  if (/^[A-Z]?\d{0,2}[A-Z]?$/i.test(ind) && ind.length <= 3) return `Stand ${ind.toUpperCase()}`;
  return ind;
}
function stopParts(stop, j){
  const n = String(stop.name || ''), i = n.lastIndexOf('-');
  let main = n, area = '';
  if (i > 0 && i < n.length - 2) {
    const before = n.slice(0, i).trim(), after = n.slice(i + 1).trim();
    const lastWord = before.split(/[\s-]/).pop();
    if ((/\s/.test(before) || /\s/.test(after)) && /^[A-Z0-9]/.test(lastWord) && /^[A-Z0-9]/.test(after)) { main = after; area = before; } // not "Stratford-upon-Avon"
  }
  main = tidyName(main); area = tidyName(area);
  const twin = j && j.stops.some(s => s !== stop && s.name === stop.name);
  return { main: stop.nick || main, auto: main, area, side: twin ? sideOf(stop.indicator) : '' };
}
const stopSub = p => [p.area, p.side].filter(Boolean).join(' · ');
function stopLabel(stop, j){ const p = stopParts(stop, j); return p.side ? `${p.main} · ${p.side}` : p.main; }
let manualJourney = null, shownKey = null;
function currentKey(){
  if (!cfg.journeys.back) return 'out';
  if (manualJourney) return manualJourney;
  const now = londonNow().mins, a = toMins(cfg.journeys.out.arriveBy), l = toMins(cfg.journeys.back.leaveAt);
  if (l <= a) return 'out';
  return now < (a + l) / 2 ? 'out' : 'back';
}
const J = () => cfg.journeys[currentKey()];
function renderToggle(){
  for (const t of [$('toggle'), $('toggle2')]) {
  t.textContent = '';
  t.hidden = !cfg.journeys.back;
  if (!cfg.journeys.back) continue;
  for (const k of ['out', 'back']) t.append(el('button', { type: 'button', 'aria-pressed': String(currentKey() === k), text: JOURNEYS[k].label(),
    onclick: () => { manualJourney = k; switchJourney(); } }));
  }
}
function switchJourney(){
  const k = currentKey();
  if (k !== shownKey) { shownKey = k; buses = []; lastOk = null; }
  render(); refresh();
}

// ---------- settings ----------
function buildSettings(){
  const add = (g, label, id, attrs, get, set) => {
    const inp = el('input', Object.assign({ id }, attrs)); inp.value = get();
    inp.addEventListener('change', () => { if (set(inp.value) !== false) store.set(KEY, cfg); else inp.value = get(); });
    g.append(el('label', { for: id, text: label }), inp);
  };
  const gt = $('sg-times'), gw = $('sg-walks'); gt.textContent = ''; gw.textContent = '';
  add(gt, `Arrive at ${destName().toLowerCase()} by`, 'set-arrive', { type: 'time' }, () => cfg.journeys.out.arriveBy, v => { if (!v) return false; cfg.journeys.out.arriveBy = v; });
  if (cfg.journeys.back) add(gt, `Leave ${destName().toLowerCase()} at`, 'set-leave', { type: 'time' }, () => cfg.journeys.back.leaveAt, v => { if (!v) return false; cfg.journeys.back.leaveAt = v; });
  add(gt, 'Running takes this share of walking time', 'set-run', { type: 'number', min: '0.3', max: '1', step: '0.05', inputmode: 'decimal' },
    () => cfg.run, v => { const n = parseFloat(v); if (!(n >= 0.2 && n <= 1)) return false; cfg.run = n; });
  gw.className = 'stoprows';
  for (const k of ['out', 'back']) {
    const j = cfg.journeys[k]; if (!j) continue;
    j.stops.forEach((s, i) => {
      const p = stopParts(s, j);
      const name = el('input', { id: `set-name-${k}-${i}`, type: 'text', maxlength: '30', placeholder: p.auto, 'aria-label': `Name for ${p.auto}` });
      name.value = s.nick || p.auto;
      name.addEventListener('change', () => {
        const v = name.value.trim();
        if (!v || v === p.auto) { delete s.nick; name.value = p.auto; } else s.nick = v;
        store.set(KEY, cfg); lastHTML.delete($('hero'));
      });
      const walk = el('input', { id: `set-walk-${k}-${i}`, type: 'number', min: '0.5', max: '30', step: '0.5', inputmode: 'decimal', 'aria-label': `Walking minutes to ${p.auto}` });
      walk.value = s.walk;
      walk.addEventListener('change', () => { const n = parseFloat(walk.value); if (n > 0) { s.walk = n; store.set(KEY, cfg); } else walk.value = s.walk; });
      gw.append(el('div', { class: 'stoprow' },
        el('small', { text: [stopSub(p) || 'Bus stop', k === 'back' ? `from ${destName().toLowerCase()}` : 'from home'].join(' · ') }),
        name, el('span', { class: 'mins' }, walk, el('span', { text: 'min' }))));
    });
  }
}

// ---------- the answer ----------
function verdictOf(b){
  const left = b.expected - londonNow().mins, walk = b.stop.walk, run = walk * cfg.run;
  if (left >= walk + BUFFER) { const l = left - walk - BUFFER; return { cls: 'go', leave: l, left }; }
  if (left >= run) return { cls: 'run', left };
  return { cls: 'miss', left };
}
const shortLeave = s => s.cls === 'run' ? 'Run now' : s.cls === 'miss' ? 'Too late' : s.leave < 1 ? 'Walk now' : `Leave in ${Math.floor(s.leave)} min`;
const dueText = left => left < 0.5 ? 'due' : `in ${Math.round(left)} min`;
const timing = b => { if (!b.live) return 'timetable'; const l = Math.round(b.delay); return l > 0 ? `${l} min late` : l < 0 ? `${-l} min early` : 'on time'; };
function ranked(){
  const rank = { go: 2, run: 1 };
  return buses.map(b => ({ b, s: verdictOf(b) })).filter(o => o.s.cls !== 'miss')
    .sort((x, y) => (Math.round(x.b.arrive) - Math.round(y.b.arrive)) || (rank[y.s.cls] - rank[x.s.cls]) || (y.b.expected - x.b.expected));
}
// Only tell people to run when it matters: a walkable bus that still gets you there on time (or within 5 min) wins.
function choose(opts){
  if (!opts.length || opts[0].s.cls !== 'run') return { pick: opts[0], runAlt: null };
  const isOut = currentKey() === 'out', top = opts[0];
  const target = isOut ? toMins(J().arriveBy) : null;
  const calm = opts.find(o => o.s.cls === 'go' && (isOut ? o.b.arrive <= target || (top.b.arrive > target && o.b.arrive - top.b.arrive <= 5) : o.b.arrive - top.b.arrive <= 5));
  return calm ? { pick: calm, runAlt: top } : { pick: top, runAlt: null };
}

function render(){
  if (view === 'track') { renderTrack(); return; }
  if (!cfg || view === 'setup' || view === 'plan' || view === 'stats' || !view) return;
  if (currentKey() !== shownKey) { switchJourney(); return; }
  renderToggle();
  if (view === 'now') renderNow();
  if (view === 'stops') renderStops();
}

// ---------- walking / running figures ----------
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function fig(kind, cls, gap){
  const t = document.createElement('template');
  t.innerHTML = figureSVG(kind, { size: 64, gap }).trim();
  const svg = t.content.firstElementChild; svg.classList.add(cls);
  return svg;
}
// Swap in freshly built content only when it actually changed, so the animations
// don't restart on every 5-second tick.
const lastHTML = new WeakMap();
function swap(target, nodes){
  const tmp = document.createElement('div'); tmp.append(...nodes);
  if (lastHTML.get(target) === tmp.innerHTML) return;
  lastHTML.set(target, tmp.innerHTML);
  target.replaceChildren(...tmp.childNodes);
  target.querySelectorAll('svg.fig').forEach(s => { if (reduceMotion && s.pauseAnimations) { s.pauseAnimations(); s.setCurrentTime(0); } });
}
const moving = s => s.cls === 'run' || (s.cls === 'go' && s.leave < 1);

function renderNow(){
  const key = currentKey(), j = J(), isOut = key === 'out';
  const hero = el('div'); const heroEl = $('hero'); heroEl.className = 'hero';
  const opts = lastOk ? ranked() : [];
  const { pick, runAlt } = choose(opts);
  if (!lastOk || !pick) {
    // Loading: say which stops we're checking, so the wait has context
    const names = [...new Set(j.stops.map(s => stopParts(s, j).main))];
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const parts = [
      el('div', { class: 'hero-row' }, el('span', { class: 'hero-num word', text: lastOk ? 'None' : '…' })),
      el('div', { class: 'hero-stop', text: lastOk ? 'Nothing catchable' : 'Checking' }),
      el('p', { class: 'muted', style: 'margin:6px 0 0', text: lastOk ? `No buses ${isOut ? 'to ' + destName().toLowerCase() : 'home'} you can reach in the next hour or so.` : `Getting live times for ${list}.` })];
    if (lastOk) parts.push(el('div', { class: 'actions', style: 'margin-top:14px' }, el('button', { class: 'btn', type: 'button', text: 'Plan ahead', onclick: () => openPlan('out') })));
    hero.append(...parts);
  } else {
    const { b, s } = pick;
    heroEl.classList.add(s.cls);
    let num, unit, word = false;
    if (s.cls === 'run') { num = 'Run'; word = true; unit = ['now', `bus in ${Math.max(0, Math.round(s.left))} min`]; }
    else if (s.leave < 1) { num = 'Go'; word = true; unit = ['walk', 'now']; }
    else { num = String(Math.floor(s.leave)); unit = ['min', 'until you leave']; }
    hero.append(
      el('div', { class: 'hero-row' },
        el('span', { class: 'hero-num' + (word ? ' word' : ''), text: num }),
        moving(s) ? fig(s.cls === 'run' ? 'run' : 'walk', 'hero-fig') : null,
        el('div', { class: 'hero-side' }, el('span', { text: unit[0] }), el('span', { class: 'muted', text: unit[1] }))),
      el('div', { class: 'hero-stop', text: stopParts(b.stop, j).main }));
    // only the road side when two stops share a name; you know where your stops are
    if (stopParts(b.stop, j).side) hero.append(el('div', { class: 'muted', style: 'font-size:1.05rem', text: stopParts(b.stop, j).side }));
    hero.append(busRow(b));
    if (isOut && b.arrive > toMins(j.arriveBy)) hero.append(el('p', { class: 'warn-line', text: `Arrives about ${hhmm(b.arrive)}, after ${j.arriveBy}` }));
    hero.append(el('div', { class: 'catch-row' }, el('button', { class: 'btn', type: 'button', onclick: () => trackBus(b, key) },
      isTracking(b) ? 'Open tracker' : 'Track this bus', T && isTracking(b) && T.remind ? icon('bell') : icon('next'))));
  }
  swap(heroEl, [...hero.childNodes]);
  heroTrip = pick ? pick.b.tripId : null;
  renderPrompt();

  // other buses: catchable first by departure, best one inverted
  const rest = opts.filter(o => o !== pick).sort((x, y) => x.b.expected - y.b.expected).slice(0, 6);
  $('list-h').hidden = !rest.length;
  swap($('list'), rest.map(({ b, s }) => card(b, s, j, isOut, false)));
  stamp();
}
// The chosen bus: big solid badge, time, and where it is as a strip of stops
function busRow(b){
  return el('div', { class: 'busrow' }, el('span', { class: 'badge xl', text: b.line }),
    el('div', { class: 'busrow-main' },
      el('div', { class: 'busrow-time' }, hhmm(b.expected), el('small', {}, b.live ? el('span', { class: 'live' }) : null, timing(b))),
      b.stopsAway ? el('div', { class: 'busrow-where' }, stopStrip(b.stopsAway, b.estimated), el('span', { text: awayText(b.stopsAway, b.estimated) }))
        : el('div', { class: 'busrow-where muted', text: b.live ? 'Tracked live' : b.pIdx < 0 ? 'Not set off yet · timetable' : 'Not tracked yet' })));
}
function card(b, s, j, isOut, best){
  const tracking = isTracking(b);
  return el('li', { class: 'card tap' + (best ? ' best' : '') + (s.cls === 'miss' ? ' missed' : '') + (tracking ? ' tracking' : ''), role: 'button', tabindex: '0', 'aria-label': `Track the ${b.line} at ${hhmm(b.expected)}`,
      onclick: () => trackBus(b, currentKey()), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trackBus(b, currentKey()); } } },
    el('span', { class: 'eyebrow' + (s.cls === 'run' ? ' run' : '') }, moving(s) ? fig(s.cls === 'run' ? 'run' : 'walk', 'mini', 'var(--card)') : null, shortLeave(s) + (tracking ? ' · tracking' : '')),
    el('span', { class: 'name' }, el('span', { class: 'badge', text: b.line }), el('span', { text: stopParts(b.stop, j).main })),
    el('span', { class: 'sub', text: [stopParts(b.stop, j).side, b.stopsAway ? awayText(b.stopsAway, b.estimated).replace(' (timetable)', '') : null, `${fmtMin(b.stop.walk)} walk`].filter(Boolean).join(' · ') }),
    el('span', { class: 'time' }, hhmm(b.expected), el('small', {}, b.live ? el('span', { class: 'live' }) : null, b.live ? timing(b) : 'timetable')));
}

function renderStops(){
  const key = currentKey(), j = J(), isOut = key === 'out';
  $('stops-title').textContent = isOut ? `To ${destName().toLowerCase()}` : 'Home';
  const boards = [];
  for (const stop of j.stops) {
    const lines = [...new Set(stop.services.map(s => s.line))];
    const ul = el('ul', { class: 'rows' });
    const list = buses.filter(b => b.stop === stop).slice(0, 5);
    if (!list.length) ul.append(el('li', { class: 'empty', text: lastOk ? 'Nothing in the next hour or so.' : 'Loading…' }));
    for (const b of list) {
      const s = verdictOf(b);
      ul.append(el('li', { class: 'tap', role: 'button', tabindex: '0', onclick: () => trackBus(b, currentKey()) },
        el('span', { class: 'badge', text: b.line }),
        el('div', {}, el('div', { class: 't', text: hhmm(b.expected) }), el('div', { class: 'd' }, b.live ? el('span', { class: 'live' }) : null, `${timing(b)} · ${isOut ? 'arrive' : 'home'} ${hhmm(b.arrive)}`)),
        el('span', { class: 's ' + s.cls }, moving(s) ? fig(s.cls === 'run' ? 'run' : 'walk', 'mini', 'var(--card)') : null, shortLeave(s))));
    }
    boards.push(el('section', { class: 'board' },
      el('div', { class: 'bh' },
        el('div', {}, el('h2', { text: stopParts(stop, j).main }), el('div', { class: 'muted', style: 'font-size:.85rem;margin-top:4px', text: [stopSub(stopParts(stop, j)), lines.join(' · ')].filter(Boolean).join(' · ') })),
        el('div', { class: 'walk' }, 'Walk ', el('b', { text: fmtMin(stop.walk) }), el('br'), 'Run ', el('b', { text: fmtMin(halfMin(stop.walk * cfg.run)) }))),
      ul));
  }
  swap($('boards'), boards);
}
function stamp(){
  const s = $('stamp'); s.textContent = '';
  if (busy) s.append('Updating…');
  else s.append(lastOk ? `Updated ${lastOk.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} · ` : '', el('b', { text: 'Refresh' }));
}
$('stamp').addEventListener('click', () => refresh());

async function refresh(){
  if (!cfg || busy || view === 'setup' || view === 'plan' || view === 'stats' || view === 'track' || document.hidden) return;
  busy = true; if (view === 'now') stamp();
  const err = $('error');
  try { await load(); err.hidden = true; if (typeof widgetLive === 'function') widgetLive(); }
  catch (e) { err.hidden = false; err.textContent = `Couldn't reach live bus data. ${lastOk ? 'Showing the last update.' : 'Check your connection and tap Refresh.'}`; }
  busy = false; render();
}
setInterval(refresh, 30000);
setInterval(render, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { manualJourney = null; refresh(); render(); if (T) loadTrack(); } });

/*@plan*/
/*@rides*/
/*@track*/
/*@widget*/
// ---------- appearance ----------
function getTheme(){ try { const v = localStorage.getItem('bw2-theme'); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; } }
function applyTheme(th){
  const root = document.documentElement;
  if (th === 'auto') delete root.dataset.theme; else root.dataset.theme = th;
  // browser bar colour: forced themes override both media-specific tags
  const light = '#E7E7E5', dark = '#111111';
  $('tc-light').content = th === 'dark' ? dark : light;
  $('tc-dark').content = th === 'light' ? light : dark;
  document.querySelectorAll('#theme button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === th)));
}
document.querySelectorAll('#theme button').forEach(b => b.addEventListener('click', () => {
  const th = b.dataset.theme;
  try { if (th === 'auto') localStorage.removeItem('bw2-theme'); else localStorage.setItem('bw2-theme', th); } catch {}
  applyTheme(th);
}));
applyTheme(getTheme());

// ---------- start ----------
const hm = location.hash.match(/#setup=(.+)$/);
if (hm) { try { cfg = decode(hm[1]); store.set(KEY, cfg); } catch {} history.replaceState(null, '', location.pathname + location.search); }
if (cfg) { store.set(KEY, cfg); show('now'); } else { step(1); show('setup'); }
