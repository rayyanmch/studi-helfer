#!/usr/bin/env bash
# Baut die fertige Mac-App: dist/mac-arm64/Ordo.app und dist/Ordo-<version>-arm64.dmg
# 1. Python-Helfer als Programm (services/ilias-sync/build.sh)
# 2. Oberfläche als Next-Standalone-Server (web: next build)
# 3. electron-builder packt beides als Resources/studi-sync und Resources/ui ins .app
# Unsigniert: auf anderen Macs beim ersten Öffnen Rechtsklick → Öffnen.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"

echo "1/3 Python-Helfer bauen"
"$ROOT/services/ilias-sync/build.sh"

echo "2/3 Oberfläche bauen"
(cd "$ROOT/web" && npm run build >/dev/null)

rm -rf build-resources
mkdir -p build-resources
cp -R "$ROOT/services/ilias-sync/dist/studi-sync" build-resources/studi-sync
cp -R "$ROOT/web/.next/standalone" build-resources/ui
mkdir -p build-resources/ui/.next
cp -R "$ROOT/web/.next/static" build-resources/ui/.next/static
[ -d "$ROOT/web/public" ] && cp -R "$ROOT/web/public" build-resources/ui/public
# Secrets gehören nie ins Paket.
find build-resources/ui -name '.env*' -maxdepth 2 -print -delete

echo "3/3 App packen"
npx electron-builder --mac --publish never
ls -la dist | grep -E '\.dmg|mac'
