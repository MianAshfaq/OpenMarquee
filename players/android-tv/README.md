# Android TV runtime

OpenMarquee can run well on Android TV, Google TV, and Fire TV by packaging the
player inside a small WebView launcher app that opens:

```text
http://YOUR-SERVER-IP:8787/player?code=ABC123
```

## Production notes

- enable boot launch in the wrapper app
- keep the screen awake while charging or on AC power
- allow autoplay in the WebView / Chromium runtime
- use the per-screen pairing code URL so the device reconnects automatically

The current OpenMarquee web player is ready for this runtime model. The next
step is packaging the dedicated Android TV APK around the same player URL.
