"""Pfade, Konstanten und kleine Helfer, die alle Teile nutzen."""

import json
import os
import sys
from pathlib import Path
from typing import Any

# Alles, was die App lokal speichert. Electron übergibt denselben Pfad per Umgebungsvariable.
DATA_DIR = Path(os.environ.get("STUDI_DATA_DIR") or Path.home() / "Library/Application Support/Studi-Helfer")
CONFIG = DATA_DIR / "config.json"
PFERD_CFG = DATA_DIR / "pferd.cfg"
RUNS = DATA_DIR / "runs.jsonl"
STATE = DATA_DIR / "state.json"
LOGS = DATA_DIR / "logs"
LOCK = DATA_DIR / ".lock"
VERSIONS = DATA_DIR / "versions"  # alte Fassungen geänderter Dateien

BASE_URL = "https://www.ilias.uni-koeln.de/ilias"
CLIENT_ID = "uk"
ILIAS_HOST = "www.ilias.uni-koeln.de"

# Name des Eintrags im macOS-Schlüsselbund (Konto = Uni-Kennung). Das Passwort liegt nur dort.
KEYCHAIN_SERVICE = "Studi-Helfer ILIAS"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Studi-Helfer"


# Fehlertexte für die Oberfläche: ein Satz, was los ist, und was man tun kann. Technik nur ins Log (stderr).
MSG_UNREACHABLE = "Can't reach ILIAS. Check your internet connection and try again."
MSG_ILIAS_DOWN = "ILIAS is having problems right now. Try again in a few minutes."


def log_detail(where: str, e: BaseException) -> None:
    """Technische Einzelheiten nur ins Log, nie in die Oberfläche."""
    print(f"[{where}] {type(e).__name__}: {e}", file=sys.stderr, flush=True)


class AppError(Exception):
    """Fehler mit festem Code, den die Oberfläche übersetzen kann."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def emit(obj: dict[str, Any]) -> None:
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_config() -> dict[str, Any]:
    """config.json schreibt nur Electron. Python liest sie nur."""
    return read_json(CONFIG, {})


def self_command() -> list[str]:
    """Wie dieses Programm sich selbst erneut startet (Entwicklung oder fertig gepacktes Programm)."""
    if getattr(sys, "frozen", False):
        return [sys.executable]
    return [sys.executable, "-m", "studi_sync"]
