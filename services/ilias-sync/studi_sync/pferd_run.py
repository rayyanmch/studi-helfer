"""PFERD mit den nötigen Korrekturen für ILIAS Köln starten.

Die Korrekturen stammen aus Rayyans ~/ilias-sync/patch-pferd.py (getestet mit PFERD 3.10.1).
Statt die installierten Dateien umzuschreiben, werden sie zur Laufzeit eingesetzt. So funktioniert
es auch im fertig gepackten Programm, und ein PFERD-Update überschreibt nichts.

1. ILIAS unter einem Unterpfad (…/ilias): urljoin(base_url, "/login.php") verwirft "/ilias".
2. links = ignore: Link-Ziele gar nicht erst auflösen, das schlägt in Köln fehl
   ("resolve_link_target failed") und bricht den ganzen Kurs ab.
3. Nie interaktiv nach Kennung/Passwort fragen.
4. Alte Version sichern, bevor PFERD eine geänderte Datei überschreibt (on_conflict = no-delete).
5. Lernmodule (Selbststudium-Seiten) überspringen: PFERD ruft sonst jede Seite einzeln ab, nur um HTML zu
   speichern, das die App ohnehin verwirft. Spart bei BWL über zwei Minuten pro Sync.
"""

import shutil
import sys
from datetime import datetime
from pathlib import PurePath
from typing import Any
from urllib.parse import urljoin as _urljoin

from .common import BASE_URL, VERSIONS

_ROOT_RELATIVE = {"/login.php", "/ilias.php?baseClass=ilDashboardGUI&cmd=show"}


def _fixed_urljoin(base: Any, url: Any, *args: Any, **kwargs: Any) -> Any:
    if isinstance(base, str) and base.rstrip("/") == BASE_URL:
        base = BASE_URL + "/"
        if url in _ROOT_RELATIVE:
            url = url[1:]
    return _urljoin(base, url, *args, **kwargs)


def install_patches() -> None:
    import PFERD.crawl.ilias.ilias_web_crawler as crawler_mod
    import PFERD.crawl.ilias.kit_ilias_html as html_mod
    from PFERD.logging import log

    crawler_mod.urljoin = _fixed_urljoin  # type: ignore[attr-defined]
    html_mod.urljoin = _fixed_urljoin  # type: ignore[attr-defined]

    cls = crawler_mod.IliasWebCrawler
    original = cls._handle_link

    async def _handle_link(self: Any, element: Any, element_path: Any) -> Any:
        if not self._links.extension():
            log.explain("Answer: No (links = ignore)")
            return None
        return await original(self, element, element_path)

    cls._handle_link = _handle_link  # type: ignore[method-assign]

    # 3. Nie nach Kennung/Passwort fragen: Ohne Terminal würde PFERD sonst ewig warten.
    #    Fehlt das Passwort im Schlüsselbund oder ist es falsch, bricht der Kurs mit AuthError ab,
    #    und sync.py meldet "Anmeldung abgelaufen".
    import PFERD.auth.keyring as keyring_mod
    from PFERD.auth.authenticator import AuthError

    async def _no_prompt(*_args: Any, **_kwargs: Any) -> str:
        raise AuthError("Login failed: password missing from the Keychain or wrong")

    keyring_mod.agetpass = _no_prompt  # type: ignore[attr-defined]
    keyring_mod.ainput = _no_prompt  # type: ignore[attr-defined]

    # 4. Vor dem Überschreiben die bisherige Datei nach <App-Daten>/versions/<Kursordner>/… kopieren
    #    (Grundlage für „geändert“ + KI-Unterschied, und eigene Notizen im PDF gehen nicht verloren).
    #    Klappt das Sichern nicht, bleibt die lokale Datei wie sie ist.
    import PFERD.output_dir as output_mod

    out_cls = output_mod.OutputDirectory
    original_lfrf = out_cls._conflict_lfrf

    async def _conflict_lfrf(self: Any, on_conflict: Any, path: PurePath) -> bool:
        replace = await original_lfrf(self, on_conflict, path)
        if not replace:
            return False
        try:
            local = self.resolve(path)
            if local.is_file():
                rel = PurePath(path)
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                dest = VERSIONS / self._root.name / rel.parent / f"{rel.stem}@{stamp}{rel.suffix}"
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(local, dest)
                print(f"STUDI-VERSION\t{rel.as_posix()}\t{dest}", flush=True)
            return True
        except Exception as e:  # noqa: BLE001
            print(f"STUDI-VERSION-FAILED\t{path}\t{type(e).__name__}", flush=True)
            return False

    out_cls._conflict_lfrf = _conflict_lfrf  # type: ignore[method-assign]

    async def _skip_learning_module(self: Any, element: Any, element_path: Any) -> None:
        from PFERD.utils import fmt_path

        log.status("[bold bright_black]", "Ignored", fmt_path(element_path), "[bright_black](learning module pages)")
        return None

    cls._handle_learning_module = _skip_learning_module  # type: ignore[method-assign]


def run(config_path: str) -> None:
    install_patches()
    from PFERD.__main__ import main

    sys.argv = ["pferd", "--config", config_path]
    main()
