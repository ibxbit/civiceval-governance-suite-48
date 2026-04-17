# fullstack

## Overview

This repository contains a fullstack civic governance application with:

- a backend API
- a frontend web application
- end-to-end browser tests

## Startup Instructions

Use Docker to start the system:

```bash
docker-compose up
```

Current secure development stack also uses:

```bash
docker compose up --build
```

## Access Method

- Frontend URL: `https://localhost`
- API base URL: `https://localhost/api`
- Health endpoint: `https://localhost/api/health`
- Login page: `https://localhost/login`

## Verification Method

### API Verification

Verify the API is up:

```bash
curl -k https://localhost/api/health
```

Expected result: JSON response containing `status`, `timestamp`, and `environment`.

If seeded credentials are enabled, verify authentication with Postman or curl by logging in at:

- `POST https://localhost/api/auth/login`

### Web Verification

Verify the web application by completing this flow:

1. Open `https://localhost/login`.
2. Sign in with a seeded account.
3. Confirm redirect to `/activities`.
4. Confirm the Activities page heading is visible.
5. Open other role-allowed pages such as `/content-library`, `/moderation`, `/rankings`, or `/evaluations/builder` based on the account role.

## Environment Rules

Use Docker-contained services for runtime infrastructure.

Required configuration values are read from `.env`:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ENCRYPTED_POSTGRES_PATH`
- `ENCRYPTED_CMS_STORAGE_PATH`
- `TLS_CERT_PATH`
- `TLS_KEY_PATH`

Development TLS certificate generation currently uses:

```bash
sh ops/tls/generate-dev-cert.sh
```

## Authentication

Authentication is required.

Default seeded credentials are not enabled automatically.

Optional non-production admin seed configuration:

- `ENABLE_SEED_ADMIN=true`
- `SEED_ADMIN_PASSWORD_HASH=<precomputed_hash>`

Available roles in the application:

- `participant`
- `reviewer`
- `program_owner`
- `admin`

Demo credentials are only available when you explicitly seed them.

If you enable seeding, document the seeded username/email and password for each role before handing the repository to a reviewer.

## Testing Instructions

Current repository test commands:

```bash
./run_tests.sh
```

Additional workspace commands:

```bash
npm test --workspace backend
npm test --workspace frontend
```

## Build Instructions

```bash
npm run build --workspace backend
npm run build --workspace frontend
```

## Tech Stack

- Backend: Node.js, Fastify, PostgreSQL
- Frontend: Angular
- Unit/API testing: Vitest, Jasmine, Karma
- E2E testing: Playwright
- Container orchestration: Docker Compose

## Architecture

- `backend/`: API routes, auth, analytics, CMS, evaluations, moderation, rankings
- `frontend/`: Angular web application
- `e2e/`: Playwright fullstack tests
- `ops/`: operational scripts, TLS helpers, schedules, and runbooks

## Security Notes

- HTTP traffic is redirected to HTTPS at the gateway.
- Backend and frontend are not directly exposed to host ports.
- Database and CMS storage paths are intended to use encrypted host bind mounts.

## Backup and Restore Evidence

- Nightly backup schedule example: `ops/schedules/nightly-backup.cron`
- Quarterly restore drill runbook: `ops/runbooks/restore-drill.md`
- Backup implementation command: `npm run backup --workspace backend`
