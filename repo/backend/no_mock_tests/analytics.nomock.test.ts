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

describe("Analytics – no-mock integration", () => {
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

  it.skipIf(!dbAvailable)(
    "POST /api/analytics/events accepts valid page_view",
    async () => {
      const participantUser = `${PARTICIPANT_USERNAME}-pv`;
      const { token } = await registerAndLogin(app, participantUser, TEST_PASSWORD);

      const response = await app.inject({
        method: "POST",
        url: "/api/analytics/events",
        headers: authHeaders(token),
        payload: {
          eventType: "page_view",
          pagePath: "/some/page",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ success: boolean }>();
      expect(body.success).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "POST /api/analytics/events rejects dwell without dwellMs",
    async () => {
      const participantUser = `${PARTICIPANT_USERNAME}-dwell`;
      const { token } = await registerAndLogin(app, participantUser, TEST_PASSWORD);

      const response = await app.inject({
        method: "POST",
        url: "/api/analytics/events",
        headers: authHeaders(token),
        payload: {
          eventType: "dwell",
          pagePath: "/some/page",
          // dwellMs intentionally omitted
        },
      });

      expect(response.statusCode).toBe(400);
    },
  );

  it.skipIf(!dbAvailable)(
    "GET /api/analytics/summary returns aggregates after inserting events",
    async () => {
      // Register participant and post 3 page_view events
      const participantUser = `${PARTICIPANT_USERNAME}-summary`;
      const { token: participantToken } = await registerAndLogin(
        app,
        participantUser,
        TEST_PASSWORD,
      );

      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/analytics/events",
          headers: authHeaders(participantToken),
          payload: {
            eventType: "page_view",
            pagePath: `/page/${i}`,
          },
        });
        expect(res.statusCode).toBe(200);
      }

      // Register an admin and upgrade their role
      const adminUser = `${ADMIN_USERNAME}-summary`;
      await registerAndLogin(app, adminUser, TEST_PASSWORD);
      await app.db.query(
        "UPDATE app.users SET role = 'program_owner' WHERE username = $1",
        [adminUser],
      );
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: adminUser, password: TEST_PASSWORD },
      });
      const adminToken = loginRes.json<{ accessToken: string }>().accessToken;

      const today = new Date().toISOString().slice(0, 10);
      const summaryRes = await app.inject({
        method: "GET",
        url: `/api/analytics/summary?startDate=${today}&endDate=${today}`,
        headers: authHeaders(adminToken),
      });

      expect(summaryRes.statusCode).toBe(200);
      const body = summaryRes.json<{
        pageViews: number;
        uniqueUsers: number;
      }>();
      expect(body.pageViews).toBeGreaterThanOrEqual(3);
      expect(body.uniqueUsers).toBeGreaterThanOrEqual(1);
    },
  );

  it.skipIf(!dbAvailable)(
    "GET /api/analytics/export.csv returns CSV with header row and data",
    async () => {
      // Post some events first
      const participantUser = `${PARTICIPANT_USERNAME}-csv`;
      const { token: participantToken } = await registerAndLogin(
        app,
        participantUser,
        TEST_PASSWORD,
      );

      await app.inject({
        method: "POST",
        url: "/api/analytics/events",
        headers: authHeaders(participantToken),
        payload: {
          eventType: "page_view",
          pagePath: "/export-test",
        },
      });

      // Create an admin for the export endpoint
      const adminUser = `${ADMIN_USERNAME}-csv`;
      await registerAndLogin(app, adminUser, TEST_PASSWORD);
      await app.db.query(
        "UPDATE app.users SET role = 'program_owner' WHERE username = $1",
        [adminUser],
      );
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: adminUser, password: TEST_PASSWORD },
      });
      const adminToken = loginRes.json<{ accessToken: string }>().accessToken;

      const today = new Date().toISOString().slice(0, 10);
      const exportRes = await app.inject({
        method: "GET",
        url: `/api/analytics/export.csv?startDate=${today}&endDate=${today}`,
        headers: authHeaders(adminToken),
      });

      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers["content-type"]).toContain("text/csv");

      const csv = exportRes.body as string;
      expect(csv.startsWith("date,page_views,unique_users,avg_dwell_ms,total_dwell_ms")).toBe(true);

      // There should be at least one data line beyond the header
      const lines = csv.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(2);
    },
  );
});
