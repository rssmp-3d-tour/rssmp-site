#!/usr/bin/env bash
# Полная проверка: сборка dist, локальный сервер с правилами .htaccess и все тесты.
# Затем тур проверяется на временных копиях сайта (в dist они не попадают): выбор B/C
# с четырьмя синтетическими панорамами без двора и демо-режим.
# Требуется Node 18+, Python 3 и Chromium для Playwright (npx playwright install chromium).
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent
python3 ../build_pages.py
VARIANT=$(mktemp -d)
DEMO=$(mktemp -d)
node server.mjs ../dist 8095 > /dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER ${SERVER2:-} ${SERVER3:-} 2>/dev/null; rm -rf "$VARIANT" "$DEMO"' EXIT
sleep 1
BASE=http://localhost:8095
node --check ../static/app.js
node --check ../static/tour-viewer.js
node security.mjs
npx html-validate --config htmlvalidate.json ../dist/*.html ../dist/*/index.html
node functional.mjs "$BASE"
node tour.mjs "$BASE" results
node words.mjs "$BASE"
node modes.mjs "$BASE"
node audit.mjs "$BASE" results

echo
echo "=== Выбор B/C без двора, синтетические панорамы (тестовая копия) ==="
node make-vehicles-variant.mjs .. "$VARIANT"
node server.mjs "$VARIANT/dist" 8096 > /dev/null 2>&1 &
SERVER2=$!
sleep 1
npx html-validate --config htmlvalidate.json "$VARIANT"/dist/tours/index.html
node tour.mjs http://localhost:8096 results-vehicles

echo
echo "=== Демо-режим (тестовая копия) ==="
node make-vehicles-variant.mjs .. "$DEMO" demo
node server.mjs "$DEMO/dist" 8097 > /dev/null 2>&1 &
SERVER3=$!
sleep 1
npx html-validate --config htmlvalidate.json "$DEMO"/dist/tours/index.html
node tour.mjs http://localhost:8097 results-demo
