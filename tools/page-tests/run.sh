#!/bin/sh
# Runs the browser scenarios of the manager, dealer and landing pages with a STUBBED Supabase SDK and Storage (no network, no real database).
# They prove the page logic and the order of calls, NOT the real Supabase behaviour. Needs Playwright with Chromium
# (in the cloud container it is preinstalled; elsewhere: `npm i -g playwright && npx playwright install chromium`).
# Screenshots and temporary pages go to $OUT (default: the system temp directory).
set -eu
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
fail=0
for f in manager.js manager-extra.js dealer.js landing.js hub.js; do
  echo "== $f"; out=$(node "$f" 2>&1) || { echo "$out" | tail -5; fail=1; continue; }
  echo "$out" | grep -E '^(PASS|FAIL)' | sort | uniq -c | sort -rn | head -3
  echo "$out" | grep -qE '^FAIL|pageerror|Error:' && { echo "$out" | grep -E '^FAIL|pageerror|Error:' | head -5; fail=1; }
done
# optional responsive audit (about 6 minutes): RESPONSIVE=1 sh run.sh; report only (exit 0) unless RESPONSIVE_STRICT=1, see responsive-README.md
[ "${RESPONSIVE:-0}" = 1 ] && { echo "== responsive.js"; node responsive.js 2>&1 | tail -4 || fail=1; }
[ "$fail" = 0 ] && echo "page tests: ok" || { echo "page tests: FAILED"; exit 1; }
