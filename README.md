# Studi-Helfer

Eine Mac-App für Studierende der Uni Köln: App öffnen und sofort sehen, was diese Woche wichtig ist. Hackathon-Projekt (Demo: Sonntag Mittag).

Die Oberfläche ist englisch, damit alle sie nutzen können; Doku und Notizen sind deutsch.

## Was die App kann

- **Dateien aus ILIAS auf dem Mac**: einmal mit der Uni-Kennung anmelden, Kurse wählen, fertig. Alles landet sortiert im Ordner `~/Uni` (Vorlesung, Übung und Übungsgruppe eines Fachs zusammen). Neue und geänderte Dateien kommen von selbst, alte Fassungen werden gesichert.
- **Fristen und Stundenplan ohne KI**: Abgaben und Termine aus dem ILIAS-Kalender, Fristen aus Übungsblättern und Vorlesungszeiten aus den Orga-Folien, alles per Regeln auf dem Mac. Klausur-Countdown, Wahltermine (z. B. Übungsgruppe) zum Anklicken, eigene Termine, Ausblenden mit „Undo“.
- **Startseite „Next 7 days“**: Wochenstreifen in Kursfarben, dringende Abgaben hervorgehoben, Abhaken, 4-Wochen-Ansicht, kurze Zusammenfassung je Kurs.
- **Suche**: Dateien, Fristen und Kurse; versteht auch deutsche Wörter („Klausur“, „Übung“, „Folien“).
- **Mensa**: Speiseplan aller Kölner Mensen mit Preisen, vegan/vegetarisch und Allergenen; mittags eine Zeile auf der Startseite.
- **Mail und Google-Kalender** (optional): Uni-Postfach mit dem ILIAS-Login, Gmail und Google-Kalender per Google-Anmeldung.

## Was wo bleibt

- Das Uni-Passwort liegt nur im Schlüsselbund des Macs und geht nur an ILIAS (und ans Uni-Postfach, falls verbunden).
- Dateien bleiben im Ordner `~/Uni` auf dem Mac, nichts wird hochgeladen.
- Keine KI: Fristen und Zusammenfassungen entstehen mit festen Regeln auf dem Mac.
- Der Mensa-Plan ist öffentlich; die App schickt dabei nichts über dich.

## Installieren (Testversion)

Bei jedem Push auf `main` baut GitHub Actions die App ins Release [„latest“](https://github.com/rayyanmch/studi-helfer/releases/tag/latest): `Studi-Helfer-arm64.dmg` laden, App in „Programme“ ziehen und einmal öffnen. Weil die App noch nicht signiert ist (nur Apple Silicon), meldet macOS „kann nicht überprüft werden“: „Fertig“ klicken, dann Systemeinstellungen → Datenschutz & Sicherheit → unten „Dennoch öffnen“ und mit dem Mac-Passwort bestätigen (seit macOS 15 reicht Rechtsklick → Öffnen nicht mehr). Beim ersten Abruf und nach Updates fragt der Schlüsselbund einmal nach dem Mac-Passwort: „Immer erlauben“. Updates holt die App selbst („Check for updates“ im Menü oben links).

## Entwickeln

```bash
# Oberfläche (Next.js 16, im Browser mit Beispieldaten)
cd web && npm install && npm run dev        # http://localhost:3000

# Mac-App mit echten Daten (zweites Terminal)
cd desktop && ../services/ilias-sync/setup.sh && npm install && npm start
```

Vor jedem Commit in `web/`: `npm run lint` und `npm run build`. Fertige App bauen: `npm run pack` in `desktop/` (siehe [desktop/README.md](desktop/README.md)).

## Aufbau

| Teil | Ordner |
|---|---|
| Oberfläche: Next.js 16, React 19, TypeScript, Tailwind 4 | `web/` |
| Mac-App: Electron, Fenster, Schlüsselbund, Sync-Zeitplan (launchd) | `desktop/` |
| ILIAS-Helfer: Python mit [PFERD](https://github.com/Garmelon/PFERD), Kalender, Regeln für Fristen und Stundenplan, Uni-Mail | `services/ilias-sync/` |

Wie alles zusammenspielt, welche Entscheidungen gefallen sind und welche Stolperfallen es gibt, steht in [NOTIZEN.md](NOTIZEN.md).

## Zusammenarbeit

In Claude Code im Projektordner prompten. Git (Pull, Commit, Push) erledigt Claude über die Hooks in `.claude/`; wer gerade woran arbeitet, steht in [NOTIZEN.md](NOTIZEN.md).

## Team

- [rayyanmch](https://github.com/rayyanmch)
- [Mika-mng](https://github.com/Mika-mng)
