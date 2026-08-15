"""Scan orchestration: normalize target, run checks, produce verdict."""

from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlsplit

from _scan_lib.checks import exposure, headers, redirect, tls
from _scan_lib.context import ScanContext
from _scan_lib.rules import evaluate
from _scan_lib.schema import Finding, Verdict
from _scan_lib.ssrf_client import SSRFError

logger = logging.getLogger("trustwatch.engine")

ALLOWED_SCHEMES = ("http", "https")


def normalize_target(target: str) -> str:
    value = target.strip()
    if "://" not in value:
        value = "https://" + value
    try:
        parts = urlsplit(value)
    except ValueError as exc:
        raise ValueError(f"некорректный URL: {exc}") from exc
    if parts.scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"схема {parts.scheme!r} не разрешена (только http/https)")
    if parts.username or parts.password:
        raise ValueError("URL с credentials не разрешён")
    hostname = parts.hostname
    if not hostname:
        raise ValueError("в URL отсутствует hostname")
    return hostname.rstrip(".").lower()


async def scan(target: str, ctx: ScanContext | None = None) -> Verdict:
    ctx = ctx or ScanContext()
    hostname = normalize_target(target)
    coroutines = [
        tls.run(hostname, ctx),
        headers.run(hostname, ctx),
        exposure.run(hostname, ctx),
        redirect.run(hostname, ctx),
    ]
    results = await asyncio.gather(*coroutines, return_exceptions=True)
    findings: list[Finding] = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning("проверка для %s завершилась ошибкой: %s", hostname, result)
            continue
        findings.extend(result)
    return evaluate(hostname, findings)


def scan_sync(target: str, ctx: ScanContext | None = None) -> Verdict:
    return asyncio.run(scan(target, ctx))