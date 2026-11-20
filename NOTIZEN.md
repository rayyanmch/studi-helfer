# Projektnotizen

Gemeinsames Gedächtnis für alle KI-Agenten und Menschen im Projekt. Wird über `CLAUDE.md` automatisch geladen.
**Agenten:** Wenn du etwas Wichtiges herausfindest oder entscheidest (Stolperfalle, Architektur, verworfene Idee, externe Eigenheit), trag es hier kurz ein: mit Datum, eine Zeile pro Punkt, Neues oben. Veraltetes löschen statt stapeln.

## Entscheidungen

- 2026-11-20: **Web-App statt Rust.** Next.js/TypeScript ist in zwei Tagen viel schneller gebaut, KI-Agenten können es am besten, und für Supabase, Claude und UI-Komponenten gibt es fertige Pakete. Rust bringt hier keinen Vorteil. Falls später eine Desktop-App gewünscht ist: Tauri um die bestehende Web-App legen.
- 2026-11-20: **Laptop zuerst**, aber responsiv. Später als PWA installierbar (Laptop und Handy).
- 2026-11-20: **Supabase** für Daten, Login und Datei-Speicher (Folien).
- 2026-11-20: **KI = Claude API, nur serverseitig.** Die App bezahlt die Aufrufe zentral, Nutzer brauchen keinen Key. Modell über `AI_MODEL` (Standard `claude-opus-5-5`). Günstiger: `claude-sonnet-5-5` oder `claude-haiku-5-5`. PDFs gehen direkt als `document`-Block an die API, kein eigenes PDF-Parsing nötig.
- 2026-11-20: **ILIAS über PFERD** (v3.10.1, MIT) als Python-Dienst statt eigenem Scraper. PFERD lädt nur Dateien; Termine kommen aus dem iCal-Export des ILIAS-Kalenders.

## Wissen und Stolperfallen

- ILIAS Uni Köln: `base_url = https://www.ilias.uni-koeln.de/ilias`, Login-Seite nutzt `client_id=uk`, deshalb PFERD mit `login_type = local`. Die Config parst, ein echter Login ist noch nicht getestet.
- Next.js 16: `npx tsc --noEmit` meldet `Cannot find name 'LayoutProps'`, solange `.next/types` fehlt. Diese Typen erzeugt erst `next build`/`next dev`. Kein echter Fehler.
- `web/AGENTS.md` wird von `next dev` neu geschrieben. Nicht von Hand ändern.
- Strukturierte KI-Antworten: `client.beta.messages.parse` + `betaZodOutputFormat` (siehe `extractFromSlides` in `web/src/lib/ai.ts`).

## Offen

- [ ] Supabase-Projekt anlegen, Keys in `.env.local` beider Rechner
- [ ] Anthropic-API-Key besorgen
- [ ] PFERD mit echtem Uni-Account gegen ILIAS Köln testen
- [ ] Aufteilen, wer was baut (README → „Wer macht was“)
