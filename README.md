# OpenMarquee

OpenMarquee is a free, self-hosted digital signage platform for mixed fleets of
smart TVs, Android players, Raspberry Pi devices, and web browsers.

## Current build

- Upload images and videos
- Build ordered playlists with per-item durations
- Pair screens using a six-character code
- Add screens manually with optional IP address and notes
- Discover visible devices on the local network and add them to the fleet
- Edit screens, delete screens, and assign playlists to one, many, or all screens
- Full-screen web player with offline browser caching
- Screen heartbeat and online/offline monitoring
- SQLite storage with no external cloud dependency

## Run on Windows

```powershell
./Start-OpenMarquee.ps1
```

Open `http://localhost:8787`. To use another computer or Raspberry Pi on the
same network, open `http://YOUR-PC-IP:8787/player` on that device.

## Roadmap

PDF and presentation conversion, template designer, advanced schedules,
Android TV kiosk packaging, Raspberry Pi image, multilingual administration,
roles, approvals, emergency override, and bandwidth-aware media variants.

## License

MIT. OpenMarquee is free to use, modify, and redistribute.
