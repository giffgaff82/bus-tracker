# Tests

Browser tests drive the built web app (`web/dist/index.html`) with
[Playwright](https://playwright.dev), a fixed clock and **real** bus data from bustimes.org.

```sh
npm install                 # once, from the repo root
npx playwright install chromium
python3 web/build.py        # build first
node tests/track.test.js    # or any *.test.js
```

Screenshots go to `tests/out/` (git-ignored). `analytics.test.js` checks the consent question and
exactly what would be sent to Google Analytics, without contacting Google.

## Your journeys (kept out of git)

The tests need a saved app setup, which contains home/work and stop details, so it is **not**
in the repository. Save yours as `tests/config.local.json` (git-ignored):

1. Open the app in a desktop browser with your journeys set up.
2. In the developer console run `copy(localStorage.getItem('bw2-config'))`.
3. Paste into `tests/config.local.json`.

`config.example.json` shows the shape with made-up values. Use `TEST_CONFIG=path` to point
somewhere else, and `TEST_DAY=YYYY-MM-DD` to pick the day (default: next Monday; times are UK
winter time).

The Android widget has its own render test – see `android-app/README.md`.
