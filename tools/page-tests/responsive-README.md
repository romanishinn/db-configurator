# Responsive audit (`responsive.js`)

`node tools/page-tests/responsive.js` (needs Playwright + Chromium; `NODE_PATH=$(npm root -g)`), about 6-9 minutes.
Matrix: 16 sizes (phone portrait/landscape, tablet, laptop, desktop; touch = `hasTouch+isMobile`, below 1366 px) x pages
(configurator steps + every toolbar popup, landing, crm with and without backend, hub, projects, submit, join) with a stubbed
Supabase SDK, no CDN, no Turnstile. The configurator runs on 6 sizes only (software WebGL is slow; `RESP_FULL_CFG=1` for all).
Checks: A page scroll sideways, B hit-test (3 points, with scrolling; sticky panels), C tap target below 44 px (coarse only),
D text below 12 px, E off-screen / clipped, F fixed+sticky panels above 35 % height on landscape phones, G main action needs nested scroll or is covered,
H console / page errors, I the same as G with all text x1.3 (font size multiplied in JS, not the real OS text scale).
Output: table, top 20, `$RESP_OUT/report.json` (default `<tmp>/resp`), one screenshot per type.
Report mode exits 0; `RESPONSIVE_STRICT=1` exits 1 on any violation. `RESP_PAGES=landing,hub` limits pages; `RESP_INJECT='<css>'` plants a defect to test the checker.
Also via `RESPONSIVE=1 sh tools/page-tests/run.sh` (opt-in, report only).
Limits: Chromium only (no iOS Safari, no real fonts/keyboard/safe areas/touch gestures), stubbed data, logged-in states only for hub/projects/submit,
parked off-canvas drawers and elements behind a full-screen layer (login gate, modal) are not tested (listed as exceptions), 3D scene hits are not judged.
