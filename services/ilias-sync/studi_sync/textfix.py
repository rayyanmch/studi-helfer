"""Text aus PDFs aufbereiten: kaputte Zeichentabellen reparieren, Schreibweisen vereinheitlichen, Wochentage.

PowerPoint-PDFs mit eingebetteter Calibri liefern über pypdf oft Unsinn wie „ϭϬ͗ϬϬ“ statt „10:00“ oder
„dŚƵƌƐĚĂǇ“ statt „Thursday“ (die Schrift hat keine Unicode-Tabelle, pypdf rät). Ziffern, Satzzeichen und
Kleinbuchstaben sind dabei immer gleich verschoben und lassen sich sicher zurückübersetzen. Großbuchstaben
unterscheiden sich je nach Schriftschnitt; dafür werden bekannte Wörter (Wochentage, „Group“, „Exam“) repariert.
"""

import re
from datetime import date
from typing import Optional

# Zeichen, die in echtem deutschen oder englischen Text nie vorkommen → immer ersetzen.
_SAFE = {chr(0x3EC + i): str(i) for i in range(10)}  # Ϭ ϭ Ϯ … ϵ
_SAFE.update({
    "͗": ":", "͘": ".", "͕": ",", "Ͳ": "-", "ʹ": "-", "ͼ": "·", "ͮ": "|",
    ";": "(", "Ϳ": ")", "͛": "’", "͊": "!",
})
# Kleinbuchstaben in Glyph-Reihenfolge (nur in überwiegend kaputten Zeilen)
_LOWER = {
    "Ă": "a", "ď": "b", "Đ": "c", "Ě": "d", "Ğ": "e", "Ĩ": "f", "Ő": "g",
    "Ś": "h", "ŝ": "i", "Ŭ": "k", "ů": "l", "ŵ": "m", "Ŷ": "n", "Ž": "o",
    "Ɖ": "p", "Ƌ": "q", "ƌ": "r", "Ɛ": "s", "ƚ": "t", "Ƶ": "u", "ǀ": "v",
    "ǁ": "w", "ǆ": "x", "Ǉ": "y", "ć": "ä", "Ƃ": "ö", "Ġ": "é",
}
# Großbuchstaben: beste Schätzung (je Schriftschnitt verschieden), danach Wort-Reparatur
_UPPER = {"r": "A", "^": "S", "=": "L", "B": "E", "I": "E", "H": "F", ".": "F", "J": "M", "W": "P", "Z": "R",
          "y": "D", "t": "W", "g": "B", "U": "H", "h": "U", "e": " ", "5": "I"}  # echte Ziffern sind hier Ϭ–ϵ
_WORD_FIXES = [
    (re.compile(r"\b\S(ondays?)\b"), r"M\1"), (re.compile(r"\b\S(uesdays?)\b"), r"T\1"),
    (re.compile(r"\b\S(ednesdays?)\b"), r"W\1"), (re.compile(r"\b\S(hursdays?)\b"), r"T\1"),
    (re.compile(r"\b\S(ridays?)\b"), r"F\1"), (re.compile(r"\b\S(aturdays?)\b"), r"S\1"),
    (re.compile(r"\b\S(roups?)\b"), r"G\1"), (re.compile(r"\b\S(xams?)\b"), r"E\1"),
    (re.compile(r"\S(örsaal)"), r"H\1"), (re.compile(r"\b\S(urt-)"), r"K\1"), (re.compile(r"\b\S(oom)\b"), r"R\1"),
]
_TRIGGER = set(_SAFE) | set(_LOWER)


def repair(line: str) -> str:
    """Kaputte Calibri-Zeichen zurückübersetzen. Normale Zeilen bleiben unverändert."""
    if not any(ch in _TRIGGER for ch in line):
        return line
    letters = [ch for ch in line if ch.isalpha()]
    heavy = bool(letters) and sum(ch in _LOWER for ch in letters) / len(letters) >= 0.3
    out = []
    for i, ch in enumerate(line):
        prev = line[i - 1] if i else " "
        nxt = line[i + 1] if i + 1 < len(line) else ""
        if ch in _SAFE:
            out.append(_SAFE[ch])
        elif not heavy:
            out.append(ch)
        elif ch in _LOWER:
            out.append(_LOWER[ch])
        elif ch == "d":
            # „d“ ist Leerzeichen, am Wortanfang vor Kleinbuchstaben aber „T“ („dŚƵƌƐĚĂǇ“ = Thursday)
            starts_word = prev in " e" or prev in _SAFE or not prev.isalpha()
            out.append("T" if nxt in _LOWER and starts_word and prev not in _LOWER else " ")
        elif ch == ":" and nxt in _LOWER:
            out.append("H")
        elif ch in _UPPER:
            out.append(_UPPER[ch])
        else:
            out.append(ch)
    s = "".join(out)
    s = re.sub(r"d{1,3}\s*·\s*d{1,3}", " · ", s)  # „13:30dd·ddLuxemburger“ in halb kaputten Zeilen
    if heavy:
        for rx, rep in _WORD_FIXES:
            s = rx.sub(rep, s)
    return re.sub(r"[ \t]{2,}", " ", s).strip()


_TIME_DOT = re.compile(r"(?<![\d.])([01]?\d|2[0-3])\.([0-5]\d)(?![\d.])(?=\s*(?:uhr\b|h\b|bis\b|-|until\b|to\b|c\.\s?t|s\.\s?t))", re.I)
_TIME_DOT_AFTER = re.compile(r"\b(von|bis|um|ab|-)\s([01]?\d|2[0-3])\.([0-5]\d)(?![\d.])", re.I)


def normalize(line: str) -> str:
    """Reparieren, Striche vereinheitlichen, „10.00 Uhr“ → „10:00 Uhr“ (Daten wie „16.10.2026“ bleiben)."""
    s = repair(line)
    s = re.sub(r"[–—−‐‑]", "-", s)
    s = re.sub(r"\s+", " ", s)
    s = _TIME_DOT.sub(r"\1:\2", s)
    s = _TIME_DOT_AFTER.sub(r"\1 \2:\3", s)
    return s.strip()


# ------------------------------------------------------------------ Wochentage

_WEEKDAYS = [
    r"mo(?:ntags?|ndays?|n)?",
    r"di(?:enstags?)?|tue(?:sdays?|s)?",
    r"mi(?:ttwochs?)?|wed(?:nesdays?)?",
    r"do(?:nnerstags?)?|thu(?:rsdays?|rs)?",
    r"fr(?:eitags?|idays?|i)?",
    r"sa(?:mstags?|turdays?|t)?",
    r"so(?:nntags?)?|sun(?:days?)?",
]
WEEKDAY_RE = re.compile(r"\b(?:" + "|".join(f"(?P<d{i}>{p})" for i, p in enumerate(_WEEKDAYS)) + r")\b\.?", re.I)


def weekday_of(m: re.Match) -> int:
    return next(i for i in range(7) if m.group(f"d{i}"))


def weekday_before(text: str, pos: int, reach: int = 16) -> Optional[int]:
    """Wochentag direkt vor einer Stelle („Freitag, 16.10.“, „Thursday Feb 11“)."""
    hits = list(WEEKDAY_RE.finditer(text[max(0, pos - reach):pos]))
    if not hits:
        return None
    m = hits[-1]
    # Kurzformen („Mo“, „Do“, „So“) nur mit Satzzeichen dahinter, sonst zu viele Fehltreffer („so“, „do“)
    if len(m.group(0).rstrip(".")) <= 2 and not re.match(r"[.,]", text[max(0, pos - reach) + m.end():pos].strip() or "x"):
        return None
    return weekday_of(m)


def fix_year(d: date, weekday: Optional[int], ref: Optional[date] = None) -> date:
    """Passt der Wochentag nicht zum Datum, ist meist die Jahreszahl falsch („Freitag, 16.10.2027“).
    Korrigiert nur, wenn das neue Datum näher am Bezugsdatum (Datei-Datum) liegt."""
    if weekday is None or d.weekday() == weekday:
        return d
    ref = ref or date.today()
    for y in (d.year - 1, d.year + 1):
        try:
            cand = d.replace(year=y)
        except ValueError:
            continue
        if cand.weekday() == weekday and abs((cand - ref).days) < abs((d - ref).days):
            return cand
    return d
