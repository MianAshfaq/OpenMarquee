# Download OpenMarquee

Compiled applications are published under GitHub Releases rather than committed to the source-code tree.

## Windows

- [Recommended installer](https://github.com/MianAshfaq/OpenMarquee/releases/latest/download/OpenMarquee-Setup-v0.3.2.exe)
- [Portable ZIP](https://github.com/MianAshfaq/OpenMarquee/releases/latest/download/OpenMarquee-v0.3.2-portable.zip)
- [SHA-256 checksums](https://github.com/MianAshfaq/OpenMarquee/releases/latest/download/SHA256SUMS.txt)
- [Release page](https://github.com/MianAshfaq/OpenMarquee/releases/latest)

The installer includes OpenMarquee and its Python runtime, presents the Terms and Conditions for acceptance, creates Desktop and Start Menu shortcuts, and supports standard Windows uninstallation. The portable ZIP must be extracted before `OpenMarquee.exe` is started.

The `release` directory is intentionally excluded from source control because it contains generated binary files. Release downloads are attached to the GitHub release so users receive versioned files with published SHA-256 digests.

The release build runs Microsoft Defender against the installer and portable archive. Windows may still display a SmartScreen warning because the project does not yet have a commercial publisher code-signing certificate.
