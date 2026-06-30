# Windows release build

Run the release builder from PowerShell:

```powershell
./packaging/build-release.ps1
```

The build creates:

- `release/OpenMarquee-v0.3.1-portable.zip`
- `release/OpenMarquee-Setup-v0.3.1.exe`

The setup executable installs OpenMarquee under the current user's local application directory and creates Desktop and Start Menu shortcuts. The portable ZIP can be extracted and started with `OpenMarquee.exe`. Both editions store writable application data under `%LOCALAPPDATA%\OpenMarquee`.
