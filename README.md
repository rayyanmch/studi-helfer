# Studi-Helfer

Hackathon-Projekt (Deadline: Sonntag Mittag): ein Assistent für Studierende, der ILIAS, Moodle & Co. an einem Ort zusammenführt und mit KI das Organisieren übernimmt.

## Feature-Ideen

- **ILIAS-Anbindung**: Dateien über [PFERD](https://github.com/Garmelon/PFERD), Termine über den iCal-Export des ILIAS-Kalenders
- **Smarter Kalender**: Termine automatisch aus Folien und ILIAS übernehmen (Abgaben, Klausuren, Übungen)
- **KI-Merkzettel**: Lernzettel aus Vorlesungsfolien erzeugen
- **Moodle** (später): über die offizielle Mobile-App-API
- … weitere Ideen kommen hier rein

## Tech-Stack

| Bereich | Wahl |
|---|---|
| Web-App | Next.js 16, TypeScript, Tailwind 4 (`web/`) |
| Daten, Login, Dateien | Supabase |
| KI | Claude API (`web/src/lib/ai.ts`), Key nur auf dem Server |
| ILIAS | PFERD als Python-Dienst (`services/ilias-sync/`) |
| Deploy | Vercel (Web), Dienst lokal bzw. Render/Fly |

## Setup

```bash
git clone https://github.com/rayyanmch/studi-helfer.git
cd studi-helfer/web
npm install
cp .env.example .env.local   # Keys eintragen
npm run dev
```

Dann http://localhost:3000 öffnen. ILIAS-Dienst: siehe [services/ilias-sync](services/ilias-sync/README.md).

## Wer macht was

| Bereich | Wer |
|---|---|
| … | … |

## Team

- [rayyanmch](https://github.com/rayyanmch)
- [Mika-mng](https://github.com/Mika-mng)
