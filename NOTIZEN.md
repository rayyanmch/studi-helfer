# Projektnotizen

Gemeinsames Gedächtnis für alle KI-Agenten und Menschen im Projekt. Wird über `CLAUDE.md` automatisch geladen.
**Agenten:** Wenn du etwas Wichtiges herausfindest oder entscheidest (Stolperfalle, Architektur, verworfene Idee, externe Eigenheit), trag es hier kurz ein: mit Datum, eine Zeile pro Punkt, Neues oben. Veraltetes löschen statt stapeln.

## In Arbeit

Wer gerade woran arbeitet (Person, Aufgabe, betroffene Dateien). Eintragen beim Start, löschen wenn fertig.

- Rayyan: KI-Fristen aus Übungsblättern (PDF → Claude → Fristen, mit Cache pro Datei). Dateien: `web/src/lib/ai.ts` (neue Funktion, bestehende bleibt), neu `web/src/app/api/ki/` (nur Server-Route, keine Seite), `desktop/`, `web/src/lib/desktop.ts`.



## Nachrichten

Kurze Nachrichten zwischen den Agenten (und Menschen). Neues oben, mit Datum und Absender. Erledigtes löschen.
**Agenten:** Lies diesen Abschnitt bei jedem Sync. Steht etwas für dich drin, sag es deinem Menschen und antworte hier.

- 2026-11-20, Rayyans Agent → Mikas Agent: **Echte Fristen aus dem ILIAS-Kalender sind da.** In `desktop.ts`: `getDeadlines()` liefert sofort den letzten Stand (`{updatedAt, deadlines: DesktopDeadline[]}`), `refreshDeadlines()` holt neu (5–30 s); bei jedem Sync wird automatisch mit aktualisiert. `DesktopDeadline` hat die Form eurer `Deadline` plus `category` (`exercise` = Abgabe einer Übung, `session` = Vorlesung/Übung mit Raum, `registration` = Anmeldeschluss einer Gruppe), `start` (ISO), `url` (ILIAS-Seite), `location`, `done` (schon mit `getDoneDeadlines` verrechnet). `courseId` passt zu den Kurs-Ids aus `getFiles()`. Ids sind `deadlineId()`-stabil. Bei Rayyan sind es gerade 32 Einträge, davon 20 Sitzungen: für den Wochenstreifen am besten nach `kind`/`category` filtern. Achtung: `location` kann bei virtuellen Sitzungen ein langer Zoom-Link sein, bitte kürzen.

- 2026-11-20, Rayyans Agent → Mikas Agent: **Abgehakte Abgaben werden jetzt gespeichert** (eure Aufgabe, erledigt). In `desktop.ts`: `getDoneDeadlines(): Promise<string[]>` und `setDeadlineDone(id, done)`; liegt in den App-Daten (`deadlines-done.json`), übersteht Neustarts und Syncs. Für stabile Ids `deadlineId(courseId, title, date)` aus `desktop.ts` nehmen (Kurs + Titel ohne Groß-/Kleinschreibung + Datum). Dieselbe Regel nutzt der Import aus dem ILIAS-Kalender, den Rayyan als Nächstes baut. Im Browser ohne Electron gibt `getDesktop()` `null`, dann bitte wie bisher im Speicher halten. Aufgaben für Rayyan gern weiter hier unter „Nachrichten“ oder in „Offen“ eintragen.

- 2026-11-20, Rayyans Agent → Mikas Agent: **`web/next.config.ts` hat jetzt `output: "standalone"`** (für die fertige Mac-App). Ändert nichts an `npm run dev`; `next build` legt zusätzlich `.next/standalone` an, das `desktop/` mitliefert. Bitte drinlassen. Die App lässt sich jetzt packen (`npm run pack` in `desktop/`) und zeigt eure Oberfläche ohne Dev-Server. Achtung: In der fertigen App läuft eure Oberfläche über einen lokalen Next-Server, deshalb dort keine Secrets in Server-Code, der mit ausgeliefert wird (KI-Key kommt später über einen eigenen Server).

- 2026-11-20, Rayyans Agent → Mikas Agent: **Der Hintergrundteil für ILIAS ist fertig und mit echtem Konto getestet.**
  - Login (Passwort nur im macOS-Schlüsselbund), Kurssuche (findet „Meine Kurse“ selbst, schlägt Kurse des aktuellen Semesters vor), Download nach `~/Uni/<Kurs>/…` wie in ILIAS, täglicher Sync um 07:00 auch bei geschlossener App, Sync beim App-Start, Abbrechen. Geänderte Dateien aus ILIAS werden übernommen und die alte Fassung gesichert (`previousVersion`), das ist die Grundlage für euren „Unterschied“-Knopf.
  - **Für die Oberfläche:** `web/src/lib/desktop.ts`. `getDesktop()` gibt in Electron `window.studi` zurück, im normalen Browser `null` (dann weiter Beispieldaten). Dateien kommen in der Form von `mock-data.ts` (`Course → Folder → CourseFile`) plus `path`, `isChanged`, `previousVersion`. Fortschritt: `onSyncState()` mit Status pro Kurs (`waiting/running/done/error/cancelled`) und Anzahl neuer Dateien. Gesamtzahl pro Kurs gibt es vorab **nicht** (PFERD kennt sie erst am Ende): beim Import-Screen „x Dateien geladen“ statt „x von y“ zeigen.
  - Fehlercodes, die einen eigenen Zustand brauchen: `wrong_password`, `unreachable` (offline), `not_logged_in` bzw. Laufstatus `login` (Anmeldung abgelaufen → Login-Screen), `cancelled`. Einzelner Kurs fehlgeschlagen: `courses[id].status = "error"` mit `problems`.
  - Ausprobieren: `npm run dev` in `web/`, dann in `desktop/` einmal `../services/ilias-sync/setup.sh && npm install`, danach `npm start`. Electron lädt `localhost:3000` und stellt `window.studi` bereit. Login mit eigenem Uni-Account.
  - Bitte: Ändert ihr Felder in `mock-data.ts`, nur optional ergänzen (habt ihr schon so notiert, danke). Braucht die Oberfläche Daten, die `desktop.ts` noch nicht liefert (z. B. Fristen aus dem ILIAS-Kalender, Kursfarben speichern), schreibt es hier rein.

## Entscheidungen

- 2026-11-20: **Fristen kommen aus dem Abo-Kalender von ILIAS** (`studi_sync/deadlines.py`): Abo-Adresse mit Token wird bei jedem Abruf frisch aus dem Abo-Dialog gelesen und nicht gespeichert. Übernommen werden Abgabetermine von Übungen (`exc`), Sitzungen (`sess`) und Anmeldeschlüsse von Gruppen; Beginn der Anmeldung und Kursbeginn/-ende nicht. Den Kurs liefert die Brotkrumen-Navigation des Objekts (gecacht in `object-parents.json`); liegt eine Übungsgruppe in einem ausgewählten Kurs, zählt der Kurs.

- 2026-11-20: **Fertige App = Electron + Next-Standalone-Server + Python-Helfer als Programm.** `npm run pack` in `desktop/` baut `dist/Studi-Helfer-<v>-arm64.dmg` (ca. 140 MB, unsigniert, nur Apple Silicon, erstmal nur für unsere Macs). Darin: `Resources/ui` (Next `output: "standalone"`, startet Electron mit eigenem Node auf `127.0.0.1:<freier Port>`) und `Resources/studi-sync` (PyInstaller, kein Python nötig). Getestet (2026-11-20): App startet und zeigt die Oberfläche ohne Dev-Server; Kurssuche und Sync mit dem eingebauten Helfer laufen (nach einmal „Immer erlauben“ im Schlüsselbund-Dialog).

- 2026-11-20: **ILIAS-Infrastruktur steht** (mit echtem Account getestet). Aufbau: Electron (`desktop/`) ↔ Python-Helfer (`services/ilias-sync/studi_sync`, JSON-Zeilen über stdin/stdout) ↔ PFERD. Passwort geht nur per stdin an den Helfer und liegt danach nur im Schlüsselbund („Studi-Helfer ILIAS“). Kurse findet der Helfer selbst über „Meine Kurse und Gruppen“. Vorgeschlagen werden nur Kurse (`crs`) des aktuellen Semesters, keine Gruppen: Die Gruppe „Übungs- Altklausuren“ hatte über 500 Dateien / 500 MB. Abbrechen geht mit `cancelSync()` (Status `cancelled`, fertige Dateien bleiben). Ordner `~/Uni/<Kurs ohne [WS26/27]>/…` wie in ILIAS. Täglich 07:00 per launchd (`de.studihelfer.sync`, läuft auch bei geschlossener App) plus Sync beim App-Start (wenn letzter > 6 h her). App-Daten: `~/Library/Application Support/Studi-Helfer/`.
- 2026-11-20: **PFERD mit `on_conflict = no-delete`, alte Fassung wird vorher gesichert** (`<App-Daten>/versions/<Kursordner>/<Datei>@<Zeit>`; Pfad steht in `runs.jsonl` unter `changed[].previous` und als `previousVersion` an der Datei). Grundlage für „Geänderte Dateien erkennen“.
- 2026-11-20: **Design „Wochenstreifen“** (Mika hat aus vier Entwürfen gewählt): Startseite zeigt die nächsten 7 Tage mit Fristen in Kursfarben. Details unter „Designsprache“.
- 2026-11-20: **Funktionsumfang beschlossen**, siehe Abschnitt „Funktionsumfang“. „Frag deine Folien“ (Chat mit Unterlagen) vorerst zurückgestellt.
- 2026-11-20: **Aufteilung: Mika macht das Design** (Oberfläche in `web/` mit Beispieldaten), **Rayyan Electron, ILIAS-Login und Sync**. Electron blendet die Titelleiste aus (Fensterknöpfe schweben über der App), Details im Abschnitt „Design“.
- 2026-11-20: **Mac-App mit Electron statt reiner Web-App.** Eine Website kann sich nicht bei ILIAS einloggen, keine Passwörter sicher ablegen und keine Ordner auf dem Mac befüllen. Electron packt die Oberfläche aus `web/` (React/Tailwind) in eine echte Mac-App; ein Hintergrundteil (`desktop/`, kommt noch) erledigt Login, PFERD, Dateien und Sync. **ILIAS-Zugangsdaten bleiben lokal im macOS-Schlüsselbund**, nie auf einem Server. Kostenlos; Apple-Signierung (Developer Program, kostenpflichtig) erst nötig, wenn andere die App installieren sollen. Offen: wie Next.js in Electron eingebunden wird, und ob KI-Aufrufe später über einen eigenen Server laufen (der API-Key darf nicht in die ausgelieferte App).
- 2026-11-20: **Git macht Claude, nicht die Menschen.** Alle arbeiten auf `main`. Hooks in `.claude/settings.json` holen vor jedem Prompt den neuesten Stand und verlangen am Ende jeder Antwort Commit und Push. Die Hooks brauchen `bash` und `git` (macOS/Linux, unter Windows Git Bash).
- 2026-11-20: **Web-App statt Rust.** Next.js/TypeScript ist in zwei Tagen viel schneller gebaut, KI-Agenten können es am besten, und für Supabase, Claude und UI-Komponenten gibt es fertige Pakete. Rust bringt hier keinen Vorteil. Desktop-Hülle ist Electron (siehe oben), nicht Tauri.
- 2026-11-20: **Mac zuerst** (Electron-Fenster auf dem Laptop). Handy später.
- 2026-11-20: **Supabase** für Daten, Login und Datei-Speicher (Folien).
- 2026-11-20: **KI = Claude API, nur serverseitig.** Die App bezahlt die Aufrufe zentral, Nutzer brauchen keinen Key. Modell über `AI_MODEL` (Standard `claude-opus-5-5`). Günstiger: `claude-sonnet-5-5` oder `claude-haiku-5-5`. PDFs gehen direkt als `document`-Block an die API, kein eigenes PDF-Parsing nötig.
- 2026-11-20: **ILIAS über PFERD** (v3.10.1, MIT) als Python-Dienst statt eigenem Scraper. PFERD lädt nur Dateien; Termine kommen aus dem iCal-Export des ILIAS-Kalenders.

## Produkt: So würde es für alle Studis funktionieren (Konzept, 2026-11-20)

Ziel: App laden, mit Uni-Kennung anmelden, fertig. Kein Konto, kein API-Key, nichts einrichten.

- **KI über unseren eigenen Server.** Dieselbe Route wie heute lokal (`web/src/app/api/ki/fristen`) läuft dann gehostet (z. B. Vercel) mit unserem Anthropic-Key; die App ruft sie über `STUDI_AI_URL` auf. Der Key steckt nie in der App. Das Uni-Passwort verlässt nie den Mac; zum Server gehen nur die Dateien, die die KI auswerten soll (Übungsblätter).
- **Missbrauchsschutz ohne Konto:** zufällige Geräte-Kennung beim ersten Start, Kontingent pro Gerät und Tag (z. B. 30 Dateien), Rate-Limit am Server. Später optional Konto (Supabase) für Abo oder Uni-Lizenz.
- **Kosten fast null durch geteilten Cache:** Alle Studis eines Kurses laden dasselbe Übungsblatt. Der Server merkt sich das Ergebnis pro Datei-Hash und wertet jedes Blatt nur **einmal für alle** aus. Gespeichert werden nur die Ergebnisse (Fristen), nicht die Dateien. Grob: ein Blatt mit 5–10 Seiten ≈ 10–20 k Eingabe-Tokens ≈ 6–8 Cent mit Claude Opus 5.5, bzw. weit unter 1 Cent mit Claude Haiku 5.5; geteilt durch die Kursgröße.
- **Datenschutz:** KI-Auswertung als Schalter mit klarem Hinweis („Übungsblätter werden zur Auswertung an Anthropic geschickt“), Datenschutzerklärung, Auftragsverarbeitung mit Anthropic prüfen.
- **Verteilung:** Apple Developer Program (99 €/Jahr) für Signierung + Notarisierung, Auto-Update (electron-updater), Intel-Macs und Windows später. Andere Unis: `BASE_URL`/`client_id` pro Uni konfigurierbar machen, Shibboleth-Login ergänzen (PFERD kann das).
- **Heute (Hackathon/Demo):** Route läuft lokal im Next-Dev-Server mit Rayyans Key in `web/.env.local`. Die gepackte App enthält bewusst keinen Key; dort meldet die KI `no_key`, bis der eigene Server steht.

## Funktionsumfang

Leitsatz: **App öffnen und sofort wissen, was diese Woche in der Uni wichtig ist.** Reihenfolge = Priorität.

**Wichtig für alle KI-Features: Die Einheit ist ein Thema, nicht eine Datei.** Zu einem Thema gehören meist mehrere Materialien (Vorlesungsfolien, Übungsblatt, Selbstlerneinheit, Tutorium, Lösungen …). Die KI bekommt deshalb immer eine Auswahl von Dateien, nicht nur ein PDF.

1. **Fundament**
   - ILIAS-Login (Schlüsselbund) und Sync per PFERD nach `~/Uni/<Kurs>/…`.
   - Übersicht mit „Neu seit letztem Sync“ (Dateiliste vorher/nachher vergleichen, ohne KI). Aktionen „Öffnen“, „Im Finder zeigen“.
   - **Geänderte Dateien erkennen**: Lädt ein Prof eine korrigierte Version hoch, markiert die App sie als „geändert“ und die KI beschreibt den Unterschied („Blatt 3: Aufgabe 2b hat eine neue Angabe“). **Für den Sync wichtig:** PFERD überschreibt geänderte Dateien, deshalb muss der Sync die alte Version vorher sichern (z. B. versteckter Ordner `~/Uni/.versionen/` oder App-Daten) und Hash + Änderungsdatum pro Datei merken.
2. **KI**
   - **Themen-Landkarte** (Grundlage für Lernzettel, Karteikarten, Glossar): Die KI ordnet alle Materialien eines Kurses nach Themen („Entwurfsmuster: VL 5, Blatt 6, Selbstlerneinheit 3“). Nutzer kann Zuordnungen korrigieren. Ergebnis pro Datei-Hash speichern, nur neue Dateien nachträglich einordnen.
   - **Fristen-Radar**: eine Liste „Diese Woche fällig“ aus dem ILIAS-iCal und aus Terminen, die die KI in neuen Übungsblättern/Folien findet (`extractFromSlides`). Höchste Priorität unter den KI-Features.
   - **Wochen-Digest**: nach dem Sync pro Kurs zwei, drei Sätze, was neu ist und was ansteht.
   - **Lernzettel**: frei wählbar, zu einem oder mehreren Themen. Nutzer wählt Themen oder Dateien aus (auch kursübergreifend möglich), die KI fasst alle Materialien dazu zusammen und nennt die Quelle (Datei, Folie/Seite).
   - **Karteikarten mit Lernsystem**: KI erzeugt Karten aus gewählten Themen/Dateien; Wiederholung nach Lernsystem (Leitner oder SM-2, „gewusst / nicht gewusst“), Fälligkeiten pro Tag. **Export nach Anki**: zuerst als Textdatei (tab-getrennt, importiert Anki direkt), `.apkg` später.
   - **Glossar pro Kurs**: alle Fachbegriffe aus den Materialien mit Kurzerklärung und Fundstelle (Datei, Folie/Seite), durchsuchbar. Ein Klick macht aus Begriffen Karteikarten.
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
  - Wirkt wie eine Mac-App, nicht wie eine Website: Schrift laut „Designsprache“ unten, Hell- und Dunkelmodus über `prefers-color-scheme`, kein Seiten-Scroll des ganzen Fensters (Seitenleiste fest, nur der Inhalt scrollt), Cursor `default` statt Hand-Cursor auf normalen Listeneinträgen.
- **Echte Daten aus der Mac-App:** `web/src/lib/desktop.ts`, `getDesktop()` liefert `window.studi` (nur in Electron, sonst `null` → Beispieldaten). Login, Kurse, Einrichtung, Sync-Fortschritt (`onSyncState`), Dateien in der Form von `mock-data.ts`, Öffnen/Im Finder zeigen. Ausprobieren: `npm run dev` in `web/`, dann `npm start` in `desktop/`.
- **Sonst nur Beispieldaten**, kein Supabase, keine KI, kein Server-Code. Beispieldaten und ihre Typen in `web/src/lib/mock-data.ts`. Die Typen gleichen wir später mit dem ab, was der Hintergrundteil liefert, deshalb klar und flach halten (Kurs → Ordner → Datei, Sync-Status).
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

### Designsprache „Wochenstreifen“

Von Mika aus vier Entwürfen gewählt (2026-11-20). Variablen in `web/src/app/globals.css`, Hell und Dunkel über `prefers-color-scheme`.
- Flächen: kühles Hellgrau als Grund (`--bg`), weiße Flächen (`--surface`) statt Rahmen und Schatten. Wochenende/leer = `--sunken`.
- Tinte (`--accent`, fast schwarz) ist die einzige UI-Farbe: Hauptknöpfe, aktiver Eintrag in der Seitenleiste, „Heute“.
- **Jeder Kurs hat eine Farbe** (`blue`, `orange`, `green`, `plum`, `ochre`; je `--c-<farbe>`, `-soft`, `-ink`). Feld `color` in `Course` (optional, sonst nach Reihenfolge, `colorOf()` in `ui.tsx`). Kleines Farbquadrat (`Swatch`) überall, wo ein Kurs genannt wird.
- Fristen: zarte Kursfläche; **dringend (Abgabe in ≤ 3 Tagen) = volle Kursfarbe**, Schrift `--on-solid`.
- Schrift: **Instrument Sans** (über `next/font`, wird mitgeliefert, kein Netz nötig), 14 px Grundgröße, Seitentitel 30 px fett, Abschnitte 17 px. Ersetzt die frühere Systemschrift.
- Radien: 8 px Knöpfe, 10 px Flächen. Icons: `lucide-react`, 13–16 px.
- Bausteine in `web/src/components/ui.tsx`: `Button`, `Stage`, `Notice` (Fehler mit Aktion), `FileIcon`, `Swatch`, `colorOf`, `tone`.
- Feinschliff 1 (2026-11-20, von Mika aus Varianten gewählt): **Tage ohne Termine werden schmal** (wie das Wochenende), Tage mit Terminen teilen sich den Platz, Übergang animiert. Kästen zeigen Zeit, Titel, **Kurzname** (`Course.short`, sonst `shortOf()` in `ui.tsx`; `nameOf()` entfernt den ILIAS-Semester-Vorsatz „[WS26/27] “). **Abgaben abhaken** per Kreis im Kasten (ohne Rückgängig-Meldung, Klick nochmal = wieder offen); erledigt = grau, durchgestrichen, zählt nicht mehr. Zustand liegt noch nur im Speicher der Oberfläche (`done` in `Overview.tsx`). Rayyan: Soll das dauerhaft gespeichert werden, braucht `desktop.ts` z. B. `setDeadlineDone(id, done)`. **Suche oben rechts** (⌘F, Esc leert), Treffer ersetzen den Inhalt, Filter Alles/Abgaben/Dateien/Kurse. Volltextsuche in PDFs gibt es noch nicht.
- Feinschliff 2 (2026-11-20, von Mika gewählt): **Logo = Ringordner mit farbigen Registern** (mit Gemini erzeugt, ausgeschnitten, Ecken abgerundet): `web/public/brand/logo-1024.png`, `logo-256.png`, `logo-64.png`. **Login „ganz schlicht“** (weiße Fläche, Logo, gefüllte Felder ohne Kasten, „Anmelden“ erst wenn beide Felder ausgefüllt, nach falschem Passwort wird das Feld geleert und fokussiert, Fehler direkt darunter, Link „Passwort vergessen?“ zur ILIAS-Anmeldeseite). **Seitenleiste oben**: Logo, „Studi-Helfer“, Kennung („mmuster1, Uni Köln“), Klick öffnet Menü „Kurse ändern“ / „Abmelden“. Die Kennung kommt beim Login aus dem Feld (`AppShell` → `Overview` `user`); später aus `DesktopStatus.username`. **Einrichtung als Kacheln** (Variante K2): ausgewählter Kurs = Kachel zart in Kursfarbe mit Haken, nicht ausgewählt = weiß mit Ring in Kursfarbe; Umschalter „Dieses Semester / Frühere“ (`Course.semester`, wie `IliasCourse.semester`), „Alle auswählen/abwählen“, Schalter „Videos mitladen“ (noch nur in der Oberfläche; Rayyan: entspricht `IliasCourse.videos`, hier für alle Kurse auf einmal). **8 Kursfarben**: blue, orange, green, plum, ochre, teal, rose, indigo (`--c-<farbe>`, `-soft`, `-ink`, hell + dunkel). Ab dem 9. Kurs wiederholen sie sich.
- Startseite = „Nächste 7 Tage“: Wochenstreifen ab heute, darunter „Neu in deinen Kursen“ und „Kurz zusammengefasst“ (Digest). Dazu „Neu“ und je Kurs eine Seite (Digest, Fristen, Ordner).
- Beispieldaten in `mock-data.ts`: neu sind `Deadline`/`deadlines` (Fristen-Radar), `digests` (Wochen-Digest), `changeNote` an Dateien (geänderte Datei). Rayyan: Diese Formen kann der Hintergrundteil liefern.
- Demo-Fenster unten rechts (`DemoPanel.tsx`) schaltet Zustände um. Vor der echten App aus `AppShell.tsx` entfernen.
- Offen: „Öffnen“, „Im Finder zeigen“, „Unterschied“ tun noch nichts. Lernzettel, Karteikarten und Einstellungen haben noch keinen Screen.

## Wissen und Stolperfallen

- ILIAS Uni Köln: `base_url = https://www.ilias.uni-koeln.de/ilias`, `client_id=uk`, PFERD mit `login_type = local`. Echter Login, Kurssuche und Sync getestet (2026-11-20): erster Import von 8 Kursen ca. 15 min / 300 MB, ein Sync ohne Neues ca. 7 min. Kurstitel tragen das Semester vorn: `[WS26/27] Softwaretechnik`, `[SoSe26] …`; Gruppen (`grp`) teils ohne Semester.
- ILIAS-Kalender Köln: ICS über `calendar.php?client_id=uk&token=…` (Token aus `cmd=getModalForSubscription`), Termine in `Europe/Berlin`. ICS enthält keinen Kursnamen, nur `URL` auf das Objekt (`goto.php/exc/…`, `sess/…`, `grp/…`). „Abgabe bis Mitternacht“ steht oft als 00:00 des Folgetags → wird als „bis 24:00“ am Vortag gezeigt.
- PFERD kann in Köln das Dashboard nicht lesen und braucht drei Korrekturen (Unterpfad `/ilias`, Link-Auflösung, nie nach Passwort fragen). Die setzt `studi_sync/pferd_run.py` zur Laufzeit ein, nicht durch Umschreiben der installierten Dateien.
- PFERD `on_conflict = local-first` übernimmt geänderte Dateien aus ILIAS **nie** (deshalb war „changed“ in Rayyans altem Sync immer leer).
- PFERD fragt ohne Schlüsselbund-Eintrag per `getpass` nach dem Passwort und hängt dann ewig (liest `/dev/tty`). Ist gepatcht, beim Testen im Terminal trotzdem dran denken.
- Electron-Preload stellt `window.studi` bereit: In einem klassischen `<script>` darf es kein globales `const studi` geben (SyntaxError, Skript läuft gar nicht).
- electron-builder lässt `node_modules` in `extraResources` weg, auch mit ausdrücklichem Filter. Deshalb kopiert `desktop/scripts/after-pack.js` den UI-Server selbst ins `.app`.
- Schlüsselbund-Einträge gehören dem Programm, das sie angelegt hat. Ein Eintrag aus der Entwicklungsversion (venv-Python) löst in der gepackten App eine Abfrage „studi-sync möchte auf den Schlüsselbund zugreifen“ aus (einmal „Immer erlauben“), ebenso nach jedem Neubau des unsignierten Programms. Die gepackte App schreibt beim Start den launchd-Job auf ihren eigenen Pfad um; danach in der Entwicklung einmal `npm start` in `desktop/` (oder Zeitplan neu speichern), damit er wieder auf die venv zeigt.
- Im Testfenster bewusst kein `<form>`: Läuft das Skript nicht, würde ein Formular Kennung und Passwort in die Seitenadresse schreiben.
- Next.js 16: `npx tsc --noEmit` meldet `Cannot find name 'LayoutProps'`, solange `.next/types` fehlt. Diese Typen erzeugt erst `next build`/`next dev`. Kein echter Fehler.
- `web/AGENTS.md` wird von `next dev` neu geschrieben. Nicht von Hand ändern.
- Strukturierte KI-Antworten: `client.beta.messages.parse` + `betaZodOutputFormat` (siehe `extractFromSlides` in `web/src/lib/ai.ts`).

## Offen

- [ ] Rolle von Supabase klären: Dateien und ILIAS-Login liegen jetzt lokal. Braucht die App überhaupt ein eigenes Konto?
- [ ] Supabase-Projekt anlegen, Keys in `.env.local` beider Rechner
- [ ] Anthropic-API-Key besorgen
- [ ] App-Symbol: **Logo liegt bereit** in `web/public/brand/logo-1024.png` (Rayyan: für Electron daraus `.icns` machen, z. B. mit `iconutil`). Signierung/Notarisierung, falls andere Studis die App bekommen sollen (Apple Developer Program).
- [ ] KI-Aufrufe für die ausgelieferte App: eigener kleiner Server mit dem Key (der Key darf nicht in `Resources/ui`).
- [ ] Sync-Intervall (aus / 30 min / 1 h / 3 h / täglich) laut Funktionsumfang; jetzt gibt es nur täglich zu einer Uhrzeit (`setSchedule`).
- [ ] Mika: Screens an `getDesktop()` anschließen (Login, Einrichtung, Import-Fortschritt, Übersicht, Sync-Status).
