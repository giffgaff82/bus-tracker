// ---------- live data ----------
// Index of the last stop the bus should have left by `nowMins`, from the timetable (+ delay). -1 = not started.
function timetablePos(times, upto, nowMins, delay){
  let last = -1, base = null;
  for (let k = 0; k <= upto && k < times.length; k++) {
    const ts = times[k].aimed_departure_time || times[k].aimed_arrival_time; if (!ts) continue;
    let t = toMins(ts); if (base === null) base = t; if (t < base - 60) t += 1440;
    if (t + delay <= nowMins) last = k; else break;
  }
  return last;
}
let buses = [], lastOk = null, busy = false;
async function load(){
  const key = currentKey(), j = cfg.journeys[key];
  const now = londonNow();
  store.pruneTrips(now.date);
  const dest = JOURNEYS[key].to(), D = [dest.lon, dest.lat];
  const ids = [...new Set(j.stops.flatMap(s => s.services.map(v => v.id)))];
  const vehicles = await getJSON(`${API}/vehicles.json?service=${ids.join(',')}`);
  const byTrip = new Map();
  for (const v of vehicles) if (v.trip_id) byTrip.set(v.trip_id, v);

  const out = [];
  for (const stop of j.stops) {
    for (const svc of stop.services) {
      const trips = await tripList(svc.id, now.date);
      const heads = new Map(svc.heads.map(h => [h.h, h.off]));
      const wanted = new Set();
      for (const [id, start, h] of trips) {
        if (!heads.has(h)) continue;
        const b = startMins(start) + heads.get(h);
        if (b >= now.mins - 25 && b <= now.mins + 90) wanted.add(id);
      }
      for (const [tid, v] of byTrip) if (v.service_id === svc.id) wanted.add(tid);

      const details = await Promise.all([...wanted].map(id => tripDetail(id).catch(() => null)));
      for (const d of details) {
        if (!d || !d.times || !heads.has(d.headsign)) continue;
        const idx = d.times.findIndex(x => x.stop.atco_code === stop.atco && x.pick_up !== false);
        if (idx < 0) continue;
        const aimedStr = d.times[idx].aimed_departure_time || d.times[idx].aimed_arrival_time;
        if (!aimedStr) continue;
        const aimed = toMins(aimedStr);
        let v = byTrip.get(d.id);
        if (v && Math.abs((v.delay || 0) / 60) > 40) v = null; // tracking matched to the wrong journey
        let delay = 0, live = false, where = '', stopsAway = null, pIdx = -1, estimated = false;
        if (v) {
          live = true;
          delay = (v.delay || 0) / 60;
          const prev = v.progress && v.progress.prev_stop;
          pIdx = prev ? d.times.findIndex(x => x.stop.atco_code === prev) : -1;
          if (pIdx > idx || (pIdx === idx && idx > 0)) continue; // already gone past
          if (pIdx >= 0) { stopsAway = idx - pIdx; where = `Near ${cleanName(d.times[pIdx].stop.name)}`; }
        } else {
          // not tracked: estimate where the bus should be from the timetable
          pIdx = timetablePos(d.times, idx, now.mins, 0);
          if (pIdx >= 0 && pIdx < idx) { stopsAway = idx - pIdx; estimated = true; }
        }
        const expected = aimed + delay;
        if (expected < now.mins - 1.5 || expected > now.mins + 120) continue;
        let arrive = null, off = '';
        for (let k = idx + 1; k < d.times.length; k++) {
          const x = d.times[k], ts = x.aimed_arrival_time || x.aimed_departure_time;
          if (x.set_down === false || !ts) continue;
          const a = j.alight[x.stop.atco_code];
          let w = null, name = '';
          if (a) { w = a[1]; name = a[0]; }
          else if (x.stop.location) { const m = dist(x.stop.location, D); if (m <= NEAR_DEST) { w = estWalk(m); name = stripDistrict(x.stop.name, dest.district); } }
          if (w === null) continue;
          let t = toMins(ts); if (t < aimed - 60) t += 1440;
          const at = t + delay + w;
          if (arrive === null || at < arrive) { arrive = at; off = name; }
        }
        if (arrive === null) continue;
        out.push({ stop, line:svc.line, aimed, delay, live, where, stopsAway, estimated, pIdx, idx, tripId: d.id, svcId: svc.id, times: d.times, expected, arrive, off });
      }
    }
  }
  if (key !== currentKey()) return; // switched while loading
  const seen = new Set();
  buses = out.sort((a, b) => a.expected - b.expected).filter(b => { const k = `${b.stop.atco}|${b.line}|${Math.round(b.aimed)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  lastOk = new Date();
}

