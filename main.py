from __future__ import annotations

import ipaddress
import json
import mimetypes
import secrets
import shutil
import sqlite3
import subprocess
import time
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
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                items TEXT NOT NULL DEFAULT '[]',
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
    if not (content_type.startswith("image/") or content_type.startswith("video/")):
        raise HTTPException(400, "This first release accepts images and videos.")
    suffix = Path(file.filename or "upload").suffix.lower()
    filename = f"{secrets.token_hex(12)}{suffix}"
    destination = UPLOADS / filename
    with destination.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    kind = "video" if content_type.startswith("video/") else "image"
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO media(name, filename, kind, size, created_at) VALUES(?,?,?,?,?)",
            (file.filename or filename, filename, kind, destination.stat().st_size, int(time.time())),
        )
        media_id = cursor.lastrowid
    return {"id": media_id, "name": file.filename, "filename": filename, "kind": kind}


@app.delete("/api/media/{media_id}")
def delete_media(media_id: int) -> dict:
    result = rows("SELECT filename FROM media WHERE id=?", (media_id,))
    if not result:
        raise HTTPException(404, "Media not found")
    (UPLOADS / result[0]["filename"]).unlink(missing_ok=True)
    with db() as conn:
        conn.execute("DELETE FROM media WHERE id=?", (media_id,))
    return {"ok": True}


@app.post("/api/playlists")
def create_playlist(name: str = Form(...), items: str = Form("[]")) -> dict:
    try:
        parsed = json.loads(items)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid playlist") from exc
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO playlists(name, items, created_at) VALUES(?,?,?)",
            (name.strip() or "Untitled playlist", json.dumps(parsed), int(time.time())),
        )
    return {"id": cursor.lastrowid}


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
    if screen["playlist_id"]:
        playlists = rows("SELECT items FROM playlists WHERE id=?", (screen["playlist_id"],))
        if playlists:
            configured = json.loads(playlists[0]["items"])
            media_lookup = {m["id"]: m for m in rows("SELECT * FROM media")}
            for item in configured:
                media = media_lookup.get(int(item["media_id"]))
                if media:
                    items.append({**media, "duration": max(2, int(item.get("duration", 10))), "url": f"/media/{media['filename']}"})
    return {"screen": screen, "items": items, "generated_at": int(time.time())}
