import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import authRoutes from "../src/routes/auth.js";
import { hashPassword } from "../src/security/password.js";

type User = {
  id: number;
  username: string;
  password_hash: string;
  role: string;
};

type LoginEvent = {
  id: number;
  user_id: number | null;
  username: string;
  success: boolean;
  user_agent: string | null;
  ip_address: string | null;
  is_unrecognized: boolean;
  reviewed_at: Date | null;
  reviewed_by_user_id: number | null;
  review_note: string | null;
  created_at: Date;
};

describe("auth routes", () => {
  let users: User[];
  let sessions: Array<{
    id: number;
    user_id: number;
    token_id: string;
    revoked_at: Date | null;
  }>;
  let failedCount = 0;
  let loginEvents: LoginEvent[];

  const makeApp = async () => {
    const app = Fastify();
    await app.register(sensible);
    await app.register(jwt, { secret: "test-secret-test-secret-test-secret" });
    app.decorate("env", {
      HOST: "0.0.0.0",
      PORT: 3000,
      NODE_ENV: "test",
      DATABASE_URL: "https://example.com",
      CORS_ORIGIN: "*",
      JWT_SECRET: "test-secret-test-secret-test-secret",
    });

    const queryFn = async <T>(text: string, values?: unknown[]) => {
      if (text.includes("INSERT INTO app.users")) {
        const username = String(values?.[0]);
        if (users.some((user) => user.username === username)) {
          const error = new Error("duplicate") as Error & { code: string };
          error.code = "23505";
          throw error;
        }
        const user = {
          id: users.length + 1,
          username,
          password_hash: String(values?.[1]),
          role: "participant",
        };
        users.push(user);
        return {
          rows: [
            { id: user.id, username: user.username, role: user.role },
          ] as T[],
        };
      }

      if (text.includes("FROM app.users") && text.includes("password_hash")) {
        const username = String(values?.[0]);
        const user = users.find((item) => item.username === username);
        return { rows: (user ? [user] : []) as T[] };
      }

      if (text.includes("UPDATE app.users") && text.includes("SET role")) {
        const userId = Number(values?.[0]);
        const newRole = String(values?.[1]);
        const user = users.find((item) => item.id === userId);
        if (!user) {
          return { rows: [] as T[] };
        }
        user.role = newRole;
        return { rows: [{ id: user.id, role: user.role }] as T[] };
      }

      if (text.includes("SELECT failed_count")) {
        return {
          rows: [
            {
              failed_count: failedCount,
              locked_until:
                failedCount >= 5 ? new Date(Date.now() + 60000) : null,
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.sessions")) {
        const session = {
          id: sessions.length + 1,
          user_id: Number(values?.[0]),
          token_id: String(values?.[1]),
          revoked_at: null,
        };
        sessions.push(session);
        return { rows: [{ id: session.id }] as T[] };
      }

      if (text.includes("DELETE FROM app.login_attempts")) {
        failedCount = 0;
        return { rows: [] as T[] };
      }

      if (text.includes("INSERT INTO app.login_attempts")) {
        failedCount += 1;
        return { rows: [] as T[] };
      }

      if (text.includes("SELECT s.id AS session_id")) {
        const session = sessions.find(
          (item) => item.id === Number(values?.[0]) && item.revoked_at === null,
        );
        if (!session) {
          return { rows: [] as T[] };
        }
        const user = users.find((item) => item.id === session.user_id);
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

      if (text.includes("UPDATE app.sessions") && text.includes("revoked_at")) {
        const session = sessions.find(
          (item) => item.id === Number(values?.[0]),
        );
        if (session) {
          session.revoked_at = new Date();
        }
        return { rows: [] as T[] };
      }

      if (text.includes("FROM app.auth_login_events") && text.includes("is_unrecognized = TRUE") && !text.includes("UPDATE")) {
        const pending = loginEvents.filter((e) => e.is_unrecognized);
        return { rows: pending as T[] };
      }

      if (text.includes("COUNT(*)::text AS total") && text.includes("auth_login_events")) {
        const pending = loginEvents.filter((e) => e.is_unrecognized);
        return { rows: [{ total: String(pending.length) }] as T[] };
      }

      if (text.includes("UPDATE app.auth_login_events") && text.includes("reviewed_at")) {
        const eventId = Number(values?.[0]);
        const event = loginEvents.find((e) => e.id === eventId && e.is_unrecognized);
        if (!event) {
          return { rows: [] as T[] };
        }
        event.reviewed_at = new Date();
        event.reviewed_by_user_id = Number(values?.[1]);
        event.review_note = values?.[2] as string | null;
        return { rows: [{ id: event.id }] as T[] };
      }

      return { rows: [] as T[] };
    };

    app.decorate("db", {
      query: queryFn,
      connect: async () =>
        ({
          query: queryFn,
          release: () => undefined,
          connect: () => Promise.resolve(),
        }) as never,
    } as unknown as Pool);

    await app.register(authRoutes, { prefix: "/api" });
    return app;
  };

  const nonceHeaders = () => ({
    "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
    "x-timestamp": String(Date.now()),
  });

  const authHeaders = (token: string) => ({
    authorization: `Bearer ${token}`,
    ...nonceHeaders(),
  });

  beforeEach(() => {
    users = [];
    sessions = [];
    failedCount = 0;
    loginEvents = [];
  });

  it("registration success", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });
    expect(response.statusCode).toBe(200);
  });

  it("registration returns user object with id, username, and role", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeTypeOf("number");
    expect(body.user.username).toBeTypeOf("string");
    expect(body.user.role).toBe("participant");
  });

  it("duplicate registration returns 409", async () => {
    const app = await makeApp();
    const passwordHash = await hashPassword("Admin@12345678");
    users.push({
      id: 1,
      username: "alice",
      password_hash: passwordHash,
      role: "participant",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("weak password returns 400", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "weakpass" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("registration rejects invalid username format", async () => {
    const app = await makeApp();
    const tooShort = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: "ab", password: "Admin@12345678" },
    });
    expect(tooShort.statusCode).toBe(400);

    const specialChars = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: "user@name!", password: "Admin@12345678" },
    });
    expect(specialChars.statusCode).toBe(400);
  });

  it("login success returns token", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeTypeOf("string");
  });

  it("login returns user info alongside token", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    const body = response.json();
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(1);
    expect(body.user.role).toBe("participant");
    expect(body.user.username).toBeTypeOf("string");
  });

  it("login creates a session", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    expect(sessions).toHaveLength(0);

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].user_id).toBe(1);
    expect(sessions[0].revoked_at).toBeNull();
  });

  it("wrong password returns 401", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "wrong" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("non-existent user returns 401", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "nobody", password: "Admin@12345678" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("lockout after 5 failures returns 423", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: "alice", password: "wrong" },
      });
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "wrong" },
    });

    expect(response.statusCode).toBe(423);
  });

  it("logout invalidates session", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    const token = login.json().accessToken as string;
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        ...nonceHeaders(),
        authorization: `Bearer ${token}`,
      },
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json().success).toBe(true);
    expect(sessions[0]?.revoked_at).not.toBeNull();
  });

  it("/auth/me returns current user info", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    const token = login.json().accessToken as string;
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeaders(token),
    });

    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(1);
    expect(body.user.role).toBe("participant");
  });

  it("requires nonce for authenticated /auth/me", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    const token = login.json().accessToken as string;
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(me.statusCode).toBe(400);
  });

  it("requires nonce for authenticated admin login-events read", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });

    const token = login.json().accessToken as string;
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/login-events/unrecognized?page=1&limit=20",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it("admin can review unrecognized login event", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });
    loginEvents.push({
      id: 10,
      user_id: 1,
      username: "admin",
      success: true,
      user_agent: "TestAgent/1.0",
      ip_address: "192.168.1.1",
      is_unrecognized: true,
      reviewed_at: null,
      reviewed_by_user_id: null,
      review_note: null,
      created_at: new Date(),
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login-events/10/review",
      headers: authHeaders(token),
      payload: { reviewNote: "Verified by admin" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(loginEvents[0].reviewed_at).not.toBeNull();
    expect(loginEvents[0].review_note).toBe("Verified by admin");
  });

  it("review returns 404 for non-existent login event", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login-events/999/review",
      headers: authHeaders(token),
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });

  it("non-admin cannot review login events", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login-events/1/review",
      headers: authHeaders(token),
      payload: {},
    });

    expect(response.statusCode).toBe(403);
  });

  it("admin can change user role", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });
    users.push({
      id: 2,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/users/2/role",
      headers: authHeaders(token),
      payload: { role: "reviewer" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(2);
    expect(response.json().role).toBe("reviewer");
    expect(users[1].role).toBe("reviewer");
  });

  it("role change returns 404 for non-existent user", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/users/999/role",
      headers: authHeaders(token),
      payload: { role: "reviewer" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("non-admin cannot change user roles", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/users/1/role",
      headers: authHeaders(token),
      payload: { role: "admin" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("role change rejects invalid role value", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/users/1/role",
      headers: authHeaders(token),
      payload: { role: "superadmin" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("admin can list unrecognized login events", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });
    loginEvents.push({
      id: 10,
      user_id: 1,
      username: "admin",
      success: false,
      user_agent: "TestAgent/1.0",
      ip_address: "10.0.0.1",
      is_unrecognized: true,
      reviewed_at: null,
      reviewed_by_user_id: null,
      review_note: null,
      created_at: new Date(),
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/login-events/unrecognized?page=1&limit=20",
      headers: authHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.total).toBeTypeOf("number");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("unauthenticated request to /auth/me returns 401", async () => {
    const app = await makeApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: nonceHeaders(),
    });

    expect(response.statusCode).toBe(401);
  });

  it("login rejects missing payload fields", async () => {
    const app = await makeApp();
    const noPassword = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice" },
    });
    expect(noPassword.statusCode).toBe(400);

    const noUsername = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { password: "Admin@12345678" },
    });
    expect(noUsername.statusCode).toBe(400);
  });

  it("login normalizes username to lowercase", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "ALICE", password: "Admin@12345678" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeTypeOf("string");
  });

  it("login-events query supports reviewed filter", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const reviewedTrue = await app.inject({
      method: "GET",
      url: "/api/auth/login-events/unrecognized?page=1&limit=20&reviewed=true",
      headers: authHeaders(token),
    });
    expect(reviewedTrue.statusCode).toBe(200);

    const reviewedAll = await app.inject({
      method: "GET",
      url: "/api/auth/login-events/unrecognized?page=1&limit=20&reviewed=all",
      headers: authHeaders(token),
    });
    expect(reviewedAll.statusCode).toBe(200);
  });

  it("role change with invalid userId format returns 400", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/users/abc/role",
      headers: authHeaders(token),
      payload: { role: "reviewer" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("login-event review with invalid eventId format returns 400", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "admin",
      password_hash: await hashPassword("Admin@12345678"),
      role: "admin",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "admin", password: "Admin@12345678" },
    });
    const token = login.json().accessToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login-events/abc/review",
      headers: authHeaders(token),
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("registration trims and normalizes username", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: "  Bob  ", password: "Admin@12345678" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe("bob");
  });

  it("logout returns success true", async () => {
    const app = await makeApp();
    users.push({
      id: 1,
      username: "alice",
      password_hash: await hashPassword("Admin@12345678"),
      role: "participant",
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: "alice", password: "Admin@12345678" },
    });

    const token = login.json().accessToken as string;
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: authHeaders(token),
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toStrictEqual({ success: true });
  });
});
