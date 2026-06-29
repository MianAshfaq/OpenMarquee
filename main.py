from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import logging
from logging.handlers import RotatingFileHandler
import mimetypes
import os
import secrets
import shutil
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
try:
    from pypdf import PdfReader
except Exception:  # noqa: BLE001
    PdfReader = None

ROOT = Path(__file__).parent
DB_PATH = ROOT / "data" / "openmarquee.db"
UPLOADS = ROOT / "uploads"
STATIC = ROOT / "static"
SECRET_PATH = ROOT / "data" / ".secret_key"
BOOTSTRAP_PATH = ROOT / "data" / "admin-bootstrap.txt"
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
UPLOADS.mkdir(exist_ok=True)
DB_PATH.parent.mkdir(exist_ok=True)

app = FastAPI(title="OpenMarquee", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/media", StaticFiles(directory=UPLOADS), name="media")
APP_STARTED_AT = int(time.time())
PING_CACHE: dict[str, tuple[int, bool]] = {}
SESSION_COOKIE = "openmarquee_session"
SESSION_TTL_SECONDS = 60 * 60 * 12
MAX_UPLOAD_BYTES = int(os.getenv("OPENMARQUEE_MAX_UPLOAD_BYTES", str(1024 * 1024 * 1024)))
ADMIN_USERNAME = os.getenv("OPENMARQUEE_ADMIN_USERNAME", "admin").strip() or "admin"
TRUSTED_HOSTS = {host.strip().lower() for host in os.getenv("OPENMARQUEE_TRUSTED_HOSTS", "").split(",") if host.strip()}
COOKIE_SECURE = os.getenv("OPENMARQUEE_COOKIE_SECURE", "0").strip().lower() in {"1", "true", "yes", "on"}
PAIRING_TTL_SECONDS = 60 * 10
URL_MEDIA_KINDS = {
    "webpage",
    "dashboard",
    "youtube",
    "rss",
    "stream",
    "iptv",
    "powerpoint",
    "excel",
    "pdf",
    "audio",
    "html",
}
DIRECT_MEDIA_KINDS = {"image", "video", "pdf", "audio", "html", "text", "countdown"}
INDUSTRY_PROFILES = {
    "retail",
    "hospital",
    "office",
    "education",
    "hotel",
    "restaurant",
    "government",
    "warehouse",
    "transport",
    "events",
}
SCREEN_BRANDS = {
    "unknown",
    "samsung",
    "lg",
    "sony",
    "hisense",
    "tcl",
    "philips",
    "panasonic",
    "sharp",
    "vizio",
    "android-tv",
    "google-tv",
    "amazon-fire-tv",
    "raspberry-pi",
    "windows",
    "chromeos",
    "other",
}
SCREEN_RUNTIMES = {
    "browser",
    "android-tv-app",
    "fire-tv-app",
    "raspberry-pi-kiosk",
    "samsung-tizen",
    "lg-webos",
    "windows-kiosk",
    "chromeos-kiosk",
}
OUI_VENDOR_MAP = {
    "00:1A:11": "Google",
    "3C:5A:B4": "Google",
    "B8:27:EB": "Raspberry Pi",
    "DC:A6:32": "Raspberry Pi",
    "E4:5F:01": "Raspberry Pi",
    "28:6A:BA": "Samsung",
    "8C:77:12": "Samsung",
    "A8:F2:74": "Samsung",
    "64:BC:0C": "LG",
    "88:C9:D0": "LG",
    "D8:BB:2C": "Sony",
    "70:26:05": "Sony",
    "9C:4E:36": "TCL",
    "D0:37:45": "Hisense",
    "50:2D:F4": "Amazon",
}
VENDOR_BRAND_MAP = {
    "google": "google-tv",
    "raspberry pi": "raspberry-pi",
    "samsung": "samsung",
    "lg": "lg",
    "sony": "sony",
    "tcl": "tcl",
    "hisense": "hisense",
    "amazon": "amazon-fire-tv",
}
TEXT_ANIMATIONS = {"none", "fade", "slide-up", "slide-left", "zoom", "ticker", "pulse", "glow", "spotlight", "bounce", "flip-in", "drift", "reveal"}
TEXT_THEMES = {"midnight", "emerald", "sunset", "royal", "mono", "aurora", "velvet", "sunrise"}
TEXT_FONTS = {"clean", "display", "editorial", "condensed", "rounded", "mono", "arabic-ui", "urdu-nastaliq"}
TEXT_ALIGNMENTS = {"left", "center", "right"}
TEXT_CASES = {"none", "uppercase", "title"}


logger = logging.getLogger("openmarquee")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(LOG_DIR / "openmarquee.log", maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)


def load_secret_key() -> str:
    if SECRET_PATH.exists():
        return SECRET_PATH.read_text(encoding="utf-8").strip()
    secret = os.getenv("OPENMARQUEE_SECRET_KEY", "").strip() or secrets.token_urlsafe(48)
    SECRET_PATH.write_text(secret, encoding="utf-8")
    return secret


SECRET_KEY = load_secret_key()


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS media_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                filename TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                size INTEGER NOT NULL,
                folder_id INTEGER,
                source_url TEXT,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                items TEXT NOT NULL DEFAULT '[]',
                layout_mode TEXT NOT NULL DEFAULT 'full',
                fit_mode TEXT NOT NULL DEFAULT 'contain',
                transition_mode TEXT NOT NULL DEFAULT 'fade',
                transition_modes TEXT NOT NULL DEFAULT '["fade"]',
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS screens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                playlist_id INTEGER,
                orientation TEXT NOT NULL DEFAULT 'landscape',
                brand TEXT NOT NULL DEFAULT 'unknown',
                model TEXT,
                runtime TEXT NOT NULL DEFAULT 'browser',
                ip_address TEXT,
                mac_address TEXT,
                vendor_name TEXT,
                profile TEXT,
                notes TEXT,
                paired_at INTEGER,
                code_expires_at INTEGER,
                last_seen INTEGER,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_name TEXT,
                details TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS player_presence (
                screen_id INTEGER NOT NULL,
                instance_id TEXT NOT NULL,
                user_agent TEXT,
                last_ip TEXT,
                last_seen INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(screen_id, instance_id)
            );
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(screens)").fetchall()}
        if "ip_address" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN ip_address TEXT")
        if "notes" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN notes TEXT")
        if "brand" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN brand TEXT NOT NULL DEFAULT 'unknown'")
        if "model" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN model TEXT")
        if "runtime" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN runtime TEXT NOT NULL DEFAULT 'browser'")
        if "mac_address" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN mac_address TEXT")
        if "vendor_name" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN vendor_name TEXT")
        if "profile" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN profile TEXT")
        if "paired_at" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN paired_at INTEGER")
        if "code_expires_at" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN code_expires_at INTEGER")
        media_columns = {row["name"] for row in conn.execute("PRAGMA table_info(media)").fetchall()}
        if "source_url" not in media_columns:
            conn.execute("ALTER TABLE media ADD COLUMN source_url TEXT")
        if "folder_id" not in media_columns:
            conn.execute("ALTER TABLE media ADD COLUMN folder_id INTEGER")
        if "metadata" not in media_columns:
            conn.execute("""ALTER TABLE media ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'""")
        playlist_columns = {row["name"] for row in conn.execute("PRAGMA table_info(playlists)").fetchall()}
        if "layout_mode" not in playlist_columns:
            conn.execute("ALTER TABLE playlists ADD COLUMN layout_mode TEXT NOT NULL DEFAULT 'full'")
        if "fit_mode" not in playlist_columns:
            conn.execute("ALTER TABLE playlists ADD COLUMN fit_mode TEXT NOT NULL DEFAULT 'contain'")
        if "transition_mode" not in playlist_columns:
            conn.execute("ALTER TABLE playlists ADD COLUMN transition_mode TEXT NOT NULL DEFAULT 'fade'")
        if "transition_modes" not in playlist_columns:
            conn.execute("""ALTER TABLE playlists ADD COLUMN transition_modes TEXT NOT NULL DEFAULT '["fade"]'""")
        password_row = conn.execute("SELECT value FROM settings WHERE key='admin_password_hash'").fetchone()
        if not password_row:
            initial_password = os.getenv("OPENMARQUEE_ADMIN_PASSWORD", "").strip() or "admin@123"
            conn.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?)",
                ("admin_password_hash", hash_password(initial_password)),
            )
            BOOTSTRAP_PATH.write_text(
                f"OpenMarquee bootstrap credentials\nusername={ADMIN_USERNAME}\npassword={initial_password}\n",
                encoding="utf-8",
            )


def rows(query: str, params: tuple = ()) -> list[dict]:
    with db() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 240000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_value: str) -> bool:
    try:
        salt, expected = stored_value.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 240000).hex()
    return hmac.compare_digest(digest, expected)


init_db()


def read_setting(key: str) -> str | None:
    with db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else None


def write_setting(key: str, value: str) -> None:
    with db() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def log_event(actor: str, action: str, target_type: str, target_name: str | None = None, details: dict | None = None) -> None:
    payload = details or {}
    logger.info("%s %s %s %s", actor, action, target_type, target_name or "")
    with db() as conn:
        conn.execute(
            "INSERT INTO activity_logs(actor, action, target_type, target_name, details, created_at) VALUES(?,?,?,?,?,?)",
            (actor, action, target_type, target_name, json.dumps(payload), int(time.time())),
        )


def issue_session_token(username: str) -> str:
    expires_at = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"{username}|{expires_at}"
    signature = hmac.new(SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{signature}".encode("utf-8")).decode("ascii")


def decode_session_token(token: str | None) -> str | None:
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        username, expires_at_raw, signature = raw.split("|", 2)
        payload = f"{username}|{expires_at_raw}"
    except Exception:  # noqa: BLE001
        return None
    expected_signature = hmac.new(SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return None
    if int(expires_at_raw) < int(time.time()):
        return None
    if username != ADMIN_USERNAME:
        return None
    return username


def set_session_cookie(response: Response, username: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        issue_session_token(username),
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=SESSION_TTL_SECONDS,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="lax")


def require_admin(request: Request) -> str:
    username = decode_session_token(request.cookies.get(SESSION_COOKIE))
    if not username:
        raise HTTPException(401, "Please sign in")
    return username


def normalize_text_animation(value: str) -> str:
    cleaned = (value or "fade").strip().lower()
    if cleaned not in TEXT_ANIMATIONS:
        raise HTTPException(400, "Invalid text animation")
    return cleaned


def normalize_text_theme(value: str) -> str:
    cleaned = (value or "midnight").strip().lower()
    if cleaned not in TEXT_THEMES:
        raise HTTPException(400, "Invalid text theme")
    return cleaned


def normalize_text_font(value: str) -> str:
    cleaned = (value or "clean").strip().lower()
    if cleaned not in TEXT_FONTS:
        raise HTTPException(400, "Invalid text font")
    return cleaned


def normalize_text_align(value: str) -> str:
    cleaned = (value or "center").strip().lower()
    if cleaned not in TEXT_ALIGNMENTS:
        raise HTTPException(400, "Invalid text alignment")
    return cleaned


def normalize_text_case(value: str) -> str:
    cleaned = (value or "none").strip().lower()
    if cleaned not in TEXT_CASES:
        raise HTTPException(400, "Invalid text case")
    return cleaned


def normalize_profile(value: str) -> str | None:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        return None
    if cleaned not in INDUSTRY_PROFILES:
        raise HTTPException(400, "Invalid industry profile")
    return cleaned


def normalize_profiles(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    for value in values:
        profile = normalize_profile(value)
        if profile and profile not in cleaned:
            cleaned.append(profile)
    return cleaned


def parse_json(raw: str | None, fallback):
    try:
        return json.loads(raw or "")
    except Exception:  # noqa: BLE001
        return fallback


def parse_pdf_page_count(path: Path) -> int:
    if PdfReader is None:
        return 1
    try:
        return max(1, len(PdfReader(str(path)).pages))
    except Exception:  # noqa: BLE001
        return 1


def read_selected_profiles() -> list[str]:
    value = read_setting("selected_profiles")
    parsed = parse_json(value, [])
    if not isinstance(parsed, list):
        return []
    return [profile for profile in parsed if profile in INDUSTRY_PROFILES]


def write_selected_profiles(profiles: list[str]) -> None:
    write_setting("selected_profiles", json.dumps(normalize_profiles(profiles)))


def remote_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "")


def make_pairing_code() -> str:
    return secrets.token_hex(3).upper()


def next_code_expiry() -> int:
    return int(time.time()) + PAIRING_TTL_SECONDS


def ensure_pairing_code(screen: dict) -> dict:
    now = int(time.time())
    if screen.get("paired_at"):
        return screen
    expires_at = int(screen.get("code_expires_at") or 0)
    if expires_at > now:
        return screen
    screen["code"] = make_pairing_code()
    screen["code_expires_at"] = next_code_expiry()
    with db() as conn:
        conn.execute("UPDATE screens SET code=?, code_expires_at=? WHERE id=?", (screen["code"], screen["code_expires_at"], screen["id"]))
    log_event("system", "regenerate", "pairing_code", screen.get("name"), {"screen_id": screen["id"]})
    return screen


def hotp_token(secret: str, counter: int, digits: int = 6) -> str:
    key = base64.b32decode(secret.upper() + "=" * ((8 - len(secret) % 8) % 8))
    message = counter.to_bytes(8, "big")
    digest = hmac.new(key, message, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = int.from_bytes(digest[offset : offset + 4], "big") & 0x7FFFFFFF
    return str(code % (10**digits)).zfill(digits)


def verify_totp(secret: str, token: str, period: int = 10, window: int = 1) -> bool:
    cleaned = (token or "").strip().replace(" ", "")
    if not cleaned.isdigit():
        return False
    counter = int(time.time() // period)
    return any(hmac.compare_digest(hotp_token(secret, counter + offset), cleaned) for offset in range(-window, window + 1))


def make_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def normalize_brand(value: str) -> str:
    cleaned = (value or "unknown").strip().lower()
    if cleaned not in SCREEN_BRANDS:
        raise HTTPException(400, "Invalid screen brand")
    return cleaned


def normalize_runtime(value: str) -> str:
    cleaned = (value or "browser").strip().lower()
    if cleaned not in SCREEN_RUNTIMES:
        raise HTTPException(400, "Invalid screen runtime")
    return cleaned


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    if TRUSTED_HOSTS:
        host = (request.url.hostname or "").lower()
        if host and host not in TRUSTED_HOSTS and host not in {"127.0.0.1", "localhost"}:
            return PlainTextResponse("Invalid host header", status_code=400)

    response = await call_next(request)
    csp = (
        "default-src 'self'; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' data: blob: https:; "
        "font-src 'self' data: https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "script-src 'self'; "
        "connect-src 'self' https:; "
        "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https:; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers["Content-Security-Policy"] = csp
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def normalize_ip_address(value: str) -> str | None:
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    try:
        return str(ipaddress.ip_address(cleaned))
    except ValueError as exc:
        raise HTTPException(400, f"Invalid IP address: {cleaned}") from exc


def screen_network_reachable(ip_address: str | None) -> tuple[bool, str]:
    if not ip_address:
        return False, "no_ip"
    try:
        normalized = str(ipaddress.ip_address(ip_address))
    except ValueError:
        return False, "invalid_ip"
    now = int(time.time())
    cached = PING_CACHE.get(normalized)
    if cached and now - cached[0] < 20:
        return cached[1], "reachable" if cached[1] else "unreachable"
    try:
        result = subprocess.run(
            ["ping", "-n", "1", "-w", "900", normalized],
            capture_output=True,
            text=True,
            check=False,
            timeout=3,
        )
        reachable = result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        reachable = False
    PING_CACHE[normalized] = (now, reachable)
    return reachable, "reachable" if reachable else "unreachable"


def lookup_arp_entry(ip_address: str | None) -> tuple[str | None, str | None]:
    if not ip_address:
        return None, None
    try:
        subprocess.run(
            ["ping", "-n", "1", "-w", "700", ip_address],
            capture_output=True,
            text=True,
            check=False,
            timeout=2,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        result = subprocess.run(["arp", "-a", ip_address], capture_output=True, text=True, check=False, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None, None
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if ip_address not in line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        mac_address = parts[1].replace("-", ":").upper()
        vendor = OUI_VENDOR_MAP.get(mac_address[:8])
        return mac_address, vendor
    return None, None


def auto_brand_for(ip_address: str | None, current_brand: str) -> tuple[str | None, str | None, str]:
    mac_address, vendor = lookup_arp_entry(ip_address)
    next_brand = current_brand
    if current_brand == "unknown" and vendor:
        next_brand = VENDOR_BRAND_MAP.get(vendor.lower(), "unknown")
    return mac_address, vendor, next_brand


def discover_network_devices() -> list[dict]:
    devices: dict[str, dict] = {}
    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, check=False, timeout=8)
    except (OSError, subprocess.TimeoutExpired):
        return []
    seen = {row["ip_address"]: row["id"] for row in rows("SELECT id, ip_address FROM screens WHERE ip_address IS NOT NULL AND TRIM(ip_address) <> ''")}
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        parts = line.split()
        if len(parts) < 3:
            continue
        ip_address = parts[0]
        mac_address = parts[1]
        if "." not in ip_address or ip_address.startswith(("224.", "239.", "255.")):
            continue
        if ip_address.endswith(".255") or mac_address.lower() == "ff-ff-ff-ff-ff-ff":
            continue
        devices[ip_address] = {
            "ip_address": ip_address,
            "mac_address": mac_address,
            "vendor_name": OUI_VENDOR_MAP.get(mac_address.replace("-", ":").upper()[:8]),
            "hostname": "",
            "already_added": ip_address in seen,
            "screen_id": seen.get(ip_address),
        }
    return sorted(devices.values(), key=lambda item: tuple(int(part) for part in item["ip_address"].split(".")))


def normalize_source_url(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(400, "Source URL is required")
    parsed = urllib.parse.urlparse(cleaned)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(400, "Only http and https URLs are supported")
    return cleaned


def normalize_layout_mode(value: str) -> str:
    cleaned = (value or "full").strip().lower()
    if cleaned not in {"full", "split-2", "split-4"}:
        raise HTTPException(400, "Invalid layout mode")
    return cleaned


def normalize_fit_mode(value: str) -> str:
    cleaned = (value or "contain").strip().lower()
    if cleaned not in {"contain", "cover"}:
        raise HTTPException(400, "Invalid fit mode")
    return cleaned


def normalize_transition_mode(value: str) -> str:
    cleaned = (value or "fade").strip().lower()
    allowed = {
        "none",
        "fade",
        "slide-left",
        "slide-right",
        "slide-up",
        "slide-down",
        "zoom-in",
        "zoom-out",
        "push",
        "wipe",
        "dissolve",
        "flip",
        "rotate",
        "cube",
        "blur",
        "crossfade",
        "split",
        "circle",
        "curtain",
        "random",
    }
    if cleaned not in allowed:
        raise HTTPException(400, "Invalid transition mode")
    return cleaned


def normalize_transition_modes(value: str) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid transition list") from exc
    if not isinstance(parsed, list):
        raise HTTPException(400, "Transition list must be an array")
    cleaned = []
    for item in parsed:
        cleaned.append(normalize_transition_mode(str(item)))
    deduped = []
    for item in cleaned:
        if item not in deduped:
            deduped.append(item)
    return deduped or ["fade"]


def parse_rss_feed(feed_url: str) -> dict:
    request = urllib.request.Request(feed_url, headers={"User-Agent": "OpenMarquee/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = response.read()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "Unable to fetch RSS feed") from exc
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise HTTPException(400, "Invalid RSS or Atom feed") from exc

    title = root.findtext("./channel/title") or root.findtext("./title") or "RSS Feed"
    entries: list[dict] = []
    for item in root.findall("./channel/item")[:8]:
        entries.append(
            {
                "title": (item.findtext("title") or "Untitled item").strip(),
                "summary": (item.findtext("description") or "").strip(),
                "link": (item.findtext("link") or "").strip(),
            }
        )
    if not entries:
        namespace = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall(".//atom:entry", namespace)[:8]:
            link_node = entry.find("atom:link", namespace)
            entries.append(
                {
                    "title": (entry.findtext("atom:title", default="", namespaces=namespace) or "Untitled item").strip(),
                    "summary": (entry.findtext("atom:summary", default="", namespaces=namespace) or entry.findtext("atom:content", default="", namespaces=namespace) or "").strip(),
                    "link": (link_node.get("href") if link_node is not None else "").strip(),
                }
            )
    return {"title": title.strip(), "items": entries}


@app.get("/")
def admin() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/player")
def player() -> FileResponse:
    return FileResponse(STATIC / "player.html")


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "app": "OpenMarquee",
        "version": app.version,
        "started_at": APP_STARTED_AT,
        "uptime_seconds": int(time.time()) - APP_STARTED_AT,
        "database": DB_PATH.exists(),
    }


@app.get("/api/auth/session")
def auth_session(request: Request) -> dict:
    username = decode_session_token(request.cookies.get(SESSION_COOKIE))
    return {
        "authenticated": bool(username),
        "username": username or ADMIN_USERNAME,
        "mfa_enabled": read_setting("mfa_enabled") == "1",
    }


@app.post("/api/auth/login")
def auth_login(
    response: Response,
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    otp: str = Form(""),
) -> dict:
    if username.strip() != ADMIN_USERNAME:
        log_event("anonymous", "failed_login", "auth", username.strip() or "unknown", {"ip": request.client.host if request.client else None})
        raise HTTPException(401, "Invalid username or password")
    stored_password = read_setting("admin_password_hash")
    if not stored_password or not verify_password(password, stored_password):
        log_event(ADMIN_USERNAME, "failed_login", "auth", ADMIN_USERNAME, {"ip": request.client.host if request.client else None})
        raise HTTPException(401, "Invalid username or password")
    mfa_enabled = read_setting("mfa_enabled") == "1"
    mfa_secret = read_setting("mfa_secret") or ""
    if mfa_enabled and not verify_totp(mfa_secret, otp):
        log_event(ADMIN_USERNAME, "failed_mfa", "auth", ADMIN_USERNAME, {"ip": request.client.host if request.client else None})
        raise HTTPException(401, "Invalid MFA code")
    set_session_cookie(response, ADMIN_USERNAME)
    log_event(ADMIN_USERNAME, "login", "auth", ADMIN_USERNAME, {"ip": request.client.host if request.client else None})
    return {"ok": True, "username": ADMIN_USERNAME, "mfa_enabled": mfa_enabled}


@app.post("/api/auth/logout")
def auth_logout(response: Response, _admin: str = Depends(require_admin)) -> dict:
    clear_session_cookie(response)
    log_event(_admin, "logout", "auth", _admin)
    return {"ok": True}


@app.post("/api/auth/password")
def auth_password_change(
    current_password: str = Form(...),
    new_password: str = Form(...),
    _admin: str = Depends(require_admin),
) -> dict:
    stored_password = read_setting("admin_password_hash")
    if not stored_password or not verify_password(current_password, stored_password):
        raise HTTPException(400, "Current password is not correct")
    if len(new_password.strip()) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    write_setting("admin_password_hash", hash_password(new_password.strip()))
    BOOTSTRAP_PATH.unlink(missing_ok=True)
    log_event(_admin, "change_password", "auth", _admin)
    return {"ok": True}


@app.post("/api/auth/mfa/setup")
def auth_mfa_setup(_admin: str = Depends(require_admin)) -> dict:
    secret = make_totp_secret()
    write_setting("mfa_secret_pending", secret)
    uri = (
        f"otpauth://totp/OpenMarquee:{urllib.parse.quote(ADMIN_USERNAME)}"
        f"?secret={secret}&issuer=OpenMarquee&algorithm=SHA1&digits=6&period=10"
    )
    return {"secret": secret, "uri": uri, "period_seconds": 10}


@app.post("/api/auth/mfa/enable")
def auth_mfa_enable(otp: str = Form(...), _admin: str = Depends(require_admin)) -> dict:
    secret = read_setting("mfa_secret_pending")
    if not secret or not verify_totp(secret, otp):
        raise HTTPException(400, "Invalid MFA code")
    write_setting("mfa_secret", secret)
    write_setting("mfa_enabled", "1")
    write_setting("mfa_secret_pending", "")
    log_event(_admin, "enable_mfa", "auth", _admin)
    return {"ok": True}


@app.post("/api/auth/mfa/disable")
def auth_mfa_disable(
    password: str = Form(...),
    otp: str = Form(""),
    _admin: str = Depends(require_admin),
) -> dict:
    stored_password = read_setting("admin_password_hash")
    if not stored_password or not verify_password(password, stored_password):
        raise HTTPException(400, "Password is not correct")
    secret = read_setting("mfa_secret") or ""
    if secret and not verify_totp(secret, otp):
        raise HTTPException(400, "Invalid MFA code")
    write_setting("mfa_enabled", "0")
    write_setting("mfa_secret", "")
    write_setting("mfa_secret_pending", "")
    log_event(_admin, "disable_mfa", "auth", _admin)
    return {"ok": True}


@app.get("/api/dashboard")
def dashboard(_admin: str = Depends(require_admin)) -> dict:
    folders = rows("SELECT * FROM media_folders ORDER BY LOWER(name)")
    media = rows("SELECT * FROM media ORDER BY created_at DESC")
    playlists = rows("SELECT * FROM playlists ORDER BY created_at DESC")
    screens = rows("SELECT * FROM screens ORDER BY created_at DESC")
    recent_logs = rows("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 30")
    presence_rows = rows("SELECT * FROM player_presence")
    presence_by_screen: dict[int, list[dict]] = {}
    now = int(time.time())
    for row in presence_rows:
        if now - int(row.get("last_seen") or 0) > 180:
            continue
        presence_by_screen.setdefault(int(row["screen_id"]), []).append(row)
    for playlist in playlists:
        playlist["items"] = json.loads(playlist["items"])
        playlist["transition_modes"] = normalize_transition_modes(playlist.get("transition_modes") or json.dumps([playlist.get("transition_mode") or "fade"]))
    folder_lookup = {folder["id"]: folder for folder in folders}
    for item in media:
        item["metadata"] = json.loads(item.get("metadata") or "{}")
        item["folder"] = folder_lookup.get(item.get("folder_id"))
    for screen in screens:
        screen = ensure_pairing_code(screen)
        screen["online"] = bool(screen["last_seen"] and now - screen["last_seen"] < 90)
        screen["player_status"] = "connected" if screen["online"] else "waiting"
        screen["player_status_label"] = "Player connected" if screen["online"] else "Player not connected"
        reachable, network_status = screen_network_reachable(screen.get("ip_address"))
        live_mac, live_vendor, auto_brand = auto_brand_for(screen.get("ip_address"), screen.get("brand") or "unknown")
        screen["mac_address"] = live_mac or screen.get("mac_address")
        screen["vendor_name"] = live_vendor or screen.get("vendor_name")
        if (screen.get("brand") or "unknown") == "unknown" and auto_brand != "unknown":
            screen["brand"] = auto_brand
        screen["reachable"] = reachable
        screen["network_status"] = network_status
        screen["network_status_label"] = {
            "reachable": "Reachable on network",
            "unreachable": "No ping response",
            "invalid_ip": "Invalid IP address",
            "no_ip": "No IP saved",
        }[network_status]
        screen["pairing_expires_in"] = max(0, int(screen.get("code_expires_at") or 0) - now) if not screen.get("paired_at") else None
        screen["connected_instances"] = len(presence_by_screen.get(int(screen["id"]), []))
        screen["profile"] = normalize_profile(screen.get("profile") or "") or None
    for entry in recent_logs:
        entry["details"] = json.loads(entry.get("details") or "{}")
    selected_profiles = read_selected_profiles()
    reports = {
        "playback": {
            "assigned_screens": sum(1 for screen in screens if screen.get("playlist_id")),
            "idle_screens": sum(1 for screen in screens if not screen.get("playlist_id")),
            "online_screens": sum(1 for screen in screens if screen.get("online")),
        },
        "devices": {
            "total": len(screens),
            "reachable": sum(1 for screen in screens if screen.get("reachable")),
            "offline": sum(1 for screen in screens if not screen.get("online")),
        },
        "content": {
            "total_media": len(media),
            "folders": len(folders),
            "text_assets": sum(1 for item in media if item.get("kind") == "text"),
            "countdowns": sum(1 for item in media if item.get("kind") == "countdown"),
            "remote_sources": sum(1 for item in media if item.get("source_url")),
        },
        "pairing": {
            "active_codes": sum(1 for screen in screens if screen.get("paired_at")),
            "live_instances": sum(screen.get("connected_instances", 0) for screen in screens),
            "single_instance_codes": sum(1 for screen in screens if screen.get("connected_instances", 0) == 1),
            "shared_codes": sum(1 for screen in screens if screen.get("connected_instances", 0) > 1),
        },
        "network": {
            "lan_ready": True,
            "cloud_ready": True,
            "internet_required_for_local_media": False,
            "internet_required_for_remote_urls": True,
        },
        "security": {
            "failed_logins": sum(1 for entry in recent_logs if entry["action"] in {"failed_login", "failed_mfa"}),
            "recent_logins": sum(1 for entry in recent_logs if entry["action"] == "login"),
        },
    }
    settings = {"selected_profiles": selected_profiles, "profiles_configured": bool(selected_profiles)}
    return {"media": media, "folders": folders, "playlists": playlists, "screens": screens, "logs": recent_logs, "reports": reports, "settings": settings}


@app.post("/api/media")
def upload_media(folder_id: int = Form(0), file: UploadFile = File(...), _admin: str = Depends(require_admin)) -> dict:
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if content_type.startswith("image/"):
        kind = "image"
    elif content_type.startswith("video/"):
        kind = "video"
    elif content_type == "application/pdf":
        kind = "pdf"
    elif content_type.startswith("audio/"):
        kind = "audio"
    elif content_type == "text/html":
        kind = "html"
    else:
        raise HTTPException(400, "Supported uploads: images, videos, PDF, audio, and HTML.")
    suffix = Path(file.filename or "upload").suffix.lower()
    filename = f"{secrets.token_hex(12)}{suffix}"
    destination = UPLOADS / filename
    with destination.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    if destination.stat().st_size > MAX_UPLOAD_BYTES:
        destination.unlink(missing_ok=True)
        raise HTTPException(400, f"File is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")
    chosen_folder_id = folder_id or None
    metadata = {}
    if kind == "pdf":
        metadata["page_count"] = parse_pdf_page_count(destination)
        metadata["slide_interval"] = 10
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, folder_id, source_url, metadata, created_at) VALUES(?,?,?,?,?,?,?,?)",
            (file.filename or filename, filename, kind, destination.stat().st_size, chosen_folder_id, None, json.dumps(metadata), int(time.time())),
        )
        media_id = cursor.lastrowid
    log_event(_admin, "upload", "media", file.filename or filename, {"media_id": media_id, "kind": kind})
    return {"id": media_id, "name": file.filename, "filename": filename, "kind": kind}


@app.post("/api/library/url")
def create_url_media(
    name: str = Form(...),
    kind: str = Form(...),
    source_url: str = Form(...),
    folder_id: int = Form(0),
    page_count: int = Form(1),
    slide_interval: int = Form(10),
    _admin: str = Depends(require_admin),
) -> dict:
    cleaned_kind = kind.strip().lower()
    if cleaned_kind not in URL_MEDIA_KINDS:
        raise HTTPException(400, "Unsupported source type")
    normalized_url = normalize_source_url(source_url)
    filename = f"url-{secrets.token_hex(8)}"
    metadata = {}
    if cleaned_kind in {"pdf", "powerpoint"}:
        metadata["page_count"] = max(1, min(500, int(page_count or 1)))
        metadata["slide_interval"] = max(2, min(300, int(slide_interval or 10)))
        metadata["office_embed"] = cleaned_kind == "powerpoint"
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, folder_id, source_url, metadata, created_at) VALUES(?,?,?,?,?,?,?,?)",
            (name.strip() or cleaned_kind.title(), filename, cleaned_kind, 0, folder_id or None, normalized_url, json.dumps(metadata), int(time.time())),
        )
        media_id = cursor.lastrowid
    log_event(_admin, "create_source", "media", name.strip() or cleaned_kind.title(), {"media_id": media_id, "kind": cleaned_kind})
    return {"id": media_id, "name": name, "filename": filename, "kind": cleaned_kind, "source_url": normalized_url}


@app.post("/api/library/text")
def create_text_media(
    name: str = Form(...),
    text: str = Form(...),
    body: str = Form(""),
    badge: str = Form(""),
    folder_id: int = Form(0),
    animation: str = Form("fade"),
    theme: str = Form("midnight"),
    font_family: str = Form("clean"),
    font_scale: int = Form(100),
    background: str = Form("#13261f"),
    foreground: str = Form("#ffffff"),
    accent: str = Form("#ffe082"),
    align: str = Form("center"),
    text_case: str = Form("none"),
    _admin: str = Depends(require_admin),
) -> dict:
    cleaned_text = text.strip()
    if not cleaned_text:
        raise HTTPException(400, "Text content is required")
    metadata = {
        "text": cleaned_text,
        "body": body.strip(),
        "badge": badge.strip(),
        "animation": normalize_text_animation(animation),
        "theme": normalize_text_theme(theme),
        "font_family": normalize_text_font(font_family),
        "font_scale": max(70, min(160, int(font_scale or 100))),
        "background": background.strip() or "#13261f",
        "foreground": foreground.strip() or "#ffffff",
        "accent": accent.strip() or "#ffe082",
        "align": normalize_text_align(align),
        "text_case": normalize_text_case(text_case),
    }
    filename = f"text-{secrets.token_hex(8)}.json"
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, folder_id, source_url, metadata, created_at) VALUES(?,?,?,?,?,?,?,?)",
            (name.strip() or "Text slide", filename, "text", len(cleaned_text.encode("utf-8")), folder_id or None, None, json.dumps(metadata), int(time.time())),
        )
        media_id = cursor.lastrowid
    log_event(_admin, "create_text", "media", name.strip() or "Text slide", {"media_id": media_id})
    return {"id": media_id, "name": name, "filename": filename, "kind": "text", "metadata": metadata}


@app.post("/api/library/countdown")
def create_countdown_media(
    name: str = Form(...),
    target_at: str = Form(...),
    badge: str = Form("Live countdown"),
    message: str = Form("The event is about to begin"),
    complete_message: str = Form("Starting now"),
    folder_id: int = Form(0),
    theme: str = Form("royal"),
    style: str = Form("flip"),
    background: str = Form("#13261f"),
    foreground: str = Form("#ffffff"),
    accent: str = Form("#7bd6ff"),
    _admin: str = Depends(require_admin),
) -> dict:
    cleaned_target = target_at.strip()
    if not cleaned_target:
        raise HTTPException(400, "Countdown target time is required")
    metadata = {
        "target_at": cleaned_target,
        "badge": badge.strip() or "Live countdown",
        "message": message.strip() or "The event is about to begin",
        "complete_message": complete_message.strip() or "Starting now",
        "theme": normalize_text_theme(theme),
        "style": (style.strip().lower() or "flip"),
        "background": background.strip() or "#13261f",
        "foreground": foreground.strip() or "#ffffff",
        "accent": accent.strip() or "#7bd6ff",
    }
    filename = f"countdown-{secrets.token_hex(8)}.json"
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, folder_id, source_url, metadata, created_at) VALUES(?,?,?,?,?,?,?,?)",
            (name.strip() or "Countdown", filename, "countdown", len(cleaned_target.encode("utf-8")), folder_id or None, None, json.dumps(metadata), int(time.time())),
        )
        media_id = cursor.lastrowid
    log_event(_admin, "create_countdown", "media", name.strip() or "Countdown", {"media_id": media_id})
    return {"id": media_id, "name": name, "filename": filename, "kind": "countdown", "metadata": metadata}


@app.put("/api/media/{media_id}/rich")
def update_rich_media(
    media_id: int,
    name: str = Form(...),
    text: str = Form(""),
    body: str = Form(""),
    badge: str = Form(""),
    target_at: str = Form(""),
    message: str = Form(""),
    complete_message: str = Form(""),
    folder_id: int = Form(0),
    animation: str = Form("fade"),
    theme: str = Form("midnight"),
    font_family: str = Form("clean"),
    font_scale: int = Form(100),
    background: str = Form("#13261f"),
    foreground: str = Form("#ffffff"),
    accent: str = Form("#ffe082"),
    align: str = Form("center"),
    text_case: str = Form("none"),
    style: str = Form("flip"),
    _admin: str = Depends(require_admin),
) -> dict:
    result = rows("SELECT kind FROM media WHERE id=?", (media_id,))
    if not result:
        raise HTTPException(404, "Media not found")
    kind = result[0]["kind"]
    if kind == "text":
        cleaned_text = text.strip()
        if not cleaned_text:
            raise HTTPException(400, "Text content is required")
        metadata = {
            "text": cleaned_text,
            "body": body.strip(),
            "badge": badge.strip(),
            "animation": normalize_text_animation(animation),
            "theme": normalize_text_theme(theme),
            "font_family": normalize_text_font(font_family),
            "font_scale": max(70, min(160, int(font_scale or 100))),
            "background": background.strip() or "#13261f",
            "foreground": foreground.strip() or "#ffffff",
            "accent": accent.strip() or "#ffe082",
            "align": normalize_text_align(align),
            "text_case": normalize_text_case(text_case),
        }
        size = len(cleaned_text.encode("utf-8"))
    elif kind == "countdown":
        cleaned_target = target_at.strip()
        if not cleaned_target:
            raise HTTPException(400, "Countdown target time is required")
        metadata = {
            "target_at": cleaned_target,
            "badge": badge.strip() or "Live countdown",
            "message": message.strip() or "The event is about to begin",
            "complete_message": complete_message.strip() or "Starting now",
            "theme": normalize_text_theme(theme),
            "style": style.strip().lower() or "flip",
            "background": background.strip() or "#13261f",
            "foreground": foreground.strip() or "#ffffff",
            "accent": accent.strip() or "#7bd6ff",
        }
        size = len(cleaned_target.encode("utf-8"))
    else:
        raise HTTPException(400, "Only text and countdown media can be edited here")
    with db() as conn:
        cursor = conn.execute(
            "UPDATE media SET name=?, folder_id=?, metadata=?, size=? WHERE id=?",
            (name.strip() or kind.title(), folder_id or None, json.dumps(metadata), size, media_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Media not found")
    log_event(_admin, "update_rich_media", "media", name.strip() or kind.title(), {"media_id": media_id, "kind": kind})
    return {"ok": True, "kind": kind, "metadata": metadata}


@app.post("/api/folders")
def create_folder(name: str = Form(...), _admin: str = Depends(require_admin)) -> dict:
    cleaned_name = name.strip()
    if not cleaned_name:
        raise HTTPException(400, "Folder name is required")
    with db() as conn:
        cursor = conn.execute("INSERT INTO media_folders(name, created_at) VALUES(?, ?)", (cleaned_name, int(time.time())))
        folder_id = cursor.lastrowid
    log_event(_admin, "create", "folder", cleaned_name, {"folder_id": folder_id})
    return {"id": folder_id, "name": cleaned_name}


@app.post("/api/settings/profiles")
def update_profiles_setting(profiles: str = Form("[]"), _admin: str = Depends(require_admin)) -> dict:
    parsed = parse_json(profiles, [])
    if not isinstance(parsed, list):
        raise HTTPException(400, "Profiles must be a JSON array")
    cleaned = normalize_profiles([str(item) for item in parsed])
    if not cleaned:
        raise HTTPException(400, "Choose at least one deployment profile")
    write_selected_profiles(cleaned)
    log_event(_admin, "update_profiles", "settings", "deployment_profiles", {"profiles": cleaned})
    return {"ok": True, "selected_profiles": cleaned}


@app.put("/api/media/{media_id}/folder")
def update_media_folder(media_id: int, folder_id: int = Form(0), _admin: str = Depends(require_admin)) -> dict:
    with db() as conn:
        cursor = conn.execute("UPDATE media SET folder_id=? WHERE id=?", (folder_id or None, media_id))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Media not found")
    log_event(_admin, "move", "media", f"media:{media_id}", {"folder_id": folder_id or None})
    return {"ok": True}


@app.delete("/api/media/{media_id}")
def delete_media(media_id: int, _admin: str = Depends(require_admin)) -> dict:
    result = rows("SELECT filename, source_url, name FROM media WHERE id=?", (media_id,))
    if not result:
        raise HTTPException(404, "Media not found")
    if not result[0]["source_url"]:
        (UPLOADS / result[0]["filename"]).unlink(missing_ok=True)
    with db() as conn:
        conn.execute("DELETE FROM media WHERE id=?", (media_id,))
    log_event(_admin, "delete", "media", result[0]["name"], {"media_id": media_id})
    return {"ok": True}


@app.post("/api/playlists")
def create_playlist(
    name: str = Form(...),
    items: str = Form("[]"),
    layout_mode: str = Form("full"),
    fit_mode: str = Form("contain"),
    transition_mode: str = Form("fade"),
    transition_modes: str = Form('["fade"]'),
    _admin: str = Depends(require_admin),
) -> dict:
    try:
        parsed = json.loads(items)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid playlist") from exc
    cleaned: list[dict] = []
    for item in parsed:
        media_id = int(item.get("media_id") or 0)
        duration = max(2, int(item.get("duration") or 10))
        if media_id:
            cleaned.append({"media_id": media_id, "duration": duration})
    if not cleaned:
        raise HTTPException(400, "Playlist needs at least one item")
    cleaned_layout = normalize_layout_mode(layout_mode)
    cleaned_fit = normalize_fit_mode(fit_mode)
    cleaned_transition = normalize_transition_mode(transition_mode)
    cleaned_transitions = normalize_transition_modes(transition_modes)
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO playlists(name, items, layout_mode, fit_mode, transition_mode, transition_modes, created_at) VALUES(?,?,?,?,?,?,?)",
            (
                name.strip() or "Untitled playlist",
                json.dumps(cleaned),
                cleaned_layout,
                cleaned_fit,
                cleaned_transition,
                json.dumps(cleaned_transitions),
                int(time.time()),
            ),
        )
    log_event(_admin, "create", "playlist", name.strip() or "Untitled playlist", {"playlist_id": cursor.lastrowid, "items": len(cleaned)})
    return {"id": cursor.lastrowid}


@app.put("/api/playlists/{playlist_id}")
def update_playlist(
    playlist_id: int,
    name: str = Form(...),
    items: str = Form("[]"),
    layout_mode: str = Form("full"),
    fit_mode: str = Form("contain"),
    transition_mode: str = Form("fade"),
    transition_modes: str = Form('["fade"]'),
    _admin: str = Depends(require_admin),
) -> dict:
    try:
        parsed = json.loads(items)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid playlist") from exc
    cleaned_layout = normalize_layout_mode(layout_mode)
    cleaned_fit = normalize_fit_mode(fit_mode)
    cleaned_transition = normalize_transition_mode(transition_mode)
    cleaned_transitions = normalize_transition_modes(transition_modes)
    cleaned: list[dict] = []
    for item in parsed:
        media_id = int(item.get("media_id") or 0)
        duration = max(2, int(item.get("duration") or 10))
        if media_id:
            cleaned.append({"media_id": media_id, "duration": duration})
    if not cleaned:
        raise HTTPException(400, "Playlist needs at least one item")
    with db() as conn:
        cursor = conn.execute(
            "UPDATE playlists SET name=?, items=?, layout_mode=?, fit_mode=?, transition_mode=?, transition_modes=? WHERE id=?",
            (
                name.strip() or "Untitled playlist",
                json.dumps(cleaned),
                cleaned_layout,
                cleaned_fit,
                cleaned_transition,
                json.dumps(cleaned_transitions),
                playlist_id,
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Playlist not found")
    log_event(_admin, "update", "playlist", name.strip() or "Untitled playlist", {"playlist_id": playlist_id, "items": len(cleaned)})
    return {"ok": True}


@app.delete("/api/playlists/{playlist_id}")
def delete_playlist(playlist_id: int, _admin: str = Depends(require_admin)) -> dict:
    playlist_rows = rows("SELECT name FROM playlists WHERE id=?", (playlist_id,))
    if not playlist_rows:
        raise HTTPException(404, "Playlist not found")
    with db() as conn:
        conn.execute("UPDATE screens SET playlist_id=NULL WHERE playlist_id=?", (playlist_id,))
        cursor = conn.execute("DELETE FROM playlists WHERE id=?", (playlist_id,))
    log_event(_admin, "delete", "playlist", playlist_rows[0]["name"], {"playlist_id": playlist_id})
    return {"ok": True}


@app.post("/api/screens")
def create_screen(
    name: str = Form(...),
    orientation: str = Form("landscape"),
    brand: str = Form("unknown"),
    model: str = Form(""),
    runtime: str = Form("browser"),
    profile: str = Form(""),
    ip_address: str = Form(""),
    notes: str = Form(""),
    _admin: str = Depends(require_admin),
) -> dict:
    code = secrets.token_hex(3).upper()
    normalized_ip = normalize_ip_address(ip_address)
    cleaned_brand = normalize_brand(brand)
    cleaned_runtime = normalize_runtime(runtime)
    cleaned_profile = normalize_profile(profile)
    mac_address, vendor_name, cleaned_brand = auto_brand_for(normalized_ip, cleaned_brand)
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO screens(name, code, orientation, brand, model, runtime, ip_address, mac_address, vendor_name, profile, notes, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                name.strip() or "New screen",
                code,
                orientation,
                cleaned_brand,
                model.strip() or None,
                cleaned_runtime,
                normalized_ip,
                mac_address,
                vendor_name,
                cleaned_profile,
                notes.strip() or None,
                int(time.time()),
            ),
        )
        conn.execute("UPDATE screens SET code_expires_at=? WHERE id=?", (next_code_expiry(), cursor.lastrowid))
    log_event(_admin, "create", "screen", name.strip() or "New screen", {"screen_id": cursor.lastrowid})
    return {"id": cursor.lastrowid, "code": code}


@app.get("/api/network/discover")
def network_discover(_admin: str = Depends(require_admin)) -> dict:
    return {"devices": discover_network_devices()}


@app.post("/api/screens/{screen_id}/regenerate-code")
def regenerate_pairing_code(screen_id: int, _admin: str = Depends(require_admin)) -> dict:
    next_code = make_pairing_code()
    expires_at = next_code_expiry()
    with db() as conn:
        conn.execute("DELETE FROM player_presence WHERE screen_id=?", (screen_id,))
        cursor = conn.execute("UPDATE screens SET code=?, paired_at=NULL, code_expires_at=? WHERE id=?", (next_code, expires_at, screen_id))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Screen not found")
    log_event(_admin, "regenerate", "pairing_code", f"screen:{screen_id}", {"screen_id": screen_id})
    return {"ok": True, "code": next_code, "expires_at": expires_at}


@app.post("/api/screens/assign-many")
def assign_many_screens(payload: dict, _admin: str = Depends(require_admin)) -> dict:
    screen_ids = [int(screen_id) for screen_id in payload.get("screen_ids", [])]
    playlist_id = int(payload.get("playlist_id") or 0)
    if not screen_ids:
        raise HTTPException(400, "Select at least one screen")
    if not playlist_id:
        raise HTTPException(400, "Choose a playlist")
    with db() as conn:
        conn.executemany(
            "UPDATE screens SET playlist_id=? WHERE id=?",
            [(playlist_id, screen_id) for screen_id in screen_ids],
        )
    log_event(_admin, "assign_many", "screen", f"{len(screen_ids)} screens", {"playlist_id": playlist_id, "screen_ids": screen_ids})
    return {"ok": True, "updated": len(screen_ids)}


@app.post("/api/screens/{screen_id}/assign")
def assign_playlist(screen_id: int, playlist_id: int = Form(...), _admin: str = Depends(require_admin)) -> dict:
    with db() as conn:
        conn.execute("UPDATE screens SET playlist_id=? WHERE id=?", (playlist_id, screen_id))
    log_event(_admin, "assign", "screen", f"screen:{screen_id}", {"playlist_id": playlist_id})
    return {"ok": True}


@app.post("/api/screens/stop-many")
def stop_many_screens(payload: dict, _admin: str = Depends(require_admin)) -> dict:
    screen_ids = [int(screen_id) for screen_id in payload.get("screen_ids", [])]
    if not screen_ids:
        raise HTTPException(400, "Select at least one screen")
    with db() as conn:
        conn.executemany("UPDATE screens SET playlist_id=NULL WHERE id=?", [(screen_id,) for screen_id in screen_ids])
    log_event(_admin, "stop_many", "screen", f"{len(screen_ids)} screens", {"screen_ids": screen_ids})
    return {"ok": True, "updated": len(screen_ids)}


@app.post("/api/screens/{screen_id}/stop")
def stop_screen(screen_id: int, _admin: str = Depends(require_admin)) -> dict:
    with db() as conn:
        conn.execute("UPDATE screens SET playlist_id=NULL WHERE id=?", (screen_id,))
    log_event(_admin, "stop", "screen", f"screen:{screen_id}", {"screen_id": screen_id})
    return {"ok": True}


@app.put("/api/screens/{screen_id}")
def update_screen(
    screen_id: int,
    name: str = Form(...),
    orientation: str = Form("landscape"),
    brand: str = Form("unknown"),
    model: str = Form(""),
    runtime: str = Form("browser"),
    profile: str = Form(""),
    ip_address: str = Form(""),
    notes: str = Form(""),
    _admin: str = Depends(require_admin),
) -> dict:
    normalized_ip = normalize_ip_address(ip_address)
    cleaned_brand = normalize_brand(brand)
    cleaned_runtime = normalize_runtime(runtime)
    cleaned_profile = normalize_profile(profile)
    mac_address, vendor_name, cleaned_brand = auto_brand_for(normalized_ip, cleaned_brand)
    with db() as conn:
        cursor = conn.execute(
            "UPDATE screens SET name=?, orientation=?, brand=?, model=?, runtime=?, ip_address=?, mac_address=?, vendor_name=?, profile=?, notes=? WHERE id=?",
            (
                name.strip() or "Unnamed screen",
                orientation,
                cleaned_brand,
                model.strip() or None,
                cleaned_runtime,
                normalized_ip,
                mac_address,
                vendor_name,
                cleaned_profile,
                notes.strip() or None,
                screen_id,
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Screen not found")
    log_event(_admin, "update", "screen", name.strip() or "Unnamed screen", {"screen_id": screen_id})
    return {"ok": True}


@app.delete("/api/screens/{screen_id}")
def delete_screen(screen_id: int, _admin: str = Depends(require_admin)) -> dict:
    screen_rows = rows("SELECT name FROM screens WHERE id=?", (screen_id,))
    if not screen_rows:
        raise HTTPException(404, "Screen not found")
    with db() as conn:
        conn.execute("DELETE FROM player_presence WHERE screen_id=?", (screen_id,))
        cursor = conn.execute("DELETE FROM screens WHERE id=?", (screen_id,))
    log_event(_admin, "delete", "screen", screen_rows[0]["name"], {"screen_id": screen_id})
    return {"ok": True}


@app.get("/api/player/{code}")
def player_manifest(request: Request, code: str, instance: str = "") -> dict:
    screens = rows("SELECT * FROM screens WHERE code=?", (code.upper(),))
    if not screens:
        raise HTTPException(404, "Pairing code not found")
    screen = screens[0]
    now = int(time.time())
    if not screen.get("paired_at") and int(screen.get("code_expires_at") or 0) < now:
        screen = ensure_pairing_code(screen)
        raise HTTPException(410, "Pairing code expired. Refresh the pairing code from the admin panel.")
    with db() as conn:
        if not screen.get("paired_at"):
            conn.execute("UPDATE screens SET last_seen=?, paired_at=? WHERE id=?", (now, now, screen["id"]))
            screen["paired_at"] = now
        else:
            conn.execute("UPDATE screens SET last_seen=? WHERE id=?", (now, screen["id"]))
        cleaned_instance = (instance or "").strip()[:80]
        if cleaned_instance:
            conn.execute(
                """
                INSERT INTO player_presence(screen_id, instance_id, user_agent, last_ip, last_seen, created_at)
                VALUES(?,?,?,?,?,?)
                ON CONFLICT(screen_id, instance_id) DO UPDATE SET
                    user_agent=excluded.user_agent,
                    last_ip=excluded.last_ip,
                    last_seen=excluded.last_seen
                """,
                (
                    screen["id"],
                    cleaned_instance,
                    (request.headers.get("user-agent") or "")[:400],
                    remote_ip(request)[:80],
                    now,
                    now,
                ),
            )
    items: list[dict] = []
    playlist_meta = {"layout_mode": "full", "fit_mode": "contain", "transition_mode": "fade", "transition_modes": ["fade"]}
    if screen["playlist_id"]:
        playlists = rows("SELECT items, layout_mode, fit_mode, transition_mode, transition_modes FROM playlists WHERE id=?", (screen["playlist_id"],))
        if playlists:
            transition_modes_raw = playlists[0].get("transition_modes") or json.dumps([playlists[0].get("transition_mode") or "fade"])
            transition_modes = normalize_transition_modes(transition_modes_raw)
            playlist_meta = {
                "layout_mode": normalize_layout_mode(playlists[0].get("layout_mode") or "full"),
                "fit_mode": normalize_fit_mode(playlists[0].get("fit_mode") or "contain"),
                "transition_mode": transition_modes[0],
                "transition_modes": transition_modes,
            }
            configured = json.loads(playlists[0]["items"])
            media_lookup = {m["id"]: m for m in rows("SELECT * FROM media")}
            for item in configured:
                media = media_lookup.get(int(item["media_id"]))
                if media:
                    resolved_url = media["source_url"] or f"/media/{media['filename']}"
                    items.append({
                        **media,
                        "metadata": json.loads(media.get("metadata") or "{}"),
                        "duration": max(2, int(item.get("duration", 10))),
                        "url": resolved_url,
                    })
    return {"screen": screen, "items": items, "generated_at": now, **playlist_meta}


@app.get("/api/rss")
def rss_proxy(url: str) -> dict:
    return parse_rss_feed(normalize_source_url(url))
