"""ILIAS-Lernmodule (Selbstlerneinheiten, Puzzle-Symbol) als PDF in den Kursordner.

PFERD findet Lernmodule beim Durchlaufen der Kurse, würde sie aber Seite für Seite als HTML
speichern (langsam, für die App unbrauchbar). pferd_run.py überspringt sie deshalb und meldet nur
"STUDI-LM<Tab>Pfad<Tab>URL". Hier wird je Lernmodul die ILIAS-Druckansicht geholt (alle Kapitel
auf einer Seite, zwei Anfragen), aufgeräumt, Bilder eingebettet und als eigenständige HTML-Datei
nach <App-Daten>/learnmods/<ref>.html geschrieben. Electron (desktop/lib/learnmods.js) druckt
daraus <Kursordner>/<Pfad>.pdf, z. B. „Woche 3 …/Selbststudium/Lerneinheit "Kaufverträge".pdf“.
Danach ist die Lerneinheit eine normale Datei: Study, Wochen, Suche und Spotlight finden sie.

Die Druckansicht ist teuer (ILIAS braucht ~8 s je Lerneinheit, dazu die Bilder). Deshalb:
- neu, verschoben, fehlgeschlagen oder neue TEMPLATE_VERSION → ganz holen;
- sonst höchstens einmal je RECHECK_S das Auswahlformular (1,5 s): neue/umbenannte Seiten oder
  Kapitel → ganz holen; je Lauf höchstens QUICK_PER_RUN solcher Prüfungen (älteste zuerst);
- Textänderungen innerhalb einer Seite sieht nur die volle Prüfung: je Lernmodul einmal je
  FULL_RECHECK_S, je Lauf höchstens FULL_PER_RUN.
Unveränderter Inhalt (gleiche Signatur aus Text und Bildpfaden) wird nicht neu geschrieben.
"""

import base64
import hashlib
import html as htmllib
import os
import re
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterable, Optional
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup, Tag

from .common import BASE_URL, DATA_DIR, VERSIONS, read_json, write_json

INDEX = DATA_DIR / "learnmods.json"
HTML_DIR = DATA_DIR / "learnmods"
RECHECK_S = 20 * 3600  # Lernmodule ändern sich selten: einmal am Tag nachsehen reicht
FULL_RECHECK_S = 7 * 86400
QUICK_PER_RUN = 6
FULL_PER_RUN = 2
SECONDS = {"new": 11.0, "full": 9.0, "quick": 1.6}  # für die Restzeit
TEMPLATE_VERSION = 2  # erhöhen, wenn sich Aufräumen oder Aussehen ändern (alles wird neu erzeugt)
TIMEOUT = 45
MAX_IMAGE = 8 * 1024 * 1024
DROP_TAGS = ("script", "style", "noscript", "iframe", "button", "form", "input", "select", "textarea", "link", "meta")


def ref_of(url: str) -> Optional[str]:
    m = re.search(r"lm[/_](\d+)", url) or re.search(r"ref_id=(\d+)", url)
    return m.group(1) if m else None


def module_url(ref: str) -> str:
    return f"{BASE_URL}/goto.php/lm/{ref}"


def fetch_selection(session: requests.Session, ref: str) -> tuple[str, list[str], str]:
    """Auswahlformular der Druckansicht. → (Formular-Ziel, Seiten-/Kapitel-Ids, Signatur der Gliederung)."""
    r = session.get(f"{BASE_URL}/ilias.php", timeout=TIMEOUT, params={
        "baseClass": "illmpresentationgui", "cmd": "showPrintViewSelection", "ref_id": ref, "obj_id": "0"})
    r.raise_for_status()
    soup = BeautifulSoup(r.content, "html.parser")
    form = soup.find("form", id="il-lm-print-view")
    if not isinstance(form, Tag) or not form.get("action"):
        raise RuntimeError("print view not offered")
    ids = [str(i["value"]) for i in form.find_all("input", attrs={"name": "sel_obj_id[]"}) if i.get("value")]
    if not ids:
        raise RuntimeError("no chapters in print view selection")
    outline = " ".join(ids) + "\n" + re.sub(r"\s+", " ", form.get_text(" ", strip=True))
    return htmllib.unescape(str(form["action"])), ids, hashlib.sha256(outline.encode()).hexdigest()


def fetch_print_view(session: requests.Session, action: str, ids: list[str]) -> str:
    """Druckansicht mit allen Kapiteln und Seiten (wie „Ausgewählte Seiten/Kapitel“ mit allem angehakt)."""
    data = [("sel_type", "selection"), ("cmd[showPrintView]", "Druckansicht")] + [("sel_obj_id[]", i) for i in ids]
    p = session.post(urljoin(BASE_URL + "/", action), data=data, timeout=TIMEOUT)
    p.raise_for_status()
    return p.text


def _unwrap_links(root: Tag) -> None:
    """Links nach außen (Gesetzestexte …) bleiben anklickbar, ILIAS-interne und Fußnoten-Sprünge werden Text."""
    for a in root.find_all("a"):
        href = str(a.get("href") or "")
        host = urlsplit(href).netloc
        if href.startswith(("http://", "https://")) and "ilias.uni-koeln.de" not in host:
            a.attrs = {"href": href}
        else:
            a.unwrap()


def clean(raw: str, module_title: str) -> tuple[Tag, str, list[Tag]]:
    """Inhalt der Druckansicht ohne ILIAS-Rahmen. → (Inhalt, Signatur, Bilder)."""
    soup = BeautifulSoup(raw, "html.parser")
    root = soup.find(id="printViewPageContainer")
    if not isinstance(root, Tag):
        raise RuntimeError("print view has no content")
    for tag in root.find_all(DROP_TAGS):
        tag.decompose()
    for tag in root.find_all(class_=re.compile(r"^(modal|hidden-print|ilPrintHidden)$")):
        tag.decompose()
    for tag in root.find_all(id="ilPageShowAdvContent"):  # „Vertiefungswissen anzeigen/verbergen“ (Inhalt bleibt)
        tag.decompose()

    # Inhaltsverzeichnis: je Eintrag eine Layout-Tabelle mit Platzhalter-Bildern (Einrückung) → schlichte Zeilen
    for table in root.find_all("table"):
        spacers = table.find_all("img", class_="spacer")
        if spacers and not any(c.startswith("ilc_") for c in table.get("class") or []):
            item = soup.new_tag("div", attrs={"class": f"toc-item toc-d{min(len(spacers) - 1, 3)}"})
            item.string = table.get_text(" ", strip=True)
            table.replace_with(item)
    for img in root.find_all("img", class_="spacer"):
        img.decompose()
    # Reste der ILIAS-Auszeichnung im Text („Willenserklärungen[/iln]“)
    for s in root.find_all(string=re.compile(r"\[/?(iln|xln|fn|com|anc|marked|kw|tex)\b[^\]]{0,80}\]")):
        s.replace_with(re.sub(r"\[/?(iln|xln|fn|com|anc|marked|kw|tex)\b[^\]]{0,80}\]", "", str(s)))

    # Videos lassen sich nicht drucken: Hinweis mit Dateiname statt leerer Fläche
    for fig in root.find_all("figure"):
        if fig.find("img"):
            continue
        name = fig.get_text(" ", strip=True)
        note = soup.new_tag("div", attrs={"class": "media-note"})
        note.string = f"Video{': ' + name if name else ''} (watch it in ILIAS)"
        fig.replace_with(note)

    # Überschriften: Kapitel = h2, Seite = h3 (ergibt Lesezeichen im PDF); erstes Kapitel = Titel des Moduls
    chapters = root.find_all(class_="ilc_PrintChapterTitle")
    if chapters and chapters[0].get_text(" ", strip=True) == module_title:
        chapters[0].decompose()
    for h in root.find_all(class_="ilc_PrintChapterTitle"):
        h.name = "h2"
    for h in root.find_all(class_="ilc_PrintPageTitle"):
        h.name = "h3"

    _unwrap_links(root)
    images = [img for img in root.find_all("img") if img.get("src") and not str(img["src"]).startswith("data:")]
    for el in root.find_all(True):
        keep = {k: v for k, v in el.attrs.items() if k in ("class", "href", "colspan", "rowspan", "alt", "src", "width")}
        if "class" in keep:
            keep["class"] = [c for c in keep["class"] if c.startswith(("ilc_", "toc-")) or c == "media-note"]
            if not keep["class"]:
                del keep["class"]
        el.attrs = keep
    for el in root.find_all(["div", "span", "p"]):  # leere Hüllen
        if el.decomposed:
            continue
        if not el.get_text(strip=True) and not el.find(["img", "table", "hr", "br"]):
            el.decompose()

    text = re.sub(r"\s+", " ", root.get_text(" ", strip=True))
    pics = sorted(urlsplit(str(img["src"])).path for img in images)
    sig = hashlib.sha256(f"{text}\n{' '.join(pics)}".encode()).hexdigest()  # nur Inhalt, ohne Vorlage
    return root, sig, images


def embed_images(session: requests.Session, images: Iterable[Tag]) -> int:
    """Bilder als data:-URI einbetten (die ILIAS-Adressen gelten nur kurz und nur mit Anmeldung)."""
    missing = 0
    for img in images:
        url = urljoin(BASE_URL + "/", str(img["src"]))
        try:
            r = session.get(url, timeout=TIMEOUT)
            kind = r.headers.get("Content-Type", "").split(";")[0].strip()
            if r.status_code != 200 or not kind.startswith("image/") or len(r.content) > MAX_IMAGE:
                raise ValueError(f"{r.status_code} {kind} {len(r.content)}")
            img["src"] = f"data:{kind};base64,{base64.b64encode(r.content).decode()}"
        except (requests.RequestException, ValueError):
            missing += 1
            img.replace_with(BeautifulSoup('<div class="media-note">Image could not be loaded (see ILIAS)</div>',
                                           "html.parser"))
    return missing


CSS = """
@page { size: A4; margin: 16mm 17mm 17mm 17mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.55 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1d1d1f; margin: 0;
  font-variant-ligatures: none; /* „ff“ statt Ligatur-Zeichen: Suche und Textauszug finden „Begriffe“ */
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.meta { font-size: 8.5pt; color: #6b7280; display: flex; justify-content: space-between; gap: 12px; }
.meta a { color: #6b7280; }
h1 { font-size: 21pt; line-height: 1.2; margin: 6px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #1d1d1f; }
h2 { font-size: 15pt; line-height: 1.25; margin: 26px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #d5dae3;
  break-after: avoid; }
h3 { font-size: 11.5pt; margin: 18px 0 6px; color: #374151; break-after: avoid; }
h2 + h3 { margin-top: 10px; }
p, .ilc_Paragraph { margin: 0 0 7px; }
ul, ol { margin: 0 0 8px; padding-left: 20px; }
li { margin: 2px 0; }
a { color: #2f4f8f; }
hr { border: 0; border-top: 1px solid #e5e7eb; margin: 12px 0; }
table { border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; width: auto; max-width: 100%; break-inside: avoid; }
td, th { border: 1px solid #d5dae3; padding: 4px 7px; vertical-align: top; text-align: left; }
.ilc_table_cell_StandardHeader, th { background: #f3f4f6; font-weight: 650; }
caption { font-size: 8.5pt; color: #6b7280; caption-side: bottom; padding-top: 4px; text-align: left; }
figure { margin: 10px 0 12px; text-align: center; break-inside: avoid; }
img { max-width: 100%; height: auto; max-height: 125mm; }
figcaption, .ilc_media_caption_MediaCaption { font-size: 8.5pt; color: #6b7280; margin-top: 4px; }
.ilc_text_block_Example, .ilc_text_block_Additional, .ilc_text_block_Remark, .ilc_text_block_Mnemonic,
.ilc_text_block_Citation, .ilc_text_block_List { margin: 8px 0 10px; padding: 8px 11px; border-radius: 6px;
  break-inside: avoid; }
.ilc_text_block_Example { background: #eef3fb; border-left: 3px solid #3a5ba0; }
.ilc_text_block_Additional, .ilc_text_block_Remark { background: #f5f5f4; border-left: 3px solid #a8a29e; }
.ilc_text_block_Mnemonic { background: #fdf6e3; border-left: 3px solid #c08a1e; }
.ilc_text_block_Citation { font-style: italic; border-left: 3px solid #d5dae3; }
.ilc_text_inline_Important { font-weight: 650; color: #9a3412; }
.ilc_page_fn_Footnote { font-size: 8pt; color: #6b7280; margin-top: 2px; }
.ilc_page_fn_Footnote:first-of-type { border-top: 1px solid #e5e7eb; padding-top: 4px; margin-top: 8px; }
.ilc_link_FootnoteLink { font-size: 7.5pt; vertical-align: super; }
.toc-item { margin: 3px 0; padding-left: 12px; border-left: 2px solid #d5dae3; }
.toc-d1 { margin-left: 16px; } .toc-d2 { margin-left: 32px; } .toc-d3 { margin-left: 48px; }
.toc-item + :not(.toc-item) { margin-top: 14px; }
.media-note { margin: 8px 0; padding: 7px 10px; border: 1px dashed #c7ccd6; border-radius: 6px; color: #6b7280;
  font-size: 9pt; text-align: left; }
"""


def page_html(title: str, course: str, ref: str, body: Tag, fetched: float) -> str:
    when = datetime.fromtimestamp(fetched).strftime("%b %-d, %Y")
    esc = htmllib.escape
    return (
        "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\">"
        f"<title>{esc(title)}</title><style>{CSS}</style></head><body>"
        f"<div class=\"meta\"><span>{esc(course)} · Self-study unit from ILIAS · as of {when}</span>"
        f"<a href=\"{esc(module_url(ref))}\">Open in ILIAS</a></div>"
        f"<h1>{esc(title)}</h1>{body.decode_contents()}</body></html>"
    )


def _course_name(cfg: dict[str, Any], cid: str) -> str:
    for c in cfg.get("courses", []):
        if c.get("id") == cid:
            folder = str(c.get("folder") or "")
            return folder.split("/")[0] if folder else re.sub(r"^\s*\[[^\]]{1,20}\]\s*", "", str(c.get("title", "")))
    return ""


def _pdf_path(cfg: dict[str, Any], cid: str, rel: str) -> Optional[Path]:
    from .sync import folder_name

    for c in cfg.get("courses", []):
        if c.get("id") == cid:
            return Path(os.path.expanduser(cfg["targetDir"])) / (c.get("folder") or folder_name(c["title"])) / rel
    return None


def _backup(path: Optional[Path], cfg: dict[str, Any], cid: str, rel: str) -> Optional[str]:
    """Bisherige PDF sichern wie bei geänderten ILIAS-Dateien (pferd_run.py), Grundlage für „geändert“."""
    if path is None or not path.is_file():
        return None
    folder = next((c.get("folder") for c in cfg.get("courses", []) if c.get("id") == cid), None) or cid
    r = Path(rel)
    dest = VERSIONS / str(folder) / r.parent / f"{r.stem}@{datetime.now():%Y%m%d-%H%M%S}{r.suffix}"
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
        return str(dest)
    except OSError:
        return None


def _move_pdf(cfg: dict[str, Any], old: dict[str, Any], cid: str, rel: str) -> None:
    """Lernmodul in ILIAS verschoben oder umbenannt: unsere PDF zieht mit (sonst läge sie doppelt da)."""
    src = _pdf_path(cfg, str(old.get("course") or ""), str(old.get("rel") or ""))
    dst = _pdf_path(cfg, cid, rel)
    if src and dst and src != dst and src.suffix == ".pdf" and src.is_file() and not dst.exists():
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            os.replace(src, dst)
        except OSError:
            pass


def refresh(get_session: Callable[[], requests.Session], found: list[dict[str, str]], cfg: dict[str, Any],
            synced: Iterable[str], initial: Iterable[str] = (), log: Callable[[str], None] = print,
            progress: Optional[Callable[[float], None]] = None) -> dict[str, Any]:
    """found: von PFERD gemeldete Lernmodule ({course, path, url}). synced: Kurse, die dieser Lauf ganz
    durchlaufen hat. Kurse, die zum ersten Mal mit Lernmodulen geprüft werden, zählen nicht als „neu“
    (sonst stünden beim ersten Mal alle alten Lerneinheiten unter „New“). progress(Restsekunden)."""
    idx: dict[str, Any] = read_json(INDEX, {})
    idx.setdefault("courses", {})
    mods: dict[str, Any] = idx.setdefault("modules", {})
    known_courses = set(idx["courses"])
    initial_set = set(initial)
    added: list[dict[str, str]] = []
    changed: list[dict[str, str]] = []
    fetched = 0
    now = time.time()

    # 1. Was ist zu tun? (neu → ganz holen, sonst Gliederung prüfen, ab und zu ganz)
    plan: list[tuple[dict[str, Any], Optional[dict[str, Any]], str]] = []
    quick: list[tuple[dict[str, Any], Optional[dict[str, Any]], str]] = []
    seen: set[str] = set()
    for f in found:
        ref = ref_of(f.get("url", ""))
        cid = f.get("course") or ""
        if not ref or not cid or ref in seen:
            continue  # dasselbe Lernmodul in Übung und Gruppe nur einmal
        seen.add(ref)
        rel = f"{f['path']}.pdf"
        old = mods.get(ref)
        if old and (old.get("rel") != rel or old.get("course") != cid):
            _move_pdf(cfg, old, cid, rel)
        entry = {**(old or {}), "ref": ref, "course": cid, "rel": rel, "title": Path(f["path"]).name}
        mods[ref] = entry
        if old is None or not old.get("sig") or old.get("v") != TEMPLATE_VERSION or not (HTML_DIR / f"{ref}.html").exists():
            plan.append((entry, old, "new"))
        elif old.get("error") or now - float(old.get("checkedAt") or 0) > RECHECK_S:
            quick.append((entry, old, "quick"))
    quick.sort(key=lambda t: float((t[1] or {}).get("checkedAt") or 0))
    full_left = FULL_PER_RUN
    for entry, old, _ in quick[:QUICK_PER_RUN]:
        kind = "quick"
        if full_left and now - float((old or {}).get("fullAt") or 0) > FULL_RECHECK_S:
            kind, full_left = "full", full_left - 1
        plan.append((entry, old, kind))
    left = sum(SECONDS[k] for _, _, k in plan)

    # 2. Abarbeiten
    for entry, old, kind in plan:
        ref, cid, rel, title = entry["ref"], entry["course"], entry["rel"], entry["title"]
        if progress:
            progress(left)
        left -= SECONDS[kind]
        started = time.time()
        try:
            session = get_session()
            action, ids, outline = fetch_selection(session, ref)
            entry["checkedAt"] = now
            entry.pop("error", None)
            if kind == "quick" and old and old.get("outline") == outline:
                continue  # gleiche Kapitel und Seiten
            body, sig, images = clean(fetch_print_view(session, action, ids), title)
            entry.update(outline=outline, fullAt=now)
            if old and old.get("sig") == sig and old.get("v") == TEMPLATE_VERSION and (HTML_DIR / f"{ref}.html").exists():
                continue  # Inhalt unverändert
            missing = embed_images(session, images)
            HTML_DIR.mkdir(parents=True, exist_ok=True)
            out = HTML_DIR / f"{ref}.html"
            tmp = out.with_suffix(".tmp")
            tmp.write_text(page_html(title, _course_name(cfg, cid), ref, body, now), encoding="utf-8")
            tmp.replace(out)
            fresh = cid in known_courses and cid not in initial_set
            if old is None and fresh:
                added.append({"course": cid, "path": rel})
            elif old is not None and old.get("v") == TEMPLATE_VERSION and old.get("sig") != sig and fresh:
                # Inhalt in ILIAS geändert (nach neuer Vorlage nicht vergleichbar: dann still neu drucken)
                item = {"course": cid, "path": rel}
                if prev := _backup(_pdf_path(cfg, cid, rel), cfg, cid, rel):
                    item["previous"] = prev
                changed.append(item)
            look = hashlib.sha256(f"{TEMPLATE_VERSION}:{sig}".encode()).hexdigest()[:20]  # Electron druckt neu, wenn anders
            entry.update(sig=sig, v=TEMPLATE_VERSION, hash=look, fetchedAt=now, images=len(images), missingImages=missing)
            fetched += 1
            log(f"Lernmodul geholt: {rel} ({len(images)} Bilder, {time.time() - started:.1f} s)")
        except Exception as e:  # noqa: BLE001 – ein Lernmodul darf den Lauf nie stören
            entry["error"] = f"{type(e).__name__}: {e}"[:300]
            entry["checkedAt"] = now
            log(f"Lernmodul nicht geholt: {rel}: {entry['error']}")
        finally:
            write_json(INDEX, idx)  # Zwischenstand: ein Abbruch verliert keine fertigen Lernmodule

    for cid in synced:
        idx["courses"].setdefault(cid, now)
    write_json(INDEX, idx)
    return {"count": len(seen), "fetched": fetched, "checked": len(plan), "added": added, "changed": changed}
