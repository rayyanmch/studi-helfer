"""Ein Sync-Lauf: pferd.cfg aus config.json erzeugen, PFERD starten, Ausgabe auswerten.

Den Fortschritt schreibt der Lauf laufend nach state.json. Electron beobachtet diese Datei,
egal ob der Lauf aus der App oder automatisch über launchd gestartet wurde.
Nach dem Lauf kommt ein Eintrag nach runs.jsonl (Grundlage für „Neu seit letztem Sync“).

Vorbild: Rayyans ~/ilias-sync/sync.py.
"""

import ast
import fcntl
import json
import os
import random
import re
import signal
import socket
import subprocess
import time
from datetime import datetime
from typing import Any, Optional

from .common import (
    BASE_URL, CLIENT_ID, DATA_DIR, ILIAS_HOST, KEYCHAIN_SERVICE, LOCK, LOGS, PFERD_CFG, RUNS, STATE,
    AppError, emit, load_config, self_command, write_json,
)

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
NET_ERRORS = ("ConnectionTimeoutError", "ClientConnectorError", "ServerDisconnectedError",
              "Cannot connect to host", "Connection timeout", "Temporary failure in name resolution",
              "nodename nor servname")
AUTH_ERRORS = ("Configured username is invalid", "AuthError", "EOFError", "Login failed",
               "Could not find the login form")
STATUS_LINE = re.compile(r"^\s*(Added|Changed|Deleted)\s+(['\"].*['\"])\s*$")


def folder_name(title: str) -> str:
    """Ordnername für einen Kurs. Ein Semester-Vorsatz wie "[WS26/27] " fällt weg."""
    title = re.sub(r"^\s*\[[^\]]{1,20}\]\s*", "", title) or title
    name = re.sub(r"[/:\\\n\r\t]+", " - ", title).strip(" .")
    return re.sub(r"\s{2,}", " ", name)[:120] or "Kurs"


def _cfg_value(value: str) -> str:
    return value.replace("\n", " ").strip()


def write_pferd_config(cfg: dict[str, Any], courses: list[dict[str, Any]]) -> None:
    lines = [
        "# Automatisch erzeugt von Studi-Helfer. Änderungen werden beim nächsten Sync überschrieben.",
        "[DEFAULT]",
        f"working_dir = {_cfg_value(cfg['targetDir'])}",
        "check_for_updates = no",
        "show_not_deleted = no",
        "",
        "[auth:ilias]",
        "type = keyring",
        f"username = {_cfg_value(cfg['username'])}",
        f"keyring_name = {KEYCHAIN_SERVICE}",
    ]
    for c in courses:
        target = c["refId"] if c["kind"] == "crs" else f"{BASE_URL}/goto.php?target=grp_{c['refId']}"
        lines += [
            "",
            f"[crawl:{c['id']}]",
            "type = ilias-web",
            f"base_url = {BASE_URL}",
            "login_type = local",
            f"client_id = {CLIENT_ID}",
            "auth = auth:ilias",
            # Geänderte Dateien aus ILIAS übernehmen (alte Fassung sichert pferd_run.py vorher),
            # lokal nie etwas löschen. local-first würde geänderte Dateien nie aktualisieren.
            "on_conflict = no-delete",
            "tasks = 1",
            f"videos = {'yes' if c.get('videos') else 'no'}",
            "forums = no",
            "links = ignore",
            f"target = {target}",
            f"output_dir = {_cfg_value(c.get('folder') or folder_name(c['title']))}",
            "transform =",
            r"  \..+ -name-re-> !",
            r"  .+\.html -name-re-> !",
        ]
    PFERD_CFG.write_text("\n".join(lines) + "\n", encoding="utf-8")


def wait_for_network(timeout_s: int, log: Any) -> bool:
    deadline = time.time() + timeout_s
    first = True
    while True:
        try:
            socket.create_connection((ILIAS_HOST, 443), timeout=5).close()
            return True
        except OSError:
            if time.time() > deadline:
                return False
            if first:
                log(f"ILIAS nicht erreichbar, warte bis zu {timeout_s} s auf Netzwerk …")
                first = False
            time.sleep(5)


def notify(text: str) -> None:
    text = text.replace('"', "'")
    subprocess.run(["osascript", "-e", f'display notification "{text}" with title "Studi-Helfer"'],
                   capture_output=True)


class Cancelled(Exception):
    """Abbruch per SIGTERM, während gerade kein PFERD läuft (Wartezeit)."""


class Run:
    def __init__(self, trigger: str, courses: list[dict[str, Any]]):
        self.trigger = trigger
        self.started = time.time()
        self.order = [c["id"] for c in courses]
        self.courses: dict[str, dict[str, Any]] = {
            c["id"]: {"title": c["title"], "status": "waiting", "added": 0, "changed": 0, "problems": []}
            for c in courses
        }
        self.current: Optional[str] = None
        self.added: list[dict[str, str]] = []
        self.changed: list[dict[str, str]] = []
        self.deleted: list[dict[str, str]] = []
        self.problems: list[dict[str, Any]] = []
        self.versions: dict[tuple[str, str], str] = {}  # (Kurs, Pfad) → gesicherte alte Fassung
        # Während des Laufs gemeldete Dateien. Fallback, falls PFERD vor dem Bericht beendet wird.
        self.live: dict[str, dict[str, list[str]]] = {}
        self.proc: Optional[subprocess.Popen[str]] = None
        self.cancelled = False


    def state(self, **extra: Any) -> None:
        write_json(STATE, {
            "running": True, "pid": os.getpid(), "trigger": self.trigger, "startedAt": self.started,
            "currentCourse": self.current, "order": self.order, "courses": self.courses, **extra,
        })

    def start_course(self, cid: str) -> None:
        if self.current and self.courses.get(self.current, {}).get("status") == "running":
            self.courses[self.current]["status"] = "done"
        self.current = cid
        if cid in self.courses:
            self.courses[cid]["status"] = "running"
        self.state()


def run_pferd(run: Run, log: Any) -> int:
    env = {k: v for k, v in os.environ.items()
           if k not in ("FORCE_COLOR", "CLICOLOR_FORCE", "TTY_COMPATIBLE", "TTY_INTERACTIVE", "COLORTERM")}
    env.update(COLUMNS="1000", TERM="dumb", NO_COLOR="1", PYTHONUNBUFFERED="1")
    proc = subprocess.Popen([*self_command(), "pferd-run", "--config", str(PFERD_CFG)],
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, env=env, bufsize=1)
    run.proc = proc
    assert proc.stdout is not None
    in_report = False
    report_crawler: Optional[str] = None
    final: dict[str, dict[str, list[str]]] = {}
    last_state = 0.0

    for raw in proc.stdout:
        if "\x1b[2K" in raw or "\r" in raw.rstrip("\n"):
            continue
        line = ANSI.sub("", raw).rstrip("\n")
        log(line)
        if m := re.match(r"^STUDI-VERSION\t(.+)\t(.+)$", line):
            if run.current:
                run.versions[(run.current, m.group(1))] = m.group(2)
        elif m := re.match(r"^Running crawl:(\S+)", line):
            run.start_course(m.group(1))
        elif m := re.match(r"^Report for crawl:(\S+)", line):
            in_report, report_crawler = True, m.group(1)
            final.setdefault(report_crawler, {"Added": [], "Changed": [], "Deleted": []})
        elif m := STATUS_LINE.match(line):
            try:
                path = str(ast.literal_eval(m.group(2)))
            except (ValueError, SyntaxError):
                path = m.group(2).strip("'\"")
            if in_report and report_crawler:
                final[report_crawler][m.group(1)].append(path)
            elif run.current in run.courses and m.group(1) in ("Added", "Changed"):
                run.courses[run.current][m.group(1).lower()] += 1
                run.live.setdefault(run.current, {"Added": [], "Changed": [], "Deleted": []})[m.group(1)].append(path)
                if time.time() - last_state > 0.5:
                    run.state()
                    last_state = time.time()
        elif re.match(r"^\s*(Error|Warning)\b", line) or any(e in line for e in AUTH_ERRORS):
            cid = report_crawler if in_report else run.current
            problem = {"course": cid, "message": line.strip()}
            if problem not in run.problems:  # PFERD wiederholt Fehler im Bericht
                run.problems.append(problem)
                if cid in run.courses:
                    run.courses[cid]["problems"].append(line.strip())
    proc.wait()
    run.proc = None

    for cid, lists in run.live.items():
        final.setdefault(cid, lists)  # kein Bericht (abgebrochen): live gemeldete Dateien nehmen
    for cid, lists in final.items():
        for kind, target in (("Added", run.added), ("Changed", run.changed), ("Deleted", run.deleted)):
            target.extend({"course": cid, "path": p} for p in lists[kind])
        for entry in run.changed:
            if (prev := run.versions.get((entry["course"], entry["path"]))) is not None:
                entry["previous"] = prev
        if cid in run.courses:
            run.courses[cid]["added"] = len(lists["Added"])
            run.courses[cid]["changed"] = len(lists["Changed"])
    for c in run.courses.values():
        if run.cancelled and c["status"] in ("running", "waiting"):
            c["status"] = "cancelled"
        elif c["status"] in ("running", "waiting"):
            c["status"] = "error" if c["problems"] or c["status"] == "waiting" else "done"
        elif c["problems"]:
            c["status"] = "error"
    return proc.returncode


def sync(auto: bool) -> dict[str, Any]:
    cfg = load_config()
    if not cfg.get("username"):
        raise AppError("not_logged_in", "Not signed in to ILIAS yet.")
    if not cfg.get("targetDir"):
        raise AppError("not_configured", "No destination folder chosen yet.")
    courses = [c for c in cfg.get("courses", []) if c.get("selected")]
    if not courses:
        raise AppError("not_configured", "No courses selected.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    lock = open(LOCK, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise AppError("busy", "A sync is already running.") from None

    trigger = "auto" if auto else "manual"
    run = Run(trigger, courses)

    # Abbrechen (Knopf in der App schickt SIGTERM): PFERD beenden, Lauf sauber als "cancelled" abschließen.
    def on_term(_signum: int, _frame: Any) -> None:
        run.cancelled = True
        if run.proc is not None and run.proc.poll() is None:
            run.proc.terminate()
        else:
            raise Cancelled()

    signal.signal(signal.SIGTERM, on_term)

    delay_min = int(cfg.get("randomDelayMin", 15))
    if auto and delay_min > 0:
        delay = random.randint(0, delay_min * 60)
        run.state(waitingUntil=time.time() + delay)
        try:
            time.sleep(delay)
        except Cancelled:
            write_json(STATE, {"running": False, "lastEnd": time.time(), "lastStatus": "cancelled"})
            return {"status": "cancelled", "added": [], "changed": [], "problems": [], "courses": run.courses}
        run.started = time.time()

    daily = open(LOGS / f"{datetime.now():%Y-%m-%d}.log", "a", encoding="utf-8")
    current = open(LOGS / "current.log", "w", encoding="utf-8")

    def log(line: str) -> None:
        for f in (daily, current):
            f.write(line + "\n")
            f.flush()

    log(f"=== {datetime.now():%Y-%m-%d %H:%M:%S} ({'automatisch' if auto else 'manuell'})")
    run.state()
    os.makedirs(os.path.expanduser(cfg["targetDir"]), exist_ok=True)
    write_pferd_config(cfg, courses)

    attempts = 3 if auto else 1
    exit_code = 1
    offline = False
    attempt = 1
    for attempt in range(1, attempts + 1):
        try:
            if not wait_for_network(300 if auto else 20, log):
                offline = True
                run.problems = [{"course": None, "message": "Can't reach ILIAS"}]
            else:
                exit_code = run_pferd(run, log)
                offline = bool(run.problems) and all(
                    any(e in p["message"] for e in NET_ERRORS) for p in run.problems)
            if run.cancelled or not offline or attempt == attempts:
                break
            log(f"Verbindungsproblem, neuer Versuch in 10 min ({attempt + 1}/{attempts})")
            run.state(retryAt=time.time() + 600)
            time.sleep(600)
        except Cancelled:
            break

    login_problem = any(any(e in p["message"] for e in AUTH_ERRORS) for p in run.problems)
    if run.cancelled:
        status = "cancelled"
        for c in run.courses.values():
            if c["status"] in ("running", "waiting"):
                c["status"] = "cancelled"
    elif offline:
        status = "offline"
    elif login_problem:
        status = "login"
    elif run.problems or exit_code != 0:
        status = "error"
    else:
        status = "ok"

    # Fristen aus dem ILIAS-Kalender mit aktualisieren. Fehler hier lassen den Sync nicht scheitern.
    if status in ("ok", "error"):
        try:
            import keyring

            from .deadlines import refresh
            from .ilias import login

            password = keyring.get_password(KEYCHAIN_SERVICE, cfg["username"]) or ""
            n = len(refresh(login(cfg["username"], password))["deadlines"])
            log(f"Fristen aus dem ILIAS-Kalender: {n}")
        except Exception as e:  # noqa: BLE001
            log(f"Fristen konnten nicht aktualisiert werden: {type(e).__name__}: {e}")
        try:
            from .sheets import refresh as refresh_sheets

            log(f"Fristen aus Übungsblättern (Regeln): {len(refresh_sheets()['deadlines'])}")
        except Exception as e:  # noqa: BLE001
            log(f"Übungsblätter konnten nicht ausgewertet werden: {type(e).__name__}: {e}")

    ended = time.time()
    record = {
        "id": str(int(run.started)), "start": run.started, "end": ended,
        "duration": round(ended - run.started, 1), "trigger": trigger, "status": status,
        "attempts": attempt, "exit": exit_code, "courses": run.courses,
        "added": run.added, "changed": run.changed, "deleted": run.deleted, "problems": run.problems,
    }
    with open(RUNS, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    write_json(STATE, {"running": False, "lastEnd": ended, "lastStatus": status})
    log(f"Fertig: {status}, {len(run.added)} neu, {round(ended - run.started)} s")

    if auto and status != "cancelled" and cfg.get("notifications", True):
        n = len(run.added)
        if status == "login":
            notify("Your ILIAS sign-in expired. Please sign in again in Studi-Helfer.")
        elif status != "ok":
            notify("Can't reach ILIAS" if status == "offline" else "Sync failed, details in Studi-Helfer")
        elif n:
            notify(f"{n} new file{'s' if n != 1 else ''} from ILIAS")

    for old in LOGS.glob("20*.log"):
        if time.time() - old.stat().st_mtime > 30 * 86400:
            old.unlink()
    return record
