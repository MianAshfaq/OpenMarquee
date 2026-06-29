# Managed players

OpenMarquee works best in production when each screen runs a managed player that
auto-starts, auto-pairs, and reconnects by itself.

## Recommended runtimes

- `Raspberry Pi kiosk`: best universal low-cost player
- `Android TV / Google TV / Fire TV app wrapper`: best for consumer smart TVs
- `Windows kiosk`: good for mini PCs and commercial signage controllers

## Auto-pair URL pattern

Each screen can use its own player URL:

```text
http://YOUR-SERVER-IP:8787/player?code=ABC123
```

Once the runtime is configured to open that URL at boot, the admin only needs
to assign or stop playlists from the dashboard. No manual browser opening is
needed after setup.
