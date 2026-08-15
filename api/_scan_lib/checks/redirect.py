"""Redirect chain checks (HTTP -> HTTPS, loops, external redirects)."""

from __future__ import annotations

import re

from _scan_lib.context import ScanContext
from _scan_lib.schema import Finding
from _scan_lib.ssrf_client import SSRFError, fetch
from urllib.parse import urlsplit

_REDIRECT_STATUSES = (301, 302, 303, 307, 308)
_SAME_SITE_RE = re.compile(r"^(?:www\.)?")


def _same_site(hostname: str, other: str) -> bool:
    a = _SAME_SITE_RE.sub("", hostname.rstrip(".").lower())
    b = _SAME_SITE_RE.sub("", other.rstrip(".").lower())
    return a == b


async def run(hostname: str, ctx: ScanContext) -> list[Finding]:
    url = f"http://{hostname}:{ctx.http_port}/"
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

    findings: list[Finding] = []
    urls = [hop_url for hop_url, _, _ in resp.chain]
    loop = len(urls) != len(set(urls))

    if loop:
        findings.append(
            Finding(
                id="redirect_loop",
                severity="high",
                title="Петля редиректов",
                evidence="цепочка: " + " → ".join(urls),
                confidence="high",
                explanation="Редирект возвращает на уже посещённый URL — пользователь не может открыть сайт.",
                remediation="Исправить правила редиректов на сервере/в CDN.",
            )
        )

    target_host = hostname.rstrip(".").lower()
    for hop_url, status, _ in resp.chain[1:]:
        other = urlsplit(hop_url).hostname
        if other and not _same_site(target_host, other):
            findings.append(
                Finding(
                    id="external_redirect",
                    severity="info",
                    title="Внешний редирект",
                    evidence=f"цепочка: " + " → ".join(urls),
                    confidence="high",
                    explanation="Сайт перенаправляет на другой домен. Может быть нормой (аналитика, партнёрские страницы), но стоит проверить, что это ожидаемое поведение.",
                    remediation="Убедиться, что редирект на внешний домен ожидаемый.",
                )
            )
            break

    if not loop:
        redirected_to_https = any(hop_url.startswith("https://") for hop_url in urls)
        if not redirected_to_https and resp.status == 200:
            findings.append(
                Finding(
                    id="no_https_redirect",
                    severity="medium",
                    title="Сайт не редиректит HTTP на HTTPS",
                    evidence=f"GET http://{hostname}/ → {resp.status}, final URL: {resp.final_url}",
                    confidence="high",
                    explanation="По HTTP отдаётся содержимое без перенаправления на HTTPS: данные и сессии передаются открыто.",
                    remediation="Настроить 301-редирект с http:// на https:// (или HSTS + redirect на сервере/CDN).",
                )
            )
        elif resp.chain and resp.chain[-1][1] in _REDIRECT_STATUSES:
            findings.append(
                Finding(
                    id="redirect_chain_too_long",
                    severity="low",
                    title="Длинная цепочка редиректов",
                    evidence="цепочка: " + " → ".join(urls),
                    confidence="high",
                    explanation="Цепочка редиректов не завершилась за 3 перехода.",
                    remediation="Сократить количество последовательных редиректов.",
                )
            )
    return findings