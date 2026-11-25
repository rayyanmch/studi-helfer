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
| 10 | 2026-11-25 | 56 → 31 · 97 → 102/112 | 13 · 11/17 | Gruppen ohne Art-Wort sind Übungen (orga.py RULES_VERSION 11): „Gruppe 1: Mo 14-16“, „Group 1: Monday …“, „Grp. 1 Do …“, Gruppennummer über einer Tabellenzeile; „Vorlesung Gruppe 1: …“ bleibt Vorlesung (Art steht in der Zeile). 4 neue Fälle, davon 1 Falle |
| 9 | 2026-11-25 | 53 → 46 · 91 → 96/108 | 13 · 11/17 | Zusatztermine (orga.py RULES_VERSION 10): „Zusätzlicher/Weiterer Termin“, „Nachholtermin“, „Extra meeting“; zusätzliche Sprechstunden zählen nicht; Datum mit Monatsnamen zwischen Wochentag und Uhrzeit („Wednesday, 25 November 2026, 18:00“, „Montag, 15. März 2027 09:00“) macht einen Einzeltermin statt eines Wochentermins. Damit auch „Nachklausur“ als Wochentermin behoben (echt Visualisierung). 4 neue Fälle, davon 1 Falle |
| 8 | 2026-11-25 | 55 → 49 · 86 → 90/104 | 13 · 11/17 | Tabellen-Zellen (orga.py RULES_VERSION 9): Zeile nur mit Wochentag + nächste Zeile mit Uhrzeit-Spanne werden verbunden (auch mit „|“ und „Mo.“); „Sprechstunde“ als Überschrift schaltet die Zeiten darunter ab. 4 neue Fälle, davon 1 Falle. Echte Fälle unverändert |
| 7 | 2026-11-25 | 57 → 51 · 81 → 85/100 | 13 · 11/17 | Erste Vorlesung ohne Orga-Namen ist Kandidat (orga.py RULES_VERSION 8, `FIRST_UNIT`: „Vorlesung_01“, „Lecture 1“, „VL 01“, „Week 1“, „Kapitel 1“ …), schwächer als Orga-Dateien; daraus zählen nur Termine mit Art oder Raum. 4 neue Fälle, davon 1 Falle (Stoff im ersten Kapitel). Echt neu gelesen: nur `ISM_…_UB01_…_Teil1.pdf`, ohne Wirkung |
| 6 | 2026-11-25 | 58 → 53 · 75 → 80/96 | 13 · 11/17 | Aufzählung von Wochentagen (orga.py RULES_VERSION 7): „dienstags und donnerstags von 8:15 bis 9:45“, „Mo und Mi“, „Di/Do 14-16“, „Montag, Mittwoch und Freitag, 8–9“, „Tuesdays and Thursdays“; „Mo–Fr“ bleibt ein Zeitraum. 5 neue Fälle, davon 1 Falle. Echte Fälle unverändert |
| 5 | 2026-11-25 | 60 → 53 · 69 → 74/91 | 13 · 11/17 | Tests (sheets.py RULES_VERSION 9): „Test 1“, „Bonus-/Kurz-/Online-Test“, „Quiz 1“ sind Termine, aber nur mit Uhrzeit (Testfälle und Sätze wie „Im Test am …“ bleiben draußen); Zeitraum „12-12:30 Uhr“ beginnt um 12:00 (vorher 12:30). 5 neue Fälle, davon 2 Fallen. Echter Fall Mathe besteht jetzt komplett |
| 4 | 2026-11-25 | 64 → 57 · 61 → 67/86 | 13 · 11/17 | Klausur-Wörter (sheets.py RULES_VERSION 8): „Prüfungstermin/-datum“, „Modulprüfung“, „Klausurdatum“, „Written examination“; „Anmeldung zur Klausur bis …“, „Prüfungsanmeldung“, „Prüfungseinsicht“ sind keine Klausurtermine mehr (war ein Fehlalarm); „Mock exam“ ist Termin, nicht Klausur; englische Titel für die neuen Wörter. 6 neue Fälle. Mathe: beide Klausuren gefunden |
| 3 | 2026-11-25 | 63 → 58 · 56 → 61/80 | 13 · 11/17 | Seitenlimit: Orga-Dateien bis Seite 200 (orga.py RULES_VERSION 6, sheets.py 7, `ORGA_HINT` kennt jetzt auch Kick-off/Überblick/Woche 0), Zeilen mit „Beispiel/z. B./example“ sind keine Wochentermine. 4 neue Fälle. Visualisierung: alle 8 Termine, Beginn und beide Klausuren + Abgabe gefunden; offen dort nur noch Räume und Wahltermin-Doppel |

Laufzeit: orga 69 Dateien 1,3 s (langsamste 0,14 s), sheets 212 Dateien 13,6 s (langsamste 0,84 s: `uebung_1_rayyan_…pdf`, eigene eingescannte Abgabe). Pro Datei-Hash gecacht, läuft also je Datei einmal; nichts davon beim App-Start. Kein Handlungsbedarf bei der Geschwindigkeit.

## Offene Fehler (nach Nutzen)

1. ~~Seitenlimit 25~~ (Runde 3), ~~„Prüfungstermin“~~ (Runde 4), ~~Bonustests~~ (Runde 5).
   - Verpasste Termine sind abgearbeitet. Nächster großer Nutzen: Doppel (3), dann Räume (9) für Visualisierung, dann sheets-Reste (11) und Web (12).
2. ~~Übungsgruppen werden zur Vorlesung~~ (Runde 10).
3. **Doppelte Gruppen ohne Nummer**, wenn Nummer und Zeit in getrennten Zeilen stehen und die Zeile mit „•“ beginnt (`before` ist dann nicht leer, die Nummer aus der Zeile davor wird nicht genommen). Visualisierung Folie 94 (6 Fehlalarme), `gruppen/zweimal-aufgelistet`. **Nächster Kandidat.**
4. ~~Beginn falsch~~ (Runde 2 behoben).
5. ~~„Nachklausur“ als Wochentermin~~ (Runde 9, über das Datum in der Zeile). `SKIP` kennt „Nachklausur“ weiterhin nicht (ohne Datum würde es wieder passieren).
6. ~~Zwei Wochentage, eine Uhrzeit~~ (Runde 6). Rest: **„Room 101“ macht aus einem Termin eine Übung** (`SMALL_ROOM` hat `room\s+s?\d`, gedacht für Kölner „Room S234“). `zeit/two-days-one-range-en` („Class meetings … Room 101“ ist eine Vorlesung).
7. ~~Tabellen-Zellen untereinander~~ (Runde 8).
8. ~~Orga-Folie in Datei ohne Orga-Namen~~ (Runde 7, erste Vorlesung). Nicht abgedeckt: Orga nur in einer späteren Vorlesung (Visualisierung wiederholt die Zeiten in `Vis-V02_ViewsTools.pdf` S. 3, steht aber auch in der Orga-Datei).
9. **Raum**: Zeile davor („Veranstaltungsort: …“), unter der ganzen Liste („Abhaltungsort:“), englische Zeilen ohne Raum-Wort („Lecture Theatre 2“).
10. ~~Zusatztermin~~ (Runde 9).
11. **sheets**: „Bearbeitung bis Di. … 23:55“ ist eine Abgabe; Fußzeilen-Datum unter „HOMEWORK PRESENTATION“ wird Termin (echt: `SSE_Exercise04.pdf`).
13. **Titel** (Prüfstand misst sie noch nicht): Visualisierung-Klausur heißt „Organisatorisches exam exam“, weil die Überschrift „Organisatorisches: Klausur“ mit der Zeile darunter verbunden wird und der Eintrag mit der direkten Zeile beim Zusammenfassen verliert. Idee: beim Zusammenfassen Treffer mit Fristwort und Datum in derselben Zeile bevorzugen; im Prüfstand `title` in erwarteten Einträgen prüfen. Ebenso „Kurztest … (in der Übung)“ → „Short test in Übung“ (Rest nach dem Fristwort halb übersetzt).
12. **Web**: `.gif` im Vorlesungsordner wird „Lecture“; „Gremienwahlen“-Folien sind keine Vorlesung; „Lösungsverfahren …“ ist keine Lösung; `answers_week3` wird nicht als Lösung erkannt; „Exercise 3 Slides“ → Übungsfolien; Module: „Übungen zur Linearen Algebra I“ gehört zu „Lineare Algebra I“, „WS 26/27 Datenbanksysteme“ (Semester vorn ohne Klammer) braucht einen Namen ohne Semester, „… – Tutorials“ gehört zum Kurs.

Hinweis zur App: Gleiche Gruppe aus ILIAS-Gruppe und Orga-Folie (Visualisierung Gruppe 6) ergibt dieselbe Termin-Id, `backend.js` zeigt sie nur einmal. Wahltermine ohne eigene Gruppe erscheinen nur in der Auswahl der Übungszeiten, nicht im Kalender.

## Noch nicht abgedeckt

- `web/src/lib/weeks.ts` (Themenwochen): eigener Prüfstand fehlt noch (braucht Dateien mit Datum und ILIAS-Sitzungen; gut als ausgedachte Fälle).
- `textfix.py` nur indirekt (über echte PowerPoint-PDFs wie SE).

## Verworfene Versuche

- **Runde 2, Seitenlimit auf 250** (orga + sheets): 57 → 58 Fehler. In Runde 3 nach dem Beginn-Fix gelungen (mit Beispiel-Regel). Visualisierung findet dann alle 8 Termine und die Klausuren, deckt aber Folgefehler im selben Fall auf (Räume fehlen 8×, Gruppen ohne Nummer doppelt 6×, Nachklausur als Wochentermin, Beginn falsch). Erst die Folgefehler beheben (Beginn: erledigt in Runde 2), dann erneut. Lesezeit war kein Problem: orga 2,3 s statt 1,3 s für alle Dateien, langsamste 0,43 s.

## Fragen an Rayyan

1. **ISM**: Folie 11 sagt „Beginn: Donnerstag, 15.10.2026“, Folie 12: am 21.10. ist im Übungsslot ausnahmsweise Vorlesung. Erwartet ist jetzt: erste Übung am 21.10. (Datum laut Folie). Soll die Übung erst ab 28.10. zählen?
2. **Mathe**: Die Bonustests (02.12. und 20.01., 12:00) erwarte ich als normalen Termin, nicht als Klausur (keine KLIPS-Anmeldung). Passt das?
3. **Visualisierung**: Raum der Übungsgruppen erwarte ich als „Weyertal 121, Raum 5.08“ (Folie 93). Stimmt das für deine Gruppe 6?
4. **Visualisierung**: Sind `Uebung01.pdf` … `Uebung06.pdf` Übungsfolien oder Übungsblätter? (Im Moment ist beides erlaubt.)
