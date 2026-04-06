# Eaglepoint Platform

Secure baseline uses TLS gateway (`https://localhost`) and encrypted bind mounts.

## Secure Startup

1. Copy `.env.example` to `.env`.
2. Set required values: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTED_POSTGRES_PATH`, `ENCRYPTED_CMS_STORAGE_PATH`, `TLS_CERT_PATH`, `TLS_KEY_PATH`.
3. Generate dev certs:

```bash
sh ops/tls/generate-dev-cert.sh
```

4. Start stack:

```bash
docker compose up --build
```

Default URLs:

- Frontend + API: `https://localhost`
- API health: `https://localhost/api/health`

## Security Baseline Notes

- HTTP (`:80`) is redirected to HTTPS (`:443`) at the gateway.
- Backend and frontend are not directly exposed to host ports.
- Compose requires host bind mounts for DB/CMS paths and they must be encrypted host paths.

## Search and Analytics Flow

- Search endpoint: `GET /api/activities/search?q=<term>&page=<n>&limit=<n>`.
- Search route throttling: `20 requests/minute`.
- Frontend analytics events posted to `/api/analytics/events`:
  - `page_view`
  - `dwell`
  - `read_complete`
  - `search`
  - `search_click`

## Seed Admin Credentials

Admin seed is disabled by default.

Optional non-production seed:

- `ENABLE_SEED_ADMIN=true`
- `SEED_ADMIN_PASSWORD_HASH=<precomputed_hash>`

If hash is missing, seed is skipped.

## Test and Build Commands

```bash
npm test --workspace backend
npm test --workspace frontend
npm run build --workspace backend
npm run build --workspace frontend
```

## Backup and Restore Evidence

- Nightly backup schedule example: `ops/schedules/nightly-backup.cron`
- Quarterly restore drill runbook: `ops/runbooks/restore-drill.md`
- Backup implementation command: `npm run backup --workspace backend`
