"""Kommandozeile des Hintergrundteils. Jede Ausgabe ist eine JSON-Zeile.

    login --username KENNUNG     Passwort kommt als erste Zeile über stdin, nie als Argument.
                                 Prüft den Login bei ILIAS und legt das Passwort im Schlüsselbund ab.
    logout --username KENNUNG    Entfernt den Schlüsselbund-Eintrag.
    has-credentials --username K Gibt es einen Schlüsselbund-Eintrag?
    courses [--dump]             Meldet sich an und listet die eigenen Kurse und Gruppen.
    deadlines                    Fristen/Termine aus dem ILIAS-Kalender holen (→ deadlines.json),
                                 danach Übungsblätter per Regeln auswerten (→ sheet-deadlines.json).
    sheet-deadlines              Nur Übungsblätter per Regeln auswerten (lokal, ohne Netz).
    calendars                    Zusätzliche Kalender (iCal-Links aus config.json) laden.
    calendar-test --url URL      Prüft einen iCal-Link (Anzahl Termine, Beispiele), speichert nichts.
    sync [--auto]                Ein Sync-Lauf (--auto: von launchd, mit Zufallsverzögerung,
                                 Netz-Wartezeit, Wiederholungen und Mitteilungen).
    pferd-run --config DATEI     Intern: PFERD mit Köln-Korrekturen starten.

Ergebnis: {"type": "result", ...} oder {"type": "error", "code": ..., "message": ...} (Exit 1).
"""

import argparse
import sys

import keyring
import keyring.errors

from .common import KEYCHAIN_SERVICE, AppError, emit, load_config


def _password_for(username: str) -> str:
    try:
        password = keyring.get_password(KEYCHAIN_SERVICE, username)
    except keyring.errors.KeyringError as e:
        raise AppError("keychain", f"Could not read the Keychain ({type(e).__name__}).") from None
    if not password:
        raise AppError("not_logged_in", "No password in the Keychain. Please sign in again.")
    return password


def cmd_login(args: argparse.Namespace) -> None:
    from .ilias import login

    username = args.username.strip()
    password = sys.stdin.readline().rstrip("\r\n")
    if not username or not password:
        raise AppError("wrong_password", "Enter your university username and password.")
    login(username, password)
    try:
        keyring.set_password(KEYCHAIN_SERVICE, username, password)
    except keyring.errors.KeyringError as e:
        raise AppError("keychain", f"Could not save the password to the Keychain ({type(e).__name__}).") from None
    emit({"type": "result", "ok": True, "username": username})


def cmd_logout(args: argparse.Namespace) -> None:
    try:
        keyring.delete_password(KEYCHAIN_SERVICE, args.username)
    except keyring.errors.PasswordDeleteError:
        pass
    emit({"type": "result", "ok": True})


def cmd_has_credentials(args: argparse.Namespace) -> None:
    try:
        ok = bool(keyring.get_password(KEYCHAIN_SERVICE, args.username))
    except keyring.errors.KeyringError:
        ok = False
    emit({"type": "result", "ok": ok})


def cmd_courses(args: argparse.Namespace) -> None:
    from .ilias import list_courses, login

    username = load_config().get("username")
    if not username:
        raise AppError("not_logged_in", "Not signed in to ILIAS yet.")
    session = login(username, _password_for(username))
    emit({"type": "result", "courses": list_courses(session, dump=args.dump)})


def cmd_deadlines(args: argparse.Namespace) -> None:
    from .deadlines import refresh
    from .ilias import login

    username = load_config().get("username")
    if not username:
        raise AppError("not_logged_in", "Not signed in to ILIAS yet.")
    result = refresh(login(username, _password_for(username)))
    from .sheets import refresh as refresh_sheets

    sheets = refresh_sheets()
    from .calendars import refresh as refresh_calendars

    cals = refresh_calendars()
    emit({"type": "result", "count": len(result["deadlines"]), "sheetCount": len(sheets["deadlines"]),
          "calendarCount": len(cals["events"]), "updatedAt": result["updatedAt"]})


def cmd_calendars(args: argparse.Namespace) -> None:
    from .calendars import refresh

    result = refresh()
    emit({"type": "result", "count": len(result["events"]), "calendars": result["calendars"]})


def cmd_calendar_test(args: argparse.Namespace) -> None:
    from .calendars import fetch, parse

    try:
        events = parse(fetch(args.url))
    except Exception as e:  # noqa: BLE001
        raise AppError("invalid", str(e) or "This link did not work.") from None
    emit({"type": "result", "count": len(events), "sample": [e["title"] for e in events[:5]]})


def cmd_sheet_deadlines(args: argparse.Namespace) -> None:
    from .sheets import refresh

    result = refresh()
    emit({"type": "result", "count": len(result["deadlines"]), "updatedAt": result["updatedAt"]})


def cmd_sync(args: argparse.Namespace) -> None:
    from .sync import sync

    record = sync(auto=args.auto)
    emit({"type": "result", "status": record["status"], "added": len(record["added"]),
          "changed": len(record["changed"]), "problems": record["problems"], "courses": record["courses"]})


def cmd_pferd_run(args: argparse.Namespace) -> None:
    from .pferd_run import run

    run(args.config)


def main() -> int:
    parser = argparse.ArgumentParser(prog="studi-sync")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("login"); p.add_argument("--username", required=True); p.set_defaults(fn=cmd_login)
    p = sub.add_parser("logout"); p.add_argument("--username", required=True); p.set_defaults(fn=cmd_logout)
    p = sub.add_parser("has-credentials"); p.add_argument("--username", required=True)
    p.set_defaults(fn=cmd_has_credentials)
    p = sub.add_parser("courses"); p.add_argument("--dump", action="store_true"); p.set_defaults(fn=cmd_courses)
    p = sub.add_parser("deadlines"); p.set_defaults(fn=cmd_deadlines)
    p = sub.add_parser("sheet-deadlines"); p.set_defaults(fn=cmd_sheet_deadlines)
    p = sub.add_parser("calendars"); p.set_defaults(fn=cmd_calendars)
    p = sub.add_parser("calendar-test"); p.add_argument("--url", required=True); p.set_defaults(fn=cmd_calendar_test)
    p = sub.add_parser("sync"); p.add_argument("--auto", action="store_true"); p.set_defaults(fn=cmd_sync)
    p = sub.add_parser("pferd-run"); p.add_argument("--config", required=True); p.set_defaults(fn=cmd_pferd_run)
    args = parser.parse_args()

    if args.command == "pferd-run":
        args.fn(args)
        return 0
    try:
        args.fn(args)
        return 0
    except AppError as e:
        emit({"type": "error", "code": e.code, "message": e.message})
        return 1
    except Exception as e:  # noqa: BLE001 – Oberfläche soll immer eine verständliche Antwort bekommen
        emit({"type": "error", "code": "internal", "message": f"{type(e).__name__}: {e}"})
        return 1


if __name__ == "__main__":
    sys.exit(main())
