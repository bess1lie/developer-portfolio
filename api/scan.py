"""Teaser scan endpoint for the Security Watch section.

POST {"domain": "example.kz"} -> quick TLS/headers/exposure-lite verdict.

Lead delivery is handled by the frontend via the existing /api/lead flow,
this endpoint only runs the scan.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _scan_lib import ScanContext, normalize_target
from _scan_lib.runner import scan as teaser_scan
from _scan_lib.schema import SEVERITY_ORDER, severity_index

SCAN_BUDGET_S = 7.5
RATE_LIMIT = 3
RATE_WINDOW_S = 3600

_usage: dict[str, list[float]] = {}


def _client_ip(handler: BaseHTTPRequestHandler) -> str:
    fwd = handler.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return handler.client_address[0]


def _rate_limited(ip: str) -> int | None:
    now = time.time()
    hits = [ts for ts in _usage.get(ip, []) if now - ts < RATE_WINDOW_S]
    _usage[ip] = hits
    if len(hits) >= RATE_LIMIT:
        return int(RATE_WINDOW_S - (now - hits[0]))
    _usage[ip] = hits + [now]
    return None


def _validate_domain(domain: str) -> str:
    hostname = normalize_target(domain)
    if any(label == "localhost" for label in hostname.split(".")):
        raise ValueError("localhost запрещён")
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise ValueError("IP-адрес не принимается, нужен домен")
    if "." not in hostname:
        raise ValueError("нужен полный домен (с точкой)")
    label_re = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
    if any(not label_re.match(label) for label in hostname.split(".")):
        raise ValueError("домен содержит недопустимые символы")
    return hostname


def _severity_of(verdict) -> str | None:
    worst = None
    for finding in verdict.findings:
        if worst is None or severity_index(finding.severity) > severity_index(worst):
            worst = finding.severity
    return worst


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args: object) -> None:
        pass

    def _json(self, status: int, payload: dict, extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._json(404, {"error": "not found"})

    def do_HEAD(self) -> None:
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/scan":
            self._json(404, {"error": "not found"})
            return

        retry_after = _rate_limited(_client_ip(self))
        if retry_after is not None:
            self._json(429, {"error": "слишком много запросов"}, {"Retry-After": str(retry_after)})
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length > 4096:
            self._json(413, {"error": "тело запроса слишком большое"})
            return
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"error": "невалидный JSON"})
            return
        domain = data.get("domain", "")
        if not isinstance(domain, str):
            self._json(400, {"error": "поле domain обязательно"})
            return
        try:
            hostname = _validate_domain(domain)
        except ValueError as exc:
            self._json(400, {"error": str(exc)})
            return

        ctx = ScanContext(timeout=4.0)
        try:
            verdict = asyncio.run(
                asyncio.wait_for(teaser_scan(hostname, ctx), timeout=SCAN_BUDGET_S)
            )
        except asyncio.TimeoutError:
            verdict = None
        except Exception:
            verdict = None

        if verdict is None:
            self._json(200, {"domain": hostname, "ok": False, "issues": 0, "severity": None})
            return

        self._json(200, {
            "domain": hostname,
            "ok": True,
            "issues": len(verdict.findings),
            "severity": _severity_of(verdict),
        })