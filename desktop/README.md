# Desktop (Electron)

Mac-App-Hülle für Studi-Helfer. Zeigt die Oberfläche aus `web/` und stellt ihr über `window.studi` den Hintergrundteil bereit: ILIAS-Login (Schlüsselbund), Kurssuche, Sync, Dateien. Typen: `web/src/lib/desktop.ts`.

```bash
../services/ilias-sync/setup.sh   # einmal: Python-Umgebung mit PFERD
npm install
npm start                          # lädt http://localhost:3000 (vorher "npm run dev" in web/); sonst Testfenster
npm run test-window                # schlichtes Testfenster für den Hintergrundteil
STUDI_DEBUG=1 npm run test-window  # Konsolenausgabe des Fensters im Terminal
```

## Fertige App bauen

```bash
npm run pack   # → dist/Studi-Helfer-<version>-arm64.dmg und dist/mac-arm64/Studi-Helfer.app
```

`scripts/pack.sh` baut den Python-Helfer (`services/ilias-sync/build.sh`, PyInstaller) und die Oberfläche (`next build` mit `output: "standalone"`), legt beides nach `build-resources/` und ruft electron-builder auf. `scripts/after-pack.js` kopiert den UI-Server samt `node_modules` ins `.app`. In der fertigen App startet `lib/ui-server.js` diesen Server auf `127.0.0.1` mit freiem Port. Keine `.env`-Dateien im Paket. Unsigniert: auf anderen Macs beim ersten Öffnen Rechtsklick → Öffnen.

- `main.js`: Fenster (Titelleiste ausgeblendet, 1280×800, min. 1000×700), IPC-Kanäle `studi:*`, nimmt Aufrufe nur von eigenen Seiten an. Sync beim Start, wenn der letzte über 6 h her ist.
- `preload.js`: die Brücke `window.studi`. Nur hier freigeben, was die Oberfläche wirklich braucht.
- `lib/backend.js`: startet `services/ilias-sync` (Python), schreibt `config.json`, liest `state.json`/`runs.jsonl`, listet Dateien, richtet den launchd-Job `de.studihelfer.sync` ein.
- `lib/modules.js`: Module ohne KI (Kurs + Übung + Gruppe), Kurznamen, Art jeder Datei, Zuordnung von Kalender-Terminen. `backend.applyLayout()` richtet die Ordner danach aus.
- `lib/ui-server.js`: startet im Paket den mitgelieferten Next-Server.
- `test/`: Testfenster ohne Design.

Das Uni-Passwort geht von der Oberfläche über IPC und stdin direkt an den Helfer, der es nach erfolgreichem Login im Schlüsselbund ablegt. Es wird nirgends gespeichert oder geloggt.
