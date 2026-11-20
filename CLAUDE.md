# Studi-Helfer – Regeln für KI-Agenten

Hackathon-Projekt, zwei Leute vibecoden parallel (Rayyan, Mika). Deadline Sonntag Mittag: lieber eine Funktion, die in der Demo sicher läuft, als drei halbe.

## Gemeinsames Gedächtnis

@NOTIZEN.md

Neue wichtige Erkenntnisse und Entscheidungen trägst du in `NOTIZEN.md` ein und committest sie mit, damit der Agent der anderen Person sie auch kennt.

## Aufbau

- `web/`: Next.js 16 (App Router, TypeScript, Tailwind 4). UI, API-Routen, KI-Aufrufe. Laptop zuerst, aber responsiv fürs Handy.
- `services/ilias-sync/`: Python-Dienst um PFERD, holt Dateien aus dem ILIAS der Uni Köln.
- Daten, Login und Datei-Speicher: Supabase. KI: Claude API über `web/src/lib/ai.ts`.

Next.js 16 weicht von älterem Wissen ab: Vor neuem Next-Code die passende Doku in `web/node_modules/next/dist/docs/` lesen (siehe `web/AGENTS.md`).

## Regeln

- Sprache der Oberfläche: Deutsch. Code-Bezeichner dürfen Englisch sein.
- Secrets nur in `web/.env.local` (Vorlage: `web/.env.example`). Nie committen, nie in Client-Code.
- KI-Aufrufe und der Anthropic-Key laufen nur serverseitig (Route Handler / Server Actions, `import "server-only"`). Nutzer brauchen keinen eigenen Key.
- Uni-Zugangsdaten nie speichern oder loggen.
- Supabase: Für Code im Browser `@/lib/supabase/client`, für Server-Code `@/lib/supabase/server`. Tabellen bekommen Row Level Security.
- Vor jedem Commit in `web/`: `npm run lint` und `npm run build` müssen durchlaufen.

## Zusammenarbeit

- Nie direkt auf `main` arbeiten: pro Feature ein Branch (`feature/kalender`, `feature/merkzettel` …), kleine Pull Requests, zügig mergen.
- Vor dem Start `git pull` auf `main`, damit beide auf demselben Stand sind.
- Wer an welchem Bereich arbeitet, steht in der README unter „Wer macht was“. Fremde Bereiche nur nach Absprache umbauen.
