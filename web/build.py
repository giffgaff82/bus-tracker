"""Build the single-file web app.

Joins the pieces in web/src/ into web/dist/index.html and copies web/public/
(manifest, service worker, icons) alongside it. Upload everything in web/dist/
to the site (currently iangifford.com/bus/).

    python3 web/build.py
"""
import re, shutil
from pathlib import Path

WEB = Path(__file__).resolve().parent
SRC, PUBLIC, DIST = WEB / 'src', WEB / 'public', WEB / 'dist'
read = lambda name: (SRC / name).read_text(encoding='utf-8')

t = read('template.html')
for k in ['core', 'migrate', 'analyse', 'load']:
    v = read(f'eng_{k}.js')
    if k == 'core':
        v += "\nlet cfg = store.get(KEY, null);\n"
    t = t.replace(f'/*@{k}*/', v)

# figure.js is also loadable from Node for previews; drop its module.exports lines
fig = re.sub(r"^if \(typeof module !== 'undefined'\).*$", "", read('figure.js'), flags=re.M)
ui = read('ui.js')
for part in ['plan', 'rides', 'track', 'widget']:
    ui = ui.replace(f'/*@{part}*/', read(f'{part}.js'))
t = t.replace('/*@figure*/', fig).replace('/*@ui*/', ui).replace('/*@icon*/', read('icon.b64').strip())

DIST.mkdir(exist_ok=True)
(DIST / 'index.html').write_text(t, encoding='utf-8')
for f in PUBLIC.iterdir():
    shutil.copy2(f, DIST / f.name)
print('Built', DIST / 'index.html', f'({len(t):,} bytes)')
