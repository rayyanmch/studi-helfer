# Projektnotizen

Gemeinsames Gedächtnis für alle KI-Agenten und Menschen im Projekt. Wird über `CLAUDE.md` automatisch geladen.
**Agenten:** Wenn du etwas Wichtiges herausfindest oder entscheidest (Stolperfalle, Architektur, verworfene Idee, externe Eigenheit), trag es hier kurz ein: mit Datum, eine Zeile pro Punkt, Neues oben. Veraltetes löschen statt stapeln.

## In Arbeit

Wer gerade woran arbeitet (Person, Aufgabe, betroffene Dateien). Eintragen beim Start, löschen wenn fertig.

- Rayyan: Desktop-Gerüst (Electron) und ILIAS-Login. Dateien: `desktop/`, `services/ilias-sync/`.

## Entscheidungen

- 2026-11-20: **Funktionsumfang beschlossen**, siehe Abschnitt „Funktionsumfang“. „Frag deine Folien“ (Chat mit Unterlagen) vorerst zurückgestellt.
- 2026-11-20: **Aufteilung: Mika macht das Design** (Oberfläche in `web/` mit Beispieldaten), **Rayyan Electron, ILIAS-Login und Sync**. Electron blendet die Titelleiste aus (Fensterknöpfe schweben über der App), Details im Abschnitt „Design“.
- 2026-11-20: **Mac-App mit Electron statt reiner Web-App.** Eine Website kann sich nicht bei ILIAS einloggen, keine Passwörter sicher ablegen und keine Ordner auf dem Mac befüllen. Electron packt die Oberfläche aus `web/` (React/Tailwind) in eine echte Mac-App; ein Hintergrundteil (`desktop/`, kommt noch) erledigt Login, PFERD, Dateien und Sync. **ILIAS-Zugangsdaten bleiben lokal im macOS-Schlüsselbund**, nie auf einem Server. Kostenlos; Apple-Signierung (Developer Program, kostenpflichtig) erst nötig, wenn andere die App installieren sollen. Offen: wie Next.js in Electron eingebunden wird, und ob KI-Aufrufe später über einen eigenen Server laufen (der API-Key darf nicht in die ausgelieferte App).
- 2026-11-20: **Git macht Claude, nicht die Menschen.** Alle arbeiten auf `main`. Hooks in `.claude/settings.json` holen vor jedem Prompt den neuesten Stand und verlangen am Ende jeder Antwort Commit und Push. Die Hooks brauchen `bash` und `git` (macOS/Linux, unter Windows Git Bash).
- 2026-11-20: **Web-App statt Rust.** Next.js/TypeScript ist in zwei Tagen viel schneller gebaut, KI-Agenten können es am besten, und für Supabase, Claude und UI-Komponenten gibt es fertige Pakete. Rust bringt hier keinen Vorteil. Desktop-Hülle ist Electron (siehe oben), nicht Tauri.
- 2026-11-20: **Mac zuerst** (Electron-Fenster auf dem Laptop). Handy später.
- 2026-11-20: **Supabase** für Daten, Login und Datei-Speicher (Folien).
- 2026-11-20: **KI = Claude API, nur serverseitig.** Die App bezahlt die Aufrufe zentral, Nutzer brauchen keinen Key. Modell über `AI_MODEL` (Standard `claude-opus-5-5`). Günstiger: `claude-sonnet-5-5` oder `claude-haiku-5-5`. PDFs gehen direkt als `document`-Block an die API, kein eigenes PDF-Parsing nötig.
- 2026-11-20: **ILIAS über PFERD** (v3.10.1, MIT) als Python-Dienst statt eigenem Scraper. PFERD lädt nur Dateien; Termine kommen aus dem iCal-Export des ILIAS-Kalenders.

## Funktionsumfang

Leitsatz: **App öffnen und sofort wissen, was diese Woche in der Uni wichtig ist.** Reihenfolge = Priorität.

**Wichtig für alle KI-Features: Die Einheit ist ein Thema, nicht eine Datei.** Zu einem Thema gehören meist mehrere Materialien (Vorlesungsfolien, Übungsblatt, Selbstlerneinheit, Tutorium, Lösungen …). Die KI bekommt deshalb immer eine Auswahl von Dateien, nicht nur ein PDF.

1. **Fundament**
   - ILIAS-Login (Schlüsselbund) und Sync per PFERD nach `~/Uni/<Kurs>/…`.
   - Übersicht mit „Neu seit letztem Sync“ (Dateiliste vorher/nachher vergleichen, ohne KI). Aktionen „Öffnen“, „Im Finder zeigen“.
2. **KI**
   - **Fristen-Radar**: eine Liste „Diese Woche fällig“ aus dem ILIAS-iCal und aus Terminen, die die KI in neuen Übungsblättern/Folien findet (`extractFromSlides`). Höchste Priorität unter den KI-Features.
   - **Wochen-Digest**: nach dem Sync pro Kurs zwei, drei Sätze, was neu ist und was ansteht.
   - **Lernzettel**: frei wählbar, zu einem oder mehreren Themen. Nutzer wählt Themen oder Dateien aus (auch kursübergreifend möglich), die KI fasst alle Materialien dazu zusammen und nennt die Quelle (Datei, Folie/Seite).
   - **Karteikarten mit Lernsystem**: KI erzeugt Karten aus gewählten Themen/Dateien; Wiederholung nach Lernsystem (Leitner oder SM-2, „gewusst / nicht gewusst“), Fälligkeiten pro Tag. **Export nach Anki**: zuerst als Textdatei (tab-getrennt, importiert Anki direkt), `.apkg` später.
3. **Mac**
   - **Mitteilungen**: „Neues Übungsblatt in BWL“, Klick öffnet die Datei; auch für nahende Fristen.
   - **Symbol in der Menüleiste**: Sync-Status, letzter Sync, „Jetzt synchronisieren“, App öffnen.
   - **Sync im Hintergrund**, Intervall einstellbar (z. B. aus / 30 min / 1 h / 3 h / täglich), optional Start beim Login.
   - **Spotlight**: Dateien liegen echt in `~/Uni`, macOS indexiert sie von selbst. Nichts zu bauen, in der Demo zeigen.

Zurückgestellt: „Frag deine Folien“ (Fragen an ausgewählte PDFs). Nicht geplant: Abgaben hochladen, Noten aus KLIPS, Lerngruppen/Teilen, Handy-App.

## Design (für Mika)

Mika macht das Design. **Agent von Mika: Lies diesen Abschnitt ganz, bevor du UI baust.**

### So bauen wir die App

- **Electron-Mac-App.** Die Oberfläche ist ganz normales Next.js 16 in `web/` (App Router, React 19, TypeScript, Tailwind 4). Electron (`desktop/`, baut Rayyan gerade) öffnet diese Oberfläche später in einem Mac-Fenster und liefert die echten Daten (ILIAS-Login, Dateien in `~/Uni`, Sync).
- **Design jetzt einfach im Browser bauen:** `npm run dev` in `web/`, Fenster auf ca. 1280×800. Für Electron muss am UI nichts Besonderes passieren, außer:
  - Titelleiste wird ausgeblendet: oben ca. 52 px hohe Leiste einplanen, links ca. 80 px frei für die Fensterknöpfe. Diese Leiste bekommt `-webkit-app-region: drag` (Buttons darin `no-drag`), damit man das Fenster daran ziehen kann.
  - Wirkt wie eine Mac-App, nicht wie eine Website: Systemschrift (`-apple-system`/SF Pro statt Geist), Hell- und Dunkelmodus über `prefers-color-scheme`, kein Seiten-Scroll des ganzen Fensters (Seitenleiste fest, nur der Inhalt scrollt), Cursor `default` statt Hand-Cursor auf normalen Listeneinträgen.
- **Nur Beispieldaten**, kein Supabase, keine KI, kein Server-Code. Beispieldaten und ihre Typen in `web/src/lib/mock-data.ts`. Die Typen gleichen wir später mit dem ab, was der Hintergrundteil liefert, deshalb klar und flach halten (Kurs → Ordner → Datei, Sync-Status).
- **Dateien von Mika:** `web/src/app/` (Seiten, `layout.tsx`, `globals.css`), `web/src/components/`, `web/src/lib/mock-data.ts`. Rayyan arbeitet in `desktop/` und `services/`, also kommt ihr euch nicht in die Quere. `web/src/lib/ai.ts` und `web/src/lib/supabase/` nicht anfassen.
- `next.config.ts` hat `cacheComponents` an. Vor neuem Next-Code die Doku in `web/node_modules/next/dist/docs/` lesen.

### Design-Skills (damit es nicht nach KI-Slop aussieht)

Rayyan nutzt diese Skills und sie haben gut funktioniert. Agent von Mika: Prüf, ob sie bei dir schon geladen sind (Skill-Liste). Falls nicht, frag Mika einmal, ob du sie global installieren darfst (`-g`, also **nicht** ins Repo, das ist öffentlich), und danach Claude neu starten:

```bash
npx skills add heydamir/unslop --skill unslop -g
npx skills add pbakaus/impeccable --skill impeccable -g
npx skills add anthropics/skills --skill frontend-design -g
npx skills add emilkowalski/skills --skill emil-design-eng --skill apple-design --skill animate -g
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -g
```

(Falls ein Flag nicht passt: `npx skills --help`.) Wofür welcher:

- **frontend-design** und **impeccable**: am Anfang eine klare Gestaltungsrichtung festlegen (Farben, Schrift, Abstände) und unten in diesem Abschnitt als „Designsprache“ festhalten, damit alle Screens gleich aussehen. impeccable auch zum Kritisieren und Polieren.
- **apple-design** und **emil-design-eng**: Mac-Gefühl und Feinschliff (Typo, Abstände, Zustände, dezente Bewegung). **animate** nur, wo Bewegung wirklich hilft (Fortschritt beim Import, Sync läuft).
- **unslop**: nach jedem fertigen Screen drüberlaufen lassen.
- **web-design-guidelines**: Abschlussprüfung (Bedienbarkeit, Tastatur, Kontraste).

Auch ohne Skills gilt: keine lila Verläufe, kein Glow, kein Verlaufstext, keine Emojis als Icons, keine „✨ Neu“-Badges, keine pulsierenden Punkte, keine Großbuchstaben-Labels mit Sperrung. Eine Akzentfarbe, ruhige Flächen, gleichmäßige Abstände, ein Icon-Set (z. B. `lucide-react`). Texte kurz und auf Deutsch.

### Inhalt und Screens

- Es wird ein **Mac-App-Fenster, keine Website**: keine Landingpage, kein Marketing, kein Cookie-Banner, keine Browser-Navigation. Eher wie Notion oder Slack: Seitenleiste links, Inhalt rechts.
- Auf Laptop auslegen (ca. 1280×800), sollte bis ca. 1000×700 schrumpfen können.
- Screens:
  1. **ILIAS-Login**: Uni-Kennung + Passwort, Hinweis „Deine Zugangsdaten bleiben im Schlüsselbund deines Macs.“ Zustände: lädt, falsches Passwort, ILIAS nicht erreichbar.
  2. **Ersteinrichtung**: Zielordner wählen (Standard `~/Uni`), Kurse dieses Semesters anzeigen und an-/abwählen.
  3. **Erster Import**: kann mehrere Minuten dauern, deshalb Fortschritt pro Kurs (x von y Dateien), App bleibt bedienbar.
  4. **Übersicht**: Kurse → Ordner → Dateien, „Neu seit letztem Sync“ hervorheben, Aktionen „Öffnen“ und „Im Finder zeigen“.
  5. **Sync-Status**, immer sichtbar (z. B. unten in der Seitenleiste): letzter Sync, läuft gerade, Fehler, Button „Jetzt synchronisieren“.
- Fehlerzustände mitdesignen: offline, Login abgelaufen, einzelner Kurs fehlgeschlagen.
- Die Daten liefert später der Hintergrundteil. Bis dahin mit Beispieldaten arbeiten (Kurse wie „Softwaretechnik“, „BWL“, „Mathematik für Informatik I“; Dateien wie Folien-PDFs und Übungsblätter). Die genaue Datenform legen wir in `web/src/lib/` fest, sobald der Login steht.
- Weitere Screens kommen aus dem Abschnitt „Funktionsumfang“ (Fristen-Radar, Digest, Lernzettel, Karteikarten, Einstellungen für das Sync-Intervall).

### Designsprache

Festgelegt (2026-11-20), Farben als Variablen in `web/src/app/globals.css`:
- Akzent: ein ruhiges Grün (`--accent`), sonst warme Grautöne. Hell und Dunkel über `prefers-color-scheme`.
- Schrift: Systemschrift (SF Pro), 13 px Grundgröße. Überschriften 22 px (Bildschirme) bzw. 15 px (Kopfleiste).
- Radien: 6 px (Knöpfe, Felder), 8 px (Listen). Linien statt Schatten. Icons: `lucide-react`, 14–16 px.
- Bausteine: `web/src/components/ui.tsx` (Button, Stage, Notice, FileIcon). Fehler = `Notice` mit Aktion.
- Alle 5 Bildschirme stehen mit Beispieldaten. Das Demo-Fenster unten rechts (`DemoPanel.tsx`) schaltet Zustände um. Vor der echten App aus `AppShell.tsx` entfernen.
- Offen: „Öffnen“ und „Im Finder zeigen“ tun noch nichts (kommen mit Electron).

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
