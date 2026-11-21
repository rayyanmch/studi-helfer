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
    orga                         Stundenplan aus Orga-Folien/ersten Vorlesungen per Regeln (→ orga-events.json).
    calendar-test --url URL      Prüft einen iCal-Link (Anzahl Termine, Beispiele), speichert nichts.
    sync [--auto]                Ein Sync-Lauf (--auto: von launchd, mit Zufallsverzögerung,
                                 Netz-Wartezeit, Wiederholungen und Mitteilungen).
    mail-check                   Uni-Postfach (IMAP) mit dem ILIAS-Passwort prüfen.
    mail-list                    Uni-Mails holen; stdin: {"known": [Ids]} (bekannte nur mit Ordner/gelesen).
    mail-modify                  stdin: {"id", "unread"?, "archive"?}
    mail-send                    stdin: {"to", "subject", "body", "inReplyTo"?}
    mail-attachment              stdin: {"id", "index"} → {"name", "data" (Base64)}
    vpn-connect                  Uni-VPN: Cisco im Hintergrund „Connect“ drücken (Bedienungshilfen), Anmeldung macht der
                                 Student im Browser; danach den Anmelde-Tab schließen. stdin: {"server"}.
                                 Zwischenstände als {"type": "progress", "stage"}.
    vpn-disconnect               Uni-VPN trennen; Ciscos Abmeldeseite im Browser abfangen und schließen.
    vpn-inspect                  Fehlersuche: Aufbau der Cisco-Fenster (ohne Feldinhalte).
    file-text                    Text einer Kursdatei mit Seitenmarken (Lernbereich); stdin: {"path", "maxChars"?}
    pferd-run --config DATEI     Intern: PFERD mit Köln-Korrekturen starten.

Ergebnis: {"type": "result", ...} oder {"type": "error", "code": ..., "message": ...} (Exit 1).
"""

import argparse
import sys

import keyring
import keyring.errors

from .common import KEYCHAIN_SERVICE, AppError, emit, load_config, log_detail


def _password_for(username: str) -> str:
    try:
        password = keyring.get_password(KEYCHAIN_SERVICE, username)
    except keyring.errors.KeyringError as e:
        log_detail("keychain", e)
        raise AppError("keychain", "Could not read your saved password. Please sign in again.") from None
    if not password:
        raise AppError("not_logged_in", "Your saved password is missing. Please sign in again.")
    return password


def cmd_login(args: argparse.Namespace) -> None:
    from .ilias import login

    username = args.username.strip()
    password = sys.stdin.readline().rstrip("\r\n")
    if not username or not password:
        raise AppError("wrong_password", "Enter your university ID and password.")
    login(username, password)
    try:
        keyring.set_password(KEYCHAIN_SERVICE, username, password)
    except keyring.errors.KeyringError as e:
        log_detail("keychain", e)
        raise AppError("keychain", "Could not save your password on this Mac. Please try again.") from None
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
        raise AppError("not_logged_in", "You are not signed in. Please sign in again.")
    session = login(username, _password_for(username))
    emit({"type": "result", "courses": list_courses(session, dump=args.dump)})


def cmd_deadlines(args: argparse.Namespace) -> None:
    from .deadlines import refresh
    from .ilias import login

    username = load_config().get("username")
    if not username:
        raise AppError("not_logged_in", "You are not signed in. Please sign in again.")
    result = refresh(login(username, _password_for(username)))
    from .sheets import refresh as refresh_sheets

    sheets = refresh_sheets()
    from .calendars import refresh as refresh_calendars

    cals = refresh_calendars()
    from .orga import refresh as refresh_orga

    orga = refresh_orga()
    emit({"type": "result", "count": len(result["deadlines"]), "sheetCount": len(sheets["deadlines"]),
          "calendarCount": len(cals["events"]), "orgaCourses": len(orga["courses"]), "updatedAt": result["updatedAt"]})


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


def cmd_orga(args: argparse.Namespace) -> None:
    from .orga import refresh

    result = refresh()
    emit({"type": "result", "courses": len(result["courses"]),
          "slots": sum(len(c["slots"]) for c in result["courses"].values()), "groups": result["myGroups"]})


def cmd_sheet_deadlines(args: argparse.Namespace) -> None:
    from .sheets import refresh

    result = refresh()
    emit({"type": "result", "count": len(result["deadlines"]), "updatedAt": result["updatedAt"]})


def cmd_sync(args: argparse.Namespace) -> None:
    from .sync import sync

    record = sync(auto=args.auto)
    emit({"type": "result", "status": record["status"], "added": len(record["added"]),
          "changed": len(record["changed"]), "problems": record["problems"], "courses": record["courses"]})


def _mail_login() -> tuple[str, str]:
    username = load_config().get("username")
    if not username:
        raise AppError("not_logged_in", "You are not signed in. Please sign in again.")
    return username, _password_for(username)


def _stdin_json() -> dict:
    import json

    try:
        data = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        raise AppError("invalid", "Invalid input.") from None
    return data if isinstance(data, dict) else {}


def cmd_mail_check(args: argparse.Namespace) -> None:
    from . import unimail

    emit(unimail.check(*_mail_login()))


def cmd_mail_list(args: argparse.Namespace) -> None:
    from . import unimail

    known = {str(k) for k in _stdin_json().get("known", []) if isinstance(k, str)}
    emit(unimail.list_mails(*_mail_login(), known))


def cmd_mail_modify(args: argparse.Namespace) -> None:
    from . import unimail

    data = _stdin_json()
    unread = data.get("unread")
    emit(unimail.modify(*_mail_login(), str(data.get("id", "")), unread if isinstance(unread, bool) else None, data.get("archive") is True))


def cmd_mail_send(args: argparse.Namespace) -> None:
    from . import unimail

    emit(unimail.send(*_mail_login(), _stdin_json()))


def cmd_file_text(args: argparse.Namespace) -> None:
    from .studytext import file_text

    data = _stdin_json()
    max_chars = int(data.get("maxChars") or 150_000)
    emit({"type": "result", **file_text(str(data.get("path") or ""), max(5_000, min(max_chars, 600_000)))})


def cmd_mail_attachment(args: argparse.Namespace) -> None:
    from . import unimail

    data = _stdin_json()
    try:
        index = int(data.get("index", -1))
    except (TypeError, ValueError):
        index = -1
    emit(unimail.attachment(*_mail_login(), str(data.get("id", "")), index))


def cmd_vpn_connect(args: argparse.Namespace) -> None:
    from . import vpnauto

    server = str(_stdin_json().get("server") or "vpngate.uni-koeln.de")
    emit(vpnauto.connect(server))


def cmd_vpn_disconnect(args: argparse.Namespace) -> None:
    from . import vpnauto

    emit(vpnauto.disconnect())


def cmd_vpn_inspect(args: argparse.Namespace) -> None:
    from . import vpnauto

    emit({"type": "result", **vpnauto.inspect()})


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
    p = sub.add_parser("orga"); p.set_defaults(fn=cmd_orga)
    p = sub.add_parser("calendar-test"); p.add_argument("--url", required=True); p.set_defaults(fn=cmd_calendar_test)
    p = sub.add_parser("sync"); p.add_argument("--auto", action="store_true"); p.set_defaults(fn=cmd_sync)
    for name, fn in (("mail-check", cmd_mail_check), ("mail-list", cmd_mail_list), ("mail-modify", cmd_mail_modify), ("mail-send", cmd_mail_send), ("mail-attachment", cmd_mail_attachment), ("file-text", cmd_file_text),
                     ("vpn-connect", cmd_vpn_connect), ("vpn-disconnect", cmd_vpn_disconnect), ("vpn-inspect", cmd_vpn_inspect)):
        sub.add_parser(name).set_defaults(fn=fn)
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
        import traceback

        traceback.print_exc(file=sys.stderr)
        emit({"type": "error", "code": "internal", "message": "Something went wrong. Please try again."})
        return 1


if __name__ == "__main__":
    sys.exit(main())
