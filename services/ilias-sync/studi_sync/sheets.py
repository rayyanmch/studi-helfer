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

RULES_VERSION = 1  # erhöhen, wenn sich die Regeln ändern → alles wird neu ausgewertet
CACHE = DATA_DIR / "sheet-deadlines-cache.json"
OUTPUT = DATA_DIR / "sheet-deadlines.json"
RECENT_DAYS = 28
MAX_PAGES = 4  # Fristen stehen fast immer auf den ersten Seiten
MAX_BYTES = 30 * 1024 * 1024

SHEET_NAME = re.compile(
    r"(blatt|sheet|übung|uebung|ubung|exercise|homework|hausaufgabe|assignment|aufgabe|tutorium|"
    r"hw ?\d|ha ?\d|ü ?\d|abgabe|testat|praktikum|projekt|project)", re.I)
SOLUTION = re.compile(r"(lösung|loesung|losung|solution)", re.I)

# Fristwort → Art. Reihenfolge egal; \b davor, damit z. B. „Ausgabe“ nicht als „Abgabe“ zählt.
DEADLINE_WORDS = re.compile(
    r"\b(\w*abgabe\w*|abzugeben|einzureichen|einreich\w*|hochzuladen|deadline|due( date)?|submission( deadline)?|"
    r"submit( by)?|hand[- ]in|turn in|bearbeitungsfrist|frist)\b", re.I)
EVENT_WORDS = re.compile(r"\b(testat\w*|präsentation\w*|presentation|vortrag|klausur(termin)?|exam|prüfung)\b", re.I)
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


def _find_date(text: str, ref: date) -> Optional[tuple[date, int, int]]:
    """Erstes plausibles Datum in text → (Datum, Start, Ende im Text)."""
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
    if not hits:
        return None
    start, d, end = min(hits, key=lambda h: h[0])
    return d, start, end


def _find_time(text: str) -> Optional[str]:
    """Uhrzeit nach dem Datum: „10:00“, „10 Uhr“, „23.59 Uhr“, „11:59 pm“."""
    for m in TIME_PATTERN.finditer(text):
        h, minute, uhr = int(m.group("h")), m.group("min"), (m.group("uhr") or "").lower()
        if minute is None and not uhr:
            continue  # nackte Zahl ist keine Uhrzeit
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
        line = re.sub(r"\s+", " ", raw).strip()
        if line:
            yield line


def extract(text: str, ref: date) -> list[dict[str, Any]]:
    """Fristen aus dem Text eines Übungsblatts. ref = Bezugsdatum für fehlende Jahreszahlen."""
    lines = list(_lines(text))
    found = []
    for i, line in enumerate(lines):
        if IGNORE_LINE.search(line) and not DEADLINE_WORDS.search(line):
            continue
        kw = DEADLINE_WORDS.search(line) or EVENT_WORDS.search(line)
        if not kw:
            continue
        # Datum in derselben Zeile hinter/um das Fristwort, sonst in der nächsten Zeile („Abgabe:\n24.11.“).
        window = line[max(0, kw.start() - 40):]
        hit = _find_date(window, ref)
        evidence = line
        if hit is None and i + 1 < len(lines) and len(line) - kw.end() < 15:
            window = lines[i + 1]
            hit = _find_date(window, ref)
            evidence = f"{line} {lines[i + 1]}"
        if hit is None:
            continue
        day, _, end = hit
        found.append({
            "date": day,
            "time": _find_time(window[end:end + 40]),
            "kind": "termin" if EVENT_WORDS.search(kw.group(0)) else "abgabe",
            "evidence": evidence[:200],
        })
    # Doppelte (gleicher Tag, gleiche Art) zusammenfassen, die mit Uhrzeit gewinnt.
    best: dict[tuple[date, str], dict[str, Any]] = {}
    for f in found:
        key = (f["date"], f["kind"])
        if key not in best or (f["time"] and not best[key]["time"]):
            best[key] = f
    return list(best.values())


def _pdf_text(path: Path) -> str:
    import logging

    from pypdf import PdfReader

    logging.getLogger("pypdf").setLevel(logging.ERROR)  # Warnungen zu leicht kaputten PDFs nicht ausgeben

    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PAGES])


def _title(file_name: str, kind: str) -> str:
    stem = re.sub(r"[_\-]+", " ", Path(file_name).stem)
    stem = re.sub(r"\s{2,}", " ", stem).strip()
    return f"Abgabe {stem}" if kind == "abgabe" else stem


def candidates(cfg: dict[str, Any]) -> list[tuple[dict[str, Any], Path]]:
    target = Path(cfg.get("targetDir") or "")
    since = time.time() - RECENT_DAYS * 86400
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
            rel = str(p.relative_to(root))
            if SOLUTION.search(p.name) or not SHEET_NAME.search(rel):
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            if st.st_mtime >= since and st.st_size <= MAX_BYTES:
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
                found = extract(_pdf_text(path), ref)
            except Exception:  # noqa: BLE001 – kaputte oder verschlüsselte PDFs überspringen
                found = []
            entry = {"version": RULES_VERSION, "found": [
                {**f, "date": f["date"].isoformat()} for f in found]}
            cache[h] = entry
        for f in entry["found"]:
            day = date.fromisoformat(f["date"])
            if not (oldest <= day <= newest):
                continue
            title = _title(path.name, f["kind"])
            time_label = (f"bis {f['time']}" if f["kind"] == "abgabe" else f["time"]) if f["time"] else "ganztägig"
            results.append({
                "id": deadline_id(course["id"], title, f["date"]),
                "courseId": course["id"],
                "title": title,
                "date": f["date"],
                "time": time_label,
                "kind": f["kind"],
                "category": "sheet",
                "source": f"Übungsblatt: {path.name}",
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
