"""Fristen aus Übungsblättern per Regeln, lokal und kostenlos (keine KI, nichts verlässt den Mac).

Liest den Text neuer Übungsblätter (PDF, pypdf) und sucht Zeilen, in denen ein Fristwort und ein Datum
zusammen stehen, z. B. „Deadline: 23.11.2026, 10:00“ oder „Abgabe bis Montag, 24.11., 10 Uhr“.
Ein Datum allein zählt nicht (auf Folien steht oft nur der Übungstermin), und „Published/Ausgabe“
ist das Erscheinungsdatum. Ergebnis pro Datei-Inhalt gecacht; Ausgabe nach sheet-deadlines.json.
"""

import hashlib
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterator, Optional

from .common import DATA_DIR, load_config, read_json, write_json
from .deadlines import deadline_id
from .textfix import fix_year, normalize, weekday_before

RULES_VERSION = 11  # erhöhen, wenn sich die Regeln ändern → alles wird neu ausgewertet; 7: Orga-Dateien bis Seite 200; 8: Prüfungstermin/Modulprüfung/examination, Anmeldeschluss ist keine Klausur; 9: Bonus-/Kurztests und Quiz als Termin, Zeitraum „12-12:30 Uhr“ beginnt um 12:00; 10: Bearbeitung bis, fällig am, upload … by; 11: Datum aus wiederholter Fußzeile gehört nicht zur Überschrift darüber
CACHE = DATA_DIR / "sheet-deadlines-cache.json"
OUTPUT = DATA_DIR / "sheet-deadlines.json"
MAX_PAGES = 8  # Fristen und Klausurtermine stehen fast immer auf den ersten Seiten (Orga-Folien)
# Orga-Folien/Einführung ganz lesen: Klausurtermine stehen oft weit hinten (SE: Folie 14, Mathe: 31, Visualisierung: 99
# von 109, nach Vorstellung und Motivation). 200 Seiten kosten mit pypdf unter 0,5 s und laufen je Datei nur einmal.
ORGA_PAGES = 200
ORGA_HINT = re.compile(r"(orga|modulinfo|allgemein|general|einf[üu]hrung|introduction|intro\b|overview|überblick|syllabus|"
                       r"kick.?off|woche_?0\b|week_?0\b|_0_|^0?[01]_|vl_?0?[01]|info)", re.I)
MAX_BYTES = 30 * 1024 * 1024

SHEET_NAME = re.compile(
    r"(blatt|sheet|übung|uebung|ubung|exercise|homework|hausaufgabe|assignment|aufgabe|tutorium|"
    r"hw ?\d|ha ?\d|ü ?\d|abgabe|testat|praktikum|projekt|project)", re.I)
SOLUTION = re.compile(r"(lösung|loesung|losung|solution)", re.I)

# Fristwort → Art. Reihenfolge egal; \b davor, damit z. B. „Ausgabe“ nicht als „Abgabe“ zählt.
DEADLINE_WORDS = re.compile(
    r"\b(\w*abgabe\w*|abzugeben|einzureichen|einreich\w*|hochzuladen|deadline|due( date)?|submission( deadline)?|"
    r"submit( by)?|hand[- ]in|turn in|bearbeitungsfrist|frist|"
    # „Bearbeitung bis Di. 15.12. 23:55“, „Bearbeitungszeit bis …“, „Fällig am …“, „upload your solutions by …“
    r"bearbeitung(?:szeit)?\s+bis|bearbeiten\s+bis|fällig(?:\s+(?:am|bis|zum))?|upload\w*(?:\s+\w+){0,3}\s+(?:by|until|before))\b", re.I)
# Klausur-Wörter auch zusammengesetzt („Prüfungstermin:“, „Modulprüfung“, „Klausurdatum“, „Written examination“), aber
# nicht „Prüfungsanmeldung“/„Prüfungseinsicht“ (die Endungen sind aufgezählt, danach muss das Wort enden)
_PRUEFUNG = r"(?:modul|abschluss|wiederholungs|nach|semester|end)?pr(?:ü|ue)fung(?:en|stermine?|sdatum|stag)?"
_KLAUSUR = r"(?:nach|wiederholungs|end|abschluss)?klausur(?:termine?|en|datum|tag)?"
_EXAM = r"(?:resit |final |written |re-?)?exam(?:ination)?s?"
EVENT_WORDS = re.compile(
    r"\b(testat\w*|präsentation\w*|presentation|vortrag|probeklausur(?:en)?|mock exams?|" + _KLAUSUR + "|" + _EXAM + "|"
    + _PRUEFUNG + r"|zwischentest|midterm)\b", re.I)
EXAM_WORDS = re.compile(r"(testat\w*|" + _KLAUSUR + "|" + _EXAM + "|" + _PRUEFUNG + r"|zwischentest|midterm)", re.I)  # fullmatch
# „Anmeldung zur Klausur bis 20.01.“, „Prüfungseinsicht: 10.03.“: Datum gehört nicht zur Klausur
NOT_EXAM_DATE = re.compile(r"\b(\w*anmeld\w*|\w*abmeld\w*|rücktritt\w*|registr\w*|register\w*|einschreib\w*|sign[- ]?ups?|"
                           r"enrol\w*|\w*einsicht\w*|exam review)\b", re.I)
# Bonus-/Kurztests und Quizze sind Termine. Nur nummeriert oder zusammengesetzt („Test 1“, „Kurztest“, „Online test“),
# und nur mit Uhrzeit, sonst sind es Testfälle („Test 3: Eingabe 05.11.2026“) oder Sätze („Im Test am 12.11.“).
TEST_WORDS = re.compile(r"\b((?:bonus|kurz|online|e|lern|eingangs|übungs)[- ]?tests?|tests?\s+\d{1,2}|quiz(?:zes)?(?:\s+\d{1,2})?)\b", re.I)
IGNORE_LINE = re.compile(r"\b(published|veröffentlicht|ausgabe|ausgegeben|issued|release[d]?|erstellt|stand)\b", re.I)

MONTHS = {
    "jan": 1, "januar": 1, "january": 1, "feb": 2, "februar": 2, "february": 2, "mär": 3, "märz": 3, "mar": 3,
    "march": 3, "apr": 4, "april": 4, "mai": 5, "may": 5, "jun": 6, "juni": 6, "june": 6, "jul": 7, "juli": 7,
    "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "okt": 10, "oktober": 10, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dez": 12, "dezember": 12, "dec": 12, "december": 12,
}
_MONTH_RE = "|".join(sorted(MONTHS, key=len, reverse=True))
DATE_PATTERNS = [
    # 23.11.2026 / 23.11.26 / 23.11.
    re.compile(r"(?<!\d)(?P<d>\d{1,2})\.\s?(?P<m>\d{1,2})\.(?:\s?(?P<y>\d{4}|\d{2})(?!\d))?"),
    # 2026-11-23
    re.compile(r"(?<!\d)(?P<y>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})(?!\d)"),
    # 23. November 2026 / 23 Nov 2026 / 23. Nov.
    re.compile(rf"(?<!\d)(?P<d>\d{{1,2}})\.?\s+(?P<mn>{_MONTH_RE})\.?(?:\s+(?P<y>\d{{4}}))?", re.I),
    # November 23, 2026 / Nov 23rd
    re.compile(rf"\b(?P<mn>{_MONTH_RE})\.?\s+(?P<d>\d{{1,2}})(?!\d)(?:st|nd|rd|th)?(?:,?\s+(?P<y>\d{{4}}))?", re.I),
]
TIME_PATTERN = re.compile(
    r"(?<![\d.:])(?P<h>2[0-3]|[01]?\d)(?!\d)(?:[:.](?P<min>[0-5]\d)(?!\d))?\s*(?P<uhr>uhr|h\b|am\b|pm\b)?", re.I)


def _year_for(day: int, month: int, ref: date) -> int:
    """Fehlende Jahreszahl: das Jahr, in dem das Datum am nächsten an ref liegt."""
    best = None
    for y in (ref.year - 1, ref.year, ref.year + 1):
        try:
            cand = date(y, month, day)
        except ValueError:
            continue
        if best is None or abs((cand - ref).days) < abs((best - ref).days):
            best = cand
    return best.year if best else ref.year


def _find_dates(text: str, ref: date) -> list[tuple[date, int, int]]:
    """Alle plausiblen Daten in text → [(Datum, Start, Ende)], nach Position, ohne Überlappungen."""
    hits = []
    for pat in DATE_PATTERNS:
        for m in pat.finditer(text):
            try:
                d = int(m.group("d"))
                month = MONTHS[m.group("mn").lower().rstrip(".")] if "mn" in m.groupdict() and m.group("mn") else int(m.group("m"))
                y = m.group("y")
                year = (int(y) + 2000 if len(y) == 2 else int(y)) if y else _year_for(d, month, ref)
                hits.append((m.start(), date(year, month, d), m.end()))
            except (ValueError, KeyError, TypeError):
                continue
    hits.sort(key=lambda h: (h[0], -(h[2] - h[0])))
    out: list[tuple[date, int, int]] = []
    last_end = -1
    for start, d, end in hits:
        if start >= last_end:
            out.append((d, start, end))
            last_end = end
    return out


def _find_date(text: str, ref: date) -> Optional[tuple[date, int, int]]:
    """Erstes plausibles Datum in text → (Datum, Start, Ende im Text)."""
    hits = _find_dates(text, ref)
    return hits[0] if hits else None


_NOISE = re.compile(
    rf"(\b({_MONTH_RE})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?\b|\b\d{{1,2}}\.?\s+({_MONTH_RE})\b\.?|\d{{1,2}}\.\s?\d{{1,2}}\.(\d{{2,4}})?|\d{{4}}-\d{{2}}-\d{{2}}|\b\d{{1,2}}[:.]\d{{2}}\b|\b\d{{1,2}}\s?uhr\b|"
    rf"\b({_MONTH_RE})\.?\b|\b\d{{4}}\b|\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|"
    rf"monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|am|um|uhr|bis|zum|spätestens|by|at|on|the|der|den|dem)\b|"
    rf"[•·▪●\-–—:,;()\[\]!|])",
    re.I,
)


# Häufige deutsche Wörter in Fristtiteln → Englisch (die App ist englisch; Rest bleibt im Original)
_ENGLISH = [
    (r"\b(?:nachklausur|wiederholungsklausur|wiederholungsprüfung|nachprüfung)(?:termin|datum)?\b", "Resit exam"),
    (r"\bprobeklausur\b", "Mock exam"), (r"\bkurztest\b", "Short test"), (r"\bbonustest\b", "Bonus test"), (r"\b(?:end|abschluss)?klausur(?:termin|datum|tag)?\b", "Exam"),
    (r"\b(?:modul|abschluss|semester|end)?pr(?:ü|ue)fung(?:stermin|sdatum|stag)?\b", "Exam"),
    (r"\b(?:written |final )?examination\b", "Exam"), (r"\bzwischentest\b", "Midterm test"), (r"\babgabefrist\b", "Deadline"),
    (r"\babgabe\b", "Submit"), (r"\bpräsentation\b", "Presentation"), (r"\bvortrag\b", "Talk"),
    (r"\bübungsblatt\b", "Exercise sheet"), (r"\bblatt\b", "Sheet"), (r"\bhausaufgabe\b", "Homework"),
    (r"\banmeldung\b", "Registration"), (r"\b1\.\s*termin\b", "1st date"), (r"\b2\.\s*termin\b", "2nd date"),
    (r"\berste[rn]?\b", "First"), (r"\bzweite[rn]?\b", "Second"), (r"\bund\b", "and"), (r"\bzur\b", "for"),
]


def english(label: str) -> str:
    for pat, rep in _ENGLISH:
        label = re.sub(pat, rep, label, flags=re.I)
    label = re.sub(r"\s{2,}", " ", label).strip()
    # GROSS GESCHRIEBENE Wörter („HOMEWORK PRESENTATION“) normal schreiben, Abkürzungen (SE, BWL) bleiben
    label = re.sub(r"\b[A-ZÄÖÜ]{4,}\b", lambda m: m.group(0).lower(), label)
    return label[:1].upper() + label[1:]


def _label(evidence: str) -> Optional[str]:
    """Kurzer Titel aus der Textstelle („21.01.27, 12:00 Uhr: Abgabe Designübung“ → „Submit Designübung“)."""
    words = [w for w in _NOISE.sub(" ", evidence).split() if len(w) > 1 or w.isdigit()]
    if not words or len(" ".join(words)) > 60:
        return None
    if len(words) < 2 and not EVENT_WORDS.search(words[0]):
        return None  # ein einzelnes Wort ist nur als Ereignis aussagekräftig („Klausur“ → „Exam“)
    text = english(" ".join(words))
    return text[0].upper() + text[1:].replace(" Exam", " exam")


def _find_time(text: str) -> Optional[str]:
    """Uhrzeit nach dem Datum: „10:00“, „10 Uhr“, „23.59 Uhr“, „11:59 pm“."""
    for m in TIME_PATTERN.finditer(text):
        h, minute, uhr = int(m.group("h")), m.group("min"), (m.group("uhr") or "").lower()
        if minute is None and not uhr:
            # Anfang eines Zeitraums („12-12:30 Uhr“, „2–3:30 pm“): die Uhr-Angabe am Ende gilt für beide Zeiten
            rng = re.match(r"\s*(?:-|–|bis|to)\s*(?:[01]?\d|2[0-3])(?:[:.][0-5]\d)?\s*(uhr|h\b|am\b|pm\b)", text[m.end():], re.I)
            if not rng:
                continue  # nackte Zahl ist keine Uhrzeit
            uhr = rng.group(1).lower()
        if m.group("min") and "." in m.group(0) and not uhr:
            continue  # „10.11“ wäre eher ein Datum
        if uhr == "pm" and h < 12:
            h += 12
        if uhr == "am" and h == 12:
            h = 0
        return f"{h:02d}:{int(minute or 0):02d}"
    return None


def _lines(text: str) -> Iterator[str]:
    for raw in text.splitlines():
        line = normalize(raw)  # repariert kaputte PowerPoint-Schrift („ϭϭ͗ϬϬ“ → „11:00“)
        if line:
            yield line


def _footer_key(line: str) -> str:
    """Zeile ohne Ziffern, Datum und Trennzeichen: gleich auf mehreren Seiten = Kopf- oder Fußzeile."""
    if len(line) > 80:
        return ""
    return re.sub(r"[\d\s./:|·,\-–]+", " ", line.lower()).strip()


def extract(text: str, ref: date) -> list[dict[str, Any]]:
    """Fristen aus dem Text eines Übungsblatts. ref = Bezugsdatum für fehlende Jahreszahlen."""
    lines = list(_lines(text))
    # Kopf-/Fußzeilen („Software and Systems Engineering 19.11.2026“ auf jeder Folie): ohne Ziffern mehrfach gleich
    keys = [_footer_key(ln) for ln in lines]
    repeated = {k for k in keys if k and keys.count(k) >= 2}
    found = []
    for i, line in enumerate(lines):
        if IGNORE_LINE.search(line) and not DEADLINE_WORDS.search(line):
            continue
        kw = DEADLINE_WORDS.search(line) or EVENT_WORDS.search(line)
        weak = None  # „Test 1“, „Quiz“: zählt nur mit Uhrzeit (sonst Testfälle, Studien, „Unit tests“)
        if not kw:
            kw = weak = TEST_WORDS.search(line)
        if not kw:
            continue
        # Datum in derselben Zeile hinter/um das Fristwort, sonst in der nächsten Zeile („Abgabe:\n24.11.“).
        window = line[max(0, kw.start() - 40):]
        hits = _find_dates(window, ref)
        evidence = line
        win_line = i
        # Datum aus der nächsten Zeile, aber nicht aus einer Fußzeile („HOMEWORK PRESENTATION“ / Fußzeile mit Foliendatum)
        if not hits and i + 1 < len(lines) and len(line) - kw.end() < 15 and keys[i + 1] not in repeated:
            window = lines[i + 1]
            win_line = i + 1
            hits = _find_dates(window, ref)
            evidence = f"{line} {lines[i + 1]}"
        if not hits:
            continue
        if weak:
            kind = "termin"
        else:
            kind = ("klausur" if EXAM_WORDS.fullmatch(kw.group(0)) else "termin") if EVENT_WORDS.search(kw.group(0)) else "abgabe"
        # Titel bevorzugt aus dem Text vor dem Datum („Klausur: 16.02., 10 Uhr, HS C“ → „Exam“, ohne Raum)
        pre = window[: hits[0][1]] if win_line == i else f"{line} {window[: hits[0][1]]}"
        if kind != "abgabe" and NOT_EXAM_DATE.search(pre):
            continue  # Anmeldeschluss oder Einsicht, kein Klausurtermin
        base_label = (_label(pre) or _label(evidence)) if len(hits) == 1 else kw.group(0)[0].upper() + kw.group(0)[1:]
        for n, (day, start, end) in enumerate(hits):
            day = fix_year(day, weekday_before(window, start), ref)  # „Freitag, 16.10.2027“ → 2026
            # Mehrere Daten in einer Zeile („Klausur 16. Februar (1. Termin) und 24. März (2. Termin)“):
            # je Datum ein Eintrag, Klammerzusatz direkt dahinter wird Teil des Titels.
            nxt = hits[n + 1][1] if n + 1 < len(hits) else len(window)
            segment = window[end:nxt]
            extra = re.match(r"\s*\(([^)]{1,30})\)", segment)
            label = f"{base_label} ({english(extra.group(1))})" if extra and len(hits) > 1 and base_label else base_label
            label = english(label) if label else label
            # „Exam (1st date)“ → „1st date“: die Oberfläche zeigt bei Klausuren ohnehin das Schild „Exam“
            short = re.fullmatch(r"Exam \((.+)\)", label or "")
            if short and kind == "klausur":
                label = short.group(1)[:1].upper() + short.group(1)[1:]
            when = _find_time(segment[:40])
            if not when and n == len(hits) - 1:
                # Uhrzeit in der nächsten Zeile (Tabellen: „First exam:“ / „Thursday Feb 11 |“ / „12:00 |“)
                follow = lines[win_line + 1] if win_line + 1 < len(lines) else ""
                if len(follow) < 25:
                    when = _find_time(follow)
            if weak and not when:
                continue
            found.append({
                "date": day,
                "time": when,
                "kind": kind,
                "label": label,
                "evidence": evidence[:200],
            })
    # Doppelte (gleicher Tag, gleiche Art) zusammenfassen, die mit Uhrzeit gewinnt.
    best: dict[tuple[date, str], dict[str, Any]] = {}
    for f in found:
        key = (f["date"], f["kind"])
        if key not in best or (f["time"] and not best[key]["time"]):
            best[key] = f
    return list(best.values())


def _pdf_text(path: Path, pages: int = MAX_PAGES) -> str:
    import logging

    from pypdf import PdfReader

    logging.getLogger("pypdf").setLevel(logging.ERROR)  # Warnungen zu leicht kaputten PDFs nicht ausgeben

    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages[:pages])


# Satzbruchstücke statt Titel („Submit des Essays ist“ aus „Abgabe des Essays ist bis zum …“)
_FRAGMENT_START = re.compile(r"^(?:submit|exam:?)?\s*(?:des|der|die|das|dem|den|ein|eine|einer|ist|sind|bis|zum|zur|am|im|the|is|are|of|by|until)\b", re.I)
_FRAGMENT_END = re.compile(r"\b(?:ist|sind|bis|zum|zur|am|im|wird|werden|is|are|by|until|of)\s*$", re.I)


def _title(file_name: str, kind: str, label: Optional[str] = None) -> str:
    """Titel: aus der Textstelle, wenn sie aussagekräftig ist, sonst aus dem Dateinamen."""
    generic = {"abgabe", "deadline", "due", "due date", "submission", "submit", "frist", "abgabetermin", "abgabefrist"}
    if label and label.lower() not in generic and not _FRAGMENT_START.search(label) and not _FRAGMENT_END.search(label):
        return label
    stem = re.sub(r"[_\-]+", " ", Path(file_name).stem)
    stem = re.sub(r"\s{2,}", " ", stem).strip()
    return {"abgabe": f"Submit {stem}", "klausur": f"Exam: {stem}"}.get(kind, stem)


def candidates(cfg: dict[str, Any]) -> list[tuple[dict[str, Any], Path]]:
    target = Path(cfg.get("targetDir") or "")
    out = []
    for c in cfg.get("courses", []):
        if not c.get("selected"):
            continue
        root = target / (c.get("folder") or c["title"])
        if not root.is_dir():
            continue
        for p in root.rglob("*.pdf"):
            if any(part.startswith(".") for part in p.relative_to(root).parts):
                continue
            # Alle PDFs außer Lösungen: Klausurtermine stehen oft in Orga-Folien, Abgaben auch in Vorlesungsfolien.
            if SOLUTION.search(p.name):
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            if st.st_size <= MAX_BYTES:
                out.append((c, p))
    return out


def refresh() -> dict[str, Any]:
    cfg = load_config()
    cache: dict[str, Any] = read_json(CACHE, {})
    today = date.today()
    oldest, newest = today - timedelta(days=14), today + timedelta(days=200)
    results: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()

    for course, path in candidates(cfg):
        data = path.read_bytes()
        h = hashlib.sha256(data).hexdigest()
        if h in seen_hashes:
            continue  # gleiche Datei in zwei Kursordnern (z. B. Kurs + Übungsgruppe)
        seen_hashes.add(h)
        entry = cache.get(h)
        if not entry or entry.get("version") != RULES_VERSION:
            ref = datetime.fromtimestamp(path.stat().st_mtime).date()
            try:
                pages = ORGA_PAGES if ORGA_HINT.search(path.stem) else MAX_PAGES
                found = extract(_pdf_text(path, pages), ref)
            except Exception:  # noqa: BLE001 – kaputte oder verschlüsselte PDFs überspringen
                found = []
            entry = {"version": RULES_VERSION, "found": [
                {**f, "date": f["date"].isoformat()} for f in found]}
            cache[h] = entry
        for f in entry["found"]:
            day = date.fromisoformat(f["date"])
            if not (oldest <= day <= newest):
                continue
            title = _title(path.name, f["kind"], f.get("label"))
            time_label = (f"by {f['time']}" if f["kind"] == "abgabe" else f["time"]) if f["time"] else "all day"
            results.append({
                "id": deadline_id(course["id"], title, f["date"]),
                "courseId": course["id"],
                "title": title,
                "date": f["date"],
                "time": time_label,
                "kind": f["kind"],
                "category": "sheet",
                "source": f"Exercise sheet: {path.name}",
                "start": f"{f['date']}T{f['time'] or '00:00'}:00",
                "url": None,
                "location": None,
                "file": str(path),
                "evidence": f["evidence"],
            })
    write_json(CACHE, cache)
    results.sort(key=lambda d: (d["date"], d["start"], d["title"]))
    out = {"updatedAt": time.time(), "deadlines": results}
    write_json(OUTPUT, out)
    return out
