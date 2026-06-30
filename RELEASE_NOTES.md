# OpenMarquee 0.3.2

This update fixes text-ad creation from the Media Library.

## Fixes

- The Create text ad button now opens a new campaign instead of incorrectly treating the click event as an existing media record.
- Text ads can be created with a blank slide name and automatically use the name `Text slide`.
- Existing text campaigns can be saved after their name is cleared.
- Structured API validation errors now display readable field messages instead of `[object Object]`.
- Text create and edit flows were verified through both the API and the actual Media Library dialog.

## Downloads

- `OpenMarquee-Setup-v0.3.2.exe`: recommended Windows installer.
- `OpenMarquee-v0.3.2-portable.zip`: extract and run `OpenMarquee.exe` without installation.

The release build is scanned with Microsoft Defender and includes `SHA256SUMS.txt`. The binaries are not digitally signed; broad Windows SmartScreen reputation requires a recognized code-signing certificate.
