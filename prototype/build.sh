#!/usr/bin/env bash
# Build the single-file 3D prototype: bundles @db/core for the browser and inlines the price data.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=prototype/dist; mkdir -p "$OUT"
npx -y esbuild@0.24.0 packages/core/src/index.ts --bundle --format=iife --global-name=DBCore --platform=browser --target=es2020 --minify --outfile="$OUT/dbcore.js"
python3 - <<'PY'
import json, glob
d = 'data/sunwinner/2026-07'
cat = {'tables': [json.load(open(f)) for f in sorted(glob.glob(d + '/tables/*.json'))], 'coating': json.load(open(d + '/coating.json')), 'colors': json.load(open(d + '/colors.json')), 'fabrics': json.load(open(d + '/fabrics.json')), 'screenMotors': json.load(open(d + '/screen-motors.json')), 'screenControls': json.load(open(d + '/screen-controls.json'))}
t = open('prototype/terrace-3d.tpl.html').read()
t = t.replace('/*CORE*/', open('prototype/dist/dbcore.js').read()).replace('/*CATALOG*/', 'const CATALOG_JSON=' + json.dumps(cat, separators=(',', ':')) + ';')
open('prototype/dist/terrace-3d.html', 'w').write(t)
PY
echo "built prototype/dist/terrace-3d.html"
