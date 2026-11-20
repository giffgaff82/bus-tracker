// ---------- Android home-screen widget ----------
// Only inside the Android app. The widget works out timetable times itself and refreshes
// live delays in the background, so here we just hand it the journey settings, the bus
// being tracked, and any fresh live data we already have.
const WB = NATIVE ? ((CAP.Plugins && CAP.Plugins.WidgetBridge) || (CAP.registerPlugin && CAP.registerPlugin('WidgetBridge'))) : null;
const wbCall = (m, data) => { if (WB && WB[m]) try { const r = WB[m](data); if (r && r.catch) r.catch(() => {}); } catch {} };

function widgetConfig(){
  if (!WB || !cfg || !cfg.journeys) return;
  const dirs = {};
  for (const k of ['out', 'back']) {
    const j = cfg.journeys[k]; if (!j) continue;
    dirs[k] = { label: JOURNEYS[k].label(), stops: j.stops.map(s => ({
      atco: s.atco, name: stopParts(s, j).main, walk: s.walk,
      services: s.services.map(v => ({ id: v.id, line: v.line, heads: v.heads.map(h => [h.h, h.off]) }))
    })) };
  }
  wbCall('setConfig', { config: { buffer: BUFFER, run: cfg.run, arriveBy: cfg.journeys.out.arriveBy, leaveAt: cfg.journeys.back ? cfg.journeys.back.leaveAt : null, dirs } });
}

function widgetTracked(){
  if (!WB) return;
  if (!T) { wbCall('setTracked', { tracked: null }); return; }
  const times = tk.d && tk.d.id === T.tripId ? tk.d.times : null;
  let idx = -1, atcos = [], mins = [];
  if (times) {
    idx = times.findIndex(x => x.stop.atco_code === T.atco && x.pick_up !== false);
    let base = null;
    for (let k = 0; k <= idx; k++) {
      const ts = times[k].aimed_departure_time || times[k].aimed_arrival_time;
      let t = ts ? toMins(ts) : null;
      if (t !== null) { if (base === null) base = t; if (t < base - 60) t += 1440; }
      atcos.push(times[k].stop.atco_code); mins.push(t);
    }
  }
  const v = tk.v && T.date === londonNow().date ? tk.v : null;
  wbCall('setTracked', { tracked: {
    line: T.line, stop: T.stop, svcId: T.svcId, tripId: T.tripId, date: T.date, aimed: T.aimed, walk: T.walk, buffer: BUFFER,
    dirLabel: JOURNEYS[T.dir] ? JOURNEYS[T.dir].label() : '', idx, atcos, mins,
    live: v ? { at: tk.ok ? tk.ok.getTime() : Date.now(), delay: (v.delay || 0) / 60, prev: v.progress && v.progress.prev_stop || null } : null
  } });
}

function widgetLive(){
  if (!WB || !buses) return;
  const trips = {};
  for (const b of buses) if (b.live) trips[b.tripId] = b.delay;
  wbCall('setLive', { live: { dir: currentKey(), at: Date.now(), trips } });
}

if (WB) {
  // keep the widget in step whenever settings or the tracked bus change
  const setRaw = store.set.bind(store);
  store.set = (k, v) => { setRaw(k, v); if (k === KEY) widgetConfig(); else if (k === TRACK) widgetTracked(); };
  // tapping the widget opens the matching screen
  const openFrom = r => { if (!r || !r.view || !cfg) return; if (r.view === 'track' && T) show('track'); else show('now'); };
  window.addEventListener('whichstopWidget', e => openFrom(e && e.view ? e : (e && e.detail) || null));
  setTimeout(() => { widgetConfig(); widgetTracked(); try { WB.consumeLaunch().then(openFrom).catch(() => {}); } catch {} }, 0);
}
