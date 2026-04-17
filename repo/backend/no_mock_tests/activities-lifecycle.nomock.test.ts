import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import {
  setupTestEnv,
  cleanupDb,
  canConnectToDb,
  authHeaders,
  nonceHeaders,
} from "./helpers/setup-db.js";
import {
  TEST_PASSWORD,
  ADMIN_USERNAME,
  PARTICIPANT_USERNAME,
  registerAndLogin,
} from "./helpers/test-users.js";

describe("Activities lifecycle – no-mock integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let dbAvailable: boolean;

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

  // ------------------------------------------------------------------ helpers

  /** Register a user and return a token that reflects the provided role. */
  const registerWithRole = async (username: string, role: string) => {
    await registerAndLogin(app, username, TEST_PASSWORD);
    await app.db.query(
      "UPDATE app.users SET role = $1 WHERE username = $2",
      [role, username],
    );
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username, password: TEST_PASSWORD },
    });
    if (loginRes.statusCode !== 200) {
      throw new Error(
        `Login failed for ${username}: ${loginRes.statusCode} ${loginRes.body}`,
      );
    }
    const body = loginRes.json<{
      accessToken: string;
      user: { id: number; role: string };
    }>();
    return { token: body.accessToken, userId: body.user.id };
  };

  /** Create an activity using the admin token. Returns the created activity body. */
  const createActivity = async (
    token: string,
    overrides: Record<string, string> = {},
  ) => {
    const now = Date.now();
    const payload = {
      title: "Test Activity",
      description: "A test description",
      participationType: "individual",
      registrationStartAt: new Date(now - 259200000).toISOString(), // -3 days
      registrationEndAt: new Date(now - 172800000).toISOString(),   // -2 days
      startsAt: new Date(now - 86400000).toISOString(),             // -1 day
      endsAt: new Date(now + 86400000).toISOString(),               // +1 day
      ...overrides,
    };
    return app.inject({
      method: "POST",
      url: "/api/activities",
      headers: authHeaders(token),
      payload,
    });
  };

  // ------------------------------------------------------------------ tests

  it.skipIf(!dbAvailable)(
    "admin creates activity successfully",
    async () => {
      const { token } = await registerWithRole(
        `${ADMIN_USERNAME}-create`,
        "admin",
      );

      const now = Date.now();
      const response = await createActivity(token, {
        title: "Future Activity",
        registrationStartAt: new Date(now + 86400000).toISOString(),
        registrationEndAt: new Date(now + 172800000).toISOString(),
        startsAt: new Date(now + 259200000).toISOString(),
        endsAt: new Date(now + 345600000).toISOString(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        id: unknown;
        title: unknown;
        participationType: unknown;
        startsAt: unknown;
        endsAt: unknown;
        registrationStartAt: unknown;
        registrationEndAt: unknown;
        createdByUserId: unknown;
        createdAt: unknown;
        updatedAt: unknown;
      }>();
      expect(typeof body.id).toBe("number");
      expect(body.title).toBe("Future Activity");
      expect(body.participationType).toBe("individual");
      expect(typeof body.startsAt).toBe("string");
      expect(typeof body.endsAt).toBe("string");
      expect(typeof body.registrationStartAt).toBe("string");
      expect(typeof body.registrationEndAt).toBe("string");
      expect(typeof body.createdByUserId).toBe("number");
      expect(typeof body.createdAt).toBe("string");
      expect(typeof body.updatedAt).toBe("string");
    },
  );

  it.skipIf(!dbAvailable)(
    "participant lists activities and sees the created item",
    async () => {
      // Admin creates activity
      const { token: adminToken } = await registerWithRole(
        `${ADMIN_USERNAME}-list`,
        "admin",
      );
      const now = Date.now();
      const createRes = await createActivity(adminToken, {
        title: "Listable Activity",
        registrationStartAt: new Date(now + 86400000).toISOString(),
        registrationEndAt: new Date(now + 172800000).toISOString(),
        startsAt: new Date(now + 259200000).toISOString(),
        endsAt: new Date(now + 345600000).toISOString(),
      });
      expect(createRes.statusCode).toBe(200);

      // Participant lists activities
      const { token: participantToken } = await registerWithRole(
        `${PARTICIPANT_USERNAME}-list`,
        "participant",
      );
      const listRes = await app.inject({
        method: "GET",
        url: "/api/activities?page=1&limit=20",
        headers: authHeaders(participantToken),
      });

      expect(listRes.statusCode).toBe(200);
      const body = listRes.json<{
        data: Array<{ title: string }>;
        total: number;
      }>();
      expect(Array.isArray(body.data)).toBe(true);
      const titles = body.data.map((a) => a.title);
      expect(titles).toContain("Listable Activity");
    },
  );

  it.skipIf(!dbAvailable)(
    "participant registers during valid registration window",
    async () => {
      const { token: adminToken } = await registerWithRole(
        `${ADMIN_USERNAME}-reg`,
        "admin",
      );
      const now = Date.now();
      // Registration window spans now; activity starts after
      const createRes = await createActivity(adminToken, {
        title: "Register Activity",
        registrationStartAt: new Date(now - 86400000).toISOString(),   // yesterday
        registrationEndAt: new Date(now + 86400000).toISOString(),     // tomorrow
        startsAt: new Date(now + 172800000).toISOString(),             // day after tomorrow
        endsAt: new Date(now + 259200000).toISOString(),               // 3 days
      });
      expect(createRes.statusCode).toBe(200);
      const { id: activityId } = createRes.json<{ id: number }>();

      const { token: participantToken } = await registerWithRole(
        `${PARTICIPANT_USERNAME}-reg`,
        "participant",
      );
      const regRes = await app.inject({
        method: "POST",
        url: `/api/activities/${activityId}/register`,
        headers: authHeaders(participantToken),
      });

      expect(regRes.statusCode).toBe(200);
      const body = regRes.json<{ success: boolean }>();
      expect(body.success).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "admin generates check-in code during active event",
    async () => {
      const { token: adminToken } = await registerWithRole(
        `${ADMIN_USERNAME}-code`,
        "admin",
      );
      // Activity is currently active (started yesterday, ends tomorrow)
      const createRes = await createActivity(adminToken, {
        title: "Active Activity for Code",
      });
      expect(createRes.statusCode).toBe(200);
      const { id: activityId } = createRes.json<{ id: number }>();

      const codeRes = await app.inject({
        method: "POST",
        url: `/api/activities/${activityId}/checkin-code`,
        headers: authHeaders(adminToken),
        payload: { expiresInSeconds: 300 },
      });

      expect(codeRes.statusCode).toBe(200);
      const body = codeRes.json<{
        checkinCodeId: number;
        code: string;
        expiresInSeconds: number;
      }>();
      expect(typeof body.checkinCodeId).toBe("number");
      expect(typeof body.code).toBe("string");
      expect(body.code.length).toBe(8);
      expect(body.expiresInSeconds).toBe(300);
    },
  );

  it.skipIf(!dbAvailable)(
    "registered participant checks in successfully",
    async () => {
      const { token: adminToken } = await registerWithRole(
        `${ADMIN_USERNAME}-checkin`,
        "admin",
      );
      // Activity currently active
      const createRes = await createActivity(adminToken, {
        title: "Checkin Activity",
      });
      expect(createRes.statusCode).toBe(200);
      const { id: activityId } = createRes.json<{ id: number }>();

      // Register participant directly via DB (registration window is closed in this activity)
      const { token: participantToken, userId: participantId } =
        await registerWithRole(`${PARTICIPANT_USERNAME}-checkin`, "participant");
      await app.db.query(
        "INSERT INTO app.activity_registrations (activity_id, user_id) VALUES ($1, $2)",
        [activityId, participantId],
      );

      // Admin generates check-in code
      const codeRes = await app.inject({
        method: "POST",
        url: `/api/activities/${activityId}/checkin-code`,
        headers: authHeaders(adminToken),
        payload: { expiresInSeconds: 300 },
      });
      expect(codeRes.statusCode).toBe(200);
      const { code } = codeRes.json<{ code: string }>();

      // Participant checks in
      const checkinRes = await app.inject({
        method: "POST",
        url: `/api/activities/${activityId}/checkin`,
        headers: authHeaders(participantToken),
        payload: { code },
      });

      expect(checkinRes.statusCode).toBe(200);
      const body = checkinRes.json<{ success: boolean }>();
      expect(body.success).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "second check-in by same participant returns 409",
    async () => {
      const { token: adminToken } = await registerWithRole(
        `${ADMIN_USERNAME}-dup`,
        "admin",
      );
      const createRes = await createActivity(adminToken, {
        title: "Duplicate Checkin Activity",
      });
      expect(createRes.statusCode).toBe(200);
      const { id: activityId } = createRes.json<{ id: number }>();

      const { token: participantToken, userId: participantId } =
        await registerWithRole(`${PARTICIPANT_USERNAME}-dup`, "participant");
      await app.db.query(
        "INSERT INTO app.activity_registrations (activity_id, user_id) VALUES ($1, $2)",
        [activityId, participantId],
      );

      const codeRes = await app.inject({
        method: "POST",
        url: `/api/activities/${activityId}/checkin-code`,
        headers: authHeaders(adminToken),
        payload: { expiresInSeconds: 300 },
      });
      expect(codeRes.statusCode).toBe(200);
      const { code } = codeRes.json<{ code: string }>();

      // First check-in
      const first = await app.inject({
        method: "POST",
        url: `/api/activities/${activityId}/checkin`,
        headers: authHeaders(participantToken),
        payload: { code },
      });
      expect(first.statusCode).toBe(200);

      // Second check-in – same participant, same activity
      const second = await app.inject({
        method: "POST",
        url: `/api/activities/${activityId}/checkin`,
        headers: authHeaders(participantToken),
        payload: { code },
      });
      expect(second.statusCode).toBe(409);
    },
  );
});
