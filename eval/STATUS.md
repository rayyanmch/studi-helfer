# Prüfstand Erkennung – Stand

Messlatte für die Regel-Erkennung (ohne KI). Der Loop „Erkennung“ liest diese Datei zu Beginn jeder Runde und aktualisiert sie am Ende.

## Aufruf

```bash
services/ilias-sync/.venv/bin/python eval/run.py      # orga.py + sheets.py (≈ 15 s, echte PDFs aus ~/Uni)
node eval/run-web.mjs                                 # doctype.ts, solutions.ts, modules.js (< 1 s)
```

Filter: `… run.py beginn` (nur Fälle mit „beginn“ in der Id, speichert dann nichts). `-v` zeigt auch Details bestandener Fälle, `--no-save` lässt `results/*.json` unverändert. Exit-Code 2 = ein vorher bestandener Fall schlägt jetzt fehl.

- **Echte Fälle** (`cases/real/`): Kursordner in `~/Uni`, erwartete Werte von Hand aus den PDFs gelesen (Seiten stehen im Fall). PDFs und Text liegen nie im Repo. Fehlt eine Quelldatei oder hat sich ihr SHA-256 geändert, wird der Fall übersprungen (bei Mika z. B. alle echten Fälle).
- **Ausgedachte Fälle** (`cases/synthetic/`): Der Prüfstand baut daraus echte PDFs (Füllseiten, Dateiname, Änderungsdatum) und schickt sie durch dieselbe Pipeline wie die App (`orga.refresh()`, `sheets.refresh()` mit eigenem Datenordner). Ohne Angabe gilt: Übrige PDFs im Fall dürfen keine Fristen liefern.
- **Beginn** wird als „erster Termin je Art und Wochentag“ verglichen (Regel aus `schedule.js`), egal ob über „Beginn: …“ oder „ab Woche 3“ erkannt.
- `optional` in einem Fall = darf gefunden werden, muss aber nicht (z. B. Anmeldefristen).
- **Erwartete Werte nie an den Code anpassen.** Nur ändern, wenn Rayyan es bestätigt; Fragen unten sammeln.
- **Fair vergleichen:** Neue Fälle zuerst mit dem alten Code laufen lassen und speichern (`run.py` ohne Filter), erst dann die Regel ändern und erneut laufen lassen. Sonst zählen die Fehler der neuen Fälle gegen die Änderung.

## Punktzahl

| Runde | Datum | Python (Fehler · bestanden) | Web (Fehler · bestanden) | Änderung |
|---|---|---|---|---|
| 1 | 2026-11-25 | 57 · 51/71 | 13 · 11/17 | Prüfstand gebaut, noch keine Regel geändert |
| 2 | 2026-11-25 | 67 → 59 · 51 → 55/76 | 13 · 11/17 | Beginn (orga.py, RULES_VERSION 5): „Gruppen“ = Übung, Beginn der Anmeldung zählt nicht, Beginn > 6 Wochen nach dem frühesten zählt nicht. 5 neue Fälle (67 = alter Code mit neuen Fällen). Seitenlimit verworfen, siehe unten |
| 25 | 2026-11-25 | 0 · 141/141 | 1 → 0 · 38/38 | Keine Regel geändert: Rayyan bestätigt „LinA I“ als Kurzname (Frage 5), Erwartung in `modules/uebungen-zur` ergänzt. **Alle Fälle bestehen.** |
| 24 | 2026-11-25 | 0 · 141/141 | 1 · 37/38 | **Prüfstand für Themenwochen** (`weeks.ts`, run-web.mjs; `ts-resolve.mjs` ergänzt „.ts“ beim Import ohne Endung). Echt: BWL (75 Dateien, Woche aus „Woche N“) und ISM (16 Dateien, Woche aus dem Sitzungsdatum) stimmen; 5 ausgedachte Fälle (Week-Ordner, KW, alles am selben Tag, Übung zum Thema, Orga/Altklausur) bestehen. ISM-Übungen landen in der Themenwoche statt der Sitzungswoche → beides erlaubt, Frage 6. **Loop beendet:** einziger offener Fehler („LinA I“) wartet auf Frage 5 |
| 23 | 2026-11-25 | 6 → 0 · 135 → 141/141 | 1 · 30/31 | **Titel werden jetzt geprüft** (run.py: `title` in erwarteten sheets-Einträgen, Liste erlaubter englischer Titel; 6 = alter Code mit den neuen Erwartungen). sheets.py RULES_VERSION 12: Beim Zusammenfassen kommt der Titel vom Treffer in der Datumszeile, die Uhrzeit von dem, der eine hat; Text hinter dem Datum wird nur Titel, wenn dort das Fristwort steht. Visualisierung-Klausur heißt jetzt „Exam“ statt „Organisatorisches exam exam“, alle anderen echten Titel unverändert. 3 neue Fälle |
| 22 | 2026-11-25 | 0 · 138/138 | 6 → 1 · 28 → 30/31 | Ankündigungen sind Kurs-Info (doctype.ts `RE.announce`): Gremien-/Hochschul-/Fachschaftswahl, Lehrevaluation, Ankündigung, Announcement. „Wahlen und Wahlsysteme“ und „Lecture 9 - Evaluation“ bleiben Vorlesung (Fallen). Echter Fall Visualisierung besteht jetzt auch bei der Dokument-Art. lint + build ok. 1 neuer Fall mit 6 Dateien |
| 21 | 2026-11-25 | 0 · 138/138 | 7 → 2 · 27 → 28/30 | Bilder (doctype.ts `RE.image`: gif, png, jpg, svg, webp …) sind „File“, in Video-/Aufzeichnungsordnern „Video“, nie Vorlesung (echt: GIF bei Visualisierung). Gegenproben: PDFs mit „Bilder“ im Namen bleiben Vorlesung. lint + build ok. 1 neuer Fall mit 6 Dateien |
| 20 | 2026-11-25 | 0 · 138/138 | 6 → 3 · 25 → 27/29 | Übungsfolien mit Nummer oder Wörtern dazwischen (doctype.ts `exslides`): „Exercise 3 Slides“, „Exercise_05_slides“, „Slides Exercise Session 7“. Gegenproben „Exercises 3“ (Blatt) und „Slides Lecture 5“ (Vorlesung) halten. lint + build ok. 1 neuer Fall mit 5 Dateien |
| 19 | 2026-11-25 | 0 · 138/138 | 10 → 4 · 23 → 25/28 | Lösungs-Wort (solutions.ts, doctype.ts, modules.js `CATEGORIES`): „answers_week3“, „Answers-Sheet4“, „HW2_answer_key“ zählen; „Lösungsverfahren/-mengen/-strategien/-ansatz/-raum/-methode“ sind keine Lösung (Vorlesungsthemen); „Lösungsvorschlag“ bleibt Lösung. lint + build in web/ ok. 2 neue Fälle mit 8 Dateien, davon 3 Fallen |
| 18 | 2026-11-25 | 0 · 138/138 | 21 → 7 · 18 → 22/26 | Module: „Übung(en) zu/zur/zum (den) …“, „Tutorium zur …“, „Exercises for …“ markieren den Teil; gebeugte Endungen zählen beim Vergleich nicht („Linearen“ = „Lineare“). 5 neue Fälle, davon 1 Falle. Rayyans 15 Module unverändert. Rest bei „Übungen zur Linearen Algebra I“: Kurzname „LinA I“ (Frage 5) |
| 17 | 2026-11-25 | 0 · 138/138 | 18 → 9 · 12 → 17/21 | Module (desktop/lib/modules.js): Semester vorn ohne Klammern („WS 26/27 …“, „SoSe 2027: …“, „Wintersemester 2026/27 – …“) und hinten in mehr Schreibweisen („(Winter 2026)“, „(Fall 2026)“, auch vor „- Exercises“); gebündelt wird nach Grundnamen, getrennt nur bei verschiedenen bekannten Semestern (`normSemester`: „[WS26/27]“ = „WiSe 2026/27“ = „Winter 2026“). 4 neue Fälle, davon 1 Falle. Für Rayyans echte config.json alle 15 Module unverändert (kein Ordner wird umbenannt) |
| 16 | 2026-11-25 | 7 → 0 · 133 → 138/138 | 13 · 11/17 | Englische Raum-Wörter (orga.py RULES_VERSION 15): „Lecture Theatre/Theater“, „Auditorium“, „Audimax“, „Classroom“, „Seminar/Tutorial Room“ (Seminar Room → Übung wie Seminarraum, nicht Art „Seminar“). „Prüfungsort: …“ in der Zeile darunter ist nicht der Raum des Kurstermins (war nach der Erweiterung ein Rückschritt, sofort behoben). 5 neue Fälle, davon 1 Falle. **Python-Prüfstand komplett grün** |
| 15 | 2026-11-25 | 12 → 2 · 129 → 132/133 | 13 · 11/17 | „Room 101“ ist kein Seminarraum mehr (orga.py RULES_VERSION 14, `SMALL_ROOM`: nur „Room S…“); eine Raumnummer allein sagt nichts über die Art. Gegenproben Seminarraum und „Room S234“ bleiben Übung. 4 neue Fälle, davon 2 Gegenproben |
| 14 | 2026-11-25 | 9 → 6 · 124 → 127/129 | 13 · 11/17 | Fußzeilen (sheets.py RULES_VERSION 11): Eine Zeile, die ohne Ziffern mehrfach im Dokument steht, ist Kopf-/Fußzeile; ihr Datum wird nicht an eine Überschrift in der Zeile darüber gehängt („HOMEWORK PRESENTATION“ / „… Engineering 19.11.2026“). Kopfzeile mit Fristwort auf jeder Seite zählt weiter. **Alle echten Fälle bestehen.** 4 neue Fälle, davon 2 Fallen |
| 13 | 2026-11-25 | 12 → 8 · 117 → 121/125 | 13 · 11/17 | Fristwörter (sheets.py RULES_VERSION 10): „Bearbeitung(szeit) bis“, „bearbeiten bis“, „Fällig am/bis“, „upload … by/until/before“. „bis spätestens“ allein bewusst nicht (Falle „Korrekturen erhalten Sie bis spätestens …“). 4 neue Fälle, davon 1 Falle |
| 12 | 2026-11-25 | 29 → 9 · 109 → 116/121 | 13 · 11/17 | Räume aus beschrifteten Ort-Zeilen (orga.py RULES_VERSION 13): „Veranstaltungsort:“, „Abhaltungsort:“ (+ nächste Zeile), „Ort:“, „Location:“, „Venue:“ gelten für alle Termine derselben Seite ohne eigenen Raum, davor oder danach; „Prüfungsort“ zählt nicht. Dafür liest `analyze_file` seitenweise (`PAGE` zwischen den Seiten). Prüfstand kann jetzt „kein Raum“ prüfen (`noRoom`). **Echter Fall Visualisierung besteht komplett.** 5 neue Fälle, davon 2 Fallen |
| 11 | 2026-11-25 | 41 → 23 · 103 → 107/116 | 13 · 11/17 | Gruppennummer aus der kurzen Listenzeile davor auch mit Aufzählungszeichen („• Gruppe 1“ / „• Mo 14:00“, „- Gruppe 1“, „* Group 4“) (orga.py RULES_VERSION 12). Echt Visualisierung: 6 Wahltermin-Doppel weg (14 → 8, nur noch Räume). 4 neue Fälle, davon 1 Falle |
| 10 | 2026-11-25 | 56 → 31 · 97 → 102/112 | 13 · 11/17 | Gruppen ohne Art-Wort sind Übungen (orga.py RULES_VERSION 11): „Gruppe 1: Mo 14-16“, „Group 1: Monday …“, „Grp. 1 Do …“, Gruppennummer über einer Tabellenzeile; „Vorlesung Gruppe 1: …“ bleibt Vorlesung (Art steht in der Zeile). 4 neue Fälle, davon 1 Falle |
| 9 | 2026-11-25 | 53 → 46 · 91 → 96/108 | 13 · 11/17 | Zusatztermine (orga.py RULES_VERSION 10): „Zusätzlicher/Weiterer Termin“, „Nachholtermin“, „Extra meeting“; zusätzliche Sprechstunden zählen nicht; Datum mit Monatsnamen zwischen Wochentag und Uhrzeit („Wednesday, 25 November 2026, 18:00“, „Montag, 15. März 2027 09:00“) macht einen Einzeltermin statt eines Wochentermins. Damit auch „Nachklausur“ als Wochentermin behoben (echt Visualisierung). 4 neue Fälle, davon 1 Falle |
| 8 | 2026-11-25 | 55 → 49 · 86 → 90/104 | 13 · 11/17 | Tabellen-Zellen (orga.py RULES_VERSION 9): Zeile nur mit Wochentag + nächste Zeile mit Uhrzeit-Spanne werden verbunden (auch mit „|“ und „Mo.“); „Sprechstunde“ als Überschrift schaltet die Zeiten darunter ab. 4 neue Fälle, davon 1 Falle. Echte Fälle unverändert |
| 7 | 2026-11-25 | 57 → 51 · 81 → 85/100 | 13 · 11/17 | Erste Vorlesung ohne Orga-Namen ist Kandidat (orga.py RULES_VERSION 8, `FIRST_UNIT`: „Vorlesung_01“, „Lecture 1“, „VL 01“, „Week 1“, „Kapitel 1“ …), schwächer als Orga-Dateien; daraus zählen nur Termine mit Art oder Raum. 4 neue Fälle, davon 1 Falle (Stoff im ersten Kapitel). Echt neu gelesen: nur `ISM_…_UB01_…_Teil1.pdf`, ohne Wirkung |
| 6 | 2026-11-25 | 58 → 53 · 75 → 80/96 | 13 · 11/17 | Aufzählung von Wochentagen (orga.py RULES_VERSION 7): „dienstags und donnerstags von 8:15 bis 9:45“, „Mo und Mi“, „Di/Do 14-16“, „Montag, Mittwoch und Freitag, 8–9“, „Tuesdays and Thursdays“; „Mo–Fr“ bleibt ein Zeitraum. 5 neue Fälle, davon 1 Falle. Echte Fälle unverändert |
| 5 | 2026-11-25 | 60 → 53 · 69 → 74/91 | 13 · 11/17 | Tests (sheets.py RULES_VERSION 9): „Test 1“, „Bonus-/Kurz-/Online-Test“, „Quiz 1“ sind Termine, aber nur mit Uhrzeit (Testfälle und Sätze wie „Im Test am …“ bleiben draußen); Zeitraum „12-12:30 Uhr“ beginnt um 12:00 (vorher 12:30). 5 neue Fälle, davon 2 Fallen. Echter Fall Mathe besteht jetzt komplett |
| 4 | 2026-11-25 | 64 → 57 · 61 → 67/86 | 13 · 11/17 | Klausur-Wörter (sheets.py RULES_VERSION 8): „Prüfungstermin/-datum“, „Modulprüfung“, „Klausurdatum“, „Written examination“; „Anmeldung zur Klausur bis …“, „Prüfungsanmeldung“, „Prüfungseinsicht“ sind keine Klausurtermine mehr (war ein Fehlalarm); „Mock exam“ ist Termin, nicht Klausur; englische Titel für die neuen Wörter. 6 neue Fälle. Mathe: beide Klausuren gefunden |
| 3 | 2026-11-25 | 63 → 58 · 56 → 61/80 | 13 · 11/17 | Seitenlimit: Orga-Dateien bis Seite 200 (orga.py RULES_VERSION 6, sheets.py 7, `ORGA_HINT` kennt jetzt auch Kick-off/Überblick/Woche 0), Zeilen mit „Beispiel/z. B./example“ sind keine Wochentermine. 4 neue Fälle. Visualisierung: alle 8 Termine, Beginn und beide Klausuren + Abgabe gefunden; offen dort nur noch Räume und Wahltermin-Doppel |

Laufzeit: orga 69 Dateien 1,3 s (langsamste 0,14 s), sheets 212 Dateien 13,6 s (langsamste 0,84 s: `uebung_1_rayyan_…pdf`, eigene eingescannte Abgabe). Pro Datei-Hash gecacht, läuft also je Datei einmal; nichts davon beim App-Start. Kein Handlungsbedarf bei der Geschwindigkeit.
Runde 12: orga langsamste Datei 0,86 s (`00_AlgebraGrundwissen.pdf`, 84 Seiten). Gemessen: Lesen mit pypdf 0,85–0,87 s (alter und neuer Weg gleich), Regeln 0,03 s. In Runde 7 waren es 0,43 s für dasselbe Lesen → schwankt mit der Auslastung des Macs, kein Rückschritt der Regeln.

## Offene Fehler (nach Nutzen)

1. ~~Seitenlimit 25~~ (Runde 3), ~~„Prüfungstermin“~~ (Runde 4), ~~Bonustests~~ (Runde 5).
   - **Python komplett grün (Runde 16), Web komplett grün (Runde 25, nach Rayyans Ja zu „LinA I“).**
   - ~~Titel prüfen~~ (Runde 23), ~~Prüfstand für `weeks.ts`~~ (Runde 24).
   - **Loop beendet nach Runde 24.** Offen ist nur, was Rayyan entscheiden muss (Fragen 1–4 und 6). Ideen für später: Mikas Orga-Folien (Database Systems, Programmierung) und Folien anderer Fakultäten/Unis als echte Fälle; „Short test in Übung“ (halb übersetzter Titel); Wochen für SE/Mathe/Visualisierung (Wahrheit braucht Vorlesungsdaten).
   - Wichtig bei modules.js: Modulnamen sind Ordnernamen in `~/Uni` (`applyLayout` verschiebt). Vor dem Behalten immer alt/neu für Rayyans config.json vergleichen (Skript in Runde 17: `buildModules` mit `object-parents.json`).
2. ~~Übungsgruppen werden zur Vorlesung~~ (Runde 10).
3. ~~Doppelte Gruppen ohne Nummer~~ (Runde 11).
4. ~~Beginn falsch~~ (Runde 2 behoben).
5. ~~„Nachklausur“ als Wochentermin~~ (Runde 9, über das Datum in der Zeile). `SKIP` kennt „Nachklausur“ weiterhin nicht (ohne Datum würde es wieder passieren).
6. ~~Zwei Wochentage, eine Uhrzeit~~ (Runde 6), ~~„Room 101“ als Übung~~ (Runde 15).
7. ~~Tabellen-Zellen untereinander~~ (Runde 8).
8. ~~Orga-Folie in Datei ohne Orga-Namen~~ (Runde 7, erste Vorlesung). Nicht abgedeckt: Orga nur in einer späteren Vorlesung (Visualisierung wiederholt die Zeiten in `Vis-V02_ViewsTools.pdf` S. 3, steht aber auch in der Orga-Datei).
9. ~~Raum aus Ort-Zeile davor/danach~~ (Runde 12), ~~englische Raum-Wörter~~ (Runde 16).
10. ~~Zusatztermin~~ (Runde 9).
11. ~~„Bearbeitung bis“~~ (Runde 13), ~~Fußzeilen-Datum~~ (Runde 14).
13. ~~Titel~~ (Runde 23 gemessen und behoben; Rest: „Short test in Übung“ ist noch halb übersetzt, kein Fall dafür). Früher: Visualisierung-Klausur heißt „Organisatorisches exam exam“, weil die Überschrift „Organisatorisches: Klausur“ mit der Zeile darunter verbunden wird und der Eintrag mit der direkten Zeile beim Zusammenfassen verliert. Idee: beim Zusammenfassen Treffer mit Fristwort und Datum in derselben Zeile bevorzugen; im Prüfstand `title` in erwarteten Einträgen prüfen. Ebenso „Kurztest … (in der Übung)“ → „Short test in Übung“ (Rest nach dem Fristwort halb übersetzt).
12. **Web**: `.gif` im Vorlesungsordner wird „Lecture“; „Gremienwahlen“-Folien sind keine Vorlesung; „Lösungsverfahren …“ ist keine Lösung; `answers_week3` wird nicht als Lösung erkannt; „Exercise 3 Slides“ → Übungsfolien; Module: „Übungen zur Linearen Algebra I“ gehört zu „Lineare Algebra I“, „WS 26/27 Datenbanksysteme“ (Semester vorn ohne Klammer) braucht einen Namen ohne Semester, „… – Tutorials“ gehört zum Kurs.

Hinweis zur App: Gleiche Gruppe aus ILIAS-Gruppe und Orga-Folie (Visualisierung Gruppe 6) ergibt dieselbe Termin-Id, `backend.js` zeigt sie nur einmal. Wahltermine ohne eigene Gruppe erscheinen nur in der Auswahl der Übungszeiten, nicht im Kalender.

## Noch nicht abgedeckt

- `textfix.py` nur indirekt (über echte PowerPoint-PDFs wie SE).
- Wochen nur für BWL und ISM echt geprüft (dort steht die Woche eindeutig im ILIAS-Pfad).

## Verworfene Versuche

- **Runde 2, Seitenlimit auf 250** (orga + sheets): 57 → 58 Fehler. In Runde 3 nach dem Beginn-Fix gelungen (mit Beispiel-Regel). Visualisierung findet dann alle 8 Termine und die Klausuren, deckt aber Folgefehler im selben Fall auf (Räume fehlen 8×, Gruppen ohne Nummer doppelt 6×, Nachklausur als Wochentermin, Beginn falsch). Erst die Folgefehler beheben (Beginn: erledigt in Runde 2), dann erneut. Lesezeit war kein Problem: orga 2,3 s statt 1,3 s für alle Dateien, langsamste 0,43 s.

## Fragen an Rayyan

1. **ISM**: Folie 11 sagt „Beginn: Donnerstag, 15.10.2026“, Folie 12: am 21.10. ist im Übungsslot ausnahmsweise Vorlesung. Erwartet ist jetzt: erste Übung am 21.10. (Datum laut Folie). Soll die Übung erst ab 28.10. zählen?
2. **Mathe**: Die Bonustests (02.12. und 20.01., 12:00) erwarte ich als normalen Termin, nicht als Klausur (keine KLIPS-Anmeldung). Passt das?
3. **Visualisierung**: Raum der Übungsgruppen erwarte ich als „Weyertal 121, Raum 5.08“ (Folie 93). Stimmt das für deine Gruppe 6?
4. **Visualisierung**: Sind `Uebung01.pdf` … `Uebung06.pdf` Übungsfolien oder Übungsblätter? (Im Moment ist beides erlaubt.)
6. **Wochen von Übungen (ISM)**: „UB01_Informationssysteme“ liegt in ILIAS in der Sitzung vom 28.10. (3. Woche), `weeks.ts` ordnet es aber der Vorlesung mit gleichem Thema zu (VL01, 1. Woche) – so ist „Themenwoche“ gedacht. Soll eine Übung zur Woche ihres Themas gehören (jetzt) oder zur Woche, in der sie stattfindet? Im Moment ist beides erlaubt.

### Beantwortet

- 5. **Kurzname „LinA I“** (25.11.): Rayyan: „LinA I passt.“ Gilt jetzt neben „Lineare Algebra I“ und „LA I“ als richtig.
