"""HTTP security headers checks (HTML responses only)."""

from __future__ import annotations

from _scan_lib.context import ScanContext
from _scan_lib.schema import Finding
from _scan_lib.ssrf_client import SSRFError, fetch


async def run(hostname: str, ctx: ScanContext) -> list[Finding]:
    url = f"https://{hostname}:{ctx.https_port}/"
    try:
        resp = await fetch(
            url,
            timeout=ctx.timeout,
            allow_private=ctx.allow_private,
            resolver=ctx.resolver,
            tls_ca=ctx.tls_ca,
        )
    except SSRFError:
        return []
    if "text/html" not in resp.headers.get("content-type", ""):
        return []

    headers = resp.headers
    findings: list[Finding] = []

    if "strict-transport-security" not in headers:
        findings.append(
            Finding(
                id="missing_hsts",
                severity="medium",
                title="HSTS отсутствует",
                evidence=f"response headers: no Strict-Transport-Security (final URL: {resp.final_url})",
                confidence="high",
                explanation="Без HSTS браузер может заходить по HTTP до первого HTTPS-визита, что допускает перехват (downgrade attack).",
                remediation="Добавить заголовок Strict-Transport-Security (например: max-age=31536000; includeSubDomains).",
            )
        )

    if "content-security-policy" not in headers:
        findings.append(
            Finding(
                id="missing_csp",
                severity="low",
                title="Content-Security-Policy отсутствует",
                evidence="response headers: no Content-Security-Policy",
                confidence="high",
                explanation="CSP ограничивает источники скриптов и снижает последствия XSS. Учитываются только HTTP-заголовки, meta-CSP слабее и здесь не проверяется.",
                remediation="Добавить Content-Security-Policy с whitelist'ом источников (default-src 'self').",
            )
        )

    if "x-content-type-options" not in headers:
        findings.append(
            Finding(
                id="missing_xcto",
                severity="low",
                title="X-Content-Type-Options отсутствует",
                evidence="response headers: no X-Content-Type-Options",
                confidence="high",
                explanation="Без nosniff браузер может интерпретировать загружаемые файлы как HTML (MIME-sniffing).",
                remediation="Добавить заголовок X-Content-Type-Options: nosniff.",
            )
        )

    if "referrer-policy" not in headers:
        findings.append(
            Finding(
                id="missing_referrer_policy",
                severity="low",
                title="Referrer-Policy отсутствует",
                evidence="response headers: no Referrer-Policy",
                confidence="high",
                explanation="Без политики браузер может передавать полный URL (включая параметры) как referrer на внешние сайты.",
                remediation="Добавить Referrer-Policy (например: strict-origin-when-cross-origin).",
            )
        )

    csp = headers.get("content-security-policy", "")
    has_frame_ancestors = "frame-ancestors" in csp
    if "x-frame-options" not in headers and not has_frame_ancestors:
        findings.append(
            Finding(
                id="missing_xfo",
                severity="low",
                title="X-Frame-Options отсутствует",
                evidence="response headers: no X-Frame-Options; в CSP нет frame-ancestors",
                confidence="high",
                explanation="Сайт может быть вставлен в iframe на стороннем сайте (clickjacking).",
                remediation="Добавить X-Frame-Options: SAMEORIGIN или frame-ancestors в CSP.",
            )
        )
    return findings