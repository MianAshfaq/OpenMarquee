# OpenMarquee

OpenMarquee is a free, self-hosted digital signage platform for mixed fleets of
smart TVs, Android players, Raspberry Pi devices, and web browsers.

## Current build

- Upload images and videos
- Add YouTube, dashboards, RSS, IPTV, HTML, audio, PDF, and web URLs
- Build ordered playlists with per-item durations
- Rotate one or many transition effects across each playlist
- Full-screen and split-screen playback modes
- Pair screens using a six-character code
- Add screens manually with brand, model, runtime, IP address, and notes
- Discover visible devices on the local network and add them to the fleet
- Edit screens, delete screens, stop playback, and assign playlists to one, many, or all screens
- Full-screen web player with smoother transitions and hidden control chrome
- Screen heartbeat and online/offline monitoring
- Admin authentication with password change and optional 10-second MFA TOTP codes
- Security headers and protected admin APIs
- SQLite storage with no external cloud dependency

## Run on Windows

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

Managed player notes and Raspberry Pi autostart setup live in:

- `players/README.md`
- `players/raspberry-pi/install-kiosk.sh`
- `players/android-tv/README.md`

## Roadmap

Dedicated Android TV APK packaging, Raspberry Pi image, template designer,
advanced schedules, document-to-speech voice workflows, multilingual
administration, roles, approvals, emergency override, and bandwidth-aware media
variants.

## License

MIT. OpenMarquee is free to use, modify, and redistribute.
