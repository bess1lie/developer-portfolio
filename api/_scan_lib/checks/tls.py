"""TLS certificate and protocol checks."""

from __future__ import annotations

import datetime

from _scan_lib.context import ScanContext
from _scan_lib.schema import Finding
from _scan_lib.ssrf_client import SSRFError, tls_inspect

_MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

_EXPIRED_REMEDIATION = "Обновить или заменить TLS-сертификат, проверить автопродление."
_HTTPS_UNAVAILABLE_EXPLANATION = (
    "Сервер не отвечает на TLS-соединение по стандартному порту 443. "
    "Это внешний признак: сайт может быть доступен только по HTTP."
)


def _parse_cert_date(value: str) -> datetime.datetime | None:
    try:
        parts = value.split()
        month = _MONTHS[parts[0]]
        day = int(parts[1])
        hour, minute, second = (int(part) for part in parts[2].split(":"))
        year = int(parts[3])
        return datetime.datetime(
            year, month, day, hour, minute, second,
            tzinfo=datetime.timezone.utc,
        )
    except (ValueError, KeyError, IndexError):
        return None


def _days_to_expiry(cert: dict) -> int | None:
    not_after = cert.get("notAfter")
    if not not_after:
        return None
    dt = _parse_cert_date(not_after)
    if dt is None:
        return None
    return (dt - datetime.datetime.now(datetime.timezone.utc)).days


def _subject_text(cert: dict) -> str:
    parts = []
    for pair in cert.get("subject", ()):
        for key, value in pair:
            parts.append(f"{key}={value}")
    return ", ".join(parts)


def _san_text(cert: dict) -> str:
    return ", ".join(f"{kind}:{value}" for kind, value in cert.get("subjectAltName", ()))


def _cert_covers_hostname(cert: dict, hostname: str) -> bool:
    hostname = hostname.rstrip(".").lower()
    names: list[str] = []
    for kind, value in cert.get("subjectAltName", ()):
        names.append(value.lower() if kind == "DNS" else value)
    for name in names:
        if name == hostname:
            return True
        if name.startswith("*.") and hostname.endswith(name[1:]):
            if hostname.count(".") == name.count("."):
                return True
    for pair in cert.get("subject", ()):
        for key, value in pair:
            if key == "commonName" and value.rstrip(".").lower() == hostname:
                return True
    return False


async def run(hostname: str, ctx: ScanContext) -> list[Finding]:
    info = await tls_inspect(
        hostname, ctx.https_port,
        timeout=ctx.timeout,
        allow_private=ctx.allow_private,
        resolver=ctx.resolver,
        tls_ca=ctx.tls_ca,
    )
    if not info.ok:
        if info.error_kind is None:
            return [
                Finding(
                    id="https_unavailable",
                    severity="low",
                    title="HTTPS недоступен",
                    evidence=f"не удалось установить TLS-соединение с {hostname}:{ctx.https_port}",
                    confidence="high",
                    explanation=_HTTPS_UNAVAILABLE_EXPLANATION,
                    remediation="Проверить, что сайт доступен по https://, настроить TLS-сертификат.",
                )
            ]
        cert = info.cert or {}
        subject = _subject_text(cert)
        days = _days_to_expiry(cert)

        if days is not None and days < 0:
            return [
                Finding(
                    id="cert_expired",
                    severity="critical",
                    title="TLS-сертификат истёк",
                    evidence=f"сертификат {subject} истёк, notAfter={cert.get('notAfter')}; ошибка: {info.error[:200]}",
                    confidence="high",
                    explanation="Сертификат просрочен или ещё не начал действовать. Браузеры будут показывать предупреждение, соединения могут перехватываться.",
                    remediation=_EXPIRED_REMEDIATION,
                )
            ]

        if not _cert_covers_hostname(cert, hostname):
            return [
                Finding(
                    id="cert_hostname_mismatch",
                    severity="high",
                    title="Имя в TLS-сертификате не совпадает с доменом",
                    evidence=f"сертификат: {subject}; SAN: {_san_text(cert) or 'нет'}; ошибка: {info.error[:200]}",
                    confidence="high",
                    explanation="Сертификат выдан для другого имени. Посетители получат ошибку безопасности.",
                    remediation="Выпустить корректный сертификат для домена (Let's Encrypt, DNS-провайдер).",
                )
            ]
        if info.error_kind in ("self_signed", "expired"):
            return [
                Finding(
                    id="cert_self_signed",
                    severity="medium",
                    title="Самоподписанный TLS-сертификат",
                    evidence=f"сертификат: {subject}; ошибка: {info.error[:200]}",
                    confidence="high",
                    explanation="Самоподписанный сертификат не доверяется браузерами и клиентами автоматически.",
                    remediation="Заменить на сертификат от доверенного CA (Let's Encrypt бесплатно).",
                )
            ]
        if info.error_kind == "untrusted":
            return [
                Finding(
                    id="cert_untrusted_issuer",
                    severity="medium",
                    title="TLS-сертификат от непроверенного издателя",
                    evidence=f"сертификат: {subject}; ошибка: {info.error[:200]}",
                    confidence="high",
                    explanation="Цепочка сертификатов не доверяется клиентами. Причина: самоподписанный или неправильная цепочка.",
                    remediation="Установить полную цепочку сертификатов от доверенного CA.",
                )
            ]
        return [
            Finding(
                id="cert_verify_failed",
                severity="low",
                title="Проблема с проверкой TLS-сертификата",
                evidence=f"ошибка: {info.error[:200]}",
                confidence="high",
                explanation="Проверка сертификата не прошла по неклассифицированной причине.",
                remediation="Проверить настройки TLS на сервере.",
            )
        ]

    findings: list[Finding] = []
    cert = info.cert or {}
    days = _days_to_expiry(cert)

    if days is not None and days < 0:
        findings.append(
            Finding(
                id="cert_expired",
                severity="critical",
                title="TLS-сертификат истёк",
                evidence=f"notAfter={cert.get('notAfter')}; issuer: {_subject_text(cert)}",
                confidence="high",
                explanation="Срок действия сертификата закончился.",
                remediation=_EXPIRED_REMEDIATION,
            )
        )
    elif days is not None and days < 7:
        findings.append(
            Finding(
                id="cert_expires_soon",
                severity="high",
                title=f"TLS-сертификат истекает через {days} дн.",
                evidence=f"notAfter={cert.get('notAfter')}; issuer: {_subject_text(cert)}",
                confidence="high",
                explanation="Сертификат истекает в ближайшие дни, возможен перерыв в работе сайта.",
                remediation="Обновить сертификат заранее, настроить автопродление.",
            )
        )
    elif days is not None and days < 30:
        findings.append(
            Finding(
                id="cert_expires_soon",
                severity="medium",
                title=f"TLS-сертификат истекает через {days} дн.",
                evidence=f"notAfter={cert.get('notAfter')}; issuer: {_subject_text(cert)}",
                confidence="high",
                explanation="Сертификат истекает в течение месяца.",
                remediation="Запланировать продление сертификата.",
            )
        )

    version = info.version or ""
    if version in ("TLSv1", "TLSv1.1", "SSLv3"):
        findings.append(
            Finding(
                id="tls_version_old",
                severity="high",
                title="Устаревшая версия TLS",
                evidence=f"согласованная версия протокола: {version}",
                confidence="high",
                explanation="TLS 1.0/1.1 устарели и имеют известные уязвимости.",
                remediation="Включить TLS 1.2+ на сервере, отключить старые версии.",
            )
        )
    return findings