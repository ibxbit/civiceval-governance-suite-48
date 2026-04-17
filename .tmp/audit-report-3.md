# CivicEval Governance Portal - Static Architecture Audit Report

**Date:** April 6, 2026
**Verdict: PASS**

---

## 1. Verdict
The CivicEval Governance Portal is a **highly credible, professional 0-to-1 deliverable**. The implementation is robust, security-first, and shows an excellent understanding of "offline-first, on-premise" democratic governance requirements.

- **Status:** PASS
- **Confidence:** High (Evidenced by code-level implementation of all core functional and security requirements).

---

## 2. Scope and Static Verification Boundary

### What was reviewed:
- **Backend (Fastify/TypeScript):** Authentication, RBAC, Rate-limiting, Nonce-guard, CMS, Activities, Analytics, Rankings.
- **Frontend (Angular):** Routes, Guards, Layout, Key component mapping.
- **Infrastructure:** Docker Compose, Nginx (TLS), Backup scripts.
- **Testing:** Unit tests, API integration tests.

### What was not reviewed:
- Runtime behavior, live network access, database performance.
- Final visual polish (aesthetic opinion).

---

## 3. Repository / Requirement Mapping Summary

| Requirement | Implementation Evidence | Status |
| :--- | :--- | :--- |
| **RBAC Roles** | `backend:src/middleware/role.ts`, `frontend:src/app/guards/role.guard` | Pass |
| **Activity Life-cycle** | `backend:src/routes/activities.ts` (Windows, Check-in) | Pass |
| **CMS Watermarking** | `backend:src/routes/cms.ts` (PDF/Image) | Pass |
| **Composite Rank** | `backend:src/routes/moderation-ranking.ts` (Weighted scoring) | Pass |
| **Analytics CSV** | `backend:src/routes/analytics.ts` | Pass |
| **Anti-Replay** | `backend:src/middleware/nonce.ts` (60s skew) | Pass |
| **Encryption/Backup** | `docker-compose.yml`, `backend:scripts/backup.ts` | Pass |

---

## 4. Section-by-section Review

### 4.1. Documentation and Static Verifiability
- **Conclusion: PASS**
- **Rationale:** README and ops/runbooks provide clear instructions for setup, backup, and restore.
- **Evidence:** `repo/README.md`, `repo/ops/runbooks/restore-drill.md`.

### 4.2. Prompt Alignment
- **Conclusion: PASS**
- **Rationale:** All business goals (4 roles, activities, CMS, ranking, analytics) are explicitly identified and implemented.
- **Evidence:** `repo/backend/src/routes`.

### 4.3. Engineering and Architecture Quality
- **Conclusion: PASS**
- **Rationale:** Clear separation of concerns (Middleware, Routes, Security utils). Consistent use of `zod` for validation.
- **Evidence:** `repo/backend/src/middleware`, `repo/backend/src/security`.

---

## 5. Issues / Suggestions (Severity-Rated)

### [MEDIUM] Frontend vs Backend Validation Sync
- **Finding:** Backend requires 12-char passwords, but frontend components like `login-page.component.ts` only check `Validators.required`.
- **Evidence:** `backend/src/routes/auth.ts:94` vs `frontend/src/app/pages/login-page.component.ts`.
- **Impact:** UX friction: users might submit short passwords and receive a 400 error.
- **Fix:** Sync `Validators.minLength(12)` in frontend components.

### [LOW] In-Memory Nonce Store
- **Finding:** `nonceStore` is an in-memory `Map`.
- **Evidence:** `backend/src/middleware/nonce.ts:6`.
- **Impact:** Nonce persistence won't survive a restart or horizontal scaling (though scaling is unlikely in on-premise local setup).
- **Fix:** Optional move to shared cache (e.g., Redis) or DB table with TTL if scaling is needed.

---

## 6. Security Review Summary

| Security Entry Point | Conclusion | Evidence / Rationale |
| :--- | :--- | :--- |
| **Authentication** | Pass | 12-char complexity, scrypt hashing, 15m lockout, 30m expire. `auth.ts:591` |
| **Route Authorization** | Pass | `roleGuard` applied consistently in `auth.ts`, `activities.ts`, `cms.ts`. |
| **Object Authorization** | Pass | Content/Activity lookups use ID parsing and status checks. `activities.ts:270` |
| **Anti-Replay** | Pass | `nonceGuard` enforces 60s skew and unique nonces. `nonce.ts:33` |
| **Data Isolation** | Pass | Bind mounts for encrypted host paths. TLS enforced in Nginx. `docker-compose.yml`. |

---

## 7. Tests and Logging Review
- **Unit Tests:** Verified for Nonce and Password complexity (`repo/backend/unit_tests`).
- **Integration Tests:** Comprehensive API suite covering all core business domains (`repo/backend/API_tests`).
- **Logging:** `logAuditEvent` used on all critical paths (Export, Publish, Role changes).
- **Observation:** No sensitive data (passwords, plain tokens) found in log statements.

---

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- **Framework:** Vitest (Backend), Angular Spec (Frontend).
- **Coverage:** Core happy paths and major failure cases (lockout, registration windows, file size limits).

### 8.2 Coverage Mapping Table
| Requirement | Mapped Test case | Status |
| :--- | :--- | :--- |
| **Lockout Policy** | `auth.test.ts:239` ("lockout after 5 failures") | Covered |
| **CMS Rollback** | `cms.test.ts:300` | Covered |
| **Weighted Ranking**| `moderation-ranking.test.ts` | Covered |
| **Rate Limiting** | `auth.ts:309` implementation + config | Partially covered (config verified) |

**Final Coverage Judgment: PASS**

---

## 9. Final Notes
The project is refined and production-ready for its intended scenario. The inclusion of professional measures like PDF watermarking and request nonces demonstrates high engineering maturity for a 0-to-1 deliverable.

*Date: 2026-04-06*
