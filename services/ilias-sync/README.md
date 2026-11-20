# ILIAS-Sync (Hintergrundteil)

Python-Helfer, den die Mac-App (`desktop/`) startet. Er meldet sich bei ILIAS Köln an, findet die eigenen Kurse und lädt deren Dateien mit [PFERD](https://github.com/Garmelon/PFERD) (v3.10.1, MIT) in den gewählten Ordner.

```bash
./setup.sh   # einmal: legt .venv an und installiert PFERD
```

## Befehle

Alle Ausgaben sind JSON-Zeilen (`{"type":"result",…}` oder `{"type":"error","code":…,"message":…}`).

```bash
.venv/bin/python -m studi_sync login --username KENNUNG   # Passwort über stdin, landet im Schlüsselbund
.venv/bin/python -m studi_sync courses [--dump]            # eigene Kurse (--dump speichert die HTML-Seiten zur Fehlersuche)
.venv/bin/python -m studi_sync sync [--auto]               # ein Sync-Lauf
.venv/bin/python -m studi_sync logout --username KENNUNG
```

## Wie es funktioniert

- **Passwort** nur im macOS-Schlüsselbund (Eintrag „Studi-Helfer ILIAS“, Konto = Uni-Kennung). Es kommt per stdin, nie als Argument, und wird nicht geloggt. PFERD liest es selbst über `type = keyring` und fragt nie nach: fehlt es oder ist es falsch, endet der Lauf mit Status `login`.
- **Kurse finden**: PFERD kann das Dashboard in Köln nicht lesen. `ilias.py` meldet sich selbst an (wie PFERD) und liest „Meine Kurse und Gruppen“. Das Semester wird aus Titel/Zeitraum erraten (`WiSe 2026/27`, `WS26_27`, `SoSe 2026`, Datumsbereiche); Kurse des aktuellen Semesters werden vorgeschlagen.
- **Sync**: Aus `config.json` (schreibt die App) wird `pferd.cfg` erzeugt, ein Crawler pro Kurs. Ordner: `<Zielordner>/<Kurs>/…` wie in ILIAS, ohne versteckte Dateien und HTML-Seiten. `on_conflict = local-first`: eigene Änderungen gewinnen, lokal wird nie etwas gelöscht. Videos pro Kurs abschaltbar (Standard aus).
- **Köln-Korrekturen für PFERD** (`pferd_run.py`): werden zur Laufzeit eingesetzt, nicht in die installierten Dateien geschrieben (ILIAS unter `/ilias`, Link-Auflösung bei `links = ignore`, nie interaktiv nachfragen).
- **Täglicher Lauf**: launchd-Job `de.studihelfer.sync` (richtet die App ein) startet `sync --auto`: Zufallsverzögerung, wartet auf Netz, bis zu 3 Versuche, Mitteilung bei neuen Dateien.

Daten liegen in `~/Library/Application Support/Studi-Helfer/`: `config.json`, `pferd.cfg`, `state.json` (laufender Sync), `runs.jsonl` (ein Eintrag pro Lauf), `logs/`.
