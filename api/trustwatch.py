#!/usr/bin/env python3
"""TrustWatch Vercel Webhook Handler - self-contained version.

Receives Telegram webhook updates via POST /api/trustwatch, processes commands
(/check, /limits, /start) and returns verdicts via the scanner engine.
Uses direct HTTPS requests (urllib) for Telegram API — NO SSRF client.
Validates X-Telegram-Bot-Api-Secret-Token header.
Works with Vercel's serverless model (handler(event, context)).
"""

import json
import logging
import os
import re
import sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Optional, Tuple

# Ensure trustwatch modules are on path
_TRUSTWATCH = "/home/bessilie/trustwatch"
if _TRUSTWATCH not in sys.path:
    sys.path.insert(0, _TRUSTWATCH)

# Minimal extract_target function
def extract_target(text: str) -> Optional[str]:
    """Extract target URL from user text (after /check command)."""
    text = text.strip()
    text = re.sub(r"/check\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"/chk\s*", "", text, flags=re.IGNORECASE)
    tokens = text.split()
    for token in tokens:
        if token.startswith("http://") or token.startswith("https://"):
            return token
        if "." in token and not token.startswith("@") and "/" not in token:
            return token
    return None

# Minimal verdict card formatting
def verdict_card(verdict: dict) -> str:
    """Format a scan verdict into a human-readable card."""
    if not verdict:
        return "Результаты скана недоступны."
    
    lines = []
    target = verdict.get("target", "unknown")
    lines.append("Цель: " + target)
    
    findings = verdict.get("findings", [])
    if findings:
        lines.append("Найденные проблемы:")
        for f in findings[:5]:
            name = f.get("name", "unknown")
            desc = f.get("description", "")
            lines.append("• " + name + ": " + desc)
    else:
        lines.append("Проблем не выявлено.")
    
    score = verdict.get("security_score", "N/A")
    lines.append("Безопасность: " + score)
    
    return "\n".join(lines)

# Help text
HELP_TEXT = "Доступные команды:\\n/check <сайт/URL> — проверить сайт\\n/limits — оставшиеся бесплатные проверки\\n/help — справка"

NO_TARGET_TEXT = "Не удалось определить цель для скана. Используйте /check <сайт/URL>."
SCAN_FAILED_TEXT = "Скан завершился с ошибкой. Попробуйте другой сайт."

# Telegram API constants
TELEGRAM_API = "https://api.telegram.org/bot" + os.environ.get("TELEGRAM_BOT_TOKEN", "")

# Server-wide SQLite limiter
_SQLITE_DB: Optional[sqlite3.Connection] = None

def _sqlite_path() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "trustwatch.db")

def _init_db(conn: sqlite3.Connection) -> None:
    """Create the schema if it does not already exist."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS usage ("
        "user_id INTEGER NOT NULL,"
        "day TEXT NOT NULL,"
        "count INTEGER NOT NULL DEFAULT 0,"
        "PRIMARY KEY (user_id, day)"
        ")"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS meta ("
        "key TEXT PRIMARY KEY,"
        "value TEXT"
        ")"
    )
    conn.commit()

def _get_conn() -> sqlite3.Connection:
    global _SQLITE_DB
    if _SQLITE_DB is None:
        db_path = _sqlite_path()
        if not os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            _init_db(conn)
            conn.close()
        _SQLITE_DB = sqlite3.connect(db_path, timeout=10.0)
        _SQLITE_DB.execute("PRAGMA journal_mode=WAL")
        _SQLITE_DB.execute("PRAGMA busy_timeout=5000")
    return _SQLITE_DB

def _day_from_dt(dt: datetime) -> str:
    """Return YYYY-MM-DD in the project's TZ (Asia/Almaty)."""
    tz = os.environ.get("TZ", "Asia/Almaty")
    try:
        from zoneinfo import ZoneInfo
        zl = ZoneInfo(tz)
        return dt.astimezone(zl).date().isoformat()
    except Exception:
        return datetime.utcnow().date().isoformat()

def _check_limit(user_id: int) -> Tuple[bool, int, str]:
    """Check daily limit (max 5 checks per day). Returns (allowed, used, reset_text)."""
    admins = set(int(x.strip()) for x in os.environ.get("TELEGRAM_ADMIN_IDS", "").split(",") if x.strip())
    if user_id in admins:
        return True, 0, None
    day = _day_from_dt(datetime.now())
    conn = _get_conn()
    row = conn.execute(
        "SELECT count FROM usage WHERE user_id=? AND day=?", (user_id, day)
    ).fetchone()
    used = row[0] if row else 0
    if used >= 5:
        return False, used, "Лимит проверок сегодня исчерпан. Сбросьтся в 00:00 по Астанам (UTC+5)."
    conn.execute(
        "INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1)"
        " ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1",
        (user_id, day),
    )
    conn.commit()
    return True, used + 1, "Лимит проверок сегодня исчерпан. Сбросься в 00:00 по Астанам (UTC+5)."

# Telegram API helpers (direct HTTPS, no SSRF)
async def _tb_fetch(url: str, params: Optional[dict] = None, *, timeout: float = 15.0) -> Optional[dict]:
    """Minimal HTTPS GET/POST via urllib — no extra deps, no SSRF client."""
    try:
        u = urllib.parse.urljoin(TELEGRAM_API, url)
        if params:
            u += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(u, headers={"User-Agent": "TrustWatch/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return json.loads(body.decode("utf-8", "replace"))
    except Exception as e:
        logging.warning("Telegram API fetch error: %s", e)
        return None

async def _send_message(chat_id: int, text: str) -> None:
    """POST /botToken/sendMessage"""
    if not text:
        return
    await _tb_fetch(
        f"/bot{os.environ.get('TELEGRAM_BOT_TOKEN', '')}/sendMessage",
        params={"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"},
    )

# Update parsing
_IS_VALID_UPDATE = lambda u: isinstance(u, dict) and "update_id" in u and (
    "message" in u or "edited_message" in u or "channel_post" in u
)

# Command handling
_HELP = HELP_TEXT
_NO_TARGET = NO_TARGET_TEXT
_SCAN_FAILED = SCAN_FAILED_TEXT
_UNKNOWN = "Используйте /check, /limits или /start."

async def _handle_update(update: dict[str, Any]) -> None:
    """Process a single Telegram webhook update."""
    if not _IS_VALID_UPDATE(update):
        return

    message = update.get("message") or update.get("channel_post") or {}
    if not message:
        return

    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not chat_id:
        return

    user = message.get("from") or {}
    user_id = user.get("id", 0)
    text = (message.get("text") or "").strip().lower()

    # /start
    if text.startswith("/start"):
        await _send_message(chat_id, _HELP)
        return

    # /limits
    if text.startswith("/limits"):
        allowed, used, reset = _check_limit(user_id)
        if allowed:
            await _send_message(chat_id, "Осталось бесплатных проверок сегодня: " + str(used) + " из 5.")
        else:
            await _send_message(chat_id, reset)
        return

    # /check
    if text.startswith("/check"):
        target = extract_target(text)
        if target is None:
            await _send_message(chat_id, _NO_TARGET)
            return
        allowed, used, reset = _check_limit(user_id)
        if not allowed:
            await _send_message(chat_id, "Лимит проверок сегодня исчерпан. Сбросься в 00:00 по Астанам (UTC+5).")
            return
        try:
            from engine.context import ScanContext
            from engine.scanner import scan
            ctx = ScanContext(timeout=8.0)
            verdict = await scan(target, ctx)
        except Exception as exc:
            logging.warning("scan %s: %s", target, exc)
            await _send_message(chat_id, _SCAN_FAILED)
            return
        await _send_message(chat_id, verdict_card(verdict))
        return

    # Unknown command (private chat only)
    if chat.get("type") == "private":
        await _send_message(chat_id, _UNKNOWN)

# Vercel entry point
_SECRET_HEADER_NAME = "X-Telegram-Bot-Api-Secret-Token"

def _verify_secret(event: dict[str, Any]) -> bool:
    """Check the secret token sent by Telegram."""
    header = event.get("headers", {}).get(_SECRET_HEADER_NAME, "")
    return header == os.environ.get("TRUSTWATCH_WEBHOOK_SECRET", "")

def _extract_from_event(event: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Pull the update dict from a Vercel event, handling both API GW forms."""
    body = event.get("body")
    if body is None:
        return event
    try:
        return json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return None

async def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Vercel serverless entry point (async)."""
    update = _extract_from_event(event)
    if update is None:
        return {"statusCode": 400, "body": "bad request"}

    # Secret check
    if not _verify_secret(event):
        return {"statusCode": 401, "body": "forbidden"}

    # Process
    if not _IS_VALID_UPDATE(update):
        return {"statusCode": 200, "body": ""}

    await _handle_update(update)  # type: ignore

    return {"statusCode": 200, "body": ""}

handler = handler
# Optional local-run sanity check
if __name__ == "__main__":
    print("This module is meant to run as a Vercel serverless function, not directly.")
    print("To run the local bot: python3 -m bot (from the trustwatch repo)")
    print("To test the webhook handler locally, set env vars and POST a JSON body.")
