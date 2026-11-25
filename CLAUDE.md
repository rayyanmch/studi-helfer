# Ordo (Repo: studi-helfer) – Regeln für KI-Agenten

Hackathon-Projekt, zwei Leute vibecoden parallel (Rayyan, Mika). Deadline Sonntag Mittag: lieber eine Funktion, die in der Demo sicher läuft, als drei halbe.

## Gemeinsames Gedächtnis

@NOTIZEN.md

Neue wichtige Erkenntnisse und Entscheidungen trägst du in `NOTIZEN.md` ein und committest sie mit, damit der Agent der anderen Person sie auch kennt.

## Aufbau

- `web/`: Next.js 16 (App Router, TypeScript, Tailwind 4). UI, API-Routen, KI-Aufrufe. Laptop zuerst, aber responsiv fürs Handy.
- `desktop/` (kommt): Electron-Hülle, macht daraus eine Mac-App. Hintergrundteil für ILIAS-Login (macOS-Schlüsselbund), PFERD, Dateien in `~/Uni` und Sync. `web/` ist die Oberfläche darin.
- `services/ilias-sync/`: Python-Dienst um PFERD, holt Dateien aus dem ILIAS der Uni Köln.
- `site/`: Website für Ordo (eigenes Next.js, statisch, Port 3200). Unabhängig von `web/`; Texte dort nie nur „ILIAS“, Ordo kann zum Release auch Moodle.
- Daten, Login und Datei-Speicher: Supabase. KI: Claude API über `web/src/lib/ai.ts`.

Next.js 16 weicht von älterem Wissen ab: Vor neuem Next-Code die passende Doku in `web/node_modules/next/dist/docs/` lesen (siehe `web/AGENTS.md`).

## Regeln

- Sprache der App: **Englisch** (alle Texte, die Nutzer sehen: Oberfläche, Fehlermeldungen, Mitteilungen, Fristtitel). Notizen, Kommentare und Commit-Nachrichten bleiben Deutsch.
- Secrets nur in `web/.env.local` (Vorlage: `web/.env.example`). Nie committen, nie in Client-Code.
- KI-Aufrufe und der Anthropic-Key laufen nur serverseitig (Route Handler / Server Actions, `import "server-only"`). Nutzer brauchen keinen eigenen Key.
- Uni-Zugangsdaten nur im macOS-Schlüsselbund ablegen. Nie in Dateien, Datenbank, Logs oder an einen Server schicken.
- Supabase: Für Code im Browser `@/lib/supabase/client`, für Server-Code `@/lib/supabase/server`. Tabellen bekommen Row Level Security.
- Vor jedem Commit mit Änderungen in `web/`: `npm run lint` und `npm run build` müssen durchlaufen.
- Kommen neue Pakete per Sync dazu (`web/package.json` geändert), zuerst `npm install` in `web/`.

## Zusammenarbeit: Git ist dein Job, nicht der der Menschen

Rayyan und Mika prompten nur. Git-Befehle tippen sie nicht, das erledigst du komplett und ohne Nachfrage.

- Alle arbeiten direkt auf `main`, keine Branches, keine Pull Requests. Kleine, häufige Commits halten Konflikte klein.
- Vor jedem Prompt holt ein Hook (`.claude/hooks/sync.sh`) automatisch den neuesten Stand. Meldet er neue Commits, schau sie dir an. Meldet er einen Konflikt, löst du ihn zuerst so, dass beide Änderungen erhalten bleiben.
- Am Ende jeder Antwort mit Änderungen: lint/build prüfen, committen, `git pull --rebase --autostash`, `git push`. Der Stop-Hook (`.claude/hooks/require-push.sh`) erinnert dich daran.
- Commit-Nachrichten auf Deutsch, kurz und konkret („Kalender: Termine aus ILIAS-iCal importieren“).
- Nie force-pushen, nie `git reset --hard` auf geteilte Commits, nie fremde Änderungen beim Konfliktlösen verwerfen.
- Gegenseitig nicht im Weg stehen: Bevor du eine größere Aufgabe anfängst, trag sie in `NOTIZEN.md` unter „In Arbeit“ ein (wer, was, welche Dateien) und pushe das sofort. Steht dort schon etwas zu denselben Dateien von der anderen Person, sag es dem Nutzer, bevor du loslegst. Ist die Aufgabe fertig, nimm den Eintrag wieder raus.
- Geteilte Grundlagen (`web/src/lib/`, Layout, Datenbank-Schema) nur in kleinen, abwärtskompatiblen Schritten ändern und direkt pushen.
