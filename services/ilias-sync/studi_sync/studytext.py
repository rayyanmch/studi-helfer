"""Text einer Kursdatei für den Lernbereich (Zusammenfassung, Lernzettel, Karteikarten).

Liefert den Text mit Seitenmarken („--- Page 3 ---“), damit die KI Fundstellen angeben kann.
Läuft nur lokal; was mit dem Text passiert, entscheidet desktop/lib/study.js.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from .common import AppError
from .textfix import repair

TEXT_SUFFIXES = {".txt", ".md", ".tex", ".csv"}


def pdf_text(path: Path, max_chars: int) -> dict[str, Any]:
    from pypdf import PdfReader

    logging.getLogger("pypdf").setLevel(logging.ERROR)  # Warnungen zu leicht kaputten PDFs nicht ausgeben
    reader = PdfReader(str(path))
    parts: list[str] = []
    used = 0
    pages_included = 0
    for i, page in enumerate(reader.pages, start=1):
        try:
            raw = page.extract_text() or ""
        except Exception:  # noqa: BLE001 – einzelne kaputte Seite überspringen
            raw = ""
        text = "\n".join(repair(line) for line in raw.splitlines() if line.strip())
        block = f"--- Page {i} ---\n{text}\n"
        if used + len(block) > max_chars and pages_included > 0:
            break
        parts.append(block)
        used += len(block)
        pages_included = i
    total = len(reader.pages)
    return {
        "text": "".join(parts),
        "pages": total,
        "pagesIncluded": pages_included,
        "partial": pages_included < total,
    }


def file_text(path_str: str, max_chars: int = 150_000) -> dict[str, Any]:
    path = Path(path_str).expanduser()
    if not path.is_file():
        raise AppError("invalid", "This file is no longer there. It may have been moved or deleted.")
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            result = pdf_text(path, max_chars)
        except Exception as e:  # noqa: BLE001
            raise AppError("invalid", "This PDF could not be read.") from e
    elif suffix in TEXT_SUFFIXES:
        text = path.read_text(encoding="utf-8", errors="replace")
        result = {"text": text[:max_chars], "pages": 1, "pagesIncluded": 1, "partial": len(text) > max_chars}
    else:
        raise AppError("unsupported", "Only PDFs and text files can be summarized for now.")
    # Seitenmarken nicht mitzählen: Folien aus Bildern liefern fast keinen Text
    content = sum(len(line) for line in result["text"].splitlines() if not line.startswith("--- Page "))
    if content < 300:
        raise AppError("no_text", "This file has almost no text (probably slides as images), so it can't be summarized yet.")
    result["chars"] = content
    return result
