"""Fristen und Termine aus dem ILIAS-Kalender (Abgaben aus Übungen, Sitzungen, Ende von Anmeldungen).

Ablauf: anmelden → Abo-Adresse des persönlichen Kalenders aus dem Abo-Dialog lesen (enthält einen
geheimen Token, wird nicht gespeichert) → ICS laden → Termine einordnen → jedem Termin über die
Brotkrumen-Navigation seines ILIAS-Objekts den Kurs zuordnen (Ergebnis wird gecacht) →
nach deadlines.json schreiben (liest Electron).
"""

import html
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from .common import BASE_URL, DATA_DIR, AppError, load_config, read_json, write_json

DEADLINES = DATA_DIR / "deadlines.json"
PARENTS = DATA_DIR / "object-parents.json"  # "exc/123" → ["crs-1", "grp-2"] (Brotkrumen, außen → innen)
BERLIN = ZoneInfo("Europe/Berlin")
PAST_DAYS = 14  # so weit zurück werden Termine noch geliefert
TIMEOUT = 30


def deadline_id(course_id: str, title: str, day: str) -> str:
    """Gleiche Regel wie deadlineId() in web/src/lib/desktop.ts."""
    norm = re.sub(r"\s+", " ", unicodedata.normalize("NFC", title).strip().lower())
    return f"{course_id}|{norm}|{day}"


# ------------------------------------------------------------------ ICS holen und lesen

def fetch_ics(session: requests.Session) -> str:
    try:
        cal = session.get(f"{BASE_URL}/ilias.php?baseClass=ilDashboardGUI&cmd=jumpToCalendar", timeout=TIMEOUT)
        modal_links = {html.unescape(x) for x in re.findall(
            r'["\']([^"\']*cmd=getModalForSubscription[^"\']*)["\']', cal.text)}
        if not modal_links:
            raise AppError("unexpected", "ILIAS-Kalender: Abo-Dialog nicht gefunden.")
        link = sorted(modal_links)[0]
        modal = session.get(link if link.startswith("http") else f"{BASE_URL}/{link.lstrip('./')}", timeout=TIMEOUT)
        urls = sorted(set(re.findall(r'(https?://[^"\'<>\s]*calendar\.php\?[^"\'<>\s]*)', html.unescape(modal.text))))
        if not urls:
            raise AppError("unexpected", "ILIAS-Kalender: Abo-Adresse nicht gefunden.")
        url = next((u for u in urls if "limited=0" in u), urls[0])
        r = session.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AppError("unreachable", f"ILIAS ist nicht erreichbar ({type(e).__name__}).") from None
    if "BEGIN:VCALENDAR" not in r.text:
        raise AppError("unexpected", "ILIAS-Kalender: keine Kalenderdaten erhalten.")
    return r.text


def _unescape_text(v: str) -> str:
    return v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def _parse_dt(params: str, value: str) -> tuple[datetime, bool]:
    """→ (Zeitpunkt in Berliner Zeit, ganztägig?)"""
    if "VALUE=DATE" in params and "VALUE=DATE-TIME" not in params or re.fullmatch(r"\d{8}", value):
        d = datetime.strptime(value[:8], "%Y%m%d").replace(tzinfo=BERLIN)
        return d, True
    if value.endswith("Z"):
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=ZoneInfo("UTC")).astimezone(BERLIN), False
    return datetime.strptime(value[:15], "%Y%m%dT%H%M%S").replace(tzinfo=BERLIN), False


def parse_events(ics: str) -> list[dict[str, Any]]:
    text = re.sub(r"\r?\n[ \t]", "", ics)  # gefaltete Zeilen zusammenfügen
    events = []
    for block in re.findall(r"BEGIN:VEVENT\r?\n(.*?)END:VEVENT", text, re.S):
        props: dict[str, tuple[str, str]] = {}
        for line in block.splitlines():
            if ":" not in line:
                continue
            head, value = line.split(":", 1)
            name, _, params = head.partition(";")
            props.setdefault(name.upper(), (params, value.strip()))
        if "DTSTART" not in props or "SUMMARY" not in props:
            continue
        start, all_day = _parse_dt(*props["DTSTART"])
        events.append({
            "uid": props.get("UID", ("", ""))[1],
            "summary": _unescape_text(props["SUMMARY"][1]).strip(),
            "start": start,
            "allDay": all_day,
            "url": props.get("URL", ("", ""))[1],
            "location": _unescape_text(props.get("LOCATION", ("", ""))[1]).strip() or None,
        })
    return events


_SUFFIX = re.compile(r"\s*\(([^()]*)\)\s*$")


def classify(ev: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Ordnet einen Termin ein. None = für die App uninteressant."""
    m = re.search(r"goto\.php/(\w+)/(\d+)", ev["url"]) or re.search(r"target=(\w+?)_(\d+)", ev["url"])
    obj_type, obj_id = (m.group(1), m.group(2)) if m else (None, None)
    suffix = _SUFFIX.search(ev["summary"])
    tag = suffix.group(1).lower() if suffix else ""
    base_title = _SUFFIX.sub("", ev["summary"]) if suffix else ev["summary"]
    start: datetime = ev["start"]

    if obj_type == "exc" and "abgabe" in tag:
        # ILIAS speichert "bis Mitternacht" oft als 00:00 des Folgetags.
        if not ev["allDay"] and start.hour == 0 and start.minute == 0:
            day, time = (start - timedelta(minutes=1)).date(), "bis 24:00"
        else:
            day, time = start.date(), "ganztägig" if ev["allDay"] else f"bis {start:%H:%M}"
        return {"category": "exercise", "kind": "abgabe", "title": base_title, "day": day, "time": time,
                "object": f"exc/{obj_id}"}
    if obj_type == "grp" and "ende der anmeldung" in tag:
        return {"category": "registration", "kind": "termin", "title": f"Anmeldeschluss {base_title}",
                "day": start.date(), "time": "ganztägig" if ev["allDay"] else f"bis {start:%H:%M}",
                "object": f"grp/{obj_id}"}
    if obj_type == "sess":
        return {"category": "session", "kind": "termin", "title": ev["summary"], "day": start.date(),
                "time": "ganztägig" if ev["allDay"] else f"{start:%H:%M}", "object": f"sess/{obj_id}"}
    return None  # Beginn der Anmeldung, Kursbeginn/-ende, eigene Termine ohne Objekt


# ------------------------------------------------------------------ Kurs zuordnen

def _breadcrumb_parents(session: requests.Session, obj: str) -> list[str]:
    r = session.get(f"{BASE_URL}/goto.php/{obj}", timeout=TIMEOUT)
    soup = BeautifulSoup(r.content, "html.parser")
    nav = soup.select_one(".breadcrumb_wrapper, .breadcrumb, .il-breadcrumbs")
    parents: list[str] = []
    for a in nav.find_all("a", href=True) if nav else []:
        if m := re.search(r"goto\.php/(crs|grp)/(\d+)", str(a["href"])):
            parents.append(f"{m.group(1)}-{m.group(2)}")
    if obj.startswith("grp/"):
        parents.append("grp-" + obj.split("/")[1])
    return parents


def refresh(session: requests.Session) -> dict[str, Any]:
    cfg = load_config()
    selected = {c["id"]: c for c in cfg.get("courses", []) if c.get("selected")}
    events = parse_events(fetch_ics(session))
    cache: dict[str, list[str]] = read_json(PARENTS, {})
    oldest = date.today() - timedelta(days=PAST_DAYS)

    deadlines: list[dict[str, Any]] = []
    for ev in events:
        info = classify(ev)
        if info is None or info["day"] < oldest:
            continue
        obj = info["object"]
        if obj not in cache:
            try:
                cache[obj] = _breadcrumb_parents(session, obj)
            except requests.RequestException:
                continue  # beim nächsten Mal erneut versuchen
        # Ausgewählter Kurs gewinnt (Übungsgruppe im Kurs → Kurs, passt zu Kursfarben in der Oberfläche);
        # nur wenn kein Kurs ausgewählt ist, die ausgewählte Gruppe.
        chain = cache[obj]
        course_id = next((p for p in reversed(chain) if p in selected and p.startswith("crs-")), None) \
            or next((p for p in reversed(chain) if p in selected), None)
        if course_id is None:
            continue
        day = info["day"].isoformat()
        deadlines.append({
            "id": deadline_id(course_id, info["title"], day),
            "courseId": course_id,
            "title": info["title"],
            "date": day,
            "time": info["time"],
            "kind": info["kind"],
            "category": info["category"],
            "source": "ILIAS-Kalender",
            "start": ev["start"].isoformat(),
            "url": ev["url"] or None,
            "location": ev["location"],
        })
    write_json(PARENTS, cache)
    # Doppelte (gleiche Id) entfernen, z. B. wenn ILIAS denselben Termin zweimal liefert.
    unique = list({d["id"]: d for d in deadlines}.values())
    unique.sort(key=lambda d: (d["date"], d["start"], d["title"]))
    result = {"updatedAt": datetime.now(BERLIN).timestamp(), "deadlines": unique}
    write_json(DEADLINES, result)
    return result
