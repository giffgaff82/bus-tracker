// ---------- plan ahead (timetable look-ahead) ----------
// Pick a day, a journey, and "arrive by" or "leave at". The answer is the time to leave your door.
const plan = { key: null, day: 0, mode: null, time: null, seq: 0 };
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
const longDayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const dayLabel = n => n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : dayFmt.format(new Date(addDays(londonNow().date, n) + 'T12:00:00Z'));
const longDay = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : longDayFmt.format(new Date(addDays(londonNow().date, n) + 'T12:00:00Z'));

function planDefaults(key, day){
  plan.key = key || currentKey();
  const j = cfg.journeys[plan.key];
  plan.mode = plan.key === 'out' ? 'arrive' : 'leave';
  plan.time = plan.key === 'out' ? j.arriveBy : j.leaveAt;
  // next time this journey happens: today if it's still ahead, otherwise tomorrow
  plan.day = day != null ? day : (londonNow().mins > toMins(plan.time) - (plan.mode === 'arrive' ? 30 : 0) ? 1 : 0);
}
function openPlan(key, day){ planDefaults(key, day); show('plan'); }

function planControls(){
  const tg = $('plan-toggle'); tg.textContent = ''; tg.hidden = !cfg.journeys.back;
  if (cfg.journeys.back) for (const k of ['out', 'back']) tg.append(el('button', { type: 'button', 'aria-pressed': String(plan.key === k), text: JOURNEYS[k].label(),
    onclick: () => { const d = plan.day; planDefaults(k, d); planControls(); runPlan(); } }));
  const days = $('plan-days'); days.textContent = '';
  for (let n = 0; n < 2; n++) days.append(el('button', { type: 'button', 'aria-pressed': String(plan.day === n), text: dayLabel(n),
    onclick: () => { plan.day = n; planControls(); runPlan(); } }));
  const md = $('plan-mode'); md.textContent = '';
  for (const [m, t] of [['arrive', 'Arrive by'], ['leave', 'Leave at']]) md.append(el('button', { type: 'button', 'aria-pressed': String(plan.mode === m), text: t,
    onclick: () => { plan.mode = m; planControls(); runPlan(); } }));
  $('plan-time').value = plan.time;
}
$('plan-time').addEventListener('change', e => { if (e.target.value) { plan.time = e.target.value; runPlan(); } });

// Timetabled journeys for one day, built the same way as the live view but without vehicles.
async function planTrips(key, date, lo, hi){
  const j = cfg.journeys[key], dest = JOURNEYS[key].to(), D = [dest.lon, dest.lat];
  const jobs = [];
  for (const stop of j.stops) for (const svc of stop.services) {
    const trips = await tripList(svc.id, date);
    const heads = new Map(svc.heads.map(h => [h.h, h.off]));
    for (const [id, start, h] of trips) {
      if (!heads.has(h)) continue;
      const b = startMins(start) + heads.get(h);
      if (b >= lo - 15 && b <= hi + 15) jobs.push({ id, stop, svc });
    }
  }
  const details = await pool(jobs, 4, x => tripDetail(x.id));
  const out = [], seen = new Set();
  jobs.forEach((x, n) => {
    const d = details[n];
    if (!d || !d.times) return;
    const idx = d.times.findIndex(t => t.stop.atco_code === x.stop.atco && t.pick_up !== false);
    if (idx < 0) return;
    const aimedStr = d.times[idx].aimed_departure_time || d.times[idx].aimed_arrival_time;
    if (!aimedStr) return;
    const aimed = toMins(aimedStr);
    if (aimed < lo || aimed > hi) return;
    let arrive = null, off = '';
    for (let k = idx + 1; k < d.times.length; k++) {
      const t = d.times[k], ts = t.aimed_arrival_time || t.aimed_departure_time;
      if (t.set_down === false || !ts) continue;
      const a = j.alight[t.stop.atco_code];
      let w = null, name = '';
      if (a) { w = a[1]; name = a[0]; }
      else if (t.stop.location) { const m = dist(t.stop.location, D); if (m <= NEAR_DEST) { w = estWalk(m); name = stripDistrict(t.stop.name, dest.district); } }
      if (w === null) continue;
      let tt = toMins(ts); if (tt < aimed - 60) tt += 1440;
      if (arrive === null || tt + w < arrive) { arrive = tt + w; off = name; }
    }
    if (arrive === null) return;
    const k = `${x.stop.atco}|${x.svc.line}|${aimed}`;
    if (seen.has(k)) return; seen.add(k);
    out.push({ stop: x.stop, line: x.svc.line, aimed, arrive, off, leave: aimed - x.stop.walk - BUFFER, tripId: d.id, svcId: x.svc.id, times: d.times });
  });
  return out;
}

async function runPlan(){
  const seq = ++plan.seq, key = plan.key, j = cfg.journeys[key], isOut = key === 'out';
  const t = toMins(plan.time), date = addDays(londonNow().date, plan.day);
  const target = plan.mode === 'arrive';
  const lo = target ? t - 150 : t - 5, hi = target ? t + 20 : t + 150;
  $('plan-sum').textContent = '';
  swap($('plan-hero'), [el('div', { class: 'hero-row' }, el('span', { class: 'hero-num word', text: '…' })), el('p', { class: 'muted', text: `Checking ${longDay(plan.day)}'s timetables…` })]);
  swap($('plan-list'), []); $('plan-list-h').hidden = true;
  let rows;
  try { rows = await planTrips(key, date, lo, hi); }
  catch { if (seq === plan.seq) swap($('plan-hero'), [el('p', { class: 'notice', text: 'Couldn\'t reach the timetables. Check your connection and try again.' })]); return; }
  if (seq !== plan.seq) return; // settings changed while loading

  let best, list;
  if (target) {
    const ok = rows.filter(r => r.arrive <= t);
    // latest you can leave and still be there on time; on ties, the earlier arrival
    best = ok.sort((a, b) => (b.leave - a.leave) || (a.arrive - b.arrive))[0];
    list = rows.filter(r => r.arrive <= t + 15).sort((a, b) => a.aimed - b.aimed).slice(-8);
  } else {
    const ok = rows.filter(r => r.leave >= t);
    best = ok.sort((a, b) => (a.arrive - b.arrive) || (a.leave - b.leave))[0];
    list = ok.sort((a, b) => a.aimed - b.aimed).slice(0, 8);
  }

  const where = isOut ? destName().toLowerCase() : 'home';
  $('plan-sum').textContent = `${longDay(plan.day).replace(/^./, c => c.toUpperCase())} · ${target ? 'arrive' : 'leave'} ${target ? 'by' : 'at'} ${plan.time}`;
  if (!best) {
    swap($('plan-hero'), [el('div', { class: 'hero-row' }, el('span', { class: 'hero-num word', text: 'None' })),
      el('p', { class: 'muted', style: 'margin:6px 0 0', text: target ? `No bus gets you ${isOut ? 'to ' + where : where} by ${plan.time} ${longDay(plan.day)}. Try a later time.` : `No buses ${isOut ? 'to ' + where : where} within a couple of hours of ${plan.time} ${longDay(plan.day)}.` })]);
  } else {
    const sp = stopParts(best.stop, j), parts = [sp.main, stopSub(sp)];
    swap($('plan-hero'), [
      el('div', { class: 'hero-row' },
        el('span', { class: 'hero-num clock', text: hhmm(best.leave) }),
        el('div', { class: 'hero-side' }, el('span', { text: 'leave' }), el('span', { class: 'muted', text: isOut ? 'home' : destName().toLowerCase() }))),
      el('div', { class: 'hero-stop', text: parts[0] }),
      parts[1] ? el('div', { class: 'muted', style: 'font-size:1.05rem', text: parts[1] }) : null,
      el('dl', { class: 'hero-meta' },
        el('dt', { text: 'Bus' }), el('dd', { text: `${best.line} at ${hhmm(best.aimed)}` }),
        el('dt', { text: isOut ? 'Arrive' : 'Home' }), el('dd', { text: `${hhmm(best.arrive)}${target ? ` · ${Math.round(t - best.arrive)} min to spare` : ''}` }),
        el('dt', { text: 'Off at' }), el('dd', { text: best.off }),
        el('dt', { text: 'Walk' }), el('dd', { text: `${fmtMin(best.stop.walk)} to the stop` })),
      el('div', { class: 'catch-row' }, el('button', { class: 'btn', type: 'button', onclick: () => trackBus(best, key, date) }, icon('bell'), 'Track and remind me'))
    ].filter(Boolean));
  }
  $('plan-list-h').hidden = !list.length;
  swap($('plan-list'), list.map(r => {
    const late = target && r.arrive > t;
    return el('li', { class: 'card tap' + (r === best ? ' best' : '') + (late ? ' missed' : ''), role: 'button', tabindex: '0', 'aria-label': `Track the ${r.line} at ${hhmm(r.aimed)}`,
      onclick: () => trackBus(r, key, date) },
      el('span', { class: 'eyebrow', text: `Leave ${isOut ? 'home' : destName().toLowerCase()} ${hhmm(r.leave)}` }),
      el('span', { class: 'name' }, el('span', { class: 'badge', text: r.line }), el('span', { text: stopParts(r.stop, j).main })),
      el('span', { class: 'sub', text: [stopParts(r.stop, j).side, `${isOut ? 'Arrive' : 'Home'} ${hhmm(r.arrive)}${late ? ` · after ${plan.time}` : ''}`].filter(Boolean).join(' · ') }),
      el('span', { class: 'time' }, hhmm(r.aimed), el('small', { text: 'departs' })));
  }));
}
