"""SSRF-safe async HTTP client.

No third-party dependencies. Resolution is manual, every resolved IP is
validated against a blocklist, and the connection is pinned to the validated
IP (server_hostname is used for TLS SNI/cert verification). Every redirect
triggers a fresh resolve + validation, so DNS rebinding cannot bypass the
blocklist.
"""

from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
import ssl
import tempfile
import zlib
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urljoin, urlsplit

USER_AGENT = "TrustWatch/0.1 (+https://developer-portfolio-six-theta.vercel.app)"
MAX_HEADER_LINE = 64 * 1024
DEFAULT_TIMEOUT = 5.0
DEFAULT_MAX_REDIRECTS = 3
DEFAULT_MAX_BODY = 2 * 1024 * 1024

BLOCKED_NETS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("2001::/32"),
    ipaddress.ip_network("2002::/16"),
    ipaddress.ip_network("::ffff:0:0/96"),
]

Resolver = Callable[[str], list[str]]


class SSRFError(Exception):
    pass


class SSRFBlocked(SSRFError):
    pass


class SSRFResolveError(SSRFError):
    pass


class SSRFTimeout(SSRFError):
    pass


class SSRFInvalidScheme(SSRFError):
    pass


def is_blocked(ip: str | int | ipaddress._BaseAddress) -> bool:
    addr = ipaddress.ip_address(ip) if not isinstance(ip, ipaddress._BaseAddress) else ip
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return any(addr in net for net in BLOCKED_NETS)


def default_resolver(hostname: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise SSRFResolveError(f"не удалось разрешить {hostname}: {exc}") from exc
    ips: list[str] = []
    for family, _, _, _, sockaddr in infos:
        if family == socket.AF_INET:
            ips.append(sockaddr[0])
        elif family == socket.AF_INET6:
            ips.append(sockaddr[0])
    if not ips:
        raise SSRFResolveError(f"нет A/AAAA записей для {hostname}")
    return ips


def _resolve_valid(
    hostname: str,
    allow_private: bool,
    resolver: Resolver | None,
) -> list[str]:
    resolve = resolver or default_resolver
    ips = resolve(hostname)
    valid = [ip for ip in ips if allow_private or not is_blocked(ip)]
    if not valid:
        raise SSRFBlocked(f"все адреса {hostname} заблокированы (приватный диапазон)")
    return valid


def _parse_url(url: str) -> tuple[str, str, int]:
    try:
        parts = urlsplit(url)
    except ValueError as exc:
        raise SSRFResolveError(f"некорректный URL: {exc}") from exc
    if parts.scheme not in ("http", "https"):
        raise SSRFInvalidScheme(f"схема {parts.scheme!r} не разрешена (только http/https)")
    if parts.username or parts.password:
        raise SSRFInvalidScheme("URL с credentials не разрешён")
    hostname = parts.hostname
    if not hostname:
        raise SSRFResolveError("в URL отсутствует hostname")
    try:
        port = parts.port
    except ValueError as exc:
        raise SSRFResolveError(f"некорректный порт: {exc}") from exc
    if port is None:
        port = 443 if parts.scheme == "https" else 80
    if port == 0:
        raise SSRFResolveError("порт 0 не разрешён")
    return parts.scheme, hostname.lower(), port


def _insecure_ctx() -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def _connect(
    hostname: str,
    port: int,
    *,
    ssl_ctx: ssl.SSLContext | None,
    timeout: float,
    allow_private: bool,
    resolver: Resolver | None,
) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    last_err: Exception | None = None
    for ip in _resolve_valid(hostname, allow_private, resolver):
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(
                    host=ip,
                    port=port,
                    ssl=ssl_ctx,
                    server_hostname=hostname if ssl_ctx else None,
                ),
                timeout=timeout,
            )
            return reader, writer
        except asyncio.TimeoutError as exc:
            raise SSRFTimeout(f"таймаут подключения к {hostname}:{port}") from exc
        except ssl.SSLCertVerificationError:
            raise
        except (OSError, ssl.SSLError) as exc:
            last_err = exc
    raise SSRFError(f"не удалось подключиться к {hostname}:{port}: {last_err}")


def _build_request(url: str, hostname: str, port: int) -> bytes:
    parts = urlsplit(url)
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    host_header = hostname if port in (80, 443) else f"{hostname}:{port}"
    lines = [
        f"GET {path} HTTP/1.1",
        f"Host: {host_header}",
        f"User-Agent: {USER_AGENT}",
        "Accept: */*",
        "Accept-Encoding: identity",
        "Connection: close",
        "",
        "",
    ]
    return "\r\n".join(lines).encode("utf-8")


async def _read_line(reader: asyncio.StreamReader, limit: int = MAX_HEADER_LINE) -> bytes:
    try:
        line = await reader.readuntil(b"\n")
    except asyncio.IncompleteReadError as exc:
        return exc.partial
    except asyncio.LimitOverrunError as exc:
        raise SSRFError("строка ответа превышает лимит") from exc
    if len(line) > limit:
        raise SSRFError("строка ответа превышает лимит")
    return line.rstrip(b"\r\n")


async def _read_chunked(reader: asyncio.StreamReader, max_body: int) -> tuple[bytes, bool]:
    body = bytearray()
    truncated = False
    while len(body) <= max_body:
        size_line = await _read_line(reader)
        if not size_line:
            break
        size_part = size_line.split(b";", 1)[0].strip()
        try:
            size = int(size_part, 16)
        except ValueError:
            break
        if size == 0:
            while True:
                trailer = await _read_line(reader)
                if not trailer:
                    break
            break
        remaining = size
        while remaining > 0:
            chunk = await reader.read(min(remaining, 65536))
            if not chunk:
                truncated = True
                return bytes(body), truncated
            body.extend(chunk)
            remaining -= len(chunk)
        if len(body) > max_body:
            truncated = True
            return bytes(body[:max_body]), truncated
        await reader.readexactly(2)
    return bytes(body[:max_body]), truncated


async def _read_response(
    reader: asyncio.StreamReader,
    *,
    max_body: int,
) -> tuple[int, dict[str, str], bytes, bool]:
    status_line = await _read_line(reader)
    if not status_line:
        raise SSRFError("пустой ответ сервера")
    parts = status_line.split(b" ", 2)
    try:
        status = int(parts[1])
    except (IndexError, ValueError) as exc:
        raise SSRFError(f"некорректная status line: {status_line!r}") from exc

    headers: dict[str, str] = {}
    while True:
        line = await _read_line(reader)
        if not line:
            break
        key, sep, value = line.partition(b":")
        if not sep:
            continue
        name = key.decode("latin-1").strip().lower()
        if name not in headers:
            headers[name] = value.decode("latin-1").strip()

    encoding = headers.get("content-encoding", "").lower()
    transfer = headers.get("transfer-encoding", "").lower()
    body: bytes
    truncated = False

    if "chunked" in transfer:
        body, truncated = await _read_chunked(reader, max_body)
    elif "content-length" in headers:
        try:
            length = int(headers["content-length"])
        except ValueError:
            length = 0
        if length > max_body:
            try:
                body = await reader.readexactly(max_body)
            except asyncio.IncompleteReadError as exc:
                body = exc.partial
            truncated = True
        else:
            try:
                body = await reader.readexactly(length)
            except asyncio.IncompleteReadError as exc:
                body = exc.partial
                truncated = True
    else:
        body = bytearray()
        while len(body) <= max_body:
            chunk = await reader.read(65536)
            if not chunk:
                break
            body.extend(chunk)
        if len(body) > max_body:
            body = body[:max_body]
            truncated = True
        body = bytes(body)

    if encoding in ("gzip", "deflate") and body:
        try:
            body = zlib.decompress(body, 16 + zlib.MAX_WBITS) if encoding == "gzip" else zlib.decompress(body)
        except zlib.error:
            try:
                body = zlib.decompress(body)
            except zlib.error:
                pass
        if len(body) > max_body:
            body = body[:max_body]
            truncated = True

    return status, headers, body, truncated


@dataclass(slots=True)
class HTTPResponse:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes
    final_url: str
    chain: list[tuple[str, int, str | None]]
    truncated: bool = False


async def fetch(
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    max_body: int = DEFAULT_MAX_BODY,
    allow_private: bool = False,
    resolver: Resolver | None = None,
    tls_ca: str | None = None,
) -> HTTPResponse:
    scheme, hostname, port = _parse_url(url)
    chain: list[tuple[str, int, str | None]] = []
    current = url
    redirects = 0

    while True:
        scheme, hostname, port = _parse_url(current)
        ssl_ctx = None
        if scheme == "https":
            ssl_ctx = ssl.create_default_context(cafile=tls_ca)
        try:
            reader, writer = await _connect(
                hostname, port, ssl_ctx=ssl_ctx, timeout=timeout,
                allow_private=allow_private, resolver=resolver,
            )
            try:
                writer.write(_build_request(current, hostname, port))
                await asyncio.wait_for(writer.drain(), timeout=timeout)
                status, headers, body, truncated = await asyncio.wait_for(
                    _read_response(reader, max_body=max_body), timeout=timeout
                )
            except asyncio.TimeoutError as exc:
                raise SSRFTimeout(f"таймаут чтения ответа от {hostname}:{port}") from exc
            finally:
                writer.close()
                try:
                    await writer.wait_closed()
                except (OSError, ssl.SSLError):
                    pass
        except (asyncio.TimeoutError, asyncio.CancelledError) as exc:
            raise SSRFTimeout(f"таймаут {hostname}:{port}") from exc

        chain.append((current, status, headers.get("location")))
        location = headers.get("location")
        if status in (301, 302, 303, 307, 308) and location and redirects < max_redirects:
            next_url = urljoin(current, location)
            if urlsplit(next_url).scheme not in ("http", "https"):
                return HTTPResponse(
                    url=url, status=status, headers=headers, body=body,
                    final_url=current, chain=chain, truncated=truncated,
                )
            current = next_url
            redirects += 1
            continue
        return HTTPResponse(
            url=url, status=status, headers=headers, body=body,
            final_url=current, chain=chain, truncated=truncated,
        )


@dataclass(slots=True)
class TLSInfo:
    ok: bool
    version: str | None = None
    cipher: str | None = None
    cert: dict | None = None
    error: str | None = None
    error_kind: str | None = None


def _classify_verify_error(exc: ssl.SSLCertVerificationError) -> str:
    message = exc.verify_message or str(exc)
    lowered = message.lower()
    if "has expired" in lowered or "not yet valid" in lowered:
        return "expired"
    if "mismatch" in lowered:
        return "mismatch"
    if "self-signed" in lowered:
        return "self_signed"
    if "unable to get local issuer" in lowered:
        return "untrusted"
    return "unknown"


async def tls_inspect(
    hostname: str,
    port: int = 443,
    *,
    timeout: float = DEFAULT_TIMEOUT,
    allow_private: bool = False,
    resolver: Resolver | None = None,
    tls_ca: str | None = None,
) -> TLSInfo:
    try:
        reader, writer = await _connect(
            hostname, port,
            ssl_ctx=ssl.create_default_context(cafile=tls_ca),
            timeout=timeout, allow_private=allow_private, resolver=resolver,
        )
    except ssl.SSLCertVerificationError as exc:
        return await _tls_unverified(
            hostname, port, timeout=timeout,
            allow_private=allow_private, resolver=resolver,
            error=str(exc), error_kind=_classify_verify_error(exc),
        )
    except (SSRFError, OSError) as exc:
        return TLSInfo(ok=False, error=str(exc))
    try:
        sslobj = writer.get_extra_info("ssl_object")
        if sslobj is None:
            return TLSInfo(ok=False, error="нет ssl_object")
        cipher = sslobj.cipher()
        return TLSInfo(
            ok=True,
            version=sslobj.version(),
            cipher=cipher[0] if cipher else None,
            cert=sslobj.getpeercert(),
        )
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except (OSError, ssl.SSLError):
            pass


def _decode_cert_der(der: bytes) -> dict | None:
    try:
        pem = ssl.DER_cert_to_PEM_cert(der)
    except (ssl.SSLError, ValueError):
        return None
    try:
        return ssl._ssl._test_decode_cert(der)
    except Exception:
        pass
    fd, path = tempfile.mkstemp(suffix=".pem")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(pem)
        return ssl._ssl._test_decode_cert(path)
    except Exception:
        return None
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def _tls_unverified(
    hostname: str,
    port: int,
    *,
    timeout: float,
    allow_private: bool,
    resolver: Resolver | None,
    error: str,
    error_kind: str,
) -> TLSInfo:
    try:
        reader, writer = await _connect(
            hostname, port, ssl_ctx=_insecure_ctx(),
            timeout=timeout, allow_private=allow_private, resolver=resolver,
        )
    except (SSRFError, OSError) as exc:
        return TLSInfo(ok=False, error=str(exc), error_kind=error_kind)
    try:
        sslobj = writer.get_extra_info("ssl_object")
        cert = None
        if sslobj is not None:
            try:
                cert = sslobj.getpeercert()
            except ValueError:
                cert = {}
            if not cert:
                der = sslobj.getpeercert(binary_form=True)
                if der:
                    cert = _decode_cert_der(der)
        return TLSInfo(
            ok=False,
            version=sslobj.version() if sslobj else None,
            cert=cert,
            error=error,
            error_kind=error_kind,
        )
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except (OSError, ssl.SSLError):
            pass