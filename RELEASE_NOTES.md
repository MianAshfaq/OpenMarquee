# OpenMarquee 0.3.1

This reliability update replaces every obsolete installer artifact and improves Windows packaging behavior.

## Highlights

- All network scans, display detection, and Office conversion helper processes run without flashing command windows.
- The modern Windows installer displays mandatory Terms and Conditions that must be accepted before installation.
- Application and installer files include OpenMarquee product, version, publisher, and copyright metadata.
- The installer creates windowless Desktop and Start Menu shortcuts and includes standard Windows uninstallation support.
- A root-level download guide explains why compiled files are attached to GitHub Releases instead of committed to the source tree.
- The build rejects unexpected or obsolete installer formats before release.
- Microsoft Defender scanning and a published SHA-256 checksum manifest are part of the release build.
- Administrator-only shutdown, 10-minute inactivity logout, media renaming, and folder management remain included.

## Downloads

- `OpenMarquee-Setup-v0.3.1.exe`: recommended Windows installer.
- `OpenMarquee-v0.3.1-portable.zip`: extract and run `OpenMarquee.exe` without installation.

## Windows Trust

The release is built from public source and scanned before publication. The binaries are not digitally signed in this release. Windows SmartScreen reputation across all computers requires a recognized code-signing certificate.
