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

describe("auth routes", () => {
  let users: User[];
  let sessions: Array<{
    id: number;
    user_id: number;
    token_id: string;
    revoked_at: Date | null;
  }>;
  let failedCount = 0;

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

  beforeEach(() => {
    users = [];
    sessions = [];
    failedCount = 0;
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
    expect(sessions[0]?.revoked_at).not.toBeNull();
  });
});
