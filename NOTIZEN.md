# Projektnotizen

Gemeinsames Gedächtnis für alle KI-Agenten und Menschen im Projekt. Wird über `CLAUDE.md` automatisch geladen.
**Agenten:** Wenn du etwas Wichtiges herausfindest oder entscheidest (Stolperfalle, Architektur, verworfene Idee, externe Eigenheit), trag es hier kurz ein: mit Datum, eine Zeile pro Punkt, Neues oben. Veraltetes löschen statt stapeln.

## In Arbeit

Wer gerade woran arbeitet (Person, Aufgabe, betroffene Dateien). Eintragen beim Start, löschen wenn fertig.

- Rayyan: Desktop-Gerüst (Electron) und ILIAS-Login. Dateien: `desktop/`, `services/ilias-sync/`.

## Entscheidungen

- 2026-11-20: **Mac-App mit Electron statt reiner Web-App.** Eine Website kann sich nicht bei ILIAS einloggen, keine Passwörter sicher ablegen und keine Ordner auf dem Mac befüllen. Electron packt die Oberfläche aus `web/` (React/Tailwind) in eine echte Mac-App; ein Hintergrundteil (`desktop/`, kommt noch) erledigt Login, PFERD, Dateien und Sync. **ILIAS-Zugangsdaten bleiben lokal im macOS-Schlüsselbund**, nie auf einem Server. Kostenlos; Apple-Signierung (Developer Program, kostenpflichtig) erst nötig, wenn andere die App installieren sollen. Offen: wie Next.js in Electron eingebunden wird, und ob KI-Aufrufe später über einen eigenen Server laufen (der API-Key darf nicht in die ausgelieferte App).
- 2026-11-20: **Git macht Claude, nicht die Menschen.** Alle arbeiten auf `main`. Hooks in `.claude/settings.json` holen vor jedem Prompt den neuesten Stand und verlangen am Ende jeder Antwort Commit und Push. Die Hooks brauchen `bash` und `git` (macOS/Linux, unter Windows Git Bash).
- 2026-11-20: **Web-App statt Rust.** Next.js/TypeScript ist in zwei Tagen viel schneller gebaut, KI-Agenten können es am besten, und für Supabase, Claude und UI-Komponenten gibt es fertige Pakete. Rust bringt hier keinen Vorteil. Desktop-Hülle ist Electron (siehe oben), nicht Tauri.
- 2026-11-20: **Mac zuerst** (Electron-Fenster auf dem Laptop). Handy später.
- 2026-11-20: **Supabase** für Daten, Login und Datei-Speicher (Folien).
- 2026-11-20: **KI = Claude API, nur serverseitig.** Die App bezahlt die Aufrufe zentral, Nutzer brauchen keinen Key. Modell über `AI_MODEL` (Standard `claude-opus-5-5`). Günstiger: `claude-sonnet-5-5` oder `claude-haiku-5-5`. PDFs gehen direkt als `document`-Block an die API, kein eigenes PDF-Parsing nötig.
- 2026-11-20: **ILIAS über PFERD** (v3.10.1, MIT) als Python-Dienst statt eigenem Scraper. PFERD lädt nur Dateien; Termine kommen aus dem iCal-Export des ILIAS-Kalenders.

## Design (für Mika)

- Es wird ein **Mac-App-Fenster, keine Website**: keine Landingpage, kein Marketing, kein Cookie-Banner, keine Browser-Navigation. Eher wie Notion oder Slack: Seitenleiste links, Inhalt rechts.
- Auf Laptop auslegen (ca. 1280×800), sollte bis ca. 1000×700 schrumpfen können.
- Oben links Platz für die Mac-Fensterknöpfe (rot/gelb/grün) lassen, falls wir die Titelleiste ausblenden.
- Screens:
  1. **ILIAS-Login**: Uni-Kennung + Passwort, Hinweis „Deine Zugangsdaten bleiben im Schlüsselbund deines Macs.“ Zustände: lädt, falsches Passwort, ILIAS nicht erreichbar.
  2. **Ersteinrichtung**: Zielordner wählen (Standard `~/Uni`), Kurse dieses Semesters anzeigen und an-/abwählen.
  3. **Erster Import**: kann mehrere Minuten dauern, deshalb Fortschritt pro Kurs (x von y Dateien), App bleibt bedienbar.
  4. **Übersicht**: Kurse → Ordner → Dateien, „Neu seit letztem Sync“ hervorheben, Aktionen „Öffnen“ und „Im Finder zeigen“.
  5. **Sync-Status**, immer sichtbar (z. B. unten in der Seitenleiste): letzter Sync, läuft gerade, Fehler, Button „Jetzt synchronisieren“.
- Fehlerzustände mitdesignen: offline, Login abgelaufen, einzelner Kurs fehlgeschlagen.
- Die Daten liefert später der Hintergrundteil. Bis dahin mit Beispieldaten arbeiten (Kurse wie „Softwaretechnik“, „BWL“, „Mathematik für Informatik I“; Dateien wie Folien-PDFs und Übungsblätter). Die genaue Datenform legen wir in `web/src/lib/` fest, sobald der Login steht.
- Kalender und KI-Merkzettel kommen danach, für jetzt nicht nötig.

## Wissen und Stolperfallen

- ILIAS Uni Köln: `base_url = https://www.ilias.uni-koeln.de/ilias`, Login-Seite nutzt `client_id=uk`, deshalb PFERD mit `login_type = local`. Die Config parst, ein echter Login ist noch nicht getestet.
- Next.js 16: `npx tsc --noEmit` meldet `Cannot find name 'LayoutProps'`, solange `.next/types` fehlt. Diese Typen erzeugt erst `next build`/`next dev`. Kein echter Fehler.
- `web/AGENTS.md` wird von `next dev` neu geschrieben. Nicht von Hand ändern.
- Strukturierte KI-Antworten: `client.beta.messages.parse` + `betaZodOutputFormat` (siehe `extractFromSlides` in `web/src/lib/ai.ts`).

## Offen

- [ ] Rolle von Supabase klären: Dateien und ILIAS-Login liegen jetzt lokal. Braucht die App überhaupt ein eigenes Konto?
- [ ] Supabase-Projekt anlegen, Keys in `.env.local` beider Rechner
- [ ] Anthropic-API-Key besorgen
- [ ] PFERD mit echtem Uni-Account gegen ILIAS Köln testen
- [ ] Aufteilen, wer was baut (siehe „In Arbeit“)
