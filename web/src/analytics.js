// ---------- usage stats (Google Analytics 4) ----------
// Only on the live site, and only what the person allows:
//  - not asked yet  -> Google's consent mode sends cookie-free, anonymous pings
//  - "Allow"        -> normal analytics cookies
//  - "No thanks"    -> nothing is sent at all
// Never sent: addresses, postcodes, stop names, times or anything else about a journey.
const GA_ID = 'G-X6NE7RJ86W';
const STATS_KEY = 'bw2-stats-consent';
const statsOn = ['iangifford.com', 'www.iangifford.com'].includes(location.hostname) && !navigator.webdriver;
const SCREEN_NAMES = { now: 'Now', stops: 'Stops', plan: 'Plan ahead', stats: 'Your rides', settings: 'Settings', setup: 'Setup', track: 'Tracker' };

function statsChoice(){ try { return localStorage.getItem(STATS_KEY); } catch { return null; } }
window.dataLayer = window.dataLayer || [];
function gtag(){ window.dataLayer.push(arguments); }

if (statsOn) {
  const allowed = statsChoice() === 'granted';
  gtag('consent', 'default', { analytics_storage: allowed ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('js', new Date());
  gtag('config', GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const installed = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
  gtag('set', 'user_properties', { app_platform: NATIVE ? 'android_app' : installed ? 'home_screen' : 'browser' });
  const s = document.createElement('script');
  s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

function stat(name, params){
  if (!statsOn || statsChoice() === 'denied') return;
  gtag('event', name, params || {});
}
let lastScreen = null;
function statScreen(v){
  if (!v || v === lastScreen) return;
  lastScreen = v;
  stat('page_view', { page_title: SCREEN_NAMES[v] || v, page_location: `${location.origin}${location.pathname}#${v}` });
}

function setStatsChoice(c){
  try { localStorage.setItem(STATS_KEY, c); } catch {}
  if (statsOn) gtag('consent', 'update', { analytics_storage: c === 'granted' ? 'granted' : 'denied' });
  renderConsent();
}

// the one-off question on the Now screen, and the switch in Settings
function renderConsent(){
  const card = $('consent'), panel = $('stats-panel');
  if (card) card.hidden = !(statsOn && cfg && statsChoice() === null);
  if (panel) panel.hidden = !statsOn;
  const on = statsChoice() === 'granted';
  document.querySelectorAll('#stats-seg button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.stats === 'granted') === on)));
}
$('consent-yes').addEventListener('click', () => setStatsChoice('granted'));
$('consent-no').addEventListener('click', () => setStatsChoice('denied'));
document.querySelectorAll('#stats-seg button').forEach(b => b.addEventListener('click', () => setStatsChoice(b.dataset.stats)));
