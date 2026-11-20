# Which stop?

A UK bus app that answers one question on the way to work or home: **which stop should I
walk (or run) to, and when do I need to leave?** It uses live bus data from
[bustimes.org](https://bustimes.org), works for any UK operator, and is free.

Live at **https://iangifford.com/bus/**

This repository holds both versions:

| Folder | What it is |
| --- | --- |
| [`web/`](web) | The web app – the whole app is one HTML file, built from the pieces in `web/src/` |
| [`android-app/`](android-app) | The Android app – wraps the live web app and adds real reminders and a home-screen widget |
| [`tests/`](tests) | Browser tests for the web app |
| [`docs/`](docs) | Notes and links |

## Web app

```sh
python3 web/build.py
```

This builds `web/dist/index.html` and copies the manifest, service worker and icons next to it.
**To deploy, upload everything in `web/dist/` to the site.** The built files are committed, so
you can also just download `web/dist/` from GitHub.

Source files in `web/src/`:

| File | Does |
| --- | --- |
| `template.html` | Page structure, styles, and placeholders where the scripts go |
| `eng_core.js` `eng_migrate.js` `eng_analyse.js` `eng_load.js` | The engine: data, storage, finding stops and buses, picking the best one |
| `ui.js` | Screens and navigation |
| `plan.js` | Plan ahead (today / tomorrow) |
| `rides.js` | Logging rides, the "Caught it!" celebration, stats |
| `track.js` | Tracking a bus, reminders |
| `widget.js` | Hands data to the Android widget (only runs inside the Android app) |
| `figure.js` | The animated walk / run / bus-and-tick figures |

## Android app

See [`android-app/README.md`](android-app/README.md). The app loads the live site, so most
changes only need the web app deployed. Rebuild the Android app to change the widget,
reminders, icon or permissions.

The signing key is **not** in this repository – keep `whichstop.keystore` safe and private.

## Automatic builds (GitHub Actions)

- **Web preview** – every change to `web/` is published to
  **https://giffgaff82.github.io/bus-tracker/** so you can try it before uploading to the live
  site. It keeps its own saved journeys (set it up once, or use *Use on another phone*).
- **Android app** – every change to `android-app/` builds a signed APK and pictures of every
  widget state (Actions tab → the run → *Artifacts*).
- **Releases** – to publish an APK you can download on your phone: bump `versionCode` and
  `versionName` in `android-app/android/app/build.gradle` and commit, then on GitHub go to
  Actions → *Android app* → **Run workflow** and type the version (e.g. `1.2`). It appears
  under *Releases*.

Signing uses four repository secrets (Settings → Secrets and variables → Actions):
`WHICHSTOP_KEYSTORE_BASE64`, `WHICHSTOP_KEYSTORE_PASSWORD`, `WHICHSTOP_KEY_ALIAS`,
`WHICHSTOP_KEY_PASSWORD`.

## Privacy

Personal journeys live only in each person's browser (`localStorage`). Nothing personal is
committed here: test setups are kept in git-ignored files (see [`tests/README.md`](tests/README.md)).
