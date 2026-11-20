# ILIAS-Sync (PFERD)

Kleiner Python-Dienst, der mit [PFERD](https://github.com/Garmelon/PFERD) (MIT-Lizenz) Dateien aus dem ILIAS der Uni Köln lädt. Die Web-App ruft ihn auf, lädt die Folien nach Supabase Storage und gibt sie an die KI weiter (Termine und Merkzettel).

PFERD lädt nur Dateien. Termine holen wir zusätzlich über den persönlichen iCal-Export aus dem ILIAS-Kalender.

## Lokal ausprobieren

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp pferd.example.cfg pferd.cfg
pferd --config pferd.cfg
```

Beim ersten Lauf fragt PFERD nach Uni-Account und Passwort. `pferd.cfg` und der Download-Ordner `ilias-dateien/` werden nicht committet.

## Status

- [x] PFERD-Konfiguration für ILIAS Köln (`login_type = local`, `client_id = uk`; aus der Login-Seite abgeleitet, mit echtem Account noch nicht getestet)
- [ ] HTTP-API (FastAPI): Sync starten, Dateiliste liefern
- [ ] Zugangsdaten nur pro Sync im Speicher halten, nie in Klartext ablegen
