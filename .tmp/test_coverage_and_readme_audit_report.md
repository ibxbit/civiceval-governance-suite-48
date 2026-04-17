# Test Coverage Audit

## Project Type Detection

- README now explicitly declares `fullstack` at the top. `repo/README.md:1`

## Backend Endpoint Inventory

- Static endpoint inventory remains 58 endpoints across health, auth, activities, analytics, evaluations, CMS, moderation, and rankings.

## API Test Classification

### True No-Mock HTTP

- `repo/backend/no_mock_tests/auth-lifecycle.nomock.test.ts`
- `repo/backend/no_mock_tests/activities-lifecycle.nomock.test.ts`
- `repo/backend/no_mock_tests/analytics.nomock.test.ts`
- `repo/backend/no_mock_tests/cms-files.nomock.test.ts`
- `repo/backend/no_mock_tests/evaluations.nomock.test.ts`
- `repo/backend/no_mock_tests/cms-content.nomock.test.ts`
- `repo/backend/no_mock_tests/moderation-rankings.nomock.test.ts`

### HTTP With Mocking

- `repo/backend/API_tests/*.test.ts`
- `repo/backend/integration_tests/cross-route.integration.test.ts`

### Non-HTTP

- `repo/backend/unit_tests/*.test.ts`
- `repo/frontend/src/app/**/*.spec.ts`
- `repo/e2e/tests/*.spec.ts`

## Coverage Summary

- Total endpoints: 58.
- Endpoints with any HTTP tests: 58/58.
- Endpoints with true no-mock HTTP tests: 50/58.
- HTTP coverage: 100.0%.
- True API coverage: 86.2%.

## Unit Test Summary

### Backend Unit Tests

- Present across middleware, security, audit, tracking, masking, nonce, and password helpers.

### Frontend Unit Tests

Frontend unit tests: PRESENT

- Direct file-level evidence exists for pages, components, services, guards, routes, and layout under `repo/frontend/src/app/**/*.spec.ts`.
- Frameworks/tools detected: Angular TestBed, Jasmine, Karma, Angular HTTP testing utilities.

### Cross-Layer Observation

- Backend coverage is now strong and materially improved.
- Frontend unit coverage is present and broad.
- E2E breadth improved, but some privileged flows remain conditional rather than deterministic.

## API Observability Check

- Strong overall in the new no-mock suites.
- Still mixed in some mocked API suites and conditional E2E flows.

## Tests Check

- `repo/run_tests.sh` starts Dockerized database infrastructure first. `repo/run_tests.sh:7-18`
- It still installs dependencies locally and runs local commands with `npm install` and `npm exec`, so it remains a strict audit flag. `repo/run_tests.sh:31-54`

## Test Quality & Sufficiency

Strengths:

- All endpoints have HTTP coverage.
- True no-mock coverage is high at 50/58 endpoints.
- Critical route families previously missing real integration coverage are now covered.
- Frontend unit test presence is clear and broad.
- E2E breadth is meaningfully better than before.

Weaknesses:

- 8 endpoints still lack confirmed true no-mock evidence.
- Some E2E tests still branch on role/UI visibility and do not always prove a completed business action.
- `run_tests.sh` is still not fully Docker-contained.

## Test Coverage Score (0-100)

91

## Score Rationale

- +25: all endpoints covered by HTTP tests.
- +30: high true no-mock API coverage.
- +12: strong frontend unit-test presence.
- +10: improved E2E breadth.
- -6: 8 endpoints still only mocked at HTTP level.
- -5: conditional/shallow E2E behavior remains.
- -5: local install/execution still present in `run_tests.sh`.

## Key Gaps

- Remaining true no-mock gaps:
  - `GET /api/auth/login-events/unrecognized`
  - `POST /api/auth/login-events/:eventId/review`
  - `POST /api/auth/users/:userId/role`
  - `GET /api/activities/search`
  - `GET /api/activities/:activityId`
  - `GET /api/activities/:activityId/registrations`
  - `PUT /api/activities/:activityId`
  - `DELETE /api/activities/:activityId`
- `run_tests.sh` still performs local dependency installation.

## Confidence & Assumptions

- Confidence: high.
- Static inspection only; no tests were executed.

# README Audit

## High Priority Issues

- Demo credentials are still not actually provided for authenticated access across roles. README says to document them later if seeding is enabled, but the strict audit requires them now when auth exists. `repo/README.md:77-97`
- Environment/setup is still not Docker-contained end-to-end because README requires manual `.env` configuration and manual certificate generation. `repo/README.md:58-75`

## Medium Priority Issues

- Testing/build instructions still include local `npm` commands, which weakens the Docker-contained expectation. `repo/README.md:99-119`
- API verification is improved but still minimal. It shows health verification and login endpoint location, but not a richer authenticated curl/Postman example for core business behavior. `repo/README.md:32-56`

## Low Priority Issues

- Markdown structure is now clean and readable.
- Tech stack and architecture sections are now present and materially better.

## Hard Gate Failures

- FAIL: environment rules still do not satisfy the strict “everything must be Docker-contained” requirement because manual `.env` setup and manual TLS generation are documented. `repo/README.md:58-75`
- FAIL: auth exists, but README still does not provide actual demo credentials with username/email and password for all roles. `repo/README.md:77-97`
- FAIL: README still includes local runtime/test/build commands (`npm test`, `npm run build`), which conflicts with the strict environment rule. `repo/README.md:99-119`

## README Verdict

PARTIAL PASS

Reason:

- Structure, access method, startup command inclusion, project type declaration, tech stack, and architecture all improved enough to clear several prior issues.
- However strict hard-gate failures remain around Docker-contained setup and missing concrete demo credentials.

## Final Verdicts

- Test Coverage Audit verdict: PASS.
- README Audit verdict: PARTIAL PASS.
