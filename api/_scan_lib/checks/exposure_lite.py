"""Exposure checks (lite): /.git/HEAD and /.env only.

Teaser variant for the website. Reuses classification logic from the full
check but skips the custom-404 probe request and heavy paths
(/backup.zip, /db.sql) to fit the response budget.
"""

from __future__ import annotations

import secrets

from _scan_lib.checks.exposure import _classify, _fingerprint
from _scan_lib.context import ScanContext
from _scan_lib.schema import Finding
from _scan_lib.ssrf_client import SSRFError, fetch

LITE_PATHS = ("/.git/HEAD", "/.env")


async def run(hostname: str, ctx: ScanContext) -> list[Finding]:
    base = f"https://{hostname}:{ctx.https_port}"
    try:
        home = await fetch(
            f"{base}/",
            timeout=ctx.timeout,
            allow_private=ctx.allow_private,
            resolver=ctx.resolver,
            tls_ca=ctx.tls_ca,
        )
    except SSRFError:
        return []
    home_fp = _fingerprint(home.body)

    probe_fp: str | None = None
    try:
        probe = await fetch(
            f"{base}/{secrets.token_urlsafe(8)}.php",
            timeout=ctx.timeout,
            max_redirects=1,
            allow_private=ctx.allow_private,
            resolver=ctx.resolver,
            tls_ca=ctx.tls_ca,
        )
        probe_fp = _fingerprint(probe.body)
    except SSRFError:
        probe_fp = None

    findings: list[Finding] = []
    for path in LITE_PATHS:
        try:
            resp = await fetch(
                f"{base}{path}",
                timeout=ctx.timeout,
                max_redirects=1,
                allow_private=ctx.allow_private,
                resolver=ctx.resolver,
                tls_ca=ctx.tls_ca,
            )
        except SSRFError:
            continue
        finding = _classify(path, resp, home_fp, probe_fp)
        if finding is not None:
            findings.append(finding)
    return findings