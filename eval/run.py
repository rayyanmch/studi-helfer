#!/usr/bin/env python3
"""Prüfstand für die Regel-Erkennung in Python: orga.py (Stundenplan, Beginn, Ausfälle, Einzeltermine, ECTS)
und sheets.py (Abgaben, Klausuren, Termine mit Datum).

Aufruf (aus dem Repo):  services/ilias-sync/.venv/bin/python eval/run.py [Filter] [-v] [--no-save]

- Echte Fälle (cases/real/*.json): ein Kursordner in ~/Uni (oder $EVAL_UNI_DIR). Die erwarteten Werte stehen im Fall,
  die PDFs nicht (Repo ist öffentlich). Fehlt eine Quelldatei oder hat sie sich geändert (SHA-256), wird der Fall
  übersprungen.
- Ausgedachte Fälle (cases/synthetic/*.json): Der Prüfstand erzeugt aus den Zeilen echte PDFs (Seiten, Füllseiten,
  Dateiname, Änderungsdatum) und schickt sie durch dieselbe Pipeline.

Die Pipeline ist die der App: orga.refresh() und sheets.refresh() mit eigener config.json in einem frischen
Datenordner (STUDI_DATA_DIR), nie im echten. Ergebnis: Tabelle je Fall und Kategorie, Laufzeit je Datei,
Vergleich mit dem letzten Lauf (results/py.json). Exit-Code 2, wenn ein vorher bestandener Fall jetzt fehlschlägt.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SYNC = REPO / "services/ilias-sync"
RESULTS = HERE / "results/py.json"
REAL_DATA = Path.home() / "Library/Application Support/Studi-Helfer"

# ------------------------------------------------------------------ PDF erzeugen (ohne Bibliothek)

FILLER = ["Motivation und Beispiele", "• Warum dieses Thema wichtig ist", "• Begriffe und Definitionen",
          "• Beispiel aus der Praxis", "• Zusammenfassung der Folie"]


def _pdf_escape(text: str) -> bytes:
    raw = text.encode("cp1252", "replace")
    return raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def make_pdf(path: Path, pages: list[list[str]], title: str) -> None:
    """Minimales PDF: Helvetica (WinAnsi), eine Textzeile je Zeile. pypdf liest es wie Folien."""
    objs: list[bytes] = []
    n_pages = len(pages)
    page_ids = [4 + 2 * i for i in range(n_pages)]
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [" + b" ".join(f"{p} 0 R".encode() for p in page_ids) + b"] /Count "
                + str(n_pages).encode() + b" >>")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    for i, lines in enumerate(pages):
        stream = b"BT /F1 10 Tf\n"
        y = 800
        for ln in lines:
            stream += f"1 0 0 1 40 {y} Tm (".encode() + _pdf_escape(ln) + b") Tj\n"
            y -= 14
        stream += b"ET"
        objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> "
                    b"/Contents " + str(page_ids[i] + 1).encode() + b" 0 R >>")
        objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    info_id = len(objs) + 1
    objs.append(b"<< /Title (" + _pdf_escape(title) + b") >>")  # macht jede Datei einzigartig (Hash-Doppelte)
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R /Info {info_id} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))


def expand_pages(spec: list) -> list[list[str]]:
    pages: list[list[str]] = []
    for item in spec:
        if isinstance(item, dict) and "filler" in item:
            for k in range(int(item["filler"])):
                pages.append([f"Folie {len(pages) + 1}"] + FILLER)
        else:
            pages.append(list(item))
    return pages


# ------------------------------------------------------------------ Fälle laden und vorbereiten

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slug(case_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", case_id.lower()).strip("-")


def load_cases(filter_text: str | None) -> list[dict]:
    cases = []
    for kind in ("real", "synthetic"):
        for f in sorted((HERE / "cases" / kind).glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            for c in data if isinstance(data, list) else [data]:
                if c.get("algo", "py") != "py":
                    continue
                c["_kind"] = kind
                c["id"] = f"{kind}/{c['id']}"
                if not filter_text or filter_text in c["id"]:
                    cases.append(c)
    return cases


def find_file(root: Path, name: str) -> Path | None:
    hits = [p for p in root.rglob(name) if not any(x.startswith(".") for x in p.relative_to(root).parts)]
    return hits[0] if hits else None


def prepare(cases: list[dict], uni: Path, work: Path) -> tuple[dict, dict]:
    """Ordnerbaum für die Pipeline: work/uni/real → ~/Uni, work/uni/synth/<fall>/… mit erzeugten PDFs."""
    tree = work / "uni"
    (tree / "synth").mkdir(parents=True)
    if uni.is_dir():
        (tree / "real").symlink_to(uni, target_is_directory=True)
    courses, skipped = [], {}
    for c in cases:
        cid = slug(c["id"])
        if c["_kind"] == "real":
            root = uni / c["folder"]
            c["_files"] = {}
            why = None
            if not root.is_dir():
                why = f"Ordner fehlt: {c['folder']}"
            for src in c.get("sources", []):
                if why:
                    break
                p = find_file(root, src["name"])
                if not p:
                    why = f"Datei fehlt: {src['name']}"
                elif src.get("sha256") and sha256(p) != src["sha256"]:
                    why = f"Datei geändert: {src['name']} (erwartete Werte prüfen)"
                else:
                    c["_files"][src["name"]] = p
            for name in c.get("sheets", {}):
                if not why and name not in c["_files"]:
                    p = find_file(root, name)
                    if p:
                        c["_files"][name] = p
                    else:
                        why = f"Datei fehlt: {name}"
            if why:
                skipped[c["id"]] = why
                continue
            folder = f"real/{c['folder']}"
        else:
            folder = f"synth/{cid}"
            ref = datetime.fromisoformat(c.get("ref", "2026-10-12")).timestamp() + 12 * 3600
            c["_files"] = {}
            for name, spec in c["files"].items():
                p = tree / folder / name
                make_pdf(p, expand_pages(spec["pages"] if isinstance(spec, dict) else spec), c["id"] + "/" + name)
                os.utime(p, (ref, ref))
                c["_files"][Path(name).name] = p
        courses.append({"id": f"crs-{cid}", "kind": "crs", "refId": cid, "title": c["id"], "folder": folder,
                        "selected": True, "videos": False})
        c["_course"] = f"crs-{cid}"
        c["_folder"] = folder
    return {"username": "eval", "targetDir": str(tree), "courses": courses}, skipped


# ------------------------------------------------------------------ Vergleichen

class Score:
    def __init__(self) -> None:
        self.cats: dict[str, list[int]] = {}  # Kategorie → [Treffer, Fehlalarme, Verpasst]
        self.msgs: list[str] = []

    def add(self, cat: str, tp: int = 0, fp: int = 0, fn: int = 0, msg: str | None = None) -> None:
        c = self.cats.setdefault(cat, [0, 0, 0])
        c[0] += tp
        c[1] += fp
        c[2] += fn
        if msg:
            self.msgs.append(f"{cat}: {msg}")

    @property
    def errors(self) -> int:
        return sum(fp + fn for _, fp, fn in self.cats.values())


WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def _slot_txt(s: dict) -> str:
    g = f" Gruppe {s['group']}" if s.get("group") is not None else ""
    return f"{s['type']} {WD[s['weekday']]} {s['start']}–{s['end']}{g}"


def _matches(item: dict, pattern: dict) -> bool:
    return all(item.get(k) == v for k, v in pattern.items() if k not in ("room", "noRoom", "note"))


def compare_slots(exp: list[dict], got: list[dict], optional: list[dict], sc: Score) -> None:
    key = lambda s: (s["weekday"], s["start"], s["end"], s["type"], s.get("group"))
    left = list(got)
    for e in exp:
        e = {"group": None, **e}
        hit = next((g for g in left if key(g) == key(e)), None)
        if not hit:
            near = next((g for g in left if g["weekday"] == e["weekday"] and g["start"] == e["start"]), None)
            extra = f" (gefunden: {_slot_txt(near)})" if near else ""
            sc.add("orga.slots", fn=1, msg=f"verpasst {_slot_txt(e)}{extra}")
            continue
        left.remove(hit)
        sc.add("orga.slots", tp=1)
        if "alternative" in e:
            if bool(hit.get("alternative")) == bool(e["alternative"]):
                sc.add("orga.alt", tp=1)
            else:
                sc.add("orga.alt", fn=1, msg=f"{_slot_txt(e)} Wahltermin={hit.get('alternative')}, erwartet {e['alternative']}")
        if e.get("noRoom"):
            if hit.get("room"):
                sc.add("orga.room", fp=1, msg=f"{_slot_txt(e)} Raum „{hit.get('room')}“, erwartet keiner")
            else:
                sc.add("orga.room", tp=1)
        if e.get("room"):
            room = re.sub(r"\s+", " ", hit.get("room") or "").lower()
            if re.sub(r"\s+", " ", e["room"]).lower() in room:
                sc.add("orga.room", tp=1)
            else:
                sc.add("orga.room", fn=1, msg=f"{_slot_txt(e)} Raum „{hit.get('room')}“, erwartet „{e['room']}“")
    for g in left:
        if any(_matches(g, o) for o in optional):
            continue
        sc.add("orga.slots", fp=1, msg=f"Fehlalarm {_slot_txt(g)} ← „{(g.get('evidence') or '')[:90]}“")


def compare_dict(cat: str, exp: dict, got: dict, optional: dict, sc: Score) -> None:
    for k, v in exp.items():
        if got.get(k) == v:
            sc.add(cat, tp=1)
        else:
            sc.add(cat, fn=1, msg=f"{k}: {got.get(k)!r}, erwartet {v!r}")
    for k, v in got.items():
        if k in exp:
            continue
        ok = optional.get(k)
        if ok is not None and (ok == "*" or v == ok or (isinstance(ok, list) and v in ok)):
            continue
        sc.add(cat, fp=1, msg=f"Fehlalarm {k}={v!r}")


def compare_list(cat: str, exp: list[dict], got: list[dict], fields: tuple, optional: list[dict], sc: Score,
                 label=lambda x: json.dumps(x, ensure_ascii=False)) -> None:
    left = list(got)
    for e in exp:
        hit = next((g for g in left if all(g.get(f) == e.get(f) for f in fields)), None)
        if hit:
            left.remove(hit)
            sc.add(cat, tp=1)
            for f, v in e.items():
                if f in fields or f == "note" or v is None:
                    continue
                if (hit.get(f) in v) if isinstance(v, list) else (hit.get(f) == v):
                    continue
                sc.add(cat + (".title" if f == "title" else ""), fn=1, msg=f"{label(e)}: {f} {hit.get(f)!r}, erwartet {v!r}")
        else:
            sc.add(cat, fn=1, msg=f"verpasst {label(e)}")
    for g in left:
        if any(_matches(g, o) for o in optional):
            continue
        sc.add(cat, fp=1, msg=f"Fehlalarm {label({f: g.get(f) for f in fields + ('time',) if f in g})}"
               + (f" ← „{g['evidence'][:90]}“" if g.get("evidence") else ""))


def _monday(d: date) -> date:
    return date.fromordinal(d.toordinal() - d.weekday())


def first_threshold(got: dict, typ: str, sem_start: date) -> date:
    """Ab wann ein Termin dieser Art stattfindet – gleiche Regel wie desktop/lib/schedule.js."""
    first = sem_start
    starts = got.get("starts", {})
    explicit = starts.get(typ) or starts.get("all")
    if explicit and abs((date.fromisoformat(explicit) - sem_start).days) < 60:
        first = date.fromisoformat(explicit)
    offset = got.get("weekOffsets", {}).get(typ)
    if offset:
        from_week = date.fromordinal(_monday(sem_start).toordinal() + (offset - 1) * 7)
        first = max(first, from_week)
    return first


def _occurrence(threshold: date, weekday: int) -> date:
    d = date.fromordinal(_monday(threshold).toordinal() + weekday)
    return d if d >= threshold else date.fromordinal(d.toordinal() + 7)


def compare_first(exp: dict, got: dict, sem_start: date, sc: Score) -> None:
    """Erster Termin je Art und Wochentag, egal ob über „Beginn: …“ oder „ab Woche 3“ erkannt."""
    by_type: dict[str, set[int]] = {}
    for s in exp.get("slots", []):
        by_type.setdefault(s["type"], set()).add(s["weekday"])
    for typ, days in sorted(by_type.items()):
        want_thr = date.fromisoformat(exp.get("first", {}).get(typ, sem_start.isoformat()))
        have_thr = first_threshold(got, typ, sem_start)
        bad = [wd for wd in sorted(days) if _occurrence(want_thr, wd) != _occurrence(have_thr, wd)]
        if bad:
            wd = bad[0]
            sc.add("orga.first", fn=1, msg=f"{typ} {WD[wd]} zuerst am {_occurrence(have_thr, wd)}, "
                                           f"erwartet {_occurrence(want_thr, wd)} (starts={got.get('starts')}, "
                                           f"weekOffsets={got.get('weekOffsets')})")
        else:
            sc.add("orga.first", tp=1)


def evaluate(c: dict, orga_out: dict, sheet_cache: dict, uni_tree: Path, title_of=lambda n, k, l: l) -> Score:
    sc = Score()
    opt = c.get("optional", {})
    if "orga" in c:
        exp = c["orga"]
        got = orga_out.get("courses", {}).get(c["_course"], {})
        compare_slots(exp.get("slots", []), got.get("slots", []), opt.get("slots", []), sc)
        compare_first(exp, got, date.fromisoformat(c.get("semesterStart", "2026-10-12")), sc)
        compare_list("orga.cancellations", exp.get("cancellations", []), got.get("cancellations", []), ("date",),
                     opt.get("cancellations", []), sc)
        compare_list("orga.extras", exp.get("extras", []), got.get("extras", []), ("date", "start"), opt.get("extras", []), sc)
        want = sorted(set(exp.get("credits", [])))
        have = sorted({x["value"] for x in got.get("credits", [])})
        for v in want:
            sc.add("orga.credits", tp=1) if v in have else sc.add("orga.credits", fn=1, msg=f"verpasst {v}")
        for v in have:
            if v not in want and v not in opt.get("credits", []):
                sc.add("orga.credits", fp=1, msg=f"Fehlalarm {v}")
    label = lambda x, n: f"{n}: {x.get('kind')} {x.get('date')}" + (f" {x['time']}" if x.get("time") else "")
    for name, exp_list in c.get("sheets", {}).items():
        p = c["_files"].get(name)
        found = sheet_cache.get(sha256(p), {}).get("found", []) if p else []
        # Titel, wie die App ihn zeigt (sheets._title aus Dateiname, Art und Textstelle)
        found = [{**f, "title": title_of(p.name, f["kind"], f.get("label"))} for f in found] if p else found
        compare_list("sheets", exp_list, found, ("date", "kind"), opt.get("sheets", []), sc,
                     label=lambda x, n=name: label(x, n))
    # Alle übrigen PDFs im Ordner dürfen nichts liefern (sonst Fehlalarm)
    if c.get("sheetsOthers", "none" if c["_kind"] == "synthetic" else None) == "none":
        root = uni_tree / c["_folder"]
        listed = {c["_files"][n].resolve() for n in c.get("sheets", {}) if n in c["_files"]}
        for p in sorted(root.rglob("*.pdf")):
            if any(x.startswith(".") for x in p.relative_to(root).parts) or p.resolve() in listed:
                continue
            found = sheet_cache.get(sha256(p), {}).get("found", [])
            if found:
                compare_list("sheets", [], found, ("date", "kind"), opt.get("sheets", []), sc,
                             label=lambda x, n=p.name: label(x, n))
    return sc


# ------------------------------------------------------------------ Lauf

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("filter", nargs="?", help="nur Fälle, deren Id das enthält")
    ap.add_argument("--uni", default=os.environ.get("EVAL_UNI_DIR") or str(Path.home() / "Uni"))
    ap.add_argument("-v", "--verbose", action="store_true", help="auch Details bestandener Fälle")
    ap.add_argument("--no-save", action="store_true", help="results/py.json nicht überschreiben")
    args = ap.parse_args()

    work = Path(tempfile.mkdtemp(prefix="ordo-eval-"))
    (work / "data").mkdir()
    os.environ["STUDI_DATA_DIR"] = str(work / "data")
    sys.path.insert(0, str(SYNC))
    from studi_sync import common, orga, sheets  # erst jetzt: DATA_DIR hängt an STUDI_DATA_DIR

    if common.DATA_DIR.resolve() == REAL_DATA.resolve():
        sys.exit("Abbruch: würde den echten Datenordner benutzen")

    cases = load_cases(args.filter)
    cfg, skipped = prepare(cases, Path(args.uni).expanduser(), work)
    common.write_json(common.CONFIG, cfg)

    # Laufzeit je Datei messen (die Pipeline ruft diese Funktionen über das Modul auf)
    timing: dict[tuple[str, str], float] = {}
    orig_analyze, orig_pdf, orig_extract = orga.analyze_file, sheets._pdf_text, sheets.extract
    last = {"path": ""}

    def t_analyze(path):
        t = time.perf_counter()
        try:
            return orig_analyze(path)
        finally:
            timing[("orga", str(path))] = time.perf_counter() - t

    def t_pdf(path, *a, **k):
        t = time.perf_counter()
        try:
            return orig_pdf(path, *a, **k)
        finally:
            last["path"] = str(path)
            timing[("sheets", str(path))] = time.perf_counter() - t

    def t_extract(text, ref):
        t = time.perf_counter()
        try:
            return orig_extract(text, ref)
        finally:
            key = ("sheets", last["path"])
            timing[key] = timing.get(key, 0) + time.perf_counter() - t

    orga.analyze_file, sheets._pdf_text, sheets.extract = t_analyze, t_pdf, t_extract
    t0 = time.perf_counter()
    orga_out = orga.refresh()
    sheets.refresh()
    total_time = time.perf_counter() - t0
    sheet_cache = common.read_json(sheets.CACHE, {})

    results: dict[str, dict] = {}
    totals: dict[str, list[int]] = {}
    width = max([len(c["id"]) for c in cases] + [20])
    print(f"{'Fall':<{width}}  Ergebnis  Fehler")
    for c in cases:
        if c["id"] in skipped:
            print(f"{c['id']:<{width}}  übersprungen ({skipped[c['id']]})")
            results[c["id"]] = {"status": "skip", "why": skipped[c["id"]]}
            continue
        sc = evaluate(c, orga_out, sheet_cache, work / "uni", sheets._title)
        for cat, v in sc.cats.items():
            t = totals.setdefault(cat, [0, 0, 0])
            for i in range(3):
                t[i] += v[i]
        ok = sc.errors == 0
        print(f"{c['id']:<{width}}  {'ok' if ok else 'FEHLER':<8}  {sc.errors}")
        if not ok or args.verbose:
            for m in sc.msgs:
                print(f"    - {m}")
        # Gespeichert wird ohne Textstellen aus echten PDFs (Repo ist öffentlich)
        saved = sc.msgs if c["_kind"] == "synthetic" else [re.sub(r" ← „.*$", "", m) for m in sc.msgs]
        results[c["id"]] = {"status": "pass" if ok else "fail", "errors": sc.errors, "details": saved}

    print()
    print(f"{'Kategorie':<20} {'Treffer':>7} {'Fehlalarm':>9} {'Verpasst':>8} {'Precision':>9} {'Recall':>7}")
    for cat in sorted(totals):
        tp, fp, fn = totals[cat]
        prec = f"{tp / (tp + fp):.0%}" if tp + fp else "–"
        rec = f"{tp / (tp + fn):.0%}" if tp + fn else "–"
        print(f"{cat:<20} {tp:>7} {fp:>9} {fn:>8} {prec:>9} {rec:>7}")
    tp = sum(v[0] for v in totals.values())
    fp = sum(v[1] for v in totals.values())
    fn = sum(v[2] for v in totals.values())
    passed = sum(1 for r in results.values() if r["status"] == "pass")
    ran = sum(1 for r in results.values() if r["status"] != "skip")
    print(f"\nSumme: {tp} Treffer, {fp} Fehlalarme, {fn} verpasst → {fp + fn} Fehler · {passed}/{ran} Fälle bestanden"
          + (f" · {len(skipped)} übersprungen" if skipped else ""))

    for algo in ("orga", "sheets"):
        items = [(t, p) for (a, p), t in timing.items() if a == algo]
        if items:
            slow_t, slow_p = max(items)
            flag = "  ← über 0,5 s" if slow_t > 0.5 else ""
            print(f"Laufzeit {algo}: {len(items)} Dateien, zusammen {sum(t for t, _ in items):.2f} s, "
                  f"langsamste {slow_t:.2f} s ({Path(slow_p).name}){flag}")
    print(f"Laufzeit gesamt (beide Pipelines): {total_time:.1f} s")

    # Vergleich mit dem letzten gespeicherten Lauf
    code = 0
    prev = json.loads(RESULTS.read_text()) if RESULTS.exists() else None
    if prev and not args.filter:
        before = prev.get("summary", {}).get("errors")
        regress = [cid for cid, r in results.items() if r["status"] == "fail" and prev["cases"].get(cid, {}).get("status") == "pass"]
        fixed = [cid for cid, r in results.items() if r["status"] == "pass" and prev["cases"].get(cid, {}).get("status") == "fail"]
        print(f"\nVorher: {before} Fehler → jetzt {fp + fn}")
        if fixed:
            print("Neu bestanden: " + ", ".join(fixed))
        if regress:
            print("RÜCKSCHRITT, vorher bestanden: " + ", ".join(regress))
            code = 2
    if not args.no_save and not args.filter:
        RESULTS.parent.mkdir(exist_ok=True)
        summary = {"errors": fp + fn, "tp": tp, "fp": fp, "fn": fn, "passed": passed, "ran": ran, "skipped": len(skipped),
                   "categories": totals, "seconds": round(total_time, 1)}
        RESULTS.write_text(json.dumps({"when": date.today().isoformat(), "summary": summary, "cases": results},
                                      ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return code


if __name__ == "__main__":
    import atexit
    import glob
    import shutil

    # Arbeitsordner (erzeugte PDFs, Datenkopie) nach dem Lauf löschen
    before = set(glob.glob(os.path.join(tempfile.gettempdir(), "ordo-eval-*")))
    atexit.register(lambda: [shutil.rmtree(p, ignore_errors=True)
                             for p in set(glob.glob(os.path.join(tempfile.gettempdir(), "ordo-eval-*"))) - before])
    sys.exit(main())
