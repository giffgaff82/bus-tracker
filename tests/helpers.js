// Shared bits for the browser tests (Playwright).
// Your journeys are personal, so they are not in the repo: put a saved config in
// tests/config.local.json (git-ignored) – see tests/README.md.
const fs = require('fs'), path = require('path'), http = require('http');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'web', 'dist');

function config() {
  const f = process.env.TEST_CONFIG || path.join(__dirname, 'config.local.json');
  if (!fs.existsSync(f)) {
    console.error(`No test config at ${f}.\nCopy tests/config.example.json and fill it in (see tests/README.md).`);
    process.exit(2);
  }
  return fs.readFileSync(f, 'utf8');
}

// Fixed clock for repeatable tests. TEST_DAY=YYYY-MM-DD (default: next Monday).
function day() {
  if (process.env.TEST_DAY) return process.env.TEST_DAY;
  const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
const at = hhmm => new Date(`${day()}T${hhmm}:00Z`);   // UTC = UK time in winter

// Tiny static server for web/dist (run `python3 web/build.py` first).
function serve(port = 8765) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(port, () => r({ url: `http://localhost:${port}/`, close: () => srv.close() })));
}

const out = name => { const d = path.join(__dirname, 'out'); fs.mkdirSync(d, { recursive: true }); return path.join(d, name); };

module.exports = { config, at, day, serve, out };
