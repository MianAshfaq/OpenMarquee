# OpenMarquee production guide

## Core checklist

- Use HTTPS with a valid certificate
- Put OpenMarquee behind Nginx or another reverse proxy
- Restrict firewall access to trusted admin networks
- Store secrets in environment variables, not in source files
- Keep `OPENMARQUEE_COOKIE_SECURE=1` in production
- Keep the app behind TLS before enabling secure cookies

## Health check

OpenMarquee exposes:

```text
GET /api/health
```

Use it for uptime checks and container health probes.

## Logging and rotation

- application logs are written to `logs/openmarquee.log`
- rotation is handled in-app with a rotating file handler
- keep the `logs/` directory on persistent storage in Docker

## Monitoring

Recommended monitors:

- `/api/health`
- web process availability
- disk space for `uploads/`, `data/`, and `logs/`
- reverse proxy certificate expiry

## Firewall

Typical inbound rules:

- allow `80` and `443` to the reverse proxy
- block direct public access to `8787`
- limit SSH/RDP to admin IP ranges only

## Reverse proxy

Sample Nginx config:

- `deploy/nginx/openmarquee.conf`

## Docker

Build and run:

```bash
docker compose up -d --build
```
