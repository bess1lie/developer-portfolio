"""Scan context shared by all checks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

Resolver = Callable[[str], list[str]]


@dataclass(slots=True)
class ScanContext:
    timeout: float = 5.0
    http_port: int = 80
    https_port: int = 443
    allow_private: bool = False
    resolver: Resolver | None = None
    tls_ca: str | None = None