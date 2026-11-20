// ---------- config versions ----------
function migrate(c){
  if (!c) return null;
  if (c.v === 3 && c.journeys && c.journeys.out) return c;
  if (c.v === 2 && Array.isArray(c.stops) && c.work) {
    return { v:3, home:c.home, work:Object.assign({ name:'Work' }, c.work), run:c.run || 0.5,
             journeys:{ out:{ arriveBy:c.arriveBy || '09:00', stops:c.stops, alight:c.alight || {} }, back:null } };
  }
  return null;
}
cfg = migrate(cfg);
const destName = () => (cfg && cfg.work && cfg.work.name) || 'Work';
const JOURNEYS = {
  out:  { from: () => cfg.home, to: () => cfg.work, label: () => `To ${destName()}`, toLabel: () => destName().toLowerCase() },
  back: { from: () => cfg.work, to: () => cfg.home, label: () => 'Home', toLabel: () => 'home' }
};

