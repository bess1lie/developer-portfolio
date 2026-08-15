"""Exposure checks: /.git/HEAD, /.env, /backup.zip, /db.sql.

HTTP 200 alone is never proof of exposure. Confirmation requires
content-type, body signatures, size and comparison with custom-404
and homepage fingerprints.
"""

from __future__ import annotations

import hashlib
import re
import secrets

from _scan_lib.context import ScanContext
from _scan_lib.schema import Finding
from _scan_lib.ssrf_client import SSRFError, fetch

EXPOSURE_PATHS = ("/.git/HEAD", "/.env", "/backup.zip", "/db.sql")

_GIT_HEAD_RE = re.compile(rb"^ref:\s*refs/heads/[A-Za-z0-9._/-]+")
_ENV_KEY_LINE_RE = re.compile(rb"^[A-Z][A-Z0-9_]{2,}=", re.MULTILINE)
_ENV_SECRET_WORDS = (
    b"PASSWORD", b"SECRET", b"API_KEY", b"APP_KEY", b"TOKEN", b"PRIVATE",
)
_SQL_SIGNATURES = (
    b"CREATE TABLE", b"INSERT INTO", b"DROP TABLE IF EXISTS",
    b"CREATE DATABASE", b"-- MySQL dump",
)
_ENV_MAX_BODY = 512 * 1024


def _fingerprint(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _classify(path: str, resp, home_fp: str, probe_fp: str | None) -> Finding | None:
    if resp.status != 200:
        return None
    body = resp.body
    fp = _fingerprint(body)
    if fp == home_fp or (probe_fp is not None and fp == probe_fp):
        return None
    content_type = resp.headers.get("content-type", "").lower()
    if "html" in content_type:
        return None

    if path == "/.git/HEAD":
        if _GIT_HEAD_RE.match(body[:4096]):
            return Finding(
                id="git_head_exposed",
                severity="high",
                title="Открыт /.git (исходный код доступен)",
                evidence=f"GET {path} → {resp.status}, content-type: {content_type or '—'}, body: {body[:80]!r}",
                confidence="high",
                explanation="/.git/HEAD отдаёт содержимое репозитория: исходный код, история, ключи и секреты в истории коммитов потенциально доступны извне.",
                remediation="Закрыть доступ к /.git на уровне веб-сервера (deny all) и удалить каталог из публичной директории.",
            )
        return None

    if path == "/.env":
        lines = [line for line in body.splitlines() if _ENV_KEY_LINE_RE.match(line)]
        has_secret = any(word in body.upper() for word in _ENV_SECRET_WORDS) and len(body) <= _ENV_MAX_BODY
        if has_secret and len(lines) >= 1:
            return Finding(
                id="env_exposed",
                severity="critical",
                title="Открыт .env (конфигурация с секретами)",
                evidence=f"GET {path} → {resp.status}, content-type: {content_type or '—'}, найдено строк вида KEY=value: {len(lines)}, упоминание секретов: да",
                confidence="high",
                explanation="Файл .env содержит ключи, пароли и токены доступа. При его наличии секреты потенциально доступны извне.",
                remediation="Удалить .env из публичной директории, закрыть доступ на веб-сервере, ротировать скомпрометированные ключи.",
            )
        if len(lines) >= 3:
            return Finding(
                id="env_exposed",
                severity="high",
                title="Вероятно открыт .env (конфигурация)",
                evidence=f"GET {path} → {resp.status}, content-type: {content_type or '—'}, найдено строк вида KEY=value: {len(lines)}",
                confidence="medium",
                explanation="Тело ответа выглядит как конфигурация вида KEY=value. Возможно, это .env или другой конфигурационный файл.",
                remediation="Проверить содержимое {path} вручную; если это .env — удалить из публичной директории и ротировать ключи.",
            )
        return None

    if path == "/backup.zip":
        if body.startswith(b"PK\x03\x04"):
            return Finding(
                id="backup_zip_exposed",
                severity="high",
                title="Открыт архив бэкапа /backup.zip",
                evidence=f"GET {path} → {resp.status}, content-type: {content_type or '—'}, body начинается с zip-magic (PK\\x03\\x04)",
                confidence="high",
                explanation="По пути /backup.zip отдаётся ZIP-архив: резервная копия сайта может содержать исходный код, конфигурацию и базу.",
                remediation="Удалить архив из публичной директории, настроить хранение бэкапов вне webroot.",
            )
        return None

    if path == "/db.sql":
        upper = body[: 200 * 1024].upper()
        hits = [sig for sig in _SQL_SIGNATURES if sig in upper]
        if hits:
            return Finding(
                id="db_sql_exposed",
                severity="high",
                title="Открыт SQL-дамп /db.sql",
                evidence=f"GET {path} → {resp.status}, content-type: {content_type or '—'}, найдены SQL-сигнатуры: {', '.join(h.decode() for h in hits[:3])}",
                confidence="high",
                explanation="По пути /db.sql отдаётся дамп базы данных: содержимое таблиц потенциально доступно извне.",
                remediation="Удалить дамп из публичной директории, перенести бэкапы вне webroot.",
            )
        return None
    return None


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
    for path in EXPOSURE_PATHS:
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