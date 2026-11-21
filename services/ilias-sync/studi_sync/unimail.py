"""Uni-Postfach (Uni Köln, smail) per IMAP und SMTP, mit dem ILIAS-Passwort aus dem Schlüsselbund.

Das Passwort verlässt diesen Prozess nie: Electron ruft nur die Befehle auf und bekommt Mails als JSON.
Server laut RRZK: IMAP imap.uni-koeln.de:993 (TLS), SMTP smtp-auth.uni-koeln.de:587 (STARTTLS),
Benutzername = Uni-Kennung, Adresse = <kennung>@smail.uni-koeln.de.

Ids der Mails: "<Ordner>|<UIDVALIDITY>|<UID>", damit Electron sie zwischenspeichern kann.
"""

from __future__ import annotations

import email
import email.policy
import email.utils
import html
import imaplib
import re
import smtplib
import ssl
import time
from datetime import datetime
from email.header import decode_header, make_header
from email.message import EmailMessage
from typing import Any

from .common import AppError

IMAP_HOST = "imap.uni-koeln.de"
SMTP_HOST = "smtp-auth.uni-koeln.de"
DOMAIN = "smail.uni-koeln.de"

LIMITS = {"inbox": 40, "drafts": 10, "sent": 15, "archive": 15}
PART_BYTES = 300_000  # pro Mail höchstens so viel laden (große Anhänge nicht ganz holen)

# Namen, unter denen Ordner üblicherweise liegen (Cyrus: "INBOX.Sent"), falls der Server keine Markierung liefert
GUESS = {
    "sent": ["sent", "sent items", "sent messages", "gesendet", "gesendete objekte", "gesendete elemente"],
    "drafts": ["drafts", "entwürfe", "entwuerfe"],
    "archive": ["archive", "archiv"],
    "trash": ["trash", "deleted items", "deleted messages", "papierkorb", "gelöschte objekte"],
}
FLAGS = {"sent": "\\Sent", "drafts": "\\Drafts", "archive": "\\Archive", "trash": "\\Trash"}


def _tls() -> ssl.SSLContext:
    """TLS mit den Zertifikaten von certifi. In der gepackten App findet Python die Zertifikate des Macs nicht von selbst."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001 – ohne certifi gelten die Zertifikate des Systems
        return ssl.create_default_context()


def address(username: str) -> str:
    return f"{username}@{DOMAIN}"


def _connect(username: str, password: str) -> imaplib.IMAP4_SSL:
    try:
        imap = imaplib.IMAP4_SSL(IMAP_HOST, 993, ssl_context=_tls(), timeout=30)
    except ssl.SSLError:
        raise AppError("failed", "The university mail server's certificate could not be verified.") from None
    except OSError:
        raise AppError("offline", "Could not reach the university mail server.") from None
    try:
        imap.login(username, password)
    except imaplib.IMAP4.error:
        raise AppError("wrong_password", "The university mail server did not accept your ILIAS login.") from None
    return imap


def _quote(name: str) -> str:
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _folders(imap: imaplib.IMAP4_SSL) -> dict[str, str]:
    """Findet Posteingang, Gesendet, Entwürfe, Archiv, Papierkorb. Ergebnis: Art → Ordnername."""
    typ, data = imap.list()
    entries: list[tuple[str, str, str]] = []  # (Merkmale, Trennzeichen, Name)
    for raw in data or []:
        if not isinstance(raw, bytes):
            continue
        m = re.match(rb'\((?P<flags>[^)]*)\) (?P<delim>"[^"]*"|NIL) (?P<name>.+)$', raw)
        if not m:
            continue
        name = m.group("name").decode("utf-8", "replace").strip()
        if name.startswith('"') and name.endswith('"'):
            name = name[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        entries.append((m.group("flags").decode(), m.group("delim").decode().strip('"'), name))
    found: dict[str, str] = {"inbox": "INBOX"}
    for kind, flag in FLAGS.items():
        for flags, _, name in entries:
            if flag.lower() in flags.lower():
                found[kind] = name
                break
    for kind, names in GUESS.items():
        if kind in found:
            continue
        for _, delim, name in entries:
            leaf = name.split(delim)[-1] if delim else name
            if _utf7_decode(leaf).lower() in names:
                found[kind] = name
                break
    found["_delim"] = next((d for _, d, n in entries if n.upper() == "INBOX" and d), ".")
    return found


def _utf7_decode(s: str) -> str:
    """IMAP-Ordnernamen sind „modified UTF-7“ (z. B. Entw&APw-rfe)."""
    def dec(m: re.Match[str]) -> str:
        b = m.group(1)
        if not b:
            return "&"
        b = b.replace(",", "/")
        b += "=" * (-len(b) % 4)
        import base64

        return base64.b64decode(b).decode("utf-16-be", "replace")

    return re.sub(r"&([^-]*)-", dec, s)


def _decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value))).strip()
    except Exception:
        return value.strip()


def _person(value: str | None) -> tuple[str, str]:
    name, addr = email.utils.parseaddr(_decode(value))
    return (name or addr.split("@")[0] or "Unknown"), addr


def _text(msg: email.message.Message) -> str:
    try:
        part = msg.get_body(preferencelist=("plain", "html"))  # type: ignore[attr-defined]
    except Exception:
        part = None
    if part is None:
        return ""
    try:
        content = part.get_content()
    except Exception:
        payload = part.get_payload(decode=True) or b""
        content = payload.decode(part.get_content_charset() or "utf-8", "replace")
    if part.get_content_type() == "text/html":
        content = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", content)
        content = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", content)
        content = html.unescape(re.sub(r"<[^>]+>", "", content))
    content = re.sub(r"[ \t]+\n", "\n", content)
    content = re.sub(r"\n{3,}", "\n\n", content)
    return content.strip()[:20_000]


def _unsubscribe(msg: email.message.Message) -> dict[str, Any] | None:
    """„List-Unsubscribe“ (Newsletter): https-Adresse und/oder mailto, dazu One-Click (RFC 8058)."""
    raw = str(msg["List-Unsubscribe"] or "")
    items = [x.strip() for x in re.findall(r"<([^>]+)>", raw)]
    url = next((x for x in items if x.lower().startswith("https://")), None)
    mailto = next((x for x in items if x.lower().startswith("mailto:")), None)
    if not url and not mailto:
        return None
    out: dict[str, Any] = {"oneClick": "one-click" in str(msg["List-Unsubscribe-Post"] or "").lower()}
    if url:
        out["url"] = url
    if mailto:
        out["mailto"] = mailto
    return out


def _attachment_parts(msg: email.message.Message) -> list[email.message.Message]:
    """Anhänge in Reihenfolge. Bilder, die nur im Text stehen (Signatur, Logo), und Unterschriften zählen nicht."""
    parts: list[email.message.Message] = []
    try:
        for part in msg.walk():
            name = part.get_filename()
            if not name or name.lower().endswith((".p7s", ".asc")):
                continue
            if part.get_content_disposition() == "inline" and part.get_content_maintype() == "image":
                continue
            parts.append(part)
    except Exception:
        pass
    return parts[:20]


def _attachments(msg: email.message.Message) -> list[str]:
    return [p.get_filename() or "file" for p in _attachment_parts(msg)]


def attachment(username: str, password: str, mail_id: str, index: int) -> dict[str, Any]:
    """Lädt die ganze Mail und gibt Anhang Nr. `index` zurück (Base64)."""
    import base64

    folder, validity, uid = _split_id(mail_id)
    imap = _connect(username, password)
    try:
        if _select(imap, folder) != validity:
            raise AppError("invalid", "This mail has changed on the server. Refresh and try again.")
        typ, data = imap.uid("FETCH", uid, "(BODY.PEEK[])")
        raw = next((item[1] for item in data or [] if isinstance(item, tuple)), None)
        if raw is None:
            raise AppError("missing", "This mail is no longer on the server.")
        parts = _attachment_parts(email.message_from_bytes(raw, policy=email.policy.default))
        if index < 0 or index >= len(parts):
            raise AppError("missing", "This attachment is no longer in the mail.")
        part = parts[index]
        content = part.get_payload(decode=True) or b""
        return {"type": "result", "name": part.get_filename() or "file", "data": base64.b64encode(content).decode()}
    finally:
        try:
            imap.logout()
        except Exception:
            pass


def _date(msg: email.message.Message, fallback: float) -> str:
    try:
        d = email.utils.parsedate_to_datetime(msg["Date"]).astimezone()
    except Exception:
        d = datetime.fromtimestamp(fallback).astimezone()
    return d.strftime("%Y-%m-%dT%H:%M")


def _select(imap: imaplib.IMAP4_SSL, folder: str, readonly: bool = True) -> str | None:
    typ, _ = imap.select(_quote(folder), readonly=readonly)
    if typ != "OK":
        return None
    typ, data = imap.response("UIDVALIDITY")
    return data[0].decode() if data and data[0] else "0"


def _uids(imap: imaplib.IMAP4_SSL, limit: int) -> list[str]:
    typ, data = imap.uid("SEARCH", None, "NOT DELETED")
    if typ != "OK" or not data or not data[0]:
        return []
    uids = data[0].decode().split()
    return list(reversed(uids[-limit:]))  # neueste zuerst


def _flags(imap: imaplib.IMAP4_SSL, uids: list[str]) -> dict[str, bool]:
    """UID → ungelesen?"""
    if not uids:
        return {}
    typ, data = imap.uid("FETCH", ",".join(uids), "(FLAGS)")
    out: dict[str, bool] = {}
    for item in data or []:
        raw = item if isinstance(item, bytes) else item[0] if isinstance(item, tuple) else b""
        m = re.search(rb"UID (\d+)", raw)
        if m:
            out[m.group(1).decode()] = b"\\Seen" not in raw
    return out


def _fetch(imap: imaplib.IMAP4_SSL, uids: list[str]) -> dict[str, email.message.Message]:
    out: dict[str, email.message.Message] = {}
    for i in range(0, len(uids), 15):
        chunk = uids[i : i + 15]
        typ, data = imap.uid("FETCH", ",".join(chunk), f"(UID BODY.PEEK[]<0.{PART_BYTES}>)")
        for item in data or []:
            if not isinstance(item, tuple):
                continue
            m = re.search(rb"UID (\d+)", item[0])
            if m:
                out[m.group(1).decode()] = email.message_from_bytes(item[1], policy=email.policy.default)
    return out


def list_mails(username: str, password: str, known: set[str]) -> dict[str, Any]:
    """Alle Ordner abrufen. Bekannte Ids kommen nur mit Ordner/gelesen zurück („known“: true)."""
    imap = _connect(username, password)
    try:
        folders = _folders(imap)
        out: list[dict[str, Any]] = []
        for kind, limit in LIMITS.items():
            folder = folders.get(kind)
            if not folder:
                continue
            validity = _select(imap, folder)
            if validity is None:
                continue
            uids = _uids(imap, limit)
            unread = _flags(imap, uids)
            ids = {uid: f"{folder}|{validity}|{uid}" for uid in uids}
            missing = [uid for uid in uids if ids[uid] not in known]
            bodies = _fetch(imap, missing)
            for uid in uids:
                base = {"id": ids[uid], "accountId": "uni", "folder": kind, "unread": unread.get(uid, False) and kind != "sent"}
                if ids[uid] in known:
                    out.append({**base, "known": True})
                    continue
                msg = bodies.get(uid)
                if msg is None:
                    continue
                from_name, from_addr = _person(msg["From"])
                to_name, _ = _person((msg["To"] or "").split(",")[0])
                out.append(
                    {
                        **base,
                        "fromName": from_name,
                        "fromAddress": from_addr,
                        "to": to_name,
                        "subject": _decode(msg["Subject"]) or "(No subject)",
                        "body": _text(msg),
                        "date": _date(msg, time.time()),
                        "messageIdHeader": (msg["Message-ID"] or "").strip(),
                        "unsubscribe": _unsubscribe(msg),
                        "attachments": _attachments(msg),
                        "files": [{"name": n, "part": str(k)} for k, n in enumerate(_attachments(msg))],
                    }
                )
            imap.close()
        return {"type": "result", "address": address(username), "mails": out}
    finally:
        try:
            imap.logout()
        except Exception:
            pass


def _split_id(mail_id: str) -> tuple[str, str, str]:
    parts = mail_id.rsplit("|", 2)
    if len(parts) != 3 or not parts[2].isdigit():
        raise AppError("invalid", "Unknown mail.")
    return parts[0], parts[1], parts[2]


def modify(username: str, password: str, mail_id: str, unread: bool | None, archive: bool) -> dict[str, Any]:
    folder, validity, uid = _split_id(mail_id)
    imap = _connect(username, password)
    try:
        folders = _folders(imap)
        if _select(imap, folder, readonly=False) != validity:
            raise AppError("invalid", "This mail has changed on the server. Refresh and try again.")
        if unread is not None:
            imap.uid("STORE", uid, "-FLAGS" if unread else "+FLAGS", "(\\Seen)")
        if archive:
            target = folders.get("archive")
            if not target:
                # Kein Archiv-Ordner: anlegen wie Thunderbird ("INBOX.Archive" bzw. "Archive")
                delim = folders["_delim"]
                target = f"INBOX{delim}Archive" if delim == "." else "Archive"
                imap.create(_quote(target))
                imap.subscribe(_quote(target))
            typ, _ = imap.uid("COPY", uid, _quote(target))
            if typ != "OK":
                raise AppError("failed", "Could not archive this mail.")
            imap.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
            imap.uid("EXPUNGE", uid)  # nur diese eine Mail (UIDPLUS)
        imap.close()
        return {"type": "result", "ok": True}
    finally:
        try:
            imap.logout()
        except Exception:
            pass


def send(username: str, password: str, mail: dict[str, Any]) -> dict[str, Any]:
    recipients = [r.strip() for r in re.split(r"[;,]", str(mail.get("to") or "")) if r.strip()]
    if not recipients or any("@" not in r for r in recipients):
        raise AppError("invalid", "Please enter a full email address, like name@example.com.")
    msg = EmailMessage()
    msg["From"] = address(username)
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = str(mail.get("subject") or "")
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["Message-ID"] = email.utils.make_msgid(domain=DOMAIN)
    reply_to = str(mail.get("inReplyTo") or "").strip()
    if reply_to:
        msg["In-Reply-To"] = reply_to
        msg["References"] = reply_to
    msg.set_content(str(mail.get("body") or ""))
    try:
        with smtplib.SMTP(SMTP_HOST, 587, timeout=30) as smtp:
            smtp.starttls(context=_tls())
            smtp.login(username, password)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise AppError("wrong_password", "The university mail server did not accept your ILIAS login.") from None
    except smtplib.SMTPRecipientsRefused:
        raise AppError("invalid", "The mail server refused this address.") from None
    except (OSError, smtplib.SMTPException):
        raise AppError("offline", "Could not send the mail. Check your connection and try again.") from None
    # Kopie in „Gesendet“ ablegen (der Uni-Server macht das nicht von selbst)
    try:
        imap = _connect(username, password)
        try:
            sent = _folders(imap).get("sent")
            if sent:
                imap.append(_quote(sent), "(\\Seen)", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
        finally:
            imap.logout()
    except Exception:
        pass
    return {"type": "result", "ok": True, "id": msg["Message-ID"]}


def check(username: str, password: str) -> dict[str, Any]:
    imap = _connect(username, password)
    try:
        folders = _folders(imap)
    finally:
        imap.logout()
    return {"type": "result", "ok": True, "address": address(username), "folders": sorted(k for k in folders if not k.startswith("_"))}
