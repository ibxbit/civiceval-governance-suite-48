# Frontend (Angular)

## Quick start

```bash
npm install --workspace frontend
npm run start --workspace frontend
```

App runs on `http://localhost:4200` in local dev.

## Test commands

```bash
npm test --workspace frontend
npm run build --workspace frontend
```

Integration and route-level E2E-style specs are under `frontend/src/app/**/*.spec.ts` and cover core flows end-to-end at UI/API-contract level.

## Feature coverage

- Auth: sign in and registration UI flow
- Activities: listing, search, participant registration, one-time code check-in
- Evaluations: form builder and participant submission
- Content management: draft/create/edit/publish/rollback, file upload, expiring share links
- Moderation: queue/reports actions and admin login-event review
- Rankings: weighted scoring and history table
- Analytics: summary and CSV export

## Local-only boundary

`ApiService` enforces frontend local/private-network boundary at runtime. Requests from non-local hostnames throw an error.

## Responsibilities split

The following are backend/infrastructure responsibilities. Frontend only surfaces controls and status:

- Watermarking of image/PDF asset downloads (`/api/cms/files/access/:token`)
- Expiring/signed link validation and token expiry enforcement
- Encryption at rest for DB/CMS files and backup volumes
- Immutable audit logging for exports, role changes, moderation, and policy updates
- Backup/restore drills and retention policy execution

## TODO stubs (frontend boundary)

- Show signed audit receipts in UI when backend exposes receipt endpoint.
- Display detailed watermark provenance metadata if backend returns verification metadata.
- Add full browser E2E (Playwright/Cypress) once CI test environment includes running backend+db+gateway stack.
