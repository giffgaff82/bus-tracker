const API = 'https://bustimes.org';
const OSRM = 'https://routing.openstreetmap.de/routed-foot';
const KEY = 'bw2-config';
const BUFFER = 0.5;          // minutes spare at the stop
const NEAR_DEST = 1600;      // metres: stops this close to the destination count as "get off here"
const MAX_DEST_WALK = 20;    // minutes: a direction "goes near" the destination if a stop is within this walk
const $ = id => document.getElementById(id);

// ---------- storage ----------
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  pruneTrips(date){ try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('bw2-trips-') && k.slice(-10) < date) localStorage.removeItem(k); } } catch {} }
};

// ---------- helpers ----------
function el(tag, props = {}, ...kids){
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
const fmt = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
function londonNow(){
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date:`${p.year}-${p.month}-${p.day}`, mins: +p.hour*60 + +p.minute + +p.second/60 };
}
function addDays(date, n){ const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const toMins = s => { const [h, m] = s.split(':').map(Number); return h*60 + m; };
const startMins = s => { const p = String(s).trim().split(' '); return p.length > 1 ? +p[0]*1440 + toMins(p[1]) : toMins(p[0]); };
const hhmm = m => { m = Math.round(m); const h = Math.floor(m/60) % 24, mm = ((m % 60) + 60) % 60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };
const halfMin = m => Math.max(0.5, Math.round(m * 2) / 2);
const fmtMin = m => `${String(m).replace('.5', '½')} min`;
const cleanName = s => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
function dist(a, b){ // [lon, lat] -> metres
  const r = Math.PI / 180, dLat = (b[1]-a[1])*r, dLon = (b[0]-a[0])*r;
  const x = Math.sin(dLat/2)**2 + Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dLon/2)**2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}
const estWalk = metres => metres * 1.35 / 75; // minutes, for when walking routes are unavailable

async function getJSON(url){
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${new URL(url).hostname} replied ${r.status}`);
  return r.json();
}
async function postcode(pc){
  const clean = String(pc || '').replace(/\s+/g, '').toUpperCase();
  if (!clean) throw new Error('Enter both postcodes.');
  let j = null, ok = false;
  try { const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`); ok = r.ok; j = await r.json(); }
  catch { throw new Error('Couldn\'t reach the postcode lookup. Check your connection.'); }
  if (!ok || !j || !j.result) throw new Error(`"${pc}" isn't a postcode we recognise.`);
  return { pc: j.result.postcode, lon: j.result.longitude, lat: j.result.latitude, district: j.result.admin_district || '' };
}
let approxWalks = false; // set when walking routes were unavailable and we estimated instead
async function valhalla(origins, dests){
  const q = { sources: origins.map(c => ({lon:c[0], lat:c[1]})), targets: dests.map(c => ({lon:c[0], lat:c[1]})), costing:'pedestrian' };
  const j = await getJSON(`https://valhalla1.openstreetmap.de/sources_to_targets?json=${encodeURIComponent(JSON.stringify(q))}`);
  return j.sources_to_targets.map(row => row.map(c => c && c.time != null ? c.time / 60 : null));
}
async function osrm(origins, dests){
  const coords = [...origins, ...dests].map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';');
  const src = origins.map((_, i) => i).join(';'), dst = dests.map((_, i) => i + origins.length).join(';');
  const j = await getJSON(`${OSRM}/table/v1/foot/${coords}?sources=${src}&destinations=${dst}&annotations=duration`);
  return j.durations.map(row => row.map(s => s == null ? null : s / 60));
}
async function walkTable(origins, dests){ // minutes, rows = origins; dests chunked to keep requests small
  const out = origins.map(() => []);
  for (let i = 0; i < dests.length; i += 20) {
    const part = dests.slice(i, i + 20);
    let m = null;
    try { m = await valhalla(origins, part); } catch { try { m = await osrm(origins, part); } catch {} }
    origins.forEach((o, r) => part.forEach((d, k) => {
      let v = m && m[r] ? m[r][k] : null;
      if (v == null) { approxWalks = true; v = estWalk(dist(o, d)); }
      out[r].push(v);
    }));
  }
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pool(items, n, fn){
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } } }));
  return out;
}
let lastNominatim = 0;
async function nominatim(params){
  const wait = 1100 - (Date.now() - lastNominatim); if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const j = await getJSON(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(Object.assign({countrycodes:'gb', format:'jsonv2', limit:'1'}, params))}`);
  return j && j[0] ? { lon: +j[0].lon, lat: +j[0].lat } : null;
}
async function geocode(line, pc){
  const p = await postcode(pc);
  line = String(line || '').trim();
  if (line) {
    const tries = [{street:line, postalcode:p.pc}, {q:`${line}, ${p.pc}`}, {q:`${line}, ${p.district || ''}`}];
    for (const t of tries) {
      try {
        const r = await nominatim(t);
        if (r && dist([r.lon, r.lat], [p.lon, p.lat]) < 1500) return { pc:p.pc, lon:r.lon, lat:r.lat, label:`${line}, ${p.pc}`, exact:true, district:p.district };
      } catch {}
    }
  }
  return { pc:p.pc, lon:p.lon, lat:p.lat, label:p.pc, exact:false, tried: !!line, district:p.district };
}
async function tripList(svc, date){
  const key = `bw2-trips-${svc}-${date}`;
  const cached = store.get(key, null);
  if (cached) return cached;
  let url = `${API}/api/trips/?service=${svc}&date=${date}`, out = [];
  while (url) { const r = await getJSON(url); out = out.concat(r.results.map(t => [t.id, t.start, t.headsign])); url = r.next; }
  store.set(key, out);
  return out;
}
const tripCache = new Map();
function tripDetail(id){
  if (!tripCache.has(id)) tripCache.set(id, getJSON(`${API}/api/trips/${id}/`).catch(e => { tripCache.delete(id); throw e; }));
  return tripCache.get(id);
}
