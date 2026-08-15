"""Teaser scan orchestration for the website.

Runs a subset of checks (TLS, headers, exposure-lite) with a strict budget.
Returns the same Verdict shape as the full engine scan.
"""

from __future__ import annotations

import asyncio
import logging

from _scan_lib.checks import exposure_lite, headers, tls
from _scan_lib.context import ScanContext
from _scan_lib.rules import evaluate
from _scan_lib.schema import Finding, Verdict
from _scan_lib.scanner import normalize_target

logger = logging.getLogger("trustwatch.teaser")


async def scan(target: str, ctx: ScanContext | None = None) -> Verdict:
    ctx = ctx or ScanContext()
    hostname = normalize_target(target)
    coroutines = [
        tls.run(hostname, ctx),
        headers.run(hostname, ctx),
        exposure_lite.run(hostname, ctx),
    ]
    results = await asyncio.gather(*coroutines, return_exceptions=True)
    findings: list[Finding] = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning("проверка для %s завершилась ошибкой: %s", hostname, result)
            continue
        findings.extend(result)
    return evaluate(hostname, findings)