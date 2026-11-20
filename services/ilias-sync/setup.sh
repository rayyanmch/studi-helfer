#!/usr/bin/env bash
# Richtet die Python-Umgebung für den Hintergrundteil ein (einmal pro Rechner).
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python -c "import studi_sync, PFERD; print('Python-Umgebung bereit (PFERD', PFERD.__version__ if hasattr(PFERD, '__version__') else '', ')')"
