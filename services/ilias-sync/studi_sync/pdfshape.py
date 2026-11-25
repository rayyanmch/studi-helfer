"""Seitenformat der PDFs in den Kursordnern: Querformat = Folien, Hochformat = Blatt.

Hilft der App bei mehrdeutigen Namen („Uebung03.pdf“ kann Übungsfolien oder Übungsblatt sein; doctype.ts).
Gelesen wird nur die Größe der ersten Seite (pypdf, wenige Millisekunden je Datei, keine Texte).
Ergebnis in <App-Daten>/pdf-shapes.json, je Pfad mit Größe und Änderungszeit, damit nur neue oder
geänderte Dateien gelesen werden.
"""

from pathlib import Path
from typing import Any

from .common import DATA_DIR, load_config, read_json, write_json

SHAPES = DATA_DIR / "pdf-shapes.json"
VERSION = 1
# Fast quadratische Seiten (Poster, Scans mit Rand) bleiben ohne Angabe.
RATIO = 1.1


def shape_of(path: Path) -> str | None:
    """„landscape“, „portrait“ oder None (quadratisch, kaputt, verschlüsselt)."""
    from pypdf import PdfReader

    try:
        page = PdfReader(str(path)).pages[0]
        box = page.mediabox
        w, h = float(box.width), float(box.height)
        if int(page.get("/Rotate", 0) or 0) % 180:
            w, h = h, w
    except Exception:  # noqa: BLE001 – kaputte oder verschlüsselte PDFs haben kein Format
        return None
    if w > h * RATIO:
        return "landscape"
    if h > w * RATIO:
        return "portrait"
    return None


def course_pdfs(cfg: dict[str, Any]) -> list[Path]:
    target = Path(cfg.get("targetDir") or "")
    out: list[Path] = []
    for c in cfg.get("courses", []):
        if not c.get("selected"):
            continue
        root = target / (c.get("folder") or c["title"])
        if not root.is_dir():
            continue
        for p in root.rglob("*"):
            if p.suffix.lower() != ".pdf" or any(part.startswith(".") for part in p.relative_to(root).parts):
                continue
            out.append(p)
    return out


def refresh() -> dict[str, Any]:
    old = read_json(SHAPES, {})
    known: dict[str, Any] = old.get("files", {}) if old.get("version") == VERSION else {}
    files: dict[str, Any] = {}
    read = 0
    for p in course_pdfs(load_config()):
        try:
            st = p.stat()
        except OSError:
            continue
        key = str(p)
        prev = known.get(key)
        if prev and prev.get("size") == st.st_size and prev.get("mtime") == int(st.st_mtime):
            files[key] = prev
            continue
        files[key] = {"size": st.st_size, "mtime": int(st.st_mtime), "shape": shape_of(p)}
        read += 1
    changed = files != known
    if changed or old.get("version") != VERSION:
        write_json(SHAPES, {"version": VERSION, "files": files})
    return {"count": len(files), "read": read, "changed": changed}
