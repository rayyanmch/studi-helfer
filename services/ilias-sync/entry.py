"""Einstieg für das fertig gepackte Programm (PyInstaller). Entspricht `python -m studi_sync`."""

import sys

from studi_sync.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
