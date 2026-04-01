# CivicEval Governance Portal - API Specification

This document defines the REST-style API endpoints for the CivicEval Governance Portal, exposed over TLS within the local network.

## 1. Authentication
All endpoints except registration and login require a valid JWT in the `Authorization: Bearer <token>` header.

### `POST /api/auth/register`
Registers a new participant account.
- **Request**: `{ username, password }`
- **Rules**: Password must be >= 12 chars with complexity.
- **Status**: 201 Created / 400 Bad Request / 409 Conflict.

### `POST /api/auth/login`
Authenticates a user and returns an access token.
- **Request**: `{ username, password }`
- **Security**: 15-minute lockout after 5 failed attempts; flags new-device sign-ins.
- **Response**: `{ accessToken, user: { id, username, role } }`

### `POST /api/auth/logout`
Invalidates the current session.
- **Security**: Revokes the session in the database.

---

## 2. Activities & Registration

### `GET /api/activities`
Lists all non-deleted activities.

### `POST /api/activities`
Creates a new activity (Admin/Program Owner only).
- **Request**: `{ title, description, participationType, startsAt, endsAt, registrationStartAt, registrationEndAt }`
- **Validation**: Registration must close before activity starts.

### `POST /api/activities/:id/register`
Registers the authenticated user for an activity.
- **Validation**: Only during the registration window.

### `POST /api/activities/:id/checkin-code`
Generates a one-time check-in code (Admin/Program Owner only).
- **Response**: `{ code, expiresAt }`

### `POST /api/activities/:id/checkin`
Checks in a registered participant using a one-time code.
- **Request**: `{ code }`

---

## 3. Content Management (CMS)

### `GET /api/cms/content`
Lists content library items (Drafts visible to Owners/Admins, Published to all).

### `POST /api/cms/files/upload`
Uploads a media file (Admin/Program Owner only).
- **Security**: Max 250MB, approved formats only (Images/Video/PDF).
- **Response**: `{ id, hash, sizeBytes }`

### `POST /api/cms/content/:id/publish`
Changes content status to `published`.
- **Governance**: Scans for sensitive words before publishing.

### `POST /api/cms/content/:id/rollback`
Reverts content to a previous version.
- **Request**: `{ versionNumber }`

---

## 4. Evaluations

### `GET /api/evaluations/forms/:id`
Retrieves the form structure for an activity.

### `POST /api/evaluations/forms/:id/submissions`
Submits an evaluation.
- **Request**: `{ responses: [{ questionId, numericValue?, commentValue? }] }`
- **Response**: `{ receiptId }`
- **Governance**: Generates an immutable receipt ID (`EVR-...`).

---

## 5. Rankings & Analytics

### `POST /api/rankings/score`
Generates a composite score for a project (Admin/Program Owner).
- **Weights**: Benchmark, Price, Volatility (must sum to 100%).

### `POST /api/analytics/events`
Tracks participant interactions (`page_view`, `dwell`, `read_complete`).

### `GET /api/analytics/summary`
Retrieves dashboard metrics for a date range.

### `GET /api/analytics/export.csv`
Exports analytics data for audit (Admin/Program Owner).
