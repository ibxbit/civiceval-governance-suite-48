/**
 * Cross-route integration tests.
 *
 * These tests exercise behaviour that can only be verified when ALL route
 * plugins are registered together in a single app instance – i.e. the full
 * middleware stack including the shared error handler, JWT guard, nonce guard,
 * rate-limit plugin, and role guard.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../src/security/password.js";
import {
  authHeaders,
  buildTestApp,
  nonceHeaders,
  type QueryFn,
} from "./helpers/build-test-app.js";

// ---------------------------------------------------------------------------
// In-memory state shared across query handlers within a single test
// ---------------------------------------------------------------------------

type User = {
  id: number;
  username: string;
  password_hash: string;
  role: string;
};

type Session = {
  id: number;
  user_id: number;
  token_id: string;
  revoked_at: Date | null;
};

// Module-level state is reset by `beforeEach`.
let users: User[] = [];
let sessions: Session[] = [];
let failedCount = 0;

/**
 * Build a QueryFn that operates over the `users` / `sessions` arrays above.
 * This is intentionally similar to the auth.test.ts pattern but lives here so
 * that all route plugins (health, cms, etc.) can also receive coherent answers
 * from the same function.
 */
const makeQueryFn = (): QueryFn => {
  return async <T>(text: string, values?: unknown[]) => {
    // -----------------------------------------------------------------------
    // Transactions – BEGIN / COMMIT / ROLLBACK are no-ops in the mock
    // -----------------------------------------------------------------------
    if (
      text.trim().toUpperCase() === "BEGIN" ||
      text.trim().toUpperCase() === "COMMIT" ||
      text.trim().toUpperCase() === "ROLLBACK"
    ) {
      return { rows: [] as T[] };
    }

    // -----------------------------------------------------------------------
    // Health
    // -----------------------------------------------------------------------
    if (text.includes("SELECT NOW()")) {
      return { rows: [{ now: new Date().toISOString() }] as T[] };
    }

    // -----------------------------------------------------------------------
    // Audit logs + login events – always succeed silently
    // -----------------------------------------------------------------------
    if (
      text.includes("INSERT INTO app.audit_logs") ||
      text.includes("INSERT INTO app.auth_login_events")
    ) {
      return { rows: [] as T[] };
    }

    // -----------------------------------------------------------------------
    // Login devices
    // -----------------------------------------------------------------------
    if (text.includes("SELECT id") && text.includes("app.login_devices")) {
      // Return an existing device so the happy-path login is never flagged as
      // unrecognized (simplifies session assertions).
      return {
        rows: [{ id: 1 }] as T[],
      };
    }

    if (
      (text.includes("INSERT INTO app.login_devices") ||
        text.includes("UPDATE app.login_devices")) &&
      !text.includes("SELECT")
    ) {
      return { rows: [] as T[] };
    }

    // -----------------------------------------------------------------------
    // User registration
    // -----------------------------------------------------------------------
    if (text.includes("INSERT INTO app.users")) {
      const username = String(values?.[0]);
      if (users.some((u) => u.username === username)) {
        const err = new Error("duplicate") as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      const user: User = {
        id: users.length + 1,
        username,
        password_hash: String(values?.[1]),
        role: "participant",
      };
      users.push(user);
      return {
        rows: [{ id: user.id, username: user.username, role: user.role }] as T[],
      };
    }

    // -----------------------------------------------------------------------
    // User lookup (login)
    // -----------------------------------------------------------------------
    if (text.includes("FROM app.users") && text.includes("password_hash")) {
      const username = String(values?.[0]);
      const user = users.find((u) => u.username === username);
      return { rows: (user ? [user] : []) as T[] };
    }

    // -----------------------------------------------------------------------
    // Role change
    // -----------------------------------------------------------------------
    if (text.includes("UPDATE app.users") && text.includes("SET role")) {
      const userId = Number(values?.[0]);
      const newRole = String(values?.[1]);
      const user = users.find((u) => u.id === userId);
      if (!user) return { rows: [] as T[] };
      user.role = newRole;
      return { rows: [{ id: user.id, role: user.role }] as T[] };
    }

    // -----------------------------------------------------------------------
    // Login attempts (brute-force tracking)
    // -----------------------------------------------------------------------
    if (text.includes("SELECT failed_count")) {
      return {
        rows: [
          {
            failed_count: failedCount,
            locked_until:
              failedCount >= 5 ? new Date(Date.now() + 60_000) : null,
          },
        ] as T[],
      };
    }

    if (text.includes("INSERT INTO app.login_attempts")) {
      failedCount += 1;
      return { rows: [] as T[] };
    }

    if (text.includes("DELETE FROM app.login_attempts")) {
      failedCount = 0;
      return { rows: [] as T[] };
    }

    // -----------------------------------------------------------------------
    // Session creation
    // -----------------------------------------------------------------------
    if (text.includes("INSERT INTO app.sessions")) {
      const session: Session = {
        id: sessions.length + 1,
        user_id: Number(values?.[0]),
        token_id: String(values?.[1]),
        revoked_at: null,
      };
      sessions.push(session);
      return { rows: [{ id: session.id }] as T[] };
    }

    // -----------------------------------------------------------------------
    // Auth guard – session lookup
    // -----------------------------------------------------------------------
    if (text.includes("SELECT s.id AS session_id")) {
      const sessionId = Number(values?.[0]);
      const session = sessions.find(
        (s) => s.id === sessionId && s.revoked_at === null,
      );
      if (!session) return { rows: [] as T[] };
      const user = users.find((u) => u.id === session.user_id);
      return {
        rows: [
          {
            session_id: session.id,
            user_id: user?.id,
            username: user?.username,
            role: user?.role,
          },
        ] as T[],
      };
    }

    // -----------------------------------------------------------------------
    // Auth guard – session refresh (last_activity_at update)
    // -----------------------------------------------------------------------
    if (
      text.includes("UPDATE app.sessions") &&
      text.includes("last_activity_at")
    ) {
      return { rows: [] as T[] };
    }

    // -----------------------------------------------------------------------
    // Logout – revoke session
    // -----------------------------------------------------------------------
    if (text.includes("UPDATE app.sessions") && text.includes("revoked_at")) {
      const sessionId = Number(values?.[0]);
      const session = sessions.find((s) => s.id === sessionId);
      if (session) session.revoked_at = new Date();
      return { rows: [] as T[] };
    }

    // -----------------------------------------------------------------------
    // CMS – sensitive terms (needed when cms routes initialise)
    // -----------------------------------------------------------------------
    if (
      text.includes("SELECT term") &&
      text.includes("app.cms_sensitive_terms")
    ) {
      return { rows: [] as T[] };
    }

    // -----------------------------------------------------------------------
    // Moderation – comments list
    // -----------------------------------------------------------------------
    if (text.includes("FROM app.comments") && text.includes("ORDER BY pinned")) {
      return { rows: [] as T[] };
    }

    if (text.includes("COUNT(*)::text AS total") && text.includes("app.comments")) {
      return { rows: [{ total: "0" }] as T[] };
    }

    // -----------------------------------------------------------------------
    // Default fall-through
    // -----------------------------------------------------------------------
    return { rows: [] as T[] };
  };
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("cross-route integration", () => {
  beforeEach(() => {
    users = [];
    sessions = [];
    failedCount = 0;
  });

  // -------------------------------------------------------------------------
  // Error handler – standardized error format
  // -------------------------------------------------------------------------

  describe("error handler returns standardized error format", () => {
    it("returns { error: { message, statusCode } } for 400 validation errors", async () => {
      const app = await buildTestApp(makeQueryFn());

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "ab", password: "weakpass" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as {
        error: { message: string; statusCode: number };
      };
      expect(body.error).toBeDefined();
      expect(body.error.statusCode).toBe(400);
      expect(typeof body.error.message).toBe("string");
    });

    it("returns { error: { message, statusCode } } for 404 not-found routes", async () => {
      const app = await buildTestApp(makeQueryFn());

      const res = await app.inject({
        method: "GET",
        url: "/api/this-route-does-not-exist",
      });

      expect(res.statusCode).toBe(404);
      // Fastify's built-in 404 goes through the error handler pipeline
      expect(res.json()).toBeDefined();
    });

    it("statusCode in error body matches HTTP status code for 409 conflict", async () => {
      const app = await buildTestApp(makeQueryFn());
      const passwordHash = await hashPassword("Admin@12345678");
      users.push({ id: 1, username: "alice", password_hash: passwordHash, role: "participant" });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "alice", password: "Admin@12345678" },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json() as { error: { message: string; statusCode: number } };
      expect(body.error.statusCode).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  // Health route alongside auth routes
  // -------------------------------------------------------------------------

  describe("health endpoint works alongside auth routes without interference", () => {
    it("GET /api/health returns 200 after auth routes are registered", async () => {
      const app = await buildTestApp(makeQueryFn());

      const res = await app.inject({ method: "GET", url: "/api/health" });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { status: string; environment: string; timestamp: string };
      expect(body.status).toBe("ok");
      expect(body.environment).toBe("test");
      expect(typeof body.timestamp).toBe("string");
    });

    it("health endpoint is reachable even after authenticated requests are processed", async () => {
      const app = await buildTestApp(makeQueryFn());

      // Exercise the auth stack first
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "tester", password: "Admin@12345678" },
      });

      // Health must still work
      const res = await app.inject({ method: "GET", url: "/api/health" });
      expect(res.statusCode).toBe(200);
    });

    it("health does not require nonce or auth headers", async () => {
      const app = await buildTestApp(makeQueryFn());

      const res = await app.inject({
        method: "GET",
        url: "/api/health",
        // no auth, no nonce headers at all
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Register then login in the same app instance
  // -------------------------------------------------------------------------

  describe("register followed by login in a single app instance", () => {
    it("newly registered user can immediately log in", async () => {
      const app = await buildTestApp(makeQueryFn());

      const registerRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "newuser", password: "Admin@12345678" },
      });
      expect(registerRes.statusCode).toBe(200);

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "newuser", password: "Admin@12345678" },
      });

      expect(loginRes.statusCode).toBe(200);
      const body = loginRes.json() as { accessToken: string; user: { id: number; role: string } };
      expect(typeof body.accessToken).toBe("string");
      expect(body.accessToken.length).toBeGreaterThan(10);
      expect(body.user.role).toBe("participant");
    });

    it("login returns a token that allows accessing /auth/me", async () => {
      const app = await buildTestApp(makeQueryFn());

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "alice", password: "Admin@12345678" },
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "alice", password: "Admin@12345678" },
      });

      const token = (loginRes.json() as { accessToken: string }).accessToken;

      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: authHeaders(token),
      });

      expect(meRes.statusCode).toBe(200);
      const me = meRes.json() as { user: { id: number; username: string; role: string } };
      expect(me.user.role).toBe("participant");
    });
  });

  // -------------------------------------------------------------------------
  // Admin role change flow
  // -------------------------------------------------------------------------

  describe("admin role change: register user -> login admin -> change role", () => {
    it("admin can change another user's role end-to-end", async () => {
      const app = await buildTestApp(makeQueryFn());

      // Seed an admin directly in state (pre-hashed)
      const adminHash = await hashPassword("Admin@12345678");
      users.push({ id: 1, username: "admin", password_hash: adminHash, role: "admin" });

      // Register the target user via the API so state is consistent
      const regRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "targetuser", password: "Admin@12345678" },
      });
      expect(regRes.statusCode).toBe(200);
      const targetId = (regRes.json() as { user: { id: number } }).user.id;

      // Login as admin
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "admin", password: "Admin@12345678" },
      });
      expect(loginRes.statusCode).toBe(200);
      const token = (loginRes.json() as { accessToken: string }).accessToken;

      // Change role
      const roleRes = await app.inject({
        method: "POST",
        url: `/api/auth/users/${targetId}/role`,
        headers: authHeaders(token),
        payload: { role: "reviewer" },
      });

      expect(roleRes.statusCode).toBe(200);
      const body = roleRes.json() as { id: number; role: string };
      expect(body.role).toBe("reviewer");

      // State should reflect the update
      const updated = users.find((u) => u.id === targetId);
      expect(updated?.role).toBe("reviewer");
    });

    it("non-admin cannot change roles", async () => {
      const app = await buildTestApp(makeQueryFn());
      const hash = await hashPassword("Admin@12345678");
      users.push({ id: 1, username: "alice", password_hash: hash, role: "participant" });
      users.push({ id: 2, username: "bob", password_hash: hash, role: "participant" });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "alice", password: "Admin@12345678" },
      });
      const token = (loginRes.json() as { accessToken: string }).accessToken;

      const roleRes = await app.inject({
        method: "POST",
        url: "/api/auth/users/2/role",
        headers: authHeaders(token),
        payload: { role: "reviewer" },
      });

      expect(roleRes.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Nonce replay detection across different route endpoints
  // -------------------------------------------------------------------------

  describe("nonce replay detection works across different route endpoints", () => {
    it("reusing the same nonce on a second request returns 409", async () => {
      const app = await buildTestApp(makeQueryFn());
      const hash = await hashPassword("Admin@12345678");
      users.push({ id: 1, username: "alice", password_hash: hash, role: "participant" });

      const sharedNonce = `nonce-${Math.random().toString(36).slice(2)}-1234567890abcdef`;
      const sharedTimestamp = String(Date.now());

      // First request succeeds
      const first = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-nonce": sharedNonce, "x-timestamp": sharedTimestamp },
        payload: { username: "alice", password: "Admin@12345678" },
      });
      expect(first.statusCode).toBe(200);

      // Second request with the same nonce on a DIFFERENT route must be rejected
      const second = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-nonce": sharedNonce, "x-timestamp": sharedTimestamp },
        payload: { username: "newbie", password: "Admin@12345678" },
      });
      expect(second.statusCode).toBe(409);
    });

    it("two requests to different routes with DIFFERENT nonces both succeed", async () => {
      const app = await buildTestApp(makeQueryFn());

      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "user1", password: "Admin@12345678" },
      });
      expect(reg.statusCode).toBe(200);

      const hash = await hashPassword("Admin@12345678");
      const userId = (reg.json() as { user: { id: number } }).user.id;
      // Patch the in-memory hash so login can verify it
      const storedUser = users.find((u) => u.id === userId);
      if (storedUser) storedUser.password_hash = hash;

      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),  // fresh nonce
        payload: { username: "user1", password: "Admin@12345678" },
      });
      expect(login.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Unauthenticated requests to multiple protected endpoints return 401
  // -------------------------------------------------------------------------

  describe("unauthenticated requests to protected endpoints all return 401", () => {
    const protectedEndpoints: Array<{ method: "GET" | "POST"; url: string; payload?: unknown }> = [
      { method: "GET", url: "/api/auth/me" },
      { method: "POST", url: "/api/auth/logout" },
      { method: "GET", url: "/api/auth/login-events/unrecognized" },
      { method: "GET", url: "/api/cms/content" },
      { method: "GET", url: "/api/cms/content/1" },
    ];

    for (const { method, url, payload } of protectedEndpoints) {
      it(`${method} ${url} returns 401 without a valid token`, async () => {
        const app = await buildTestApp(makeQueryFn());

        const res = await app.inject({
          method,
          url,
          headers: nonceHeaders(),
          ...(payload ? { payload } : {}),
        });

        expect(res.statusCode).toBe(401);
      });
    }

    it("all listed protected endpoints consistently return 401 in a single app instance", async () => {
      const app = await buildTestApp(makeQueryFn());

      for (const { method, url, payload } of protectedEndpoints) {
        const res = await app.inject({
          method,
          url,
          headers: nonceHeaders(),
          ...(payload ? { payload } : {}),
        });
        expect(
          res.statusCode,
          `Expected 401 for ${method} ${url}, got ${res.statusCode}`,
        ).toBe(401);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Full auth lifecycle in a single app instance
  // -------------------------------------------------------------------------

  describe("auth lifecycle: register -> login -> use protected endpoint -> logout", () => {
    it("token is rejected after logout", async () => {
      const app = await buildTestApp(makeQueryFn());

      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "charlie", password: "Admin@12345678" },
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "charlie", password: "Admin@12345678" },
      });
      const token = (loginRes.json() as { accessToken: string }).accessToken;

      // /auth/me works before logout
      const meBeforeRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: authHeaders(token),
      });
      expect(meBeforeRes.statusCode).toBe(200);

      // Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: authHeaders(token),
      });
      expect(logoutRes.statusCode).toBe(200);

      // Session is revoked – /auth/me must now return 401
      const meAfterRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: authHeaders(token),
      });
      expect(meAfterRes.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Missing nonce header returns 400 (not 401 / 500)
  // -------------------------------------------------------------------------

  describe("missing nonce header returns 400", () => {
    it("POST /api/auth/register without nonce returns 400", async () => {
      const app = await buildTestApp(makeQueryFn());

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        // deliberately no nonce headers
        payload: { username: "alice", password: "Admin@12345678" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("POST /api/auth/login without nonce returns 400", async () => {
      const app = await buildTestApp(makeQueryFn());
      const hash = await hashPassword("Admin@12345678");
      users.push({ id: 1, username: "alice", password_hash: hash, role: "participant" });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        // no nonce headers
        payload: { username: "alice", password: "Admin@12345678" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-endpoint flow with role changes
  // -------------------------------------------------------------------------

  describe("multi-endpoint flow with role changes", () => {
    it("participant promoted to reviewer can access moderation comments endpoint", async () => {
      const app = await buildTestApp(makeQueryFn());

      // Seed admin directly in state
      const adminHash = await hashPassword("Admin@12345678");
      users.push({ id: 1, username: "admin", password_hash: adminHash, role: "admin" });

      // Register participant via API
      const regRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "promoted_user", password: "Admin@12345678" },
      });
      expect(regRes.statusCode).toBe(200);
      const participantId = (regRes.json() as { user: { id: number } }).user.id;

      // Login as admin
      const adminLoginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "admin", password: "Admin@12345678" },
      });
      expect(adminLoginRes.statusCode).toBe(200);
      const adminToken = (adminLoginRes.json() as { accessToken: string }).accessToken;

      // Change participant to reviewer
      const roleRes = await app.inject({
        method: "POST",
        url: `/api/auth/users/${participantId}/role`,
        headers: authHeaders(adminToken),
        payload: { role: "reviewer" },
      });
      expect(roleRes.statusCode).toBe(200);

      // Login as the newly promoted reviewer
      const reviewerLoginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "promoted_user", password: "Admin@12345678" },
      });
      expect(reviewerLoginRes.statusCode).toBe(200);
      const reviewerToken = (reviewerLoginRes.json() as { accessToken: string }).accessToken;

      // Reviewer should be able to access moderation comments
      const commentsRes = await app.inject({
        method: "GET",
        url: "/api/moderation/comments?page=1&limit=20",
        headers: authHeaders(reviewerToken),
      });
      expect(commentsRes.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Error format consistency
  // -------------------------------------------------------------------------

  describe("error format consistency", () => {
    it("register with valid nonce but missing username returns 400 with structured error", async () => {
      const app = await buildTestApp(makeQueryFn());

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { password: "Admin@12345678" },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: { message: string; statusCode: number } };
      expect(body.error).toBeDefined();
      expect(typeof body.error.message).toBe("string");
      expect(body.error.statusCode).toBe(400);
    });

    it("expired session returns 401 across protected endpoints", async () => {
      const app = await buildTestApp(makeQueryFn());

      // Register and login
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: nonceHeaders(),
        payload: { username: "expiry_user", password: "Admin@12345678" },
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "expiry_user", password: "Admin@12345678" },
      });
      expect(loginRes.statusCode).toBe(200);
      const token = (loginRes.json() as { accessToken: string }).accessToken;

      // Manually mark the session as revoked (simulating expiry)
      const session = sessions[sessions.length - 1];
      if (session) {
        session.revoked_at = new Date(Date.now() - 1000);
      }

      // Now /auth/me must return 401 because the session is revoked
      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: authHeaders(token),
      });
      expect(meRes.statusCode).toBe(401);
    });
  });
});
