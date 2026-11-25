"""Stundenplan aus Orga-Folien und ersten Vorlesungen, ohne KI, nur Regeln (lokal, kostenlos).

Findet in den ersten Dateien eines Kurses (Organisatorisches, Modulinformationen, Introduction, Woche 0 …):
  - wöchentliche Termine: „Die Vorlesung findet freitags von 10.00 bis 11.30 Uhr statt“,
    „Group 3 (Maxim): Tuesdays, 14:00 - 15:30 · Luxemburger Str. 90, room S234“,
    „Termine: / Donnerstags, 10:00 - 11:30 Uhr, Aula 1“, „Tutorium Donnerstag 10-11:30, 14-15:30 oder 16-17:30“
    mit Art (Vorlesung/Übung/Tutorium), Raum, Gruppe und ob es Wahltermine sind,
  - Beginn („Beginn: Donnerstag, 15.10.2026“, „Übungen beginnen in der zweiten Woche“),
  - Ausfälle („Die Vorlesung am 24.11. entfällt“) und Einzeltermine („Am Freitag, 16.10. findet zudem von 12 bis
    13:30 Uhr eine Veranstaltung statt“, Probeklausur, Klausureinsicht).
Außerdem die Leistungspunkte des Moduls („12 Leistungspunkte“, „6 ECTS“, „ECTS: 9“) für den Progress-Tab.
Dazu die eigenen ILIAS-Gruppen („Group 3“, „Gruppe 6: Donnerstag 14:00 - 15:30“): Nummer und, falls im Titel, Zeit.
Klausuren und Abgaben mit Datum findet sheets.py (gleiche Textreparatur).

Ergebnis: orga-events.json. Electron (desktop/lib/schedule.js) macht daraus Termine im Kalender: Semester,
Feiertage, eigene Gruppe bzw. gewählte Wahltermine, Doppelte mit ILIAS und Kalender-Abo werden entfernt.
"""

import hashlib
import re
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from .common import DATA_DIR, load_config, read_json, write_json
from .deadlines import PARENTS
from .sheets import _MONTH_RE, DEADLINE_WORDS, EVENT_WORDS, SOLUTION, _find_dates
from .textfix import WEEKDAY_RE, fix_year, normalize, weekday_before, weekday_of

RULES_VERSION = 13  # 2: Überschrift „ROOM“ ist kein Raum, „start in lecture week 3“ gilt für die genannte Art; 3: Leistungspunkte (credits); 4: beides zusammen; 5: Beginn (Gruppen = Übung, Anmeldung zählt nicht, späte Planpunkte zählen nicht); 6: bis Seite 200; 7: Aufzählung von Wochentagen („Di/Do 14-16“); 8: erste Vorlesung ohne Orga-Namen (nur Termine mit Art oder Raum); 9: Tabellenzellen Tag + Uhrzeit, Sprechstunde als Überschrift; 10: Zusatz-/Nachholtermine, Datum mit Monatsnamen = Einzeltermin; 11: Gruppe ohne Art-Wort = Übung; 12: Gruppennummer aus Listenzeile davor; 13: beschriftete Ort-Zeile gilt für alle Termine der Seite
CACHE = DATA_DIR / "orga-cache.json"
OUTPUT = DATA_DIR / "orga-events.json"
# Orga-Folien ganz lesen: oft stehen die Zeiten erst nach Vorstellung und Motivation (Visualisierung: Folie 88 von 109).
# 200 Seiten kosten mit pypdf unter 0,5 s und laufen je Datei nur einmal (Cache pro Datei-Hash).
MAX_PAGES = 200
MAX_BYTES = 40 * 1024 * 1024
MAX_FILES = 8  # je Kurs

# ------------------------------------------------------------------ Welche Dateien?

ORGA_NAME = re.compile(
    r"(orga|modulinfo|modulinformation|informationen zum modul|allgemeines|general|einf[üu]hrung|introduction|"
    r"intro\b|kick.?off|überblick|overview|syllabus|woche_?0\b|week_?0\b|_0_|vl_?0?[01](?:_|\b)|ub_?00(?:_|\b)|"
    r"lecture_?0?[01](?:_|\b)|v_?0?1(?:\.\d)?_|^0?[01]_|^00)", re.I)
ORGA_DIR = re.compile(r"(grundlegende informationen|informationen zum modul|organisation|organisatorisches|allgemein|general info)", re.I)
NOT_ORGA = re.compile(r"(literatur|klausur|exam|altklausur|lösung|loesung|solution|übungsblatt|blatt|sheet|selbststudium)", re.I)
# Erste Vorlesung ohne Orga-Wort („Vorlesung_01_Grundlagen“, „Lecture 1 - Basics“, „VL 01 …“, „Week 1 slides“): oft steht
# dort die Orga-Folie. Schwächerer Kandidat; daraus zählen nur Termine mit Art oder Raum (sonst Stoff wie „Kino Mo 20–22“).
FIRST_UNIT = re.compile(
    r"(?<![a-zäöü])(?:vorlesung|lecture|vl|vo|v|einheit|kapitel|chapter|session|sitzung|woche|week|teil|part|folien|slides|"
    r"lektion|unit)[\s_\-.]*0?[01](?![\d.])", re.I)


def candidates(cfg: dict[str, Any]) -> list[tuple[dict[str, Any], Path]]:
    target = Path(cfg.get("targetDir") or "")
    out = []
    for c in cfg.get("courses", []):
        if not c.get("selected"):
            continue
        root = target / (c.get("folder") or c["title"])
        if not root.is_dir():
            continue
        found = []
        for p in root.rglob("*.pdf"):
            rel = p.relative_to(root)
            if any(part.startswith(".") for part in rel.parts) or SOLUTION.search(p.name) or NOT_ORGA.search(p.name):
                continue
            score = (2 if ORGA_NAME.search(p.stem) else 0) + (1 if any(ORGA_DIR.search(x) for x in rel.parts[:-1]) else 0)
            if not score and FIRST_UNIT.search(p.stem):
                score = 0.5
            if not score:
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            if st.st_size <= MAX_BYTES:
                found.append((-score, st.st_mtime, str(p), p))
        for *_, p in sorted(found)[:MAX_FILES]:
            out.append((c, p))
    return out


# ------------------------------------------------------------------ Zeiten, Arten, Räume

_T = r"(?P<{n}h>[01]?\d|2[0-3])(?:[:.](?P<{n}m>[0-5]\d))?"
RANGE_RE = re.compile(
    r"(?:\b(?:von|from|ab)\s+)?" + _T.format(n="a") + r"\s*(?P<apm>uhr|h|am|pm)?\s*(?:-|bis|to|until)\s*"
    + _T.format(n="b") + r"(?![\d.]\d)\s*(?P<pm>uhr|h\b|am\b|pm\b)?\s*(?P<ct>c\.\s?t\.|s\.\s?t\.)?",
    re.I,
)
TYPES = [
    ("tutorial", re.compile(r"\b(tutori(?:um|en|al|als)|tutorenübung)\b", re.I)),
    ("exercise", re.compile(r"(\b(?:\w*übung(?:en)?|uebung(?:en)?|übungsgruppen?|exercises?|exercise groups?|praktikum|labs?)\b|übungsslot)", re.I)),
    ("lecture", re.compile(r"\b(\w*vorlesung(?:en)?|vl|lectures?)\b", re.I)),
    ("seminar", re.compile(r"\b(seminar(?:e)?|seminarsitzung)\b(?!raum)", re.I)),
]
LABELS = {"lecture": "Lecture", "exercise": "Exercise", "tutorial": "Tutorial", "seminar": "Seminar"}
OFFICE = re.compile(r"\b(sprechstunden?|office hours?|sprechzeiten?)\b", re.I)
# Stoff auf späteren Folien („Beispiel: Das Kino zeigt den Film Mittwoch 20:00 – 21:45“) ist kein Kurstermin
EXAMPLE = re.compile(r"(\bbeispiel\w*|\bz\.\s?b\.|\be\.\s?g\.|\bfor example\b|\bexample\b)", re.I)
SKIP = re.compile(r"(lehramt|didaktik|nur nach vereinbarung|ausgewählten terminen|selected dates|\bklausur\w*|\bexams?\b|\bprüfung\w*)", re.I)
ALT = re.compile(r"\b(oder|or|alternativ\w*|wahlweise|choose|wählen|parallel\w*)\b", re.I)
BULLETS = " \t•·-–—*◦▪>|"
# Nur Verbindungswörter zwischen zwei Wochentagen („Mo und Mi“, „Di/Do“, „Montag, Mittwoch und Freitag“); „Mo–Fr“ zählt nicht
DAY_CHAIN = re.compile(r"(?:\s*(?:,|/|&|\+|und|and|sowie|oder|or)\s*)+", re.I)
GROUP = re.compile(r"\b(?:gruppe|group|grp\.?|übungsgruppe)\s*0*(\d{1,2})\b", re.I)
GENERIC_HEADER = re.compile(r"\b(termine?|zeiten|dates|times|schedule|zeit und ort|ort und zeit|when and where)\b", re.I)
ROOM = re.compile(
    r"(hörsaal|\bhs\b|\braum\b|\broom\b|\baula\b|seminarraum|\bs\d{2,4}\b|gebäude|building|str\.|straße|strasse|online|zoom|"
    r"hybrid|präsenz|mensa|labor|lecture hall|\bhall\b|\bsr\b|\bpc-?pool)", re.I)
LABEL_ONLY = re.compile(r"(?:room|raum|ort|location|where|wo|place|venue)", re.I)
LECTURE_ROOM = re.compile(r"(hörsaal|\bhs\b|\baula\b|lecture hall)", re.I)
SMALL_ROOM = re.compile(r"(seminarraum|\bsr\b|\bs\d{2,4}\b|room\s+s?\d|pc-?pool|labor)", re.I)


def _type_in(text: str) -> Optional[str]:
    hits = [(m.start(), t) for t, rx in TYPES for m in rx.finditer(text)]
    return max(hits)[1] if hits else None  # das letzte Wort vor dem Termin zählt


def _room(rest: str) -> Optional[str]:
    """Raum aus dem Text hinter der Uhrzeit („, Aula 1, Hauptgebäude“, „· Luxemburger Str. 90, room S234“)."""
    cut = re.search(r"\b(?:oder|or|und|and|sowie)\b|" + WEEKDAY_RE.pattern, rest, re.I)
    if cut:
        rest = rest[: cut.start()]
    rest = re.sub(r"\b(uhr|c\.\s?t\.|s\.\s?t\.)", " ", rest, flags=re.I)
    m = ROOM.search(rest)
    if not m:
        return None
    start = 0 if m.start() < 25 else m.start()
    room = re.split(r"(?<=[a-zäöü0-9])\.\s+(?=[A-ZÄÖÜ])|\s(?:für|for|statt|findet|takes)\b", rest[start:], maxsplit=1)[0]
    room = re.sub(r"\s{2,}", " ", room).strip(" ,;:|·()-.")
    room = re.sub(r"^(?:im|in der|in|at|room:|raum:|ort:)\s+", "", room, flags=re.I)
    # Folien-Überschrift („ROOM“, „Raum“, „Ort“) allein ist kein Raum: der steht dann in der nächsten Zeile
    if LABEL_ONLY.fullmatch(room):
        return None
    # „Lecture hall H161 (building 213, formerly H1)“ über zwei Zeilen: Klammer auflösen, „formerly …“ weg
    if "(" in room and ")" not in room:
        room = room.replace("(", ", ")
    room = re.sub(r",?\s*\b(?:formerly|ehemals|früher|ehem\.)\b.*$", "", room, flags=re.I)
    room = re.sub(r"\s+,", ",", re.sub(r"\s{2,}", " ", room)).strip(" ,;:|·()-.")
    return room[:60] or None


def _room_type(room: Optional[str]) -> Optional[str]:
    if not room:
        return None
    if LECTURE_ROOM.search(room):
        return "lecture"
    if SMALL_ROOM.search(room):
        return "exercise"
    return None


def _minutes(h: str, m: Optional[str]) -> int:
    return int(h) * 60 + int(m or 0)


# Datum zwischen Wochentag und Uhrzeit → Einzeltermin, kein Wochentermin („Wednesday, 25 November 2026, 18:00“)
DATE_IN_GAP = re.compile(
    r"\d{1,2}\.\s?\d{1,2}\.|\d{4}-\d{2}-\d{2}|\b\d{1,2}\.?\s+(?:" + _MONTH_RE + r")\b|\b(?:" + _MONTH_RE + r")\.?\s+\d{1,2}\b", re.I)


def _ranges_after(text: str) -> list[re.Match]:
    """Zeitspannen direkt hinter einem Wochentag, bis zum nächsten Wochentag."""
    out: list[re.Match] = []
    pos = 0
    nxt_wd = WEEKDAY_RE.search(text)
    stop = nxt_wd.start() if nxt_wd else len(text)
    while True:
        m = RANGE_RE.search(text, pos)
        if not m or m.start() >= stop:
            break
        gap = text[pos:m.start()]
        if (not out and m.start() > 26) or (out and len(gap) > 14):
            break
        if DATE_IN_GAP.search(gap):
            break  # Datum dazwischen → Einzeltermin, kein Wochentermin
        out.append(m)
        pos = m.end()
    return out


def _slot_times(m: re.Match) -> Optional[tuple[int, int]]:
    start = _minutes(m.group("ah"), m.group("am"))
    end = _minutes(m.group("bh"), m.group("bm"))
    if (m.group("apm") or "").lower() == "pm" and start < 12 * 60:
        start += 12 * 60
    if (m.group("pm") or "").lower() == "pm" and end < 12 * 60:
        end += 12 * 60
        if start + 12 * 60 < end:
            start += 12 * 60  # „2:00 - 3:30 pm“
    if m.group("ct") and m.group("ct").lower().startswith("c"):
        start, end = start + 15, end - 15  # c.t. = akademisches Viertel
    if not (7 * 60 <= start < 22 * 60 and 30 <= end - start <= 300):
        return None
    return start, end


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _join_cells(lines: list[str]) -> list[str]:
    """Tabellen liefert pypdf oft Zelle für Zelle („Dienstag“ / „14:00–15:30“): Tag und Zeit wieder in eine Zeile."""
    out: list[str] = []
    i = 0
    while i < len(lines):
        cell = lines[i].strip(" |:,;·")
        nxt = lines[i + 1].strip(" |") if i + 1 < len(lines) else ""
        if WEEKDAY_RE.fullmatch(cell) and nxt and len(nxt) < 40 and RANGE_RE.match(nxt):
            out.append(f"{cell} {nxt}")
            i += 2
            continue
        out.append(lines[i])
        i += 1
    return out


PAGE = "\x00page"  # Seitenwechsel zwischen den Zeilen (setzt analyze_file)
# Beschriftete Ort-Zeile („Veranstaltungsort: Hörsaal 230“, „Abhaltungsort:“ + nächste Zeile, „Location: …“, „Venue: …“):
# gilt für alle Termine derselben Seite ohne eigenen Raum, egal ob sie davor oder danach steht. „Prüfungsort“ zählt nicht.
LOCATION_LINE = re.compile(
    r"^[\s•·\-–*]*(?:veranstaltungs|abhaltungs|vorlesungs|übungs|tutoriums?)?(?:ort|location|venue|where|place|raum|room)\s*:\s*(.*)$", re.I)


def _location(value: str) -> Optional[str]:
    value = re.sub(r"\s{2,}", " ", value).strip(" ,;:|·-.")
    if not value or LABEL_ONLY.fullmatch(value) or not (ROOM.search(value) or re.search(r"\d", value)):
        return None
    if len(value) > 60:
        cut = value.rfind(", ", 0, 60)
        value = value[:cut] if cut > 10 else value[:60]
    return value


def find_slots(lines: list[str], default_type: str = "lecture") -> list[dict[str, Any]]:
    """Wöchentliche Termine in den (normalisierten) Zeilen einer Datei."""
    lines = _join_cells(lines)
    slots: list[dict[str, Any]] = []
    header_type: Optional[str] = None  # aus einer Überschrift („Lectures:“, „Übungen:“)
    header_skip = False  # Überschrift „Klausur:“ / „Lehramt:“ → folgende Zeiten ignorieren
    carry: tuple[int, Optional[str]] = (-9, None)  # Art der vorigen Terminzeile (Zeilenumbruch mitten im Satz)
    roomless: list[dict[str, Any]] = []  # Termine ohne Raum, Raum steht evtl. in der nächsten Zeile
    page_slots: list[dict[str, Any]] = []  # Termine der aktuellen Seite
    page_loc: Optional[str] = None  # Ort aus einer beschrifteten Ort-Zeile dieser Seite
    for i, line in enumerate(lines):
        if line == PAGE:
            page_slots, page_loc, roomless = [], None, []
            continue
        has_range = bool(RANGE_RE.search(line)) and bool(WEEKDAY_RE.search(line))
        loc = None if has_range else LOCATION_LINE.match(line)
        if loc:
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            value = loc.group(1) or (nxt if nxt != PAGE and not WEEKDAY_RE.search(nxt) and len(nxt) < 70 else "")
            room = _location(value)
            if room:
                page_loc = room
                for s in page_slots:
                    if not s["room"]:
                        s["room"] = room
        if not has_range:
            headerish = line.rstrip().endswith(":") or len(line) < 45
            t = _type_in(line)
            if headerish and t and not GROUP.search(line):
                header_type, header_skip = t, bool(SKIP.search(line))
            elif headerish and GENERIC_HEADER.search(line):
                header_type, header_skip = None, False
            elif headerish and SKIP.search(line) and line.rstrip().endswith(":"):
                header_skip = True
            elif headerish and OFFICE.search(line):
                header_type, header_skip = None, True  # „Sprechstunde“ über einer Tabelle: Zeiten darunter sind keine Kurstermine
            room_line = not t or LECTURE_ROOM.search(line) or SMALL_ROOM.search(line)
            if roomless and len(line) < 50 and ROOM.search(line) and room_line and i - roomless[-1]["_line"] <= 2:
                room = _room(line)
                if room:  # bloße Überschrift („ROOM“): weiter in der nächsten Zeile suchen
                    for s in roomless:
                        s["room"] = room
                        if s["_conf"] < 2 and _room_type(room):
                            s["type"], s["_conf"] = _room_type(room), 1
                    roomless = []
            continue
        if OFFICE.search(line) or SKIP.search(line) or EXAMPLE.search(line):
            continue
        line_type = _type_in(line)
        if header_skip and not line_type:
            continue
        prev = lines[i - 1] if i else ""
        new_slots = []
        wds = list(WEEKDAY_RE.finditer(line))
        for idx, wd in enumerate(wds):
            chained = idx + 1 < len(wds) and bool(DAY_CHAIN.fullmatch(line[wd.end():wds[idx + 1].start()]))
            if len(wd.group(0).rstrip(".")) <= 2 and not chained and not re.match(r"\s*[.,:]|\s+\d", line[wd.end():]):
                continue  # „Do“/„Mo“ nur mit Satzzeichen oder direkt folgender Uhrzeit
            after = line[wd.end():]
            ranges = _ranges_after(after)
            # „dienstags und donnerstags von 8:15 bis 9:45“, „Di/Do 14-16“: die Zeit hinter dem letzten Tag gilt für alle
            j = idx
            while not ranges and j + 1 < len(wds) and DAY_CHAIN.fullmatch(line[wds[j].end():wds[j + 1].start()]):
                j += 1
                after = line[wds[j].end():]
                ranges = _ranges_after(after)
            if not ranges:
                continue
            if len(wd.group(0).rstrip(".")) <= 3 and not re.fullmatch(r"[\s.,:]*(?:von|from|ab|um)?\s*", after[: ranges[0].start()], re.I):
                continue  # Kurzform („So“, „Do“) nur direkt vor der Uhrzeit, sonst Fehltreffer („So, und jetzt 10 - 12 …“)
            rest = after[ranges[-1].end():]
            room = _room(rest)
            before = line[: wd.start()]
            explicit = _type_in(before) or line_type or header_type
            conf = 2 if explicit else 0
            typ = explicit
            if not typ and _room_type(room):
                typ, conf = _room_type(room), 1
            if not typ and carry[0] == i - 1 and carry[1]:
                typ, conf = carry[1], 1
            typ = typ or default_type
            # nächste Gruppennummer vor dem Wochentag („Gruppe 1: Mo 8-10, Gruppe 2: Mo 10-12“)
            grps = list(GROUP.finditer(before))
            # Nummer in der kurzen Listenzeile davor („• Gruppe 1“ / „• Mo 14:00 - 15:30“); Aufzählungszeichen zählen nicht
            grp = grps[-1] if grps else (GROUP.search(prev) if not before.strip(BULLETS) and len(prev) < 40 else None)
            if grp and typ == "lecture" and not (_type_in(before) or line_type):
                typ, conf = "exercise", max(conf, 1)  # „Gruppe 1: Mo 14-16“ ohne Art-Wort: Gruppen sind Übungsgruppen
            for rng in ranges:
                times = _slot_times(rng)
                if not times:
                    continue
                new_slots.append({
                    "type": typ,
                    "weekday": weekday_of(wd),
                    "start": _hhmm(times[0]),
                    "end": _hhmm(times[1]),
                    "room": room,
                    "group": int(grp.group(1)) if grp else None,
                    "alternative": bool(ALT.search(line) or ALT.search(prev[-30:]) or len(ranges) > 1 or grp),
                    "evidence": line[:200],
                    "_conf": conf,
                    "_line": i,
                })
        if new_slots:
            carry = (i, new_slots[-1]["type"])
            if page_loc:
                for s in new_slots:
                    s["room"] = s["room"] or page_loc
            page_slots.extend(new_slots)
            slots.extend(new_slots)
            roomless = [s for s in new_slots if not s["room"]] + [s for s in roomless if not s["room"] and i - s["_line"] <= 1]
    return _merge(slots)


def _merge(slots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gleiche Termine nur einmal (sicherste Art gewinnt, Raum wird ergänzt); Wahltermine markieren."""
    best: dict[tuple, dict[str, Any]] = {}
    for s in slots:
        key = (s["weekday"], s["start"], s["group"])
        cur = best.get(key)
        if not cur or s["_conf"] > cur["_conf"]:
            if cur and not s["room"]:
                s["room"] = cur["room"]
            best[key] = s
        elif not cur["room"] and s["room"]:
            cur["room"] = s["room"]
    out = sorted(best.values(), key=lambda s: (s["weekday"], s["start"]))
    for t in ("exercise", "tutorial", "seminar"):
        same = [s for s in out if s["type"] == t]
        if len(same) > 1:
            for s in same:
                s["alternative"] = True
    for s in out:
        if s["type"] == "lecture" and s["group"] is None:
            s["alternative"] = False  # mehrere Vorlesungstermine = beide besuchen
        s["key"] = f"{s['type']}|{s['weekday']}|{s['start']}|{s['group'] or ''}"
    return out


# ------------------------------------------------------------------ Beginn, Ausfälle, Einzeltermine

START_RE = re.compile(
    r"\b(beginn\w*|beginnt|beginnen|start(?:s|et|en)?|first (?:lecture|session|class|meeting)|erste[nr]? (?:vorlesung|sitzung|veranstaltung|übung|termin)|"
    r"vorlesungsbeginn|ab dem)\b", re.I)
WEEK_N = re.compile(r"\b(?:(zweite[nr]?|2\.|second|dritte[nr]?|3\.|third)\s+(?:vorlesungs|semester)?(?:woche|week)|(?:woche|week)\s+([23])\b)", re.I)
CANCEL_RE = re.compile(
    r"\b(entfällt|entfallen|fällt\s+(?:\w+\s+){0,2}aus|fallen\s+(?:\w+\s+){0,2}aus|ausfall|cancel+ed|no (?:lecture|class|exercise|tutorial)s?|"
    r"keine (?:vorlesung|übung|veranstaltung|tutorien|tutorium))\b", re.I)
EXTRA_WORDS = re.compile(
    # „Zusätzlicher Termin“, „Weiterer Termin“, „Nachholtermin“, „Extra meeting“
    r"\b((?:zusätzliche[rsn]?|weitere[rsn]?|extra|additional|ersatz|nachhol)\s*(?:termine?|sitzung|session|class|meeting|lecture)|"
    r"probeklausur|mock exam|klausureinsicht|einsicht|exam review|fragestunde|q\s?&\s?a|repetitorium|"
    r"einführungsveranstaltung|einführung|kick.?off|zusatztermin|ersatztermin|sondertermin|gastvortrag|guest lecture|exkursion|"
    r"\w*veranstaltung|\w*sitzung|session|\w*vorlesung|\w*übung|tutorium|lecture|exercise|tutorial)\b", re.I)
EXTRA_TITLES = [
    (re.compile(r"probeklausur|mock exam", re.I), "Mock exam"),
    (re.compile(r"klausureinsicht|einsicht|exam review", re.I), "Exam review"),
    (re.compile(r"fragestunde|q\s?&\s?a|repetitorium", re.I), "Q&A session"),
    (re.compile(r"einführung|kick.?off", re.I), "Introduction"),
    (re.compile(r"gastvortrag|guest lecture", re.I), "Guest lecture"),
    (re.compile(r"exkursion", re.I), "Field trip"),
]
EXTRA_HINT = re.compile(r"\b(ausnahmsweise|zusätzlich\w*|zudem|außerdem|extra|additional|zusatz\w*|ersatz\w*|sonder\w*|weitere[rsn]?|nachhol\w*)\b", re.I)
EXAM_ONLY = re.compile(r"\b(klausur|exam|prüfung|testat|zwischentest)\b", re.I)


def _date_hits(text: str, ref: date) -> list[tuple[date, int, int]]:
    return [(fix_year(d, weekday_before(text, s), ref), s, e) for d, s, e in _find_dates(text, ref)]


WEEK_WORDS = re.compile(r"\b(?:lecture|teaching|semester)\s+weeks?\b|vorlesungs(?:woche\w*|zeit)|semesterwoche\w*", re.I)
# „Beginn der Gruppen ab 19.10.“, „Groups start on …“: Gruppen sind Übungsgruppen, nicht die Vorlesung
GROUP_WORDS = re.compile(r"\b(?:gruppen?|groups?)\b", re.I)
# „Die Anmeldung zu den Gruppen beginnt am 05.10.“ ist der Beginn der Anmeldung, nicht der Termine
REGISTER = re.compile(r"\b(anmeld\w*|registr\w*|register\w*|einschreib\w*|sign[- ]?ups?|enrol\w*|belegung\w*)\b", re.I)
# Ein Beginn liegt in den ersten Wochen; „Ab 14.12.: Start Projektübung“ ist ein Punkt im Semesterplan
START_SPREAD_DAYS = 42


def find_markers(lines: list[str], ref: date) -> dict[str, Any]:
    starts: dict[str, str] = {}
    week_offsets: dict[str, int] = {}
    cancellations: list[dict[str, Any]] = []
    for i, line in enumerate(lines):
        window = f"{line} {lines[i + 1]}" if i + 1 < len(lines) and len(line) < 50 else line
        if START_RE.search(line) and not SKIP.search(window) and not REGISTER.search(line):
            typ = _type_in(WEEK_WORDS.sub(" ", window)) or ("exercise" if GROUP_WORDS.search(line) else "all")
            hits = _date_hits(window, ref)
            if hits:
                d = hits[0][0].isoformat()
                starts[typ] = min(starts.get(typ, d), d)
            else:
                wk = WEEK_N.search(window)
                if wk and typ != "all":
                    word = (wk.group(1) or wk.group(2)).lower()
                    week_offsets[typ] = 2 if word[:1] in "z2s" else 3
        if CANCEL_RE.search(line):
            for d, _, _ in _date_hits(window, ref):
                cancellations.append({"date": d.isoformat(), "type": _type_in(line), "evidence": line[:160]})
    if starts:
        first = min(date.fromisoformat(v) for v in starts.values())
        starts = {k: v for k, v in starts.items() if (date.fromisoformat(v) - first).days <= START_SPREAD_DAYS}
    return {"starts": starts, "weekOffsets": week_offsets, "cancellations": cancellations}


# Leistungspunkte: „12 Leistungspunkte“, „6 ECTS“, „9 CP“, „ECTS: 6“, „Credits: 7,5“
CREDITS_AFTER = re.compile(
    r"(?<![\d.,])(\d{1,2}(?:[.,]5)?)\s*(?:ECTS(?:[- ]?(?:Punkte|Credits?|points?))?|Leistungspunkte?n?|LP\b|CP\b|credit ?points?|credits?\b)",
    re.I)
CREDITS_BEFORE = re.compile(r"\b(?:ECTS(?:[- ]?Punkte)?|Leistungspunkte|LP|CP|Credits?)\s*[:=]\s*(\d{1,2}(?:[.,]5)?)(?![\d.,])", re.I)
# Zeilen über andere Veranstaltungen oder den ganzen Studiengang („Requirements Engineering (9 ECTS, Master)“, „30 ECTS pro Semester“)
CREDITS_SKIP = re.compile(r"\b(master|bachelorarbeit|masterarbeit|thesis|studiengang|insgesamt|gesamt|pro semester|per semester|je semester|wahlpflicht|summer term|sommersemester)\b", re.I)


def _plain(text: str) -> str:
    return re.sub(r"[\x00-\x1f\x7f-\x9f]", "", text).strip()[:160]


def find_credits(lines: list[str]) -> list[dict[str, Any]]:
    """Leistungspunkte mit Fundstelle; labelled = steht unter/hinter „Credits:“ (sicherer als Fließtext)."""
    out = []
    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        prev = lines[i - 1] if i else ""
        # Folien brechen mitten im Satz um: „Software Engineering (9“ / „ECTS, Bachelor)“
        joined = f"{line} {nxt}" if line.count("(") > line.count(")") or re.search(r"\d$", line) else line
        if CREDITS_SKIP.search(joined):
            continue
        label = bool(re.search(r"\b(credits?|leistungspunkte|ects)\s*:?\s*$", prev, re.I))
        for m in CREDITS_AFTER.finditer(joined):
            if m.start() < len(line):
                value = float(m.group(1).replace(",", "."))
                if 2 <= value <= 20:
                    out.append({"value": value, "labelled": label, "evidence": _plain(joined)})
        for m in CREDITS_BEFORE.finditer(joined):
            value = float(m.group(1).replace(",", "."))
            if 2 <= value <= 20 and m.start() < len(line):
                out.append({"value": value, "labelled": True, "evidence": _plain(joined)})
    return out


def find_extras(lines: list[str], ref: date) -> list[dict[str, Any]]:
    """Einzeltermine mit Datum und Uhrzeit, die keine Abgabe/Klausur sind (die findet sheets.py)."""
    out = []
    for i, line in enumerate(lines):
        window = line
        if not EXTRA_WORDS.search(line) and i + 1 < len(lines):
            window = f"{line} {lines[i + 1]}"
        if not EXTRA_WORDS.search(window) or DEADLINE_WORDS.search(window):
            continue
        if EVENT_WORDS.search(window) and not re.search(r"probeklausur|einsicht", window, re.I):
            continue
        if CANCEL_RE.search(window) or START_RE.search(line) or OFFICE.search(window) or re.search(r"lehramt|didaktik", window, re.I):
            continue
        for d, _, e in _date_hits(line, ref):
            seg = line[e:e + 70]
            rng = RANGE_RE.search(seg)
            if not rng:
                continue
            times = _slot_times(rng)
            if not times:
                continue
            title = next((t for rx, t in EXTRA_TITLES if rx.search(window)), None)
            if not title:
                # Nur der Satz mit dem Datum zählt („… findet zudem eine Veranstaltung statt. In dieser … Übung …“)
                sentence = re.split(r"(?<=[a-zäöü)])\.\s+(?=[A-ZÄÖÜ])", window[e:], maxsplit=1)[0]
                typ = _type_in(window[:e] + sentence)
                base = LABELS.get(typ or "", "Session")
                title = f"Extra {base.lower()}" if EXTRA_HINT.search(window) else base
            raw_room = re.search(r"(?:raum|room|ort|location)\s*:?\s*([^;)]{2,50})", window, re.I)
            out.append({
                "date": d.isoformat(),
                "start": _hhmm(times[0]),
                "end": _hhmm(times[1]),
                "title": title,
                "room": raw_room.group(1).strip(" ,.") if raw_room else _room(seg[rng.end():]),
                "evidence": window[:200],
            })
    return out


# ------------------------------------------------------------------ Eigene ILIAS-Gruppen

def _parent_of(group_id: str, parents: dict[str, list[str]]) -> Optional[str]:
    kind, _, num = group_id.partition("-")
    chain = parents.get(f"{kind}/{num}") or []
    outer = [c for c in chain if c != group_id]
    return outer[-1] if outer else None


def my_groups(cfg: dict[str, Any]) -> tuple[dict[str, int], list[dict[str, Any]]]:
    """Gruppen, in denen man in ILIAS Mitglied ist → {Elternkurs: Gruppennummer} und Zeiten aus dem Titel."""
    parents = read_json(PARENTS, {})
    courses = {c["id"]: c for c in cfg.get("courses", [])}
    groups: dict[str, int] = {}
    slots: list[dict[str, Any]] = []
    for c in cfg.get("courses", []):
        if not str(c.get("id", "")).startswith("grp-"):
            continue
        parent = c.get("parent") or _parent_of(c["id"], parents)
        if not parent or parent not in courses or not courses[parent].get("selected"):
            continue
        title = normalize(c.get("title", ""))
        m = re.search(r"\b(?:gruppe|group|grp\.?|tutorium|übungsgruppe)\s*0*(\d{1,2})\b", title, re.I)
        if m:
            groups[parent] = int(m.group(1))
        typ = "tutorial" if re.search(r"tutor", courses[parent].get("title", "") + title, re.I) else "exercise"
        for s in find_slots([title], default_type=typ):
            grp = groups.get(parent)
            slots.append({**s, "type": typ, "group": grp, "alternative": False, "mine": True, "source": "ILIAS group",
                          "file": None, "key": f"{typ}|{s['weekday']}|{s['start']}|{grp or ''}", "courseId": parent})
    return groups, slots


# ------------------------------------------------------------------ Gesamtlauf

def _page_lines(path: Path) -> list[str]:
    """Normalisierte Zeilen aller Seiten, mit PAGE zwischen den Seiten (Ort-Zeilen gelten je Seite)."""
    import logging

    from pypdf import PdfReader

    logging.getLogger("pypdf").setLevel(logging.ERROR)
    out: list[str] = []
    for page in PdfReader(str(path)).pages[:MAX_PAGES]:
        out += [ln for ln in (normalize(raw) for raw in (page.extract_text() or "").splitlines()) if ln]
        out.append(PAGE)
    return out


def analyze_file(path: Path) -> dict[str, Any]:
    ref = datetime.fromtimestamp(path.stat().st_mtime).date()
    lines = _page_lines(path)
    default = "exercise" if re.search(r"(übung|uebung|exercise|ub_?\d|tutor)", path.stem, re.I) else "lecture"
    slots = find_slots(lines, default)
    if not ORGA_NAME.search(path.stem) and FIRST_UNIT.search(path.stem):
        slots = [s for s in slots if s["_conf"] > 0]  # erste Vorlesung: nur Termine mit Art oder Raum
    return {"slots": slots, **find_markers(lines, ref), "extras": find_extras(lines, ref), "credits": find_credits(lines)}


def _clean(slot: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in slot.items() if not k.startswith("_")}


def refresh() -> dict[str, Any]:
    cfg = load_config()
    cache: dict[str, Any] = read_json(CACHE, {})
    courses: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    empty = {"slots": [], "starts": {}, "weekOffsets": {}, "cancellations": [], "extras": [], "credits": []}

    def bucket(cid: str) -> dict[str, Any]:
        return courses.setdefault(cid, {"slots": [], "starts": {}, "weekOffsets": {}, "cancellations": [], "extras": [], "credits": [], "files": []})

    for course, path in candidates(cfg):
        try:
            data = path.read_bytes()
        except OSError:
            continue
        h = hashlib.sha256(data).hexdigest()
        if h in seen:
            continue
        seen.add(h)
        entry = cache.get(h)
        if not entry or entry.get("version") != RULES_VERSION:
            try:
                found = analyze_file(path)
                found["slots"] = [{**_clean(s), "conf": s["_conf"]} for s in found["slots"]]
                entry = {"version": RULES_VERSION, **found}
            except Exception:  # noqa: BLE001 – kaputte oder verschlüsselte PDFs überspringen
                entry = {"version": RULES_VERSION, **empty}
            cache[h] = entry
        b = bucket(course["id"])
        if any(entry.get(k) for k in empty):
            b["files"].append(path.name)
        for s in entry["slots"]:
            b["slots"].append({**s, "_conf": s.get("conf", 0), "_line": 0, "source": path.name, "file": str(path)})
        for typ, d in entry["starts"].items():
            b["starts"][typ] = min(b["starts"].get(typ, d), d)
        b["weekOffsets"].update(entry["weekOffsets"])
        b["cancellations"] += entry["cancellations"]
        b["extras"] += [{**x, "source": path.name, "file": str(path)} for x in entry["extras"]]
        b["credits"] += [{**x, "source": path.name} for x in entry.get("credits", [])]

    for b in courses.values():
        b["slots"] = [{k: v for k, v in _clean(s).items() if k != "conf"} for s in _merge(b["slots"])]

    groups, group_slots = my_groups(cfg)
    for s in group_slots:
        b = bucket(s.pop("courseId"))
        s = _clean(s)
        # Gleicher Termin schon aus den Folien bekannt → dort als eigenen markieren
        same = next((x for x in b["slots"] if x["weekday"] == s["weekday"] and x["start"] == s["start"]), None)
        if same:
            same["mine"] = True
        else:
            b["slots"].append(s)

    write_json(CACHE, cache)
    out = {"updatedAt": time.time(), "courses": courses, "myGroups": groups}
    write_json(OUTPUT, out)
    return out
