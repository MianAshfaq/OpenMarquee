# OpenMarquee

OpenMarquee is a free, self-hosted digital signage platform for mixed fleets of
smart TVs, Android players, Raspberry Pi devices, and web browsers.

## Current build

- Upload images and videos
- Add YouTube, dashboards, RSS, IPTV, HTML, audio, PDF, and web URLs
- Create styled text-signage slides with backgrounds and animations
- Build ordered playlists with per-item durations
- Rotate one or many transition effects across each playlist
- Full-screen and split-screen playback modes
- Pair screens using a six-character code with 10-minute expiry before first successful pairing
- Add screens manually with brand, model, runtime, IP address, and notes
- Discover visible devices on the local network and add them to the fleet
- Organize media into folders and move assets between folders
- Edit screens, delete screens, stop playback, and assign playlists to one, many, or all screens
- Full-screen web player with smoother transitions and hidden control chrome
- Low-latency WebRTC screen sharing to one, selected, or all paired displays, with system audio when the browser provides it
- Direct local-file presentation for PowerPoint, Word, Excel, PDF, images, video, audio, and HTML; Office documents convert to PDF when Microsoft Office or LibreOffice is installed
- Windows source-monitor detection with separate source display and destination player selection
- Screen heartbeat and online/offline monitoring
- Admin authentication with password change and optional 10-second MFA TOTP codes
- Server-enforced 10-minute administrator inactivity logout
- Admin-only safe shutdown that stops live sharing and notifies connected players
- Rename media and rename or delete folders without deleting their contents
- Security headers and protected admin APIs
- Health endpoint, audit logs, and overview reports
- Docker, `.env` example, and Nginx reverse proxy sample config
- SQLite storage with no external cloud dependency

## Run on Windows

### Recommended installer

Download `OpenMarquee-Setup-v0.3.0.exe` from the latest GitHub release and run it. The installer includes the application runtime, adds OpenMarquee to the Desktop and Start Menu, and launches the local dashboard. Python is not required.

The portable `OpenMarquee-v0.3.0-portable.zip` is also available for users who do not want installation. Extract the ZIP and run `OpenMarquee.exe`. Writable data is stored under `%LOCALAPPDATA%\OpenMarquee`.

### Run from source

```powershell
./Start-OpenMarquee.ps1
```

Open `http://localhost:8787`.

Default admin login:

- Username: `admin`
- Password: `admin@123`

After the first login, change the password from the admin header. If you enable
MFA, the authenticator code rotates every 10 seconds.

To use another computer or Raspberry Pi on the same network, open:

```text
http://YOUR-PC-IP:8787/player?code=ABC123
```

Use the screen pairing code in place of `ABC123`.

The same paired code can be opened in multiple browsers or tabs. Every player receives the same assigned content, while only an authenticated administrator can stop sharing, change playback, or shut down OpenMarquee.

## Administrator controls

- The Admin Panel signs out after 10 minutes without keyboard, mouse, or touch activity.
- The header power button safely stops live sharing and shuts down OpenMarquee, not the computer.
- Restart the software from the OpenMarquee Desktop shortcut.
- Media names can be edited from each media card.
- Folder names and deletion are available from the folder-management button. Deleting a folder moves its media to Unfiled.

Managed player notes and Raspberry Pi autostart setup live in:

- `players/README.md`
- `players/raspberry-pi/install-kiosk.sh`
- `players/android-tv/README.md`

Production deployment guidance lives in:

- `PRODUCTION.md`
- `deploy/nginx/openmarquee.conf`
- `docker-compose.yml`
- `.env.example`

## Roadmap

Dedicated Android TV APK packaging, Raspberry Pi image, template designer,
advanced schedules, document-to-speech voice workflows, multilingual
administration, roles, approvals, emergency override, and bandwidth-aware media
variants.

## License

MIT. OpenMarquee is free to use, modify, and redistribute.
