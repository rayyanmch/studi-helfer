"""Login bei ILIAS Köln und Suche der eigenen Kurse (PFERD kann das Dashboard dort nicht lesen)."""

import re
from datetime import date
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag
from PFERD.crawl.ilias.kit_ilias_html import IliasPage, IliasSoup

from .common import BASE_URL, CLIENT_ID, DATA_DIR, USER_AGENT, AppError

TIMEOUT = 30


def _get(session: requests.Session, url: str, **kwargs: Any) -> requests.Response:
    try:
        r = session.get(url, timeout=TIMEOUT, **kwargs)
    except requests.RequestException as e:
        raise AppError("unreachable", f"Can't reach ILIAS ({type(e).__name__}).") from None
    if r.status_code >= 500:
        raise AppError("unreachable", f"ILIAS returned error {r.status_code}.")
    return r


def _logged_in(r: requests.Response) -> bool:
    soup = BeautifulSoup(r.content, "html.parser")
    return IliasPage.is_logged_in(IliasSoup(soup, r.url))


def login(username: str, password: str) -> requests.Session:
    """Meldet sich an und gibt die angemeldete Sitzung zurück. Wirft AppError."""
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    r = _get(session, f"{BASE_URL}/login.php", params={"client_id": CLIENT_ID, "cmd": "force_login"})
    soup = BeautifulSoup(r.content, "html.parser")
    form = soup.find("form", attrs={"name": "login_form"})
    if not isinstance(form, Tag) or not form.get("action"):
        raise AppError("unexpected", "The ILIAS sign-in page looks different than expected.")

    # Feldnamen aus dem Formular lesen; Fallback sind die Namen, die PFERD nutzt.
    user_field = "login_form/input_3/input_4"
    pass_field = "login_form/input_3/input_5"
    for inp in form.find_all("input"):
        name, kind = inp.get("name"), (inp.get("type") or "text").lower()
        if not name:
            continue
        if kind == "password":
            pass_field = name
        elif kind == "text":
            user_field = name

    try:
        r = session.post(
            urljoin(BASE_URL + "/", str(form["action"])),
            data={user_field: username, pass_field: password},
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        raise AppError("unreachable", f"Can't reach ILIAS ({type(e).__name__}).") from None

    if _logged_in(r):
        return session
    if BeautifulSoup(r.content, "html.parser").find("form", attrs={"name": "login_form"}):
        raise AppError("wrong_password", "Wrong username or password.")
    raise AppError("unexpected", "Sign-in not completed. Please sign in to ILIAS once in your browser "
                   "(e.g. to accept the terms of use) and try again.")


# ------------------------------------------------------------------ Kurse finden

# Links auf Kurse/Gruppen kommen in ILIAS in mehreren Formen vor.
_LINK_PATTERNS = [
    re.compile(r"goto\.php/(crs|grp)/(\d+)"),
    re.compile(r"target=(crs|grp)_(\d+)"),
    re.compile(r"goto_[^/]*?_(crs|grp)_(\d+)\.html"),
]

_OVERVIEW_PAGES = [
    "ilias.php?baseClass=ilmembershipoverviewgui",
    "ilias.php?baseClass=ilDashboardGUI&cmd=jumpToMemberships",
    "ilias.php?baseClass=ilDashboardGUI&cmd=show",
]


def _match_link(href: str) -> Optional[tuple[str, str]]:
    for pattern in _LINK_PATTERNS:
        if m := pattern.search(href):
            return m.group(1), m.group(2)
    return None


def _item_text(a: Tag) -> str:
    """Text des ganzen Listeneintrags (Titel, Eigenschaften wie Semester oder Zeitraum)."""
    node: Optional[Tag] = a
    for _ in range(8):
        node = node.parent if node is not None else None
        if node is None:
            break
        classes = " ".join(node.get("class") or [])
        if any(c in classes for c in ("il-item", "ilContainerListItemOuter", "il-card", "list-group-item")):
            return node.get_text(" ", strip=True)
    return a.get_text(" ", strip=True)


def parse_courses(html: bytes) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, dict[str, Any]] = {}
    for a in soup.find_all("a", href=True):
        hit = _match_link(str(a["href"]))
        if not hit:
            continue
        kind, ref = hit
        title = a.get_text(" ", strip=True)
        if not title:
            continue  # Icon-Links ohne Text
        cid = f"{kind}-{ref}"
        text = _item_text(a)
        prev = found.get(cid)
        if prev is None or len(title) > len(prev["title"]):
            found[cid] = {"id": cid, "kind": kind, "refId": ref, "title": title, "_text": text}
    return list(found.values())


def _semester_of(text: str, today: date) -> str:
    """'current', 'past' oder 'unknown' – aus Angaben wie 'WiSe 2026/27', 'WS26_27', 'SoSe 2026'."""
    t = text.lower()
    if today.month >= 10:
        cur = ("w", today.year)
    elif today.month <= 3:
        cur = ("w", today.year - 1)
    else:
        cur = ("s", today.year)

    def year(s: str) -> int:
        y = int(s)
        return y + 2000 if y < 100 else y

    hits: list[tuple[str, int]] = []
    for m in re.finditer(r"(?<![a-z])(wise|ws|wintersemester|winter\s*term)\s*'?(\d{2}|\d{4})(?![0-9])", t):
        hits.append(("w", year(m.group(2))))
    for m in re.finditer(r"(?<![a-z])(sose|ss|sommersemester|summer\s*term)\s*'?(\d{2}|\d{4})(?![0-9])", t):
        hits.append(("s", year(m.group(2))))
    if hits:
        return "current" if cur in hits else "past"

    # Zeiträume wie "13.10.2026 - 06.02.2027"
    dates = [date(int(y), int(mo), int(d)) for d, mo, y in re.findall(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b", t)
             if 1 <= int(mo) <= 12 and 1 <= int(d) <= 31]
    if len(dates) >= 2:
        start, end = min(dates), max(dates)
        if start <= today <= end:
            return "current"
        if end < today:
            return "past"
    return "unknown"


def list_courses(session: requests.Session, dump: bool = False) -> list[dict[str, Any]]:
    courses: list[dict[str, Any]] = []
    for i, page in enumerate(_OVERVIEW_PAGES):
        r = _get(session, urljoin(BASE_URL + "/", page))
        if dump:
            out = DATA_DIR / "debug"
            out.mkdir(parents=True, exist_ok=True)
            Path(out / f"overview-{i}.html").write_bytes(r.content)
        courses = parse_courses(r.content)
        if courses:
            break

    today = date.today()
    for c in courses:
        c["semester"] = _semester_of(c["title"] + " " + c.pop("_text"), today)
    # Vorauswahl: nur Kurse (keine Gruppen) des aktuellen Semesters; ist keiner erkennbar, alle Kurse
    # außer eindeutig alten. Gruppen (Tutorien, Altklausur-Sammlungen) können riesig sein: nur auf Wunsch.
    any_current = any(c["semester"] == "current" and c["kind"] == "crs" for c in courses)
    for c in courses:
        fits = c["semester"] == "current" or (not any_current and c["semester"] == "unknown")
        c["suggested"] = c["kind"] == "crs" and fits
    courses.sort(key=lambda c: ({"current": 0, "unknown": 1, "past": 2}[c["semester"]], c["title"].lower()))
    return courses
