"""Uni-VPN über Studi-Helfer verbinden (Cisco Secure Client, Uni Köln): Die App übernimmt den Cisco-Schritt,
die Anmeldung im Browser macht der Student selbst.

Hintergrund: Den Tunnel baut nur Cisco auf, und Ciscos Befehlszeile kann die SAML-Anmeldung der Uni nicht. Cisco 5
meldet sich im normalen Standardbrowser an (acextwebhelper) und wartet auf 127.0.0.1:29786/api/sso/<token>.
Der VPN-Server nimmt nur die Anmeldung aus genau diesem Tab an (jede weitere Anfrage an die Startadresse erzeugt
eine neue Anmelde-Kennung, die mit „Validation failure“ abgelehnt wird).

Ablauf (Bedienungshilfen über ctypes, kein AppleScript → nur eine Mac-Abfrage):
1. Cisco im Hintergrund starten, „Connect“ drücken, Ciscos Fenster verstecken.
2. Der Browser öffnet die Uni-Anmeldung; wir merken uns diesen Tab (über die Tab-Leiste, ohne Webinhalte).
   Uni-Login und Duo macht der Student dort selbst.
3. Sobald Cisco verbunden ist: diesen Tab schließen (die App holt sich danach nach vorn).
Trennen: `vpn disconnect`; die Abmeldeseite, die Cisco danach im Browser öffnet, wird ebenso geschlossen.

Ausgabe: Zwischenstände {"type": "progress", "stage": ...}, am Ende {"type": "result"} oder AppError.
Stufen: starting, browser (Anmeldung im Browser läuft), connecting.
Fehlercodes: no_permission, not_installed, timeout, failed, cancelled.
"""

from __future__ import annotations

import ctypes
import glob
import os
import re
import signal
import subprocess
import time
from ctypes import POINTER, byref, c_bool, c_char_p, c_float, c_int32, c_int64, c_long, c_uint32, c_ulong, c_void_p

from .common import AppError, emit, log_detail

GUI_APPS = ["/Applications/Cisco/Cisco Secure Client.app", "/Applications/Cisco/Cisco AnyConnect Secure Mobility Client.app"]
GUI_EXE = ("/Cisco Secure Client.app/Contents/MacOS/Cisco Secure Client",
           "/Cisco AnyConnect Secure Mobility Client.app/Contents/MacOS/Cisco AnyConnect Secure Mobility Client")
CLIS = ["/opt/cisco/secureclient/bin/vpn", "/opt/cisco/anyconnect/bin/vpn"]
CISCO_LOGS = os.path.expanduser("~/.cisco/vpn/log")

BROWSERS = ("/Safari.app/", "/Google Chrome.app/", "/Arc.app/", "/Microsoft Edge.app/", "/Brave Browser.app/",
            "/Firefox.app/", "/Opera.app/", "/Vivaldi.app/", "/Chromium.app/", "/Orion.app/", "/Zen.app/")
# Tab-Titel der Anmeldung (beim Laden zeigt der Tab noch die Adresse) und der Abmeldeseite
LOGIN_TITLES = ("universität zu köln", "university of cologne", "login dienst", "loading session", "vpngate",
                "/saml/", "duo", "secured by duo")
LOGOUT_TITLES = ("logout successful", "logged out", "abmeldung", "vpngate", "/saml/", "universität zu köln")
# Was der Anmelde-Tab nach dem Verbinden zeigen darf, damit wir ihn schließen (sonst hat der Student ihn
# inzwischen für etwas anderes benutzt und wir lassen ihn offen)
DONE_TITLES = LOGIN_TITLES + ("localhost", "127.0.0.1", "cisco", "secure client", "success", "erfolgreich",
                              "authentication", "anmeldung", "login")
UTF8 = 0x08000100

# ------------------------------------------------------------------ ctypes: CoreFoundation + Bedienungshilfen

_CF = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
_AX = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")


def _sig(lib, name, restype, argtypes):
    fn = getattr(lib, name)
    fn.restype = restype
    fn.argtypes = argtypes
    return fn


CFStringCreateWithCString = _sig(_CF, "CFStringCreateWithCString", c_void_p, [c_void_p, c_char_p, c_uint32])
CFStringGetLength = _sig(_CF, "CFStringGetLength", c_long, [c_void_p])
CFStringGetMaximumSizeForEncoding = _sig(_CF, "CFStringGetMaximumSizeForEncoding", c_long, [c_long, c_uint32])
CFStringGetCString = _sig(_CF, "CFStringGetCString", c_bool, [c_void_p, c_char_p, c_long, c_uint32])
CFGetTypeID = _sig(_CF, "CFGetTypeID", c_ulong, [c_void_p])
CFStringGetTypeID = _sig(_CF, "CFStringGetTypeID", c_ulong, [])
CFArrayGetTypeID = _sig(_CF, "CFArrayGetTypeID", c_ulong, [])
CFBooleanGetTypeID = _sig(_CF, "CFBooleanGetTypeID", c_ulong, [])
CFNumberGetTypeID = _sig(_CF, "CFNumberGetTypeID", c_ulong, [])
CFURLGetTypeID = _sig(_CF, "CFURLGetTypeID", c_ulong, [])
CFArrayGetCount = _sig(_CF, "CFArrayGetCount", c_long, [c_void_p])
CFArrayGetValueAtIndex = _sig(_CF, "CFArrayGetValueAtIndex", c_void_p, [c_void_p, c_long])
CFBooleanGetValue = _sig(_CF, "CFBooleanGetValue", c_bool, [c_void_p])
CFNumberGetValue = _sig(_CF, "CFNumberGetValue", c_bool, [c_void_p, c_long, c_void_p])
CFURLGetString = _sig(_CF, "CFURLGetString", c_void_p, [c_void_p])
CFRetain = _sig(_CF, "CFRetain", c_void_p, [c_void_p])
CFRelease = _sig(_CF, "CFRelease", None, [c_void_p])
CFEqual = _sig(_CF, "CFEqual", c_bool, [c_void_p, c_void_p])
kCFBooleanTrue = c_void_p.in_dll(_CF, "kCFBooleanTrue").value
kCFBooleanFalse = c_void_p.in_dll(_CF, "kCFBooleanFalse").value

AXIsProcessTrusted = _sig(_AX, "AXIsProcessTrusted", c_bool, [])
AXIsProcessTrustedWithOptions = _sig(_AX, "AXIsProcessTrustedWithOptions", c_bool, [c_void_p])
CFDictionaryCreate = _sig(_CF, "CFDictionaryCreate", c_void_p, [c_void_p, POINTER(c_void_p), POINTER(c_void_p), c_long, c_void_p, c_void_p])
AXUIElementCreateApplication = _sig(_AX, "AXUIElementCreateApplication", c_void_p, [c_int32])
AXUIElementCreateSystemWide = _sig(_AX, "AXUIElementCreateSystemWide", c_void_p, [])
AXUIElementCopyAttributeValue = _sig(_AX, "AXUIElementCopyAttributeValue", c_int32, [c_void_p, c_void_p, POINTER(c_void_p)])
AXUIElementSetAttributeValue = _sig(_AX, "AXUIElementSetAttributeValue", c_int32, [c_void_p, c_void_p, c_void_p])
AXUIElementPerformAction = _sig(_AX, "AXUIElementPerformAction", c_int32, [c_void_p, c_void_p])
AXUIElementSetMessagingTimeout = _sig(_AX, "AXUIElementSetMessagingTimeout", c_int32, [c_void_p, c_float])
AXUIElementGetPid = _sig(_AX, "AXUIElementGetPid", c_int32, [c_void_p, POINTER(c_int32)])
AXUIElementGetTypeID = _sig(_AX, "AXUIElementGetTypeID", c_ulong, [])

_T_STR, _T_ARR, _T_BOOL, _T_NUM, _T_URL, _T_AX = (CFStringGetTypeID(), CFArrayGetTypeID(), CFBooleanGetTypeID(),
                                                  CFNumberGetTypeID(), CFURLGetTypeID(), AXUIElementGetTypeID())
_names: dict[str, int] = {}


def _cf(s: str) -> int:
    return CFStringCreateWithCString(None, s.encode("utf-8"), UTF8)


def _name(s: str) -> int:
    if s not in _names:
        _names[s] = _cf(s)
    return _names[s]


def _py_str(ref: int) -> str:
    size = CFStringGetMaximumSizeForEncoding(CFStringGetLength(ref), UTF8) + 1
    buf = ctypes.create_string_buffer(size)
    return buf.value.decode("utf-8", "replace") if CFStringGetCString(ref, buf, size, UTF8) else ""


def _convert(ref: int):
    t = CFGetTypeID(ref)
    if t == _T_STR:
        return _py_str(ref)
    if t == _T_BOOL:
        return CFBooleanGetValue(ref)
    if t == _T_NUM:
        n = c_int64()
        return n.value if CFNumberGetValue(ref, 4, byref(n)) else None  # kCFNumberSInt64Type
    if t == _T_URL:
        return _py_str(CFURLGetString(ref))
    if t == _T_AX:
        return El(ref)
    if t == _T_ARR:
        out = []
        for i in range(CFArrayGetCount(ref)):
            item = CFArrayGetValueAtIndex(ref, i)
            if CFGetTypeID(item) == _T_AX:
                CFRetain(item)  # gehört sonst nur der Liste
                out.append(El(item))
        return out
    return None


class El:
    """Ein Element der Bedienungshilfen (Programm, Fenster, Knopf …)."""

    def __init__(self, ref: int):
        self.ref = ref

    @staticmethod
    def app(pid: int) -> "El":
        el = El(AXUIElementCreateApplication(pid))
        AXUIElementSetMessagingTimeout(el.ref, 2.0)
        return el

    def get(self, attr: str):
        out = c_void_p()
        if AXUIElementCopyAttributeValue(self.ref, _name(attr), byref(out)) != 0 or not out.value:
            return None
        return _convert(out.value)

    def set(self, attr: str, value) -> bool:
        if isinstance(value, bool):
            return AXUIElementSetAttributeValue(self.ref, _name(attr), kCFBooleanTrue if value else kCFBooleanFalse) == 0
        ref = _cf(str(value))
        try:
            return AXUIElementSetAttributeValue(self.ref, _name(attr), ref) == 0
        finally:
            CFRelease(ref)

    def press(self) -> bool:
        return AXUIElementPerformAction(self.ref, _name("AXPress")) == 0

    @property
    def role(self) -> str:
        return self.get("AXRole") or ""

    @property
    def pid(self) -> int:
        p = c_int32()
        return p.value if AXUIElementGetPid(self.ref, byref(p)) == 0 else 0

    def label(self) -> str:
        for attr in ("AXTitle", "AXDescription", "AXValue"):
            v = self.get(attr)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""


def walk(root: El, limit: int = 400) -> list[tuple[El, str]]:
    """Alle Elemente unter root (Tiefensuche, begrenzt)."""
    out: list[tuple[El, str]] = []
    stack = [(root, 0)]
    while stack and len(out) < limit:
        el, depth = stack.pop()
        out.append((el, el.role))
        if depth < 30:
            stack.extend((k, depth + 1) for k in reversed(el.get("AXChildren") or []) if isinstance(k, El))
    return out


def trusted(prompt: bool = False) -> bool:
    """Darf dieser Prozess die Bedienungshilfen nutzen? In der fertigen App rechnet macOS den Helfer nicht
    Studi-Helfer zu, er braucht einen eigenen Eintrag („studi-sync“). prompt=True: macOS fragt nach und trägt
    den Helfer in die Liste unter Datenschutz & Sicherheit → Bedienungshilfen ein."""
    try:
        if not prompt:
            return bool(AXIsProcessTrusted())
        key = c_void_p.in_dll(_AX, "kAXTrustedCheckOptionPrompt")
        keys = (c_void_p * 1)(key.value)
        values = (c_void_p * 1)(kCFBooleanTrue)
        key_cb = ctypes.addressof(ctypes.c_char.in_dll(_CF, "kCFTypeDictionaryKeyCallBacks"))
        value_cb = ctypes.addressof(ctypes.c_char.in_dll(_CF, "kCFTypeDictionaryValueCallBacks"))
        options = CFDictionaryCreate(None, keys, values, 1, key_cb, value_cb)
        try:
            return bool(AXIsProcessTrustedWithOptions(options))
        finally:
            CFRelease(options)
    except Exception as e:  # noqa: BLE001
        log_detail("vpn-trusted", e)
        return False


# ------------------------------------------------------------------ Prozesse und Cisco

def _ps() -> list[tuple[int, str]]:
    try:
        lines = subprocess.run(["/bin/ps", "-axo", "pid=,comm="], capture_output=True, text=True, timeout=5).stdout.splitlines()
    except (OSError, subprocess.SubprocessError):
        return []
    out = []
    for line in lines:
        pid, _, comm = line.strip().partition(" ")
        if pid.isdigit():
            out.append((int(pid), comm.strip()))
    return out


def _pid_of(suffixes: tuple[str, ...]) -> int | None:
    return next((pid for pid, comm in _ps() if comm.endswith(suffixes)), None)


def _cli() -> str | None:
    return next((p for p in CLIS if os.path.exists(p)), None)


def cli_state() -> str | None:
    """connected / disconnected / connecting / None (aus `vpn state`, dauert ~2 s)."""
    cli = _cli()
    if not cli:
        return None
    try:
        out = subprocess.run([cli, "state"], capture_output=True, text=True, timeout=8).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    states = [line.split("state:", 1)[1].strip().lower() for line in out.splitlines() if "state:" in line]
    last = states[-1] if states else ""
    if not last or last == "unknown":
        return None
    return last if last in ("connected", "disconnected") else "connecting"


def _gui_state(gui: El) -> tuple[El | None, str]:
    """(Connect-Knopf, Zustand) aus Ciscos Fenstern; Zustand: connected / ready / busy."""
    connect = None
    status = "busy"
    for win in gui.get("AXWindows") or []:
        for el, role in walk(win):
            if role == "AXButton" and (el.get("AXTitle") or "").strip().lower() == "connect":
                connect = el
            elif role == "AXStaticText" and (el.get("AXValue") or "").strip().lower().startswith(("connected", "verbunden")):
                status = "connected"
    if connect is not None and status != "connected":
        status = "ready"
    return connect, status


def _cancel_pending(gui: El) -> bool:
    """Wartet Cisco noch auf eine Browser-Anmeldung („Please complete …“), dort „Cancel“ drücken.
    `vpn disconnect` beendet diesen Zustand nicht."""
    wins = gui.get("AXWindows") or []
    wins.sort(key=lambda w: 0 if "|" in (w.get("AXTitle") or "") else 1)  # erst der Anmelde-Dialog
    for win in wins:
        for el, role in walk(win):
            if role == "AXButton" and (el.get("AXTitle") or "").strip().lower() == "cancel":
                return el.press()
    return False


def _hide(app: El | None) -> None:
    if app:
        app.set("AXHidden", True)


def _start_gui() -> int | None:
    pid = _pid_of(GUI_EXE)
    if pid:
        return pid
    app = next((p for p in GUI_APPS if os.path.exists(p)), None)
    if not app:
        return None
    subprocess.run(["/usr/bin/open", "-g", "-j", app], capture_output=True, timeout=10)  # im Hintergrund, versteckt
    for _ in range(40):
        time.sleep(0.25)
        pid = _pid_of(GUI_EXE)
        if pid:
            return pid
    return None


def _abort_cisco() -> None:
    pid = _pid_of(GUI_EXE)
    if pid:
        try:
            _cancel_pending(El.app(pid))
        except Exception as e:  # noqa: BLE001
            log_detail("vpn-cancel", e)


def _started_browser_sign_in(since: float) -> bool:
    """Hat Cisco seit `since` eine Browser-Anmeldung begonnen? (Eintrag in Ciscos Protokoll)"""
    for f in glob.glob(os.path.join(CISCO_LOGS, "UIHistory_*.txt")):
        try:
            if os.path.getmtime(f) < since:
                continue
            with open(f, "rb") as fh:
                fh.seek(max(0, os.path.getsize(f) - 200_000))
                if re.search(rb'start_url="[^"]*/saml/sp/login[^"]*"[^>]*is_external="true"', fh.read()):
                    return True
        except OSError:
            pass
    return False


# ------------------------------------------------------------------ Browser-Tab merken und später schließen
# Nur über die Tab-Leiste (Titel), Webinhalte lesen wir nicht.

def _browser_pids() -> list[int]:
    return [pid for pid, comm in _ps() if any(re.search(re.escape(b) + r"Contents/MacOS/[^/]+$", comm) for b in BROWSERS)]


def _find(root: El, want: str, limit: int = 300) -> list[El]:
    """Elemente einer Rolle suchen (Breitensuche), ohne in Webinhalte abzusteigen."""
    out: list[El] = []
    queue = [root]
    seen = 0
    while queue and seen < limit:
        el = queue.pop(0)
        seen += 1
        role = el.role
        if role == want:
            out.append(el)
            continue
        if role == "AXWebArea":
            continue
        queue.extend(k for k in el.get("AXChildren") or [] if isinstance(k, El))
    return out


def _tabs(win: El) -> list[El]:
    """Tab-Knöpfe eines Browserfensters (leer, wenn das Fenster keine Tab-Leiste zeigt)."""
    return [t for group in _find(win, "AXTabGroup") for t in group.get("AXChildren") or [] if t.role == "AXRadioButton"]


def _title(el: El) -> str:
    return (el.get("AXTitle") or el.get("AXDescription") or "").lower()


def _matching(titles: tuple[str, ...]) -> list[tuple[El, El, El | None]]:
    """Tabs (bzw. Fenster ohne Tab-Leiste) mit passendem Titel: (Browser, Fenster, Tab)."""
    out = []
    for pid in _browser_pids():
        app = El.app(pid)
        for win in app.get("AXWindows") or []:
            tabs = _tabs(win)
            if tabs:
                out.extend((app, win, t) for t in tabs if any(x in _title(t) for x in titles))
            elif any(x in _title(win) for x in titles):
                out.append((app, win, None))
    return out


def _close_tab_item(app: El) -> El | None:
    """Menüpunkt mit ⌘W (Tab bzw. Fenster schließen), sprachunabhängig."""
    bar = app.get("AXMenuBar")
    for top in (bar.get("AXChildren") if isinstance(bar, El) else None) or []:
        for menu in top.get("AXChildren") or []:
            for item in menu.get("AXChildren") or []:
                if (item.get("AXMenuItemCmdChar") or "").upper() == "W" and item.get("AXMenuItemCmdModifiers") == 0 \
                        and item.get("AXEnabled") is not False:
                    return item
    return None


class TabWatch:
    """Merkt sich den Tab, den Cisco im Browser öffnet, und schließt ihn auf Wunsch wieder."""

    def __init__(self, titles: tuple[str, ...]):
        self.titles = titles
        self.before = [t or w for _, w, t in _matching(titles)]  # schon offene Tabs nicht anfassen
        self.app: El | None = None
        self.win: El | None = None
        self.tab: El | None = None

    def look(self) -> bool:
        if self.win is not None:
            return True
        for app, win, tab in _matching(self.titles):
            if not any(CFEqual((tab or win).ref, b.ref) for b in self.before):
                self.app, self.win, self.tab = app, win, tab
                return True
        return False

    def close(self, titles: tuple[str, ...]) -> bool:
        """Tab schließen, wenn er noch wie erwartet heißt (sonst benutzt ihn der Student inzwischen anders)."""
        if self.app is None or self.win is None:
            return False
        try:
            if self.tab is not None:
                if self.tab.role != "AXRadioButton" or not any(x in _title(self.tab) for x in titles):
                    return False
                btn = next((c for c in self.tab.get("AXChildren") or [] if c.role == "AXButton"), None)
                if btn is not None and btn.press():
                    return True
            elif not any(x in _title(self.win) for x in titles):
                return False
            AXUIElementPerformAction(self.win.ref, _name("AXRaise"))
            item = _close_tab_item(self.app)
            return bool(item is not None and item.press())
        except Exception as e:  # noqa: BLE001
            log_detail("vpn-tab", e)
            return False


# ------------------------------------------------------------------ Verbinden und trennen

def _stage(stage: str) -> None:
    emit({"type": "progress", "stage": stage})


class _Stop(Exception):
    pass


def connect(server: str, timeout: float = 300.0) -> dict:
    if not trusted():
        raise AppError("no_permission", "Studi-Helfer needs permission to operate Cisco for you.")
    if not _cli() or not any(os.path.exists(p) for p in GUI_APPS):
        raise AppError("not_installed", "Cisco Secure Client is not installed yet.")

    def on_term(*_):
        raise _Stop()

    signal.signal(signal.SIGTERM, on_term)  # „Cancel“ in der App
    watch: list[TabWatch] = []
    try:
        return _connect(server, timeout, watch)
    except (_Stop, AppError) as e:
        _abort_cisco()  # halben Versuch nicht in Cisco hängen lassen
        if watch:
            watch[0].close(DONE_TITLES)  # Anmelde-Tab wird nicht mehr gebraucht
        if isinstance(e, _Stop):
            raise AppError("cancelled", "Cancelled.") from None
        raise


def _connect(server: str, timeout: float, watch: list) -> dict:
    _stage("starting")
    pid = _start_gui()
    if not pid:
        raise AppError("failed", "Could not start Cisco Secure Client.")
    gui = El.app(pid)

    connect_btn, status = None, "busy"
    for attempt in range(60):
        connect_btn, status = _gui_state(gui)
        if status in ("ready", "connected"):
            break
        if attempt in (6, 24):
            _cancel_pending(gui)  # hängt noch ein alter Versuch? abbrechen
        time.sleep(0.25)
    if status == "connected":
        _hide(gui)
        return {"type": "result", "ok": True, "already": True}
    if connect_btn is None:
        raise AppError("failed", "Cisco Secure Client isn't ready. Please try again in a moment.")

    combo = next((el for win in gui.get("AXWindows") or [] for el, role in walk(win) if role == "AXComboBox"), None)
    if combo is not None and (combo.get("AXValue") or "").strip().lower() != server.lower():
        combo.set("AXValue", server)
    tab = TabWatch(LOGIN_TITLES)
    watch.append(tab)
    pressed_at = time.time()
    connect_btn.press()
    _hide(gui)

    # Cisco öffnet jetzt die Uni-Anmeldung im Browser; dort meldet sich der Student selbst an
    deadline = time.monotonic() + timeout
    announced = False
    last_cli = time.monotonic()
    while time.monotonic() < deadline:
        time.sleep(0.4)
        if _gui_state(gui)[1] == "connected":
            break
        tab.look()
        if not announced and (tab.win is not None or _started_browser_sign_in(pressed_at)):
            announced = True
            _stage("browser")
        if time.monotonic() - last_cli > 10:  # Sicherheitsnetz, falls Ciscos Fenster nichts verrät
            last_cli = time.monotonic()
            if cli_state() == "connected":
                break
    else:
        raise AppError("timeout", "The sign-in wasn't finished in time. Please try again.")

    _stage("connecting")
    _hide(gui)
    time.sleep(0.6)  # Seite „Authentication successful“ fertig laden lassen
    tab.close(DONE_TITLES)
    return {"type": "result", "ok": True}


def disconnect() -> dict:
    """Trennen. Cisco öffnet danach die Abmeldeseite im Browser; die schließen wir wieder."""
    cli = _cli()
    if not cli:
        raise AppError("unsupported", "Please disconnect in Cisco Secure Client.")
    tab = TabWatch(LOGOUT_TITLES) if trusted() else None
    proc = subprocess.Popen([cli, "disconnect"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if tab is not None:
        end = time.monotonic() + 10
        while time.monotonic() < end and not tab.look():
            time.sleep(0.3)
        if tab.win is not None:
            time.sleep(0.8)  # Seite fertig laden lassen, dann schließen
            tab.close(LOGOUT_TITLES)
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()
    if cli_state() == "connected":
        raise AppError("failed", "Could not disconnect. Please do it in Cisco Secure Client.")
    return {"type": "result", "ok": True}


def inspect() -> dict:
    """Nur zur Fehlersuche: Ciscos Fenster und passende Browser-Tabs (nur Titel)."""
    out: dict = {"trusted": trusted()}
    pid = _pid_of(GUI_EXE)
    if pid:
        app = El.app(pid)
        out["gui"] = {"hidden": app.get("AXHidden"), "items": [[role, el.label()[:80]] for win in app.get("AXWindows") or []
                                                               for el, role in walk(win) if role in ("AXWindow", "AXButton", "AXStaticText")]}
    out["tabCounts"] = [len(_tabs(w)) for pid in _browser_pids() for w in El.app(pid).get("AXWindows") or []]
    out["tabs"] = [{"tab": _title(t) if t is not None else _title(w), "selected": t.get("AXValue") if t is not None else None}
                   for _, w, t in _matching(LOGIN_TITLES + LOGOUT_TITLES)]
    return out
