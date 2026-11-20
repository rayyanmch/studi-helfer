"""Zusätzliche Kalender per iCal-Link (z. B. der persönliche Stundenplan aus KLIPS, Google, Apple).

ILIAS kennt nur Termine, die Lehrende dort eintragen (bei Rayyan nur ISM-Sitzungen). Vorlesungszeiten stehen
in KLIPS. Statt KLIPS zu scrapen, fügt man einmal den Abo-Link des eigenen Kalenders ein. Die Zuordnung zu
den Modulen macht Electron (desktop/lib/modules.js), hier wird nur geladen und gelesen.

Ergebnis: calendar-events.json (Termine von heute − 14 Tagen bis + 200 Tage, Serien aufgelöst).
"""

import re
import time
from datetime import date, datetime, timedelta
from typing import Any, Iterator, Optional
from zoneinfo import ZoneInfo

import requests

from .common import DATA_DIR, USER_AGENT, load_config, write_json

OUTPUT = DATA_DIR / "calendar-events.json"
BERLIN = ZoneInfo("Europe/Berlin")
PAST_DAYS, FUTURE_DAYS = 14, 200
MAX_BYTES = 8 * 1024 * 1024
EXAM = re.compile(r"\b(klausur\w*|prüfung\w*|exam\w*|zwischentest\w*|testat\w*|nachklausur)\b", re.I)
DEADLINE = re.compile(r"\b(\w*abgabe\w*|deadline|due|submission|einreich\w*)\b", re.I)
WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def _unescape(v: str) -> str:
    return v.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def _tz(params: str) -> ZoneInfo:
    m = re.search(r"TZID=([^;:]+)", params)
    if m:
        try:
            return ZoneInfo(m.group(1).strip('"'))
        except Exception:  # noqa: BLE001 – unbekannte Zeitzone → Berlin
            pass
    return BERLIN


def _parse_dt(params: str, value: str) -> tuple[datetime, bool]:
    value = value.strip()
    if "VALUE=DATE" in params.upper() and "DATE-TIME" not in params.upper() or re.fullmatch(r"\d{8}", value):
        return datetime.strptime(value[:8], "%Y%m%d").replace(tzinfo=BERLIN), True
    if value.endswith("Z"):
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=ZoneInfo("UTC")).astimezone(BERLIN), False
    return datetime.strptime(value[:15], "%Y%m%dT%H%M%S").replace(tzinfo=_tz(params)).astimezone(BERLIN), False


def _occurrences(start: datetime, rrule: Optional[str], exdates: set[date], until_window: datetime) -> Iterator[datetime]:
    """Einfache Serien: FREQ=DAILY/WEEKLY mit INTERVAL, COUNT, UNTIL, BYDAY (reicht für Stundenpläne)."""
    if not rrule:
        yield start
        return
    rule = dict(p.split("=", 1) for p in rrule.split(";") if "=" in p)
    freq = rule.get("FREQ", "")
    interval = int(rule.get("INTERVAL", "1") or 1)
    count = int(rule["COUNT"]) if "COUNT" in rule else None
    until = None
    if "UNTIL" in rule:
        try:
            until = _parse_dt("", rule["UNTIL"])[0]
        except ValueError:
            until = None
    end = min(until, until_window) if until else until_window
    if freq not in ("DAILY", "WEEKLY"):
        yield start  # andere Serien (monatlich …) nur erster Termin
        return
    days = [WEEKDAYS[d[-2:]] for d in rule.get("BYDAY", "").split(",") if d[-2:] in WEEKDAYS] if freq == "WEEKLY" else []
    if not days:
        days = [start.weekday()]
    n = 0
    week_start = start - timedelta(days=start.weekday())
    step = 0
    while True:
        base = week_start + timedelta(weeks=step * interval) if freq == "WEEKLY" else start + timedelta(days=step * interval)
        candidates = [base + timedelta(days=d) for d in sorted(days)] if freq == "WEEKLY" else [base]
        for occ in candidates:
            if occ < start:
                continue
            if occ > end or (count is not None and n >= count):
                return
            n += 1
            if occ.date() not in exdates:
                yield occ
        step += 1
        if step > 2000:
            return


def parse(ics: str) -> list[dict[str, Any]]:
    text = re.sub(r"\r?\n[ \t]", "", ics)
    now = datetime.now(BERLIN)
    lo, hi = now - timedelta(days=PAST_DAYS), now + timedelta(days=FUTURE_DAYS)
    events: list[dict[str, Any]] = []
    for block in re.findall(r"BEGIN:VEVENT\r?\n(.*?)END:VEVENT", text, re.S):
        props: dict[str, tuple[str, str]] = {}
        exdates: set[date] = set()
        for line in block.splitlines():
            if ":" not in line:
                continue
            head, value = line.split(":", 1)
            name, _, params = head.partition(";")
            name = name.upper()
            if name == "EXDATE":
                for v in value.split(","):
                    try:
                        exdates.add(_parse_dt(params, v)[0].date())
                    except ValueError:
                        pass
                continue
            props.setdefault(name, (params, value.strip()))
        if "DTSTART" not in props or "SUMMARY" not in props or "RECURRENCE-ID" in props:
            continue
        if props.get("STATUS", ("", ""))[1].upper() == "CANCELLED":
            continue
        try:
            start, all_day = _parse_dt(*props["DTSTART"])
            end_dt = _parse_dt(*props["DTEND"])[0] if "DTEND" in props else None
        except ValueError:
            continue
        duration = (end_dt - start) if end_dt else timedelta(0)
        summary = _unescape(props["SUMMARY"][1])
        location = _unescape(props.get("LOCATION", ("", ""))[1]) or None
        kind = "klausur" if EXAM.search(summary) else "abgabe" if DEADLINE.search(summary) else "termin"
        for occ in _occurrences(start, props.get("RRULE", ("", ""))[1] or None, exdates, hi):
            if occ < lo:
                continue
            events.append({
                "uid": f"{props.get('UID', ('', summary))[1]}@{occ:%Y%m%d%H%M}",
                "title": summary,
                "date": occ.date().isoformat(),
                "time": "all day" if all_day else f"{occ:%H:%M}",
                "end": None if all_day or not duration else f"{occ + duration:%H:%M}",
                "kind": kind,
                "start": occ.isoformat(),
                "location": location,
            })
    events.sort(key=lambda e: e["start"])
    return events


def fetch(url: str) -> str:
    url = re.sub(r"^webcals?://", "https://", url.strip())
    if not re.match(r"^https?://", url):
        raise ValueError("Not a calendar link")
    try:
        r = requests.get(url, timeout=30, headers={"User-Agent": USER_AGENT}, stream=True)
    except requests.RequestException:
        raise ValueError("Could not reach this address. Check the link and your internet connection.") from None
    if r.status_code in (401, 403):
        raise ValueError("This calendar is private. Use the subscribe/export link, not the normal web address.")
    if r.status_code >= 400:
        raise ValueError(f"The address returned an error ({r.status_code}). Check the link.")
    data = r.raw.read(MAX_BYTES + 1, decode_content=True)
    if len(data) > MAX_BYTES:
        raise ValueError("This calendar is too large.")
    # iCal ist UTF-8, wenn der Server nichts anderes sagt (requests würde sonst Latin-1 annehmen)
    declared = "charset=" in r.headers.get("content-type", "").lower()
    text = data.decode(r.encoding if declared and r.encoding else "utf-8", errors="replace")
    if "BEGIN:VCALENDAR" not in text:
        raise ValueError("This link does not lead to a calendar. In KLIPS, copy the “Subscribe” (iCal) link.")
    return text


def refresh() -> dict[str, Any]:
    cfg = load_config()
    out_cals, events = [], []
    for cal in cfg.get("calendars", []):
        entry = {"id": cal.get("id"), "name": cal.get("name") or "Calendar", "ok": True, "error": None, "count": 0}
        try:
            evs = parse(fetch(cal["url"]))
            for e in evs:
                e["calendar"] = cal.get("id")
            events.extend(evs)
            entry["count"] = len(evs)
        except Exception as e:  # noqa: BLE001 – Fehler pro Kalender anzeigen, Rest weiter
            entry["ok"], entry["error"] = False, (str(e) or type(e).__name__)[:200]
        out_cals.append(entry)
    result = {"updatedAt": time.time(), "calendars": out_cals, "events": events}
    write_json(OUTPUT, result)
    return result
