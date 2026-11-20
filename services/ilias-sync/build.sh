#!/usr/bin/env bash
# Baut den Python-Helfer als eigenständiges Programm (dist/studi-sync/studi-sync), das die Mac-App mitliefert.
# Studis brauchen dann kein Python. Voraussetzung: ./setup.sh wurde einmal ausgeführt.
set -euo pipefail
cd "$(dirname "$0")"
.venv/bin/pip install -q "pyinstaller>=6.10"
rm -rf build dist
.venv/bin/pyinstaller --noconfirm --clean --onedir --name studi-sync \
  --collect-submodules PFERD \
  --collect-submodules keyring.backends \
  --copy-metadata keyring \
  --copy-metadata PFERD \
  --collect-data certifi \
  --log-level WARN \
  entry.py
echo "Fertig: $(du -sh dist/studi-sync | cut -f1) in dist/studi-sync"
