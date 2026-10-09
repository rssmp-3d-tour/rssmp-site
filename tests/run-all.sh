#!/usr/bin/env bash
# Полная проверка: сборка dist, локальный сервер с правилами .htaccess и все тесты.
# Затем тур проверяется во втором режиме — на временной копии сайта с четырьмя
# разными (синтетическими) панорамами; в dist эта копия не попадает.
# Требуется Node 18+, Python 3 и Chromium для Playwright (npx playwright install chromium).
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent
python3 ../build_pages.py
VARIANT=$(mktemp -d)
node server.mjs ../dist 8095 > /dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER ${SERVER2:-} 2>/dev/null; rm -rf "$VARIANT"' EXIT
sleep 1
BASE=http://localhost:8095
node --check ../static/app.js
node --check ../static/tour-viewer.js
npx html-validate --config htmlvalidate.json ../dist/*.html ../dist/*/index.html
node functional.mjs "$BASE"
node tour.mjs "$BASE" results
node words.mjs "$BASE"
node modes.mjs "$BASE"
node audit.mjs "$BASE" results

echo
echo "=== Режим четырёх отдельных панорам (тестовая копия) ==="
node make-vehicles-variant.mjs .. "$VARIANT"
node server.mjs "$VARIANT/dist" 8096 > /dev/null 2>&1 &
SERVER2=$!
sleep 1
npx html-validate --config htmlvalidate.json "$VARIANT"/dist/tours/index.html
node tour.mjs http://localhost:8096 results-vehicles
