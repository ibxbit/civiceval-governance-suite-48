# Eaglepoint Platform

## Project Overview

CivicEval Governance Portal is a full-stack evaluation and governance system for managing activities, content workflows, moderation, scoring, and analytics.

Core features:

- Role-based access control for admins, program owners, reviewers, and participants
- Activity lifecycle, registrations, and one-time check-in flow
- Evaluation forms with immutable submission receipts
- CMS draft/publish/version rollback and private file storage
- Moderation queues, report handling, weighted rankings, and analytics exports

## Start Command

```bash
docker compose up
```

## Service Addresses

- Frontend: http://localhost:4200
- Backend API: http://localhost:3000
- PostgreSQL: localhost:5432
  - Database: `eaglepoint`
  - User: `app_user`
  - Password: `app_password`

## Role Descriptions

- `admin`: full platform access including RBAC and moderation governance
- `program_owner`: manages activities, content, rankings, analytics, and forms
- `reviewer`: reviews participant content/comments and handles moderation reports
- `participant`: registers/checks in to activities and submits evaluations

## Seeded Admin Credentials

- Username: `admin`
- Password: `Admin@12345678`

## API Endpoint Summary

| Area        | Key Endpoints                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/users/:userId/role`, `/api/auth/login-events/unrecognized` |
| Activities  | `/api/activities`, `/api/activities/:activityId`, `/api/activities/:activityId/register`, `/api/activities/:activityId/checkin`                    |
| CMS         | `/api/cms/content`, `/api/cms/content/:contentId`, `/api/cms/content/:contentId/publish`, `/api/cms/files/upload`                                  |
| Evaluations | `/api/evaluations/forms`, `/api/evaluations/forms/:formId`, `/api/evaluations/forms/:formId/submissions`                                           |
| Moderation  | `/api/moderation/comments`, `/api/moderation/reports`, `/api/moderation/reports/:reportId/handle`                                                  |
| Rankings    | `/api/rankings/score`, `/api/rankings/latest`                                                                                                      |
| Analytics   | `/api/analytics/events`, `/api/analytics/summary`, `/api/analytics/export.csv`                                                                     |

## Local Development (Without Docker)

1. Create backend env file from `backend/.env.example` and set:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `PORT`, `HOST`, `CORS_ORIGIN`
2. Start PostgreSQL locally and ensure database/user match your `DATABASE_URL`.
3. Install dependencies:

```bash
npm install --workspace backend
npm install --workspace frontend
```

4. Start backend:

```bash
npm run dev:backend
```

5. Start frontend:

```bash
npm run dev:frontend
```

## Verification Method

1. Verify containers are running:

```bash
docker compose ps
```

2. Verify backend health endpoint:

```bash
curl http://localhost:3000/api/health
```

3. Verify frontend is reachable:

```bash
curl -I http://localhost:4200
```

4. Verify PostgreSQL is accepting connections:

```bash
docker compose exec database pg_isready -U app_user -d eaglepoint
```

## Test Instructions

Official verification command from the repo root is `sh run_tests.sh` (or `npm run test:all`).

```bash
sh run_tests.sh
npm run test:all
npm test --workspace backend
npm test --workspace frontend
```

## Data Governance

- Canonical data dictionary: `database/data-dictionary.md`
- Covers all `app.*` PostgreSQL tables, field definitions, data types, and validation constraints.

## Encryption At Rest (Production)

For production, mount database and CMS storage onto encrypted host paths.

1. Enable host-level encryption (for example BitLocker on Windows or LUKS on Linux) for directories used by Docker bind mounts.
2. Replace named volumes with encrypted bind mounts in a compose override file.

Example `docker-compose.override.yml`:

```yaml
services:
  database:
    volumes:
      - /secure/eaglepoint/postgres:/var/lib/postgresql/data
      - ./database/sql:/docker-entrypoint-initdb.d:ro

  backend:
    volumes:
      - /secure/eaglepoint/cms-storage:/app/storage/private
```

This keeps PostgreSQL data and CMS file objects encrypted at rest while preserving current runtime behavior.

## Audit Retention (7 Years)

- Run `npm run backup --workspace backend` on a schedule (daily recommended).
- Script: `backend/scripts/backup.ts`
- Rolling snapshots remain in `backups/<timestamp>` for 30 days.
- Audit log archives are exported to `backups/7-year-retention/` and retained for 7 years.
