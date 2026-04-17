import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { buildApp } from "../src/app.js";
import {
  setupTestEnv,
  cleanupDb,
  canConnectToDb,
  nonceHeaders,
  authHeaders,
} from "./helpers/setup-db.js";
import {
  TEST_PASSWORD,
  ADMIN_USERNAME,
  PARTICIPANT_USERNAME,
  registerAndLogin,
} from "./helpers/test-users.js";

describe("real no-mock auth lifecycle", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dbAvailable = false;

  beforeAll(async () => {
    setupTestEnv();
    dbAvailable = await canConnectToDb();
    if (!dbAvailable) return;
    app = await buildApp();
    await cleanupDb(app.db);
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await cleanupDb(app.db);
    await app.close();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await cleanupDb(app.db);
  });

  it.skipIf(!dbAvailable)("GET /api/health returns 200 with status, timestamp, environment", async () => {

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      status: string;
      timestamp: string;
      environment: string;
    }>();
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
    expect(body.timestamp.length).toBeGreaterThan(0);
    expect(body.environment).toBe("test");
  });

  it.skipIf(!dbAvailable)("POST /api/auth/register creates a real user", async () => {

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      user: { id: number; username: string; role: string };
    }>();
    expect(body.user).toBeDefined();
    expect(typeof body.user.id).toBe("number");
    expect(body.user.id).toBeGreaterThan(0);
    expect(body.user.role).toBe("participant");
  });

  it.skipIf(!dbAvailable)("POST /api/auth/register rejects duplicate username", async () => {

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: TEST_PASSWORD },
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: TEST_PASSWORD },
    });

    expect(second.statusCode).toBe(409);
  });

  it.skipIf(!dbAvailable)("POST /api/auth/register rejects weak password", async () => {

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: "weakpass" },
    });

    expect(response.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("POST /api/auth/login returns a usable token", async () => {

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: TEST_PASSWORD },
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: TEST_PASSWORD },
    });

    expect(loginResponse.statusCode).toBe(200);
    const body = loginResponse.json<{
      accessToken: string;
      user: { id: number; username: string; role: string };
    }>();
    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken.length).toBeGreaterThan(0);
    expect(body.user).toBeDefined();
    expect(typeof body.user.id).toBe("number");
    expect(typeof body.user.username).toBe("string");
    expect(typeof body.user.role).toBe("string");
  });

  it.skipIf(!dbAvailable)("POST /api/auth/login rejects wrong password", async () => {

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: TEST_PASSWORD },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: {
        username: PARTICIPANT_USERNAME,
        password: "WrongPassword@9999",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)("GET /api/auth/me succeeds with valid token", async () => {

    const { token, userId } = await registerAndLogin(
      app,
      PARTICIPANT_USERNAME,
      TEST_PASSWORD,
    );

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeaders(token),
    });

    expect(meResponse.statusCode).toBe(200);
    const body = meResponse.json<{
      user: { id: number; username: string; role: string };
    }>();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(userId);
  });

  it.skipIf(!dbAvailable)("POST /api/auth/logout revokes session", async () => {

    const { token } = await registerAndLogin(
      app,
      PARTICIPANT_USERNAME,
      TEST_PASSWORD,
    );

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: authHeaders(token),
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toStrictEqual({ success: true });
  });

  it.skipIf(!dbAvailable)("GET /api/auth/me returns 401 after logout", async () => {

    const { token } = await registerAndLogin(
      app,
      PARTICIPANT_USERNAME,
      TEST_PASSWORD,
    );

    await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: authHeaders(token),
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeaders(token),
    });

    expect(meResponse.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)("full auth lifecycle: register -> login -> /me -> logout -> /me fails", async () => {

    // Step 1: register
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: ADMIN_USERNAME, password: TEST_PASSWORD },
    });
    expect(registerResponse.statusCode).toBe(200);
    const registerBody = registerResponse.json<{
      user: { id: number; role: string };
    }>();
    expect(registerBody.user.role).toBe("participant");

    // Step 2: login
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: ADMIN_USERNAME, password: TEST_PASSWORD },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json<{
      accessToken: string;
      user: { id: number };
    }>();
    const token = loginBody.accessToken;
    const userId = loginBody.user.id;

    // Step 3: GET /me succeeds
    const meBeforeLogout = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeaders(token),
    });
    expect(meBeforeLogout.statusCode).toBe(200);
    const meBody = meBeforeLogout.json<{ user: { id: number } }>();
    expect(meBody.user.id).toBe(userId);

    // Step 4: logout
    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: authHeaders(token),
    });
    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toStrictEqual({ success: true });

    // Step 5: GET /me fails with 401
    const meAfterLogout = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeaders(token),
    });
    expect(meAfterLogout.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)("login lockout after 5 failed attempts", async () => {

    // Register the user first
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: nonceHeaders(),
      payload: { username: PARTICIPANT_USERNAME, password: TEST_PASSWORD },
    });

    // Attempt 5 wrong password logins
    for (let i = 0; i < 5; i += 1) {
      const failedAttempt = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: {
          username: PARTICIPANT_USERNAME,
          password: "WrongPassword@9999",
        },
      });
      // Each individual failure returns 401 until the 5th which locks (423)
      expect([401, 423]).toContain(failedAttempt.statusCode);
    }

    // The 6th attempt (after 5 failures) must be locked out (423)
    const lockedResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: {
        username: PARTICIPANT_USERNAME,
        password: "WrongPassword@9999",
      },
    });

    expect(lockedResponse.statusCode).toBe(423);
  });
});
