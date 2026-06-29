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
TEXT_ANIMATIONS = {"none", "fade", "slide-up", "slide-left", "zoom", "ticker", "pulse"}
TEXT_THEMES = {"midnight", "emerald", "sunset", "royal", "mono"}


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
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                filename TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                size INTEGER NOT NULL,
                source_url TEXT,
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
                notes TEXT,
                last_seen INTEGER,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
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
        media_columns = {row["name"] for row in conn.execute("PRAGMA table_info(media)").fetchall()}
        if "source_url" not in media_columns:
            conn.execute("ALTER TABLE media ADD COLUMN source_url TEXT")
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
        secure=False,
        max_age=SESSION_TTL_SECONDS,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="lax")


def require_admin(request: Request) -> str:
    username = decode_session_token(request.cookies.get(SESSION_COOKIE))
    if not username:
        raise HTTPException(401, "Please sign in")
    return username


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


@app.get("/api/auth/session")
def auth_session(request: Request) -> dict:
    username = decode_session_token(request.cookies.get(SESSION_COOKIE))
    return {
        "authenticated": bool(username),
        "username": username or ADMIN_USERNAME,
        "bootstrap_path": str(BOOTSTRAP_PATH) if BOOTSTRAP_PATH.exists() else None,
        "mfa_enabled": read_setting("mfa_enabled") == "1",
    }


@app.post("/api/auth/login")
def auth_login(
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
    otp: str = Form(""),
) -> dict:
    if username.strip() != ADMIN_USERNAME:
        raise HTTPException(401, "Invalid username or password")
    stored_password = read_setting("admin_password_hash")
    if not stored_password or not verify_password(password, stored_password):
        raise HTTPException(401, "Invalid username or password")
    mfa_enabled = read_setting("mfa_enabled") == "1"
    mfa_secret = read_setting("mfa_secret") or ""
    if mfa_enabled and not verify_totp(mfa_secret, otp):
        raise HTTPException(401, "Invalid MFA code")
    set_session_cookie(response, ADMIN_USERNAME)
    return {"ok": True, "username": ADMIN_USERNAME, "mfa_enabled": mfa_enabled}


@app.post("/api/auth/logout")
def auth_logout(response: Response, _admin: str = Depends(require_admin)) -> dict:
    clear_session_cookie(response)
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
    return {"ok": True}


@app.get("/api/dashboard")
def dashboard(_admin: str = Depends(require_admin)) -> dict:
    media = rows("SELECT * FROM media ORDER BY created_at DESC")
    playlists = rows("SELECT * FROM playlists ORDER BY created_at DESC")
    screens = rows("SELECT * FROM screens ORDER BY created_at DESC")
    for playlist in playlists:
        playlist["items"] = json.loads(playlist["items"])
        playlist["transition_modes"] = normalize_transition_modes(playlist.get("transition_modes") or json.dumps([playlist.get("transition_mode") or "fade"]))
    now = int(time.time())
    for screen in screens:
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
    return {"media": media, "playlists": playlists, "screens": screens}


@app.post("/api/media")
def upload_media(file: UploadFile = File(...), _admin: str = Depends(require_admin)) -> dict:
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
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, source_url, created_at) VALUES(?,?,?,?,?,?)",
            (file.filename or filename, filename, kind, destination.stat().st_size, None, int(time.time())),
        )
        media_id = cursor.lastrowid
    return {"id": media_id, "name": file.filename, "filename": filename, "kind": kind}


@app.post("/api/library/url")
def create_url_media(
    name: str = Form(...),
    kind: str = Form(...),
    source_url: str = Form(...),
    _admin: str = Depends(require_admin),
) -> dict:
    cleaned_kind = kind.strip().lower()
    if cleaned_kind not in URL_MEDIA_KINDS:
        raise HTTPException(400, "Unsupported source type")
    normalized_url = normalize_source_url(source_url)
    filename = f"url-{secrets.token_hex(8)}"
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, source_url, created_at) VALUES(?,?,?,?,?,?)",
            (name.strip() or cleaned_kind.title(), filename, cleaned_kind, 0, normalized_url, int(time.time())),
        )
        media_id = cursor.lastrowid
    return {"id": media_id, "name": name, "filename": filename, "kind": cleaned_kind, "source_url": normalized_url}


@app.delete("/api/media/{media_id}")
def delete_media(media_id: int, _admin: str = Depends(require_admin)) -> dict:
    result = rows("SELECT filename, source_url FROM media WHERE id=?", (media_id,))
    if not result:
        raise HTTPException(404, "Media not found")
    if not result[0]["source_url"]:
        (UPLOADS / result[0]["filename"]).unlink(missing_ok=True)
    with db() as conn:
        conn.execute("DELETE FROM media WHERE id=?", (media_id,))
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
    return {"ok": True}


@app.delete("/api/playlists/{playlist_id}")
def delete_playlist(playlist_id: int, _admin: str = Depends(require_admin)) -> dict:
    with db() as conn:
        conn.execute("UPDATE screens SET playlist_id=NULL WHERE playlist_id=?", (playlist_id,))
        cursor = conn.execute("DELETE FROM playlists WHERE id=?", (playlist_id,))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Playlist not found")
    return {"ok": True}


@app.post("/api/screens")
def create_screen(
    name: str = Form(...),
    orientation: str = Form("landscape"),
    brand: str = Form("unknown"),
    model: str = Form(""),
    runtime: str = Form("browser"),
    ip_address: str = Form(""),
    notes: str = Form(""),
    _admin: str = Depends(require_admin),
) -> dict:
    code = secrets.token_hex(3).upper()
    normalized_ip = normalize_ip_address(ip_address)
    cleaned_brand = normalize_brand(brand)
    cleaned_runtime = normalize_runtime(runtime)
    mac_address, vendor_name, cleaned_brand = auto_brand_for(normalized_ip, cleaned_brand)
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO screens(name, code, orientation, brand, model, runtime, ip_address, mac_address, vendor_name, notes, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
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
                notes.strip() or None,
                int(time.time()),
            ),
        )
    return {"id": cursor.lastrowid, "code": code}


@app.get("/api/network/discover")
def network_discover(_admin: str = Depends(require_admin)) -> dict:
    return {"devices": discover_network_devices()}


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
    return {"ok": True, "updated": len(screen_ids)}


@app.post("/api/screens/{screen_id}/assign")
def assign_playlist(screen_id: int, playlist_id: int = Form(...), _admin: str = Depends(require_admin)) -> dict:
    with db() as conn:
        conn.execute("UPDATE screens SET playlist_id=? WHERE id=?", (playlist_id, screen_id))
    return {"ok": True}


@app.post("/api/screens/stop-many")
def stop_many_screens(payload: dict, _admin: str = Depends(require_admin)) -> dict:
    screen_ids = [int(screen_id) for screen_id in payload.get("screen_ids", [])]
    if not screen_ids:
        raise HTTPException(400, "Select at least one screen")
    with db() as conn:
        conn.executemany("UPDATE screens SET playlist_id=NULL WHERE id=?", [(screen_id,) for screen_id in screen_ids])
    return {"ok": True, "updated": len(screen_ids)}


@app.post("/api/screens/{screen_id}/stop")
def stop_screen(screen_id: int, _admin: str = Depends(require_admin)) -> dict:
    with db() as conn:
        conn.execute("UPDATE screens SET playlist_id=NULL WHERE id=?", (screen_id,))
    return {"ok": True}


@app.put("/api/screens/{screen_id}")
def update_screen(
    screen_id: int,
    name: str = Form(...),
    orientation: str = Form("landscape"),
    brand: str = Form("unknown"),
    model: str = Form(""),
    runtime: str = Form("browser"),
    ip_address: str = Form(""),
    notes: str = Form(""),
    _admin: str = Depends(require_admin),
) -> dict:
    normalized_ip = normalize_ip_address(ip_address)
    cleaned_brand = normalize_brand(brand)
    cleaned_runtime = normalize_runtime(runtime)
    mac_address, vendor_name, cleaned_brand = auto_brand_for(normalized_ip, cleaned_brand)
    with db() as conn:
        cursor = conn.execute(
            "UPDATE screens SET name=?, orientation=?, brand=?, model=?, runtime=?, ip_address=?, mac_address=?, vendor_name=?, notes=? WHERE id=?",
            (
                name.strip() or "Unnamed screen",
                orientation,
                cleaned_brand,
                model.strip() or None,
                cleaned_runtime,
                normalized_ip,
                mac_address,
                vendor_name,
                notes.strip() or None,
                screen_id,
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Screen not found")
    return {"ok": True}


@app.delete("/api/screens/{screen_id}")
def delete_screen(screen_id: int, _admin: str = Depends(require_admin)) -> dict:
    with db() as conn:
        cursor = conn.execute("DELETE FROM screens WHERE id=?", (screen_id,))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Screen not found")
    return {"ok": True}


@app.get("/api/player/{code}")
def player_manifest(code: str) -> dict:
    screens = rows("SELECT * FROM screens WHERE code=?", (code.upper(),))
    if not screens:
        raise HTTPException(404, "Pairing code not found")
    screen = screens[0]
    with db() as conn:
        conn.execute("UPDATE screens SET last_seen=? WHERE id=?", (int(time.time()), screen["id"]))
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
                    items.append({**media, "duration": max(2, int(item.get("duration", 10))), "url": resolved_url})
    return {"screen": screen, "items": items, "generated_at": int(time.time()), **playlist_meta}


@app.get("/api/rss")
def rss_proxy(url: str) -> dict:
    return parse_rss_feed(normalize_source_url(url))
