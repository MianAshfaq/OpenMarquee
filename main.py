from __future__ import annotations

import ipaddress
import json
import mimetypes
import secrets
import shutil
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).parent
DB_PATH = ROOT / "data" / "openmarquee.db"
UPLOADS = ROOT / "uploads"
STATIC = ROOT / "static"
UPLOADS.mkdir(exist_ok=True)
DB_PATH.parent.mkdir(exist_ok=True)

app = FastAPI(title="OpenMarquee", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/media", StaticFiles(directory=UPLOADS), name="media")
PING_CACHE: dict[str, tuple[int, bool]] = {}
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
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS screens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                playlist_id INTEGER,
                orientation TEXT NOT NULL DEFAULT 'landscape',
                ip_address TEXT,
                notes TEXT,
                last_seen INTEGER,
                created_at INTEGER NOT NULL
            );
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(screens)").fetchall()}
        if "ip_address" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN ip_address TEXT")
        if "notes" not in columns:
            conn.execute("ALTER TABLE screens ADD COLUMN notes TEXT")
        media_columns = {row["name"] for row in conn.execute("PRAGMA table_info(media)").fetchall()}
        if "source_url" not in media_columns:
            conn.execute("ALTER TABLE media ADD COLUMN source_url TEXT")
        playlist_columns = {row["name"] for row in conn.execute("PRAGMA table_info(playlists)").fetchall()}
        if "layout_mode" not in playlist_columns:
            conn.execute("ALTER TABLE playlists ADD COLUMN layout_mode TEXT NOT NULL DEFAULT 'full'")
        if "fit_mode" not in playlist_columns:
            conn.execute("ALTER TABLE playlists ADD COLUMN fit_mode TEXT NOT NULL DEFAULT 'contain'")


init_db()


def rows(query: str, params: tuple = ()) -> list[dict]:
    with db() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


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


@app.get("/api/dashboard")
def dashboard() -> dict:
    media = rows("SELECT * FROM media ORDER BY created_at DESC")
    playlists = rows("SELECT * FROM playlists ORDER BY created_at DESC")
    screens = rows("SELECT * FROM screens ORDER BY created_at DESC")
    for playlist in playlists:
        playlist["items"] = json.loads(playlist["items"])
    now = int(time.time())
    for screen in screens:
        screen["online"] = bool(screen["last_seen"] and now - screen["last_seen"] < 90)
        screen["player_status"] = "connected" if screen["online"] else "waiting"
        screen["player_status_label"] = "Player connected" if screen["online"] else "Player not connected"
        reachable, network_status = screen_network_reachable(screen.get("ip_address"))
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
def upload_media(file: UploadFile = File(...)) -> dict:
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
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, source_url, created_at) VALUES(?,?,?,?,?,?)",
            (file.filename or filename, filename, kind, destination.stat().st_size, None, int(time.time())),
        )
        media_id = cursor.lastrowid
    return {"id": media_id, "name": file.filename, "filename": filename, "kind": kind}


@app.post("/api/library/url")
def create_url_media(name: str = Form(...), kind: str = Form(...), source_url: str = Form(...)) -> dict:
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
def delete_media(media_id: int) -> dict:
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
) -> dict:
    try:
        parsed = json.loads(items)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid playlist") from exc
    cleaned_layout = normalize_layout_mode(layout_mode)
    cleaned_fit = normalize_fit_mode(fit_mode)
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO playlists(name, items, layout_mode, fit_mode, created_at) VALUES(?,?,?,?,?)",
            (name.strip() or "Untitled playlist", json.dumps(parsed), cleaned_layout, cleaned_fit, int(time.time())),
        )
    return {"id": cursor.lastrowid}


@app.put("/api/playlists/{playlist_id}")
def update_playlist(
    playlist_id: int,
    name: str = Form(...),
    items: str = Form("[]"),
    layout_mode: str = Form("full"),
    fit_mode: str = Form("contain"),
) -> dict:
    try:
        parsed = json.loads(items)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid playlist") from exc
    cleaned_layout = normalize_layout_mode(layout_mode)
    cleaned_fit = normalize_fit_mode(fit_mode)
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
            "UPDATE playlists SET name=?, items=?, layout_mode=?, fit_mode=? WHERE id=?",
            (name.strip() or "Untitled playlist", json.dumps(cleaned), cleaned_layout, cleaned_fit, playlist_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Playlist not found")
    return {"ok": True}


@app.post("/api/screens")
def create_screen(
    name: str = Form(...),
    orientation: str = Form("landscape"),
    ip_address: str = Form(""),
    notes: str = Form(""),
) -> dict:
    code = secrets.token_hex(3).upper()
    normalized_ip = normalize_ip_address(ip_address)
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO screens(name, code, orientation, ip_address, notes, created_at) VALUES(?,?,?,?,?,?)",
            (
                name.strip() or "New screen",
                code,
                orientation,
                normalized_ip,
                notes.strip() or None,
                int(time.time()),
            ),
        )
    return {"id": cursor.lastrowid, "code": code}


@app.get("/api/network/discover")
def network_discover() -> dict:
    return {"devices": discover_network_devices()}


@app.post("/api/screens/assign-many")
def assign_many_screens(payload: dict) -> dict:
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
def assign_playlist(screen_id: int, playlist_id: int = Form(...)) -> dict:
    with db() as conn:
        conn.execute("UPDATE screens SET playlist_id=? WHERE id=?", (playlist_id, screen_id))
    return {"ok": True}


@app.put("/api/screens/{screen_id}")
def update_screen(
    screen_id: int,
    name: str = Form(...),
    orientation: str = Form("landscape"),
    ip_address: str = Form(""),
    notes: str = Form(""),
) -> dict:
    normalized_ip = normalize_ip_address(ip_address)
    with db() as conn:
        cursor = conn.execute(
            "UPDATE screens SET name=?, orientation=?, ip_address=?, notes=? WHERE id=?",
            (name.strip() or "Unnamed screen", orientation, normalized_ip, notes.strip() or None, screen_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Screen not found")
    return {"ok": True}


@app.delete("/api/screens/{screen_id}")
def delete_screen(screen_id: int) -> dict:
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
    playlist_meta = {"layout_mode": "full", "fit_mode": "contain"}
    if screen["playlist_id"]:
        playlists = rows("SELECT items, layout_mode, fit_mode FROM playlists WHERE id=?", (screen["playlist_id"],))
        if playlists:
            playlist_meta = {
                "layout_mode": normalize_layout_mode(playlists[0].get("layout_mode") or "full"),
                "fit_mode": normalize_fit_mode(playlists[0].get("fit_mode") or "contain"),
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
