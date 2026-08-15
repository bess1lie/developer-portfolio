"""Teaser scan library for the website (snapshot of the engine).

Copy of the engine kept in sync manually. Do not edit engine logic here —
the full scan lives in the trustwatch repo; this tree is the deployment
subset (no redirect check, lite exposure) served from api/scan.py.
"""

from _scan_lib.context import ScanContext
from _scan_lib.runner import scan
from _scan_lib.schema import Verdict
from _scan_lib.scanner import normalize_target

__all__ = ["ScanContext", "Verdict", "normalize_target", "scan"]