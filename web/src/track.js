// =====================================================================
// Tracking a chosen bus: pick any bus (Now, Stops, Plan ahead) to follow it on
// its own page, see how many stops away it is, set a leave reminder, and log
// "Caught it" when you're on board.
// =====================================================================
const TRACK = 'bw2-track';
let T = store.get(TRACK, null), heroTrip = null;
let tk = { d: null, v: null, ok: null, busy: false, err: false, from: 'now' };
const saveT = () => store.set(TRACK, T);
const ICON = {
  bus: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3" fill="currentColor"/><rect x="7.5" y="5.5" width="9" height="5" rx="1" fill="var(--inv-bg)"/><circle cx="8.5" cy="14" r="1.2" fill="var(--inv-bg)"/><circle cx="15.5" cy="14" r="1.2" fill="var(--inv-bg)"/><rect x="6" y="17" width="3" height="3" rx="1" fill="currentColor"/><rect x="15" y="17" width="3" height="3" rx="1" fill="currentColor"/></svg>',
  back: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
  next: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>',
  bell: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  cal: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>'
};
const icon = k => svgNode(ICON[k]);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const stopShort = n => stopParts({ name: cleanName(n) }, null).main;

// ---- start tracking ----
function trackBus(b, key, date){
  const j = cfg.journeys[key], p = stopParts(b.stop, j);
  T = { date: date || londonNow().date, dir: key, tripId: b.tripId, svcId: b.svcId, line: b.line, atco: b.stop.atco, stop: p.main, side: p.side,
        walk: b.stop.walk, aimed: b.aimed, arrive: b.arrive, target: key === 'out' ? toMins(j.arriveBy) : null, remind: false, notified: false, ran: false };
  saveT();
  tk = { d: b.times ? { id: b.tripId, times: b.times } : null, v: null, ok: null, busy: false, err: false, from: view === 'track' ? tk.from : view };
  show('track');
}
function stopTracking(){ T = null; saveT(); clearTimeout(remindTimer); nativeCancel(); lastHTML.delete($('caught')); show(tk.from && tk.from !== 'track' ? tk.from : 'now'); }
const isTracking = b => T && T.tripId === b.tripId && T.atco === b.stop.atco;

// ---- where is it? ----
function trackState(){
  if (!T) return null;
  const now = londonNow(), dayOff = daysBetween(now.date, T.date);
  const times = tk.d && tk.d.times;
  const idx = times ? times.findIndex(x => x.stop.atco_code === T.atco && x.pick_up !== false) : -1;
  // use the freshest live data: the tracker's own fetch, or the Now screen's (which refreshes every 30s)
  let v = dayOff === 0 ? tk.v : null;
  const nb = dayOff === 0 && typeof buses !== 'undefined' ? buses.find(x => x.tripId === T.tripId && x.stop.atco === T.atco) : null;
  if (nb && nb.live && (!v || (lastOk && tk.ok && lastOk > tk.ok))) v = { delay: nb.delay * 60, progress: { prev_stop: nb.pIdx >= 0 && nb.times[nb.pIdx] ? nb.times[nb.pIdx].stop.atco_code : null } };
  if (!tk.d && nb && nb.times) tk.d = { id: T.tripId, times: nb.times };
  const live = !!v;
  const delay = live ? (v.delay || 0) / 60 : 0;
  const expected = T.aimed + delay;
  let pIdx = -1, est = false;
  if (dayOff === 0 && times) {
    const prev = live && v.progress && v.progress.prev_stop;
    pIdx = prev ? times.findIndex(x => x.stop.atco_code === prev) : -1;
    if (!prev) { pIdx = timetablePos(times, times.length - 1, now.mins, delay); est = true; }
  }
  const left = expected - now.mins + 1440 * dayOff;                  // minutes until the bus reaches your stop
  const leaveIn = left - T.walk - BUFFER;
  const passed = idx >= 0 && pIdx >= idx && (live || left < -1);
  const departed = dayOff < 0 || (dayOff === 0 && (left < -1.5 || (live && passed)));
  const cls = departed ? 'gone' : left >= T.walk + BUFFER ? 'go' : left >= T.walk * cfg.run ? 'run' : 'late';
  const stopsAway = idx >= 0 && pIdx >= 0 && pIdx < idx ? idx - pIdx : null;
  return { now, dayOff, times, idx, pIdx, est, live, delay, expected, left, leaveIn, departed, cls, stopsAway, leave: expected - T.walk - BUFFER };
}
async function loadTrack(){
  if (!T || tk.busy) return;
  tk.busy = true;
  try {
    if (!tk.d || tk.d.id !== T.tripId || !tk.d.times) tk.d = await tripDetail(T.tripId);
    if (T.date === londonNow().date) {
      const vs = await getJSON(`${API}/vehicles.json?service=${T.svcId}`);
      let v = (vs || []).find(x => x.trip_id === T.tripId) || null;
      if (v && Math.abs((v.delay || 0) / 60) > 40) v = null;
      tk.v = v;
    }
    tk.ok = new Date(); tk.err = false;
  } catch { tk.err = true; }
  tk.busy = false;
  const st = trackState();
  if (st && st.dayOff === 0 && st.left < -60) { T = null; saveT(); }      // long gone: stop tracking
  if (view === 'track') renderTrack(); if (view === 'now') renderPrompt();
  scheduleReminder();
  if (typeof widgetTracked === 'function') widgetTracked();
}
setInterval(() => { if (T && !document.hidden && (view === 'track' || view === 'now')) loadTrack(); }, 20000);

// ---- the clever "3 stops away" strip ----
function stopStrip(n, est){
  const shown = Math.min(n, 5), s = el('span', { class: 'strip' + (est ? ' est' : ''), 'aria-hidden': 'true' });
  s.append(el('span', { class: 'sbus' }, icon('bus')));
  if (n > 5) s.append(el('span', { class: 'seg' }), el('span', { class: 'more', text: '…' }));
  for (let i = 0; i < shown; i++) s.append(el('span', { class: 'seg' }), el('span', { class: 'sdot' + (i === shown - 1 ? ' you' : '') }));
  return s;
}
const awayText = (n, est) => `${est ? 'about ' : ''}${n} stop${n > 1 ? 's' : ''} away${est ? ' (timetable)' : ''}`;

// ---- the route line ----
function routeView(st){
  if (!st.times || st.idx < 0) return el('p', { class: 'muted', text: tk.err ? 'Couldn\'t load the route. Tap Refresh.' : 'Loading the route…' });
  const times = st.times, idx = st.idx, j = cfg.journeys[T.dir];
  let off = -1;
  for (let k = idx + 1; k < times.length; k++) if (j && j.alight && j.alight[times[k].stop.atco_code]) { off = k; break; }
  const from = Math.max(0, idx - 6), showBus = st.dayOff === 0 && !st.departed || (st.dayOff === 0 && st.pIdx >= idx);
  const t = k => { const ts = times[k].aimed_departure_time || times[k].aimed_arrival_time; return ts ? hhmm(toMins(ts) + st.delay) : ''; };
  const rows = [];
  const busRow = (label) => el('li', { class: 'rs bus' + (st.est ? ' est' : '') },
    el('span', { class: 'rt' }), el('span', { class: 'rr' }, el('span', { class: 'busmark' }, icon('bus'))),
    el('span', { class: 'rl' }, el('b', { text: label }), el('small', { text: st.est ? 'estimated from the timetable' : 'live position' })));
  if (showBus && st.pIdx < 0) rows.push(busRow('Not set off yet'));
  else if (showBus && st.pIdx < from) rows.push(busRow(`${from - st.pIdx} more stop${from - st.pIdx > 1 ? 's' : ''} back`));
  for (let k = from; k <= idx; k++) {
    const you = k === idx, passed = st.dayOff === 0 && k <= st.pIdx;
    rows.push(el('li', { class: 'rs' + (you ? ' you' : '') + (passed ? ' passed' : '') },
      el('span', { class: 'rt', text: t(k) }), el('span', { class: 'rr' }, el('span', { class: 'rd' })),
      el('span', { class: 'rl' }, you ? el('b', { text: T.stop }) : stopShort(times[k].stop.name), you ? el('small', { text: 'Your stop' }) : null)));
    if (showBus && k === st.pIdx && k < idx) rows.push(busRow(st.stopsAway === 1 ? 'Next stop is yours' : `${st.stopsAway} stops away`));
  }
  if (showBus && st.pIdx >= idx) rows.push(busRow('Left your stop'));
  if (off > idx) {
    if (off - idx > 1) rows.push(el('li', { class: 'rs gap' }, el('span', { class: 'rt' }), el('span', { class: 'rr' }), el('span', { class: 'rl', text: `${off - idx - 1} stops` })));
    rows.push(el('li', { class: 'rs off' }, el('span', { class: 'rt', text: t(off) }), el('span', { class: 'rr' }, el('span', { class: 'rd' })),
      el('span', { class: 'rl' }, stopShort(times[off].stop.name), el('small', { text: 'Get off' }))));
  }
  return el('ul', { class: 'route' }, ...rows);
}

// ---- reminder: 10 minutes before you need to leave ----
let remindTimer = null;
function londonOffsetMin(ms){
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000);
}
function londonToMs(date, mins){ const [y, m, d] = date.split('-').map(Number); const g = Date.UTC(y, m - 1, d) + Math.round(mins * 60000); return g - londonOffsetMin(g) * 60000; }
// Inside the Android app (Capacitor), reminders are real Android alarms that fire even when the app is closed.
const CAP = window.Capacitor;
const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const LN = NATIVE ? ((CAP.Plugins && CAP.Plugins.LocalNotifications) || (CAP.registerPlugin && CAP.registerPlugin('LocalNotifications'))) : null;
const NOTE_ID = 1001;
let nativeDenied = false;
async function nativeCancel(){ if (LN) try { await LN.cancel({ notifications: [{ id: NOTE_ID }] }); } catch {} }
async function nativeSchedule(at, title, body){
  if (!LN) return;
  try {
    await nativeCancel();
    await LN.schedule({ notifications: [{ id: NOTE_ID, title, body, schedule: { at: new Date(Math.max(at, Date.now() + 1500)), allowWhileIdle: true }, smallIcon: 'ic_stat_bus', iconColor: '#22A447' }] });
  } catch (e) { console.warn('reminder', e); }
}
async function nativePermission(){
  if (!LN) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    nativeDenied = p.display === 'denied';
    return p.display === 'granted';
  } catch { return false; }
}
async function registerSW(){ if (NATIVE) return null;  try { if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) return await navigator.serviceWorker.register('sw.js'); } catch {} return null; }
registerSW();
function scheduleReminder(){
  clearTimeout(remindTimer);
  if (!T || !T.remind || T.notified) return;
  const st = trackState(); if (!st || st.departed) return;
  const at = londonToMs(T.date, st.leave - 10), ms = at - Date.now();
  // the Android alarm is (re)set every time fresh times arrive, so it follows live delays while the app is open
  if (NATIVE && ms > 0) { nativeSchedule(at, `Leave in 10 min for the ${T.line}`, `${T.stop} · leave at ${hhmm(st.leave)} for the ${hhmm(st.expected)} bus`); }
  if (ms <= 0) { if (st.leaveIn > -2) fireReminder(st); return; }
  remindTimer = setTimeout(() => fireReminder(trackState()), Math.min(ms, 2 ** 31 - 1));
}
async function fireReminder(st){
  if (!T || T.notified || !st) return;
  T.notified = true; saveT();
  const mins = Math.max(0, Math.round(st.leaveIn));
  const title = mins > 0 ? `Leave in ${mins} min for the ${T.line}` : `Time to go for the ${T.line}`;
  const body = `${T.stop} · bus at ${hhmm(st.expected)}${st.live ? ' (live)' : ''}`;
  try {
    // in the Android app the system alarm has already been set, so only the in-app toast is shown here
    if (NATIVE) {}
    else if ('Notification' in window && Notification.permission === 'granted') {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(title, { body, tag: 'which-stop-leave', renotify: true, vibrate: [200, 100, 200], icon: 'icon-192.png', badge: 'icon-192.png' });
      else new Notification(title, { body });
    }
  } catch {}
  if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch {}
  toast(title, body);
}
async function toggleRemind(){
  if (!T) return;
  if (T.remind) { T.remind = false; T.notified = false; saveT(); clearTimeout(remindTimer); nativeCancel(); renderTrack(); return; }
  T.remind = true; T.notified = false; saveT();
  if (NATIVE) { await nativePermission(); scheduleReminder(); renderTrack(); return; }
  if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  await registerSW(); scheduleReminder(); renderTrack();
}
function calendarFile(){
  const st = trackState(); if (!st) return;
  const f = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = londonToMs(T.date, st.leave), end = Math.max(londonToMs(T.date, T.arrive + st.delay), start + 15 * 60000);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Which stop//EN', 'BEGIN:VEVENT', `UID:${T.tripId}-${T.date}-${T.atco}@which-stop`, `DTSTAMP:${f(Date.now())}`,
    `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:Leave for the ${T.line} at ${T.stop}`,
    `DESCRIPTION:Bus ${T.line} from ${T.stop} at ${hhmm(st.expected)}. Leave by ${hhmm(st.leave)}.`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:Leave in 10 min for the ${T.line}`, 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `leave-for-the-${T.line}.ics` });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
let toastTimer = null;
function toast(title, body){
  const t = $('toast'); t.replaceChildren(icon('bell'), el('div', {}, el('b', { text: title }), el('span', { text: body })));
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 12000);
  t.onclick = () => { t.hidden = true; if (T) show('track'); };
}

// ---- logging from the tracker ----
function trackRide(st){
  return { key: rideKey(T.date, T.atco, T.line, T.aimed), date: T.date, dir: T.dir, line: T.line, atco: T.atco, stop: T.stop, aimed: T.aimed,
    expected: st.expected, arrive: T.arrive + st.delay, live: st.live, delay: Math.round(st.delay), ran: T.ran || st.cls === 'run', target: T.target };
}

// ---- the page ----
function renderTrack(){
  const body = $('track-body');
  if (!T) { swap(body, [el('p', { class: 'muted', text: 'Not tracking a bus.' })]); return; }
  const st = trackState(), j = cfg.journeys[T.dir], isOut = T.dir === 'out';
  if (st.cls === 'run' && !T.ran) { T.ran = true; saveT(); }
  const key = rideKey(T.date, T.atco, T.line, T.aimed), logged = isLogged(key);
  const parts = [];
  parts.push(el('div', { class: 'top' },
    el('button', { class: 'round', type: 'button', 'aria-label': 'Back', onclick: () => show(tk.from && tk.from !== 'track' ? tk.from : 'now') }, icon('back')),
    el('span', { class: 'muted', text: `Tracking · ${isOut ? 'to ' + destName().toLowerCase() : 'home'}` })));
  // hero: when to leave
  let num, unit, cls = '', word = false, figure = null;
  if (st.dayOff > 0) { num = hhmm(st.leave); cls = 'clock'; unit = ['leave', st.dayOff === 1 ? 'tomorrow' : fmtDate(T.date)]; }
  else if (st.departed) { num = logged ? 'On' : 'Left'; word = true; unit = logged ? ['board', 'have a good trip'] : ['your stop', `at ${hhmm(st.expected)}`]; }
  else if (st.cls === 'late') { num = 'Late'; word = true; unit = ['too late', `bus in ${Math.max(0, Math.round(st.left))} min`]; }
  else if (st.cls === 'run') { num = 'Run'; word = true; figure = 'run'; unit = ['now', `bus in ${Math.max(0, Math.round(st.left))} min`]; }
  else if (st.leaveIn < 1) { num = 'Go'; word = true; figure = 'walk'; unit = ['walk', 'now']; }
  else if (st.leaveIn >= 90) { num = hhmm(st.leave); cls = 'clock'; unit = ['leave', `in ${Math.floor(st.leaveIn / 60)} h ${Math.round(st.leaveIn % 60)} min`]; }
  else { num = String(Math.floor(st.leaveIn)); unit = ['min', 'until you leave']; }
  parts.push(el('section', { class: 'hero' + (st.cls === 'run' && !st.departed ? ' run' : '') },
    el('div', { class: 'hero-row' }, el('span', { class: 'hero-num' + (word ? ' word' : '') + (cls ? ' ' + cls : ''), text: num }),
      figure ? fig(figure, 'hero-fig') : null,
      el('div', { class: 'hero-side' }, el('span', { text: unit[0] }), el('span', { class: 'muted', text: unit[1] }))),
    el('div', { class: 'hero-stop', text: T.stop }),
    T.side ? el('div', { class: 'muted', style: 'font-size:1.05rem', text: T.side }) : null));
  // bus row
  const timing = st.dayOff !== 0 ? (st.dayOff > 0 ? (st.dayOff === 1 ? 'tomorrow' : fmtDate(T.date)) : '') : st.live ? (Math.round(st.delay) > 0 ? `${Math.round(st.delay)} min late` : Math.round(st.delay) < 0 ? `${-Math.round(st.delay)} min early` : 'on time') : 'timetable';
  parts.push(el('div', { class: 'busrow' }, el('span', { class: 'badge xl', text: T.line }),
    el('div', { class: 'busrow-main' },
      el('div', { class: 'busrow-time' }, hhmm(st.expected), el('small', {}, st.live ? el('span', { class: 'live' }) : null, timing)),
      st.stopsAway && !st.departed ? el('div', { class: 'busrow-where' }, stopStrip(st.stopsAway, st.est), el('span', { text: awayText(st.stopsAway, st.est) })) : null)));
  // actions
  const acts = el('div', { class: 'track-actions' });
  if (logged) acts.append(el('div', { class: 'logged' }, checkIcon(), el('span', { text: 'Ride logged. Have a good trip.' }), el('button', { class: 'linkbtn', type: 'button', text: 'Undo', onclick: () => { undoRide(key); renderTrack(); } })));
  else if (st.dayOff <= 0) acts.append(el('button', { class: 'btn' + (st.departed || st.left < 6 ? '' : ' ghost'), type: 'button', onclick: () => { caught(trackRide(st)); lastHTML.delete(body); renderTrack(); } }, checkIcon(), st.departed ? 'Yes, I caught it' : 'Caught it'));
  if (!st.departed && st.leaveIn > 1) {
    const on = T.remind, when = hhmm(st.leave - 10);
    const blocked = 'Notification' in window && Notification.permission === 'denied';
    acts.append(el('button', { class: 'btn' + (on ? '' : ' ghost') + ' remind', type: 'button', 'aria-pressed': String(on), onclick: toggleRemind }, icon('bell'),
      on ? (T.notified ? 'Reminder sent' : `Reminder at ${when}`) : st.leaveIn > 10 ? 'Remind me 10 min before I leave' : 'Remind me when to go'));
    if (NATIVE) { if (nativeDenied) acts.append(el('p', { class: 'note', text: 'Notifications are turned off for Which stop. Turn them on in Android Settings → Apps → Which stop? → Notifications.' })); }
    else if (on || blocked || !('Notification' in window)) acts.append(el('p', { class: 'note' },
      blocked ? 'Notifications are blocked for this site. ' : on ? 'Phones pause web apps in the background, so this alert isn\'t guaranteed. ' : '',
      el('button', { class: 'linkbtn', type: 'button', onclick: calendarFile }, 'Add it to your calendar'), ' for an alert that always goes off.'));
  }
  if (st.departed && !logged) acts.append(el('button', { class: 'btn ghost', type: 'button', text: 'No, I missed it', onclick: stopTracking }));
  parts.push(acts);
  // route
  parts.push(el('section', { class: 'panel route-panel' },
    el('div', { class: 'panel-h' }, el('h3', { text: st.dayOff > 0 ? 'The route' : 'Where\'s the bus?' }),
      st.dayOff === 0 && !st.live ? el('span', { class: 'muted small', text: 'not tracked yet' }) : st.live ? el('span', { class: 'small' }, el('span', { class: 'live' }), 'live') : null),
    routeView(st)));
  parts.push(el('div', { class: 'track-foot' },
    el('button', { class: 'stamp', type: 'button', onclick: () => loadTrack() }, tk.busy ? 'Updating…' : tk.ok ? `Updated ${tk.ok.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} · ` : '', tk.busy ? null : el('b', { text: 'Refresh' })),
    el('button', { class: 'linkbtn', type: 'button', text: 'Stop tracking', onclick: stopTracking })));
  swap(body, parts);
}

// ---- Now screen banner: what you're tracking, or "did you catch it?" ----
function renderPrompt(){
  const box = $('caught');
  const st = T && T.date === londonNow().date ? trackState() : (T && daysBetween(londonNow().date, T.date) > 0 ? trackState() : null);
  const key = T && rideKey(T.date, T.atco, T.line, T.aimed);
  if (!st || isLogged(key) || (st.departed && st.left < -30)) { swap(box, []); box.hidden = true; return; }
  box.hidden = false;
  if (st.departed) {
    box.className = 'prompt';
    swap(box, [
      el('div', { class: 'q' }, el('span', { class: 'badge', text: T.line }), el('span', { text: `Did you catch the ${T.line}?` })),
      el('p', { class: 'muted', text: `${hhmm(st.expected)} from ${T.stop} · ${T.dir === 'out' ? 'to ' + destName().toLowerCase() : 'home'}` }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', onclick: () => { caught(trackRide(st)); renderPrompt(); } }, checkIcon(), 'Yes, caught it'),
        el('button', { class: 'btn ghost', type: 'button', text: 'No', onclick: () => { T = null; saveT(); lastHTML.delete(box); renderPrompt(); } }))]);
  } else if (heroTrip === T.tripId) { swap(box, []); box.hidden = true;   // the big answer is already this bus
  } else {
    box.className = 'prompt slim';
    const what = st.dayOff > 0 ? `leave ${hhmm(st.leave)} ${st.dayOff === 1 ? 'tomorrow' : fmtDate(T.date)}` : st.cls === 'run' ? 'run now' : st.leaveIn < 1 ? 'go now' : st.leaveIn >= 90 ? `leave at ${hhmm(st.leave)}` : `leave in ${Math.floor(st.leaveIn)} min`;
    swap(box, [el('button', { class: 'slimbtn', type: 'button', onclick: () => { tk.from = 'now'; show('track'); } },
      el('span', { class: 'badge', text: T.line }), el('span', { class: 'grow' }, `Tracking · ${what}`), T.remind ? icon('bell') : null, icon('next'))]);
  }
}
// pick the tracked bus back up when the app opens (keeps the reminder scheduled)
if (T) setTimeout(loadTrack, 300);
if (NATIVE && LN) LN.checkPermissions().then(p => { nativeDenied = p.display === 'denied'; }).catch(() => {});
