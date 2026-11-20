# Desktop (Electron)

Mac-App-Hülle für Studi-Helfer. Zeigt die Oberfläche aus `web/` und stellt ihr über `window.studi` den Hintergrundteil bereit: ILIAS-Login (Schlüsselbund), Kurssuche, Sync, Dateien. Typen: `web/src/lib/desktop.ts`.

```bash
../services/ilias-sync/setup.sh   # einmal: Python-Umgebung mit PFERD
npm install
npm start                          # lädt http://localhost:3000 (vorher "npm run dev" in web/); sonst Testfenster
npm run test-window                # schlichtes Testfenster für den Hintergrundteil
STUDI_DEBUG=1 npm run test-window  # Konsolenausgabe des Fensters im Terminal
```

- `main.js`: Fenster (Titelleiste ausgeblendet, 1280×800, min. 1000×700), IPC-Kanäle `studi:*`, nimmt Aufrufe nur von eigenen Seiten an. Sync beim Start, wenn der letzte über 6 h her ist.
- `preload.js`: die Brücke `window.studi`. Nur hier freigeben, was die Oberfläche wirklich braucht.
- `lib/backend.js`: startet `services/ilias-sync` (Python), schreibt `config.json`, liest `state.json`/`runs.jsonl`, listet Dateien, richtet den launchd-Job `de.studihelfer.sync` ein.
- `test/`: Testfenster ohne Design.

Das Uni-Passwort geht von der Oberfläche über IPC und stdin direkt an den Helfer, der es nach erfolgreichem Login im Schlüsselbund ablegt. Es wird nirgends gespeichert oder geloggt.
