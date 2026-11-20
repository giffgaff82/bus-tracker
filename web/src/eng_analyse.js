// ---------- setup: find buses ----------
const START_WALK_MAX = 12;  // minutes to the first stop
let found = null;           // {home, work, journeys:{out:{...}, back:{...}}}

const bbox = (c, m) => { const dLat = m / 111000, dLon = dLat / Math.cos(c[1] * Math.PI / 180); return `ymin=${(c[1]-dLat).toFixed(5)}&ymax=${(c[1]+dLat).toFixed(5)}&xmin=${(c[0]-dLon).toFixed(5)}&xmax=${(c[0]+dLon).toFixed(5)}`; };
const toStops = j => (j.features || []).filter(f => f.properties && f.properties.url && f.properties.services && f.properties.services.length).map(f => ({
  atco: f.properties.url.split('/').filter(Boolean).pop(), name: cleanName(f.properties.name), indicator: f.properties.indicator || '',
  lines: f.properties.services, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
const stripDistrict = (n, dd) => { n = cleanName(n); return dd && n.toLowerCase().startsWith(dd.toLowerCase() + ' ') && n.length > dd.length + 6 ? n.slice(dd.length + 1) : n; };

// Works out every direct bus from stops near `from` to stops near `to`.
// time: minutes; mode 'arrive' (arrive by time) or 'leave' (leave at time) — used to sample typical journeys.
async function analyse({ from, to, fromWord, toWord, time, mode, say }){
  const F = [from.lon, from.lat], T = [to.lon, to.lat];
  const sampleAt = mode === 'arrive' ? time - 45 : time + 5;
  const noBus = `None of the buses near ${fromWord} go near ${toWord}. You might need to change buses, which this app doesn't handle yet.`;

  say(`Finding bus stops near ${fromWord}…`);
  let near = toStops(await getJSON(`${API}/stops.json?${bbox(F, 750)}`));
  near.forEach(s => { s.d = dist(F, [s.lon, s.lat]); s.name = stripDistrict(s.name, from.district); });
  near = near.filter(s => s.d <= 1000).sort((a, b) => a.d - b.d).slice(0, 25);
  if (!near.length) throw new Error(`We couldn't find any bus stops near ${fromWord}.`);

  say(`Finding the buses that serve ${toWord}…`);
  const destStops = toStops(await getJSON(`${API}/stops.json?${bbox(T, 1100)}`)).filter(s => dist(T, [s.lon, s.lat]) <= NEAR_DEST);
  const destLines = new Set(destStops.flatMap(s => s.lines));
  near = near.filter(s => s.lines.some(l => destLines.has(l)));
  if (!near.length) throw new Error(noBus);

  say(`Working out the walk to each stop near ${fromWord}…`);
  const m = await walkTable([F], near.map(s => [s.lon, s.lat]));
  near.forEach((s, i) => s.walk = halfMin(m[0][i]));
  near = near.filter(s => s.walk <= START_WALK_MAX);
  if (!near.length) throw new Error(`No useful bus stops within a ${START_WALK_MAX}-minute walk of ${fromWord}.`);
  const byAtco = new Map(near.map(s => [s.atco, s]));

  say(`Looking up the routes near ${fromWord}…`);
  const services = new Map();
  await pool(near, 4, async s => {
    const j = await getJSON(`${API}/api/services/?stops=${encodeURIComponent(s.atco)}`);
    for (const v of j.results || []) if (destLines.has(v.line_name)) services.set(v.id, v);
  });
  const svcList = [...services.values()];
  if (!svcList.length) throw new Error('We couldn\'t find route details for those stops. Try again in a minute.');

  const today = londonNow().date, raw = [], cands = new Map();
  let done = 0;
  await pool(svcList, 3, async svc => {
    let trips = [];
    for (let i = 0; i < 4 && !trips.length; i++) trips = await tripList(svc.id, addDays(today, i));
    const heads = new Map();
    for (const tr of trips) if (tr[2]) { if (!heads.has(tr[2])) heads.set(tr[2], []); heads.get(tr[2]).push(tr); }
    for (const [h, list] of heads) {
      if (list.length < 3) continue; // school runs and other rare journeys
      const sample = list.slice().sort((a, b) => Math.abs(startMins(a[1]) - sampleAt) - Math.abs(startMins(b[1]) - sampleAt))[0];
      const d = await tripDetail(sample[0]).catch(() => null);
      if (!d || !d.times) continue;
      const times = d.times, start = startMins(sample[1]) % 1440;
      times.forEach((x, i) => {
        const stop = byAtco.get(x.stop.atco_code), bt = x.aimed_departure_time || x.aimed_arrival_time;
        if (!stop || x.pick_up === false || !bt) return;
        const later = [];
        for (const y of times.slice(i + 1)) {
          const t = y.aimed_arrival_time || y.aimed_departure_time;
          if (y.set_down === false || !t || !y.stop.location || dist(y.stop.location, T) > NEAR_DEST) continue;
          later.push({ atco: y.stop.atco_code, t: toMins(t) });
          cands.set(y.stop.atco_code, { name: stripDistrict(y.stop.name, to.district), lon: y.stop.location[0], lat: y.stop.location[1] });
        }
        if (!later.length) return;
        let off = toMins(bt) - start; if (off < 0) off += 1440;
        raw.push({ stop, svc, h, off, board: toMins(bt), later, perDay: list.length });
      });
    }
    say(`Checking routes to ${toWord}… ${++done} of ${svcList.length}`);
  });
  if (!raw.length) throw new Error(noBus);

  say(`Working out the walk to ${toWord}…`);
  const ids = [...cands.keys()];
  const wm = await walkTable(ids.map(a => [cands.get(a).lon, cands.get(a).lat]), [T]);
  ids.forEach((a, i) => cands.get(a).walk = halfMin(wm[i][0]));

  const opts = new Map();
  for (const r of raw) {
    let best = null;
    for (const l of r.later) {
      const c = cands.get(l.atco); if (!c || c.walk > MAX_DEST_WALK) continue;
      let ride = l.t - r.board; if (ride < 0) ride += 1440;
      const total = r.stop.walk + ride + c.walk;
      if (!best || total < best.total) best = { total, ride, off: c.name, walk: c.walk };
    }
    if (!best) continue;
    const key = `${r.stop.atco}|${r.svc.id}`;
    const o = opts.get(key) || { key, stop: r.stop, svc: r.svc, heads: [], best, perDay: 0 };
    if (!o.heads.some(x => x.h === r.h)) { o.heads.push({ h: r.h, off: r.off }); o.perDay += r.perDay; }
    if (best.total < o.best.total) o.best = best;
    opts.set(key, o);
  }
  const options = [...opts.values()].sort((a, b) => (Math.round(a.best.total) - Math.round(b.best.total)) || (a.stop.walk - b.stop.walk));
  if (!options.length) throw new Error(`None of the buses near ${fromWord} stop within a 20-minute walk of ${toWord}.`);
  const alight = {};
  for (const a of ids) if (cands.get(a).walk <= MAX_DEST_WALK + 5) alight[a] = [cands.get(a).name, cands.get(a).walk];
  return { options, alight };
}

