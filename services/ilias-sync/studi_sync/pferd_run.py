"""PFERD mit den nötigen Korrekturen für ILIAS Köln starten.

Die Korrekturen stammen aus Rayyans ~/ilias-sync/patch-pferd.py (getestet mit PFERD 3.10.1).
Statt die installierten Dateien umzuschreiben, werden sie zur Laufzeit eingesetzt. So funktioniert
es auch im fertig gepackten Programm, und ein PFERD-Update überschreibt nichts.

1. ILIAS unter einem Unterpfad (…/ilias): urljoin(base_url, "/login.php") verwirft "/ilias".
2. links = ignore: Link-Ziele gar nicht erst auflösen, das schlägt in Köln fehl
   ("resolve_link_target failed") und bricht den ganzen Kurs ab.
"""

import sys
from typing import Any
from urllib.parse import urljoin as _urljoin

from .common import BASE_URL

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
        raise AuthError("Login failed: Passwort im Schlüsselbund fehlt oder ist falsch")

    keyring_mod.agetpass = _no_prompt  # type: ignore[attr-defined]
    keyring_mod.ainput = _no_prompt  # type: ignore[attr-defined]


def run(config_path: str) -> None:
    install_patches()
    from PFERD.__main__ import main

    sys.argv = ["pferd", "--config", config_path]
    main()
