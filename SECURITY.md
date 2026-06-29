# Security Policy

Please report security concerns privately to the repository owner rather than
publishing an exploit in an issue.

## Current hardening

- authenticated admin APIs
- password-change flow
- optional TOTP MFA with a 10-second rotation window
- signed session cookies
- browser hardening headers and content security policy
- optional trusted host allow-list with `OPENMARQUEE_TRUSTED_HOSTS`
- configurable upload size limit with `OPENMARQUEE_MAX_UPLOAD_BYTES`

## Production guidance

- change the default admin password immediately after first login
- enable MFA for the admin account
- place OpenMarquee behind TLS if exposed outside the local network
- keep managed players on a restricted VLAN where possible
- prefer dedicated kiosk runtimes for Raspberry Pi, Android TV, Fire TV, or mini PCs
