import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import analyticsRoutes from "../src/routes/analytics.js";

describe("analytics routes", () => {
  const buildApp = async (role: "participant" | "program_owner" = "participant") => {
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

    const queryFn = async <T>(text: string) => {
      if (text.includes("SELECT s.id AS session_id")) {
        return {
          rows: [
            {
              session_id: 1,
              user_id: 1,
              username: "user",
              role,
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.analytics_events")) {
        return { rows: [] as T[] };
      }

      if (text.includes("FROM app.analytics_events") && text.includes("AS page_views") && !text.includes("GROUP BY")) {
        return {
          rows: [
            {
              page_views: "5",
              unique_users: "2",
              avg_dwell_ms: "120.5",
              total_dwell_ms: "241",
            },
          ] as T[],
        };
      }

      if (text.includes("read_complete")) {
        return { rows: [{ value: "33.3" }] as T[] };
      }

      if (text.includes("search_click")) {
        return { rows: [{ value: "50" }] as T[] };
      }

      if (text.includes("content_id::text")) {
        return {
          rows: [{ content_id: "1", views: "4" }] as T[],
        };
      }

      if (text.includes("GROUP BY referrer")) {
        return {
          rows: [{ referrer: "direct", count: "7" }] as T[],
        };
      }

      if (text.includes("GROUP BY DATE(occurred_at)")) {
        return {
          rows: [
            {
              date: "2026-01-01",
              page_views: "3",
              unique_users: "2",
              avg_dwell_ms: "100",
              total_dwell_ms: "300",
            },
          ] as T[],
        };
      }

      return { rows: [] as T[] };
    };

    app.decorate("db", {
      query: queryFn,
      connect: async () => ({ query: queryFn, release: () => undefined }) as never,
    } as unknown as Pool);

    await app.register(analyticsRoutes, { prefix: "/api" });
    return app;
  };

  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
    "x-timestamp": String(Date.now()),
  });

  it("ingests analytics events", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      headers: headers(token),
      payload: {
        eventType: "search",
        pagePath: "/activities",
        referrer: "query=health",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it("rejects dwell events without dwellMs", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      headers: headers(token),
      payload: {
        eventType: "dwell",
        pagePath: "/activities",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("enforces role guards for summary and export", async () => {
    const participantApp = await buildApp("participant");
    const participantToken = participantApp.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const deniedSummary = await participantApp.inject({
      method: "GET",
      url: "/api/analytics/summary?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(participantToken),
    });
    expect(deniedSummary.statusCode).toBe(403);

    const deniedExport = await participantApp.inject({
      method: "GET",
      url: "/api/analytics/export.csv?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(participantToken),
    });
    expect(deniedExport.statusCode).toBe(403);

    const ownerApp = await buildApp("program_owner");
    const ownerToken = ownerApp.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const allowedSummary = await ownerApp.inject({
      method: "GET",
      url: "/api/analytics/summary?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(ownerToken),
    });
    expect(allowedSummary.statusCode).toBe(200);

    const allowedExport = await ownerApp.inject({
      method: "GET",
      url: "/api/analytics/export.csv?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(ownerToken),
    });
    expect(allowedExport.statusCode).toBe(200);
  });

  it("requires nonce for authenticated summary access", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/summary?startDate=2026-01-01&endDate=2026-01-02",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it("summary response includes expected aggregate fields", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/summary?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pageViews).toBeTypeOf("number");
    expect(body.uniqueUsers).toBeTypeOf("number");
    expect(body.avgDwellMs).toBeTypeOf("number");
    expect(body.totalDwellMs).toBeTypeOf("number");
    expect(body.readCompletionRate).toBeTypeOf("number");
    expect(body.searchConversion).toBeTypeOf("number");
    expect(body.contentPopularity).toBeInstanceOf(Array);
    expect(body.trafficSources).toBeInstanceOf(Array);
  });

  it("export returns CSV content type", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/export.csv?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
  });

  it("event ingestion response confirms success", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      headers: headers(token),
      payload: {
        eventType: "page_view",
        pagePath: "/dashboard",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it("rejects invalid event type", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      headers: headers(token),
      payload: {
        eventType: "invalid_type",
        pagePath: "/dashboard",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("unauthenticated event ingestion returns 401", async () => {
    const app = await buildApp("participant");

    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      headers: {
        "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
        "x-timestamp": String(Date.now()),
      },
      payload: {
        eventType: "page_view",
        pagePath: "/dashboard",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("event ingestion for dwell type includes dwellMs in response", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/analytics/events",
      headers: headers(token),
      payload: {
        eventType: "dwell",
        pagePath: "/activities",
        dwellMs: 500,
        contentId: 10,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it("summary response includes contentPopularity and trafficSources arrays", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/summary?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.contentPopularity).toBeInstanceOf(Array);
    expect(body.contentPopularity.length).toBeGreaterThan(0);
    expect(body.contentPopularity[0]).toHaveProperty("contentId");
    expect(body.contentPopularity[0]).toHaveProperty("views");
    expect(typeof body.contentPopularity[0].contentId).toBe("number");
    expect(typeof body.contentPopularity[0].views).toBe("number");

    expect(body.trafficSources).toBeInstanceOf(Array);
    expect(body.trafficSources.length).toBeGreaterThan(0);
    expect(body.trafficSources[0]).toHaveProperty("referrer");
    expect(body.trafficSources[0]).toHaveProperty("visits");
    expect(typeof body.trafficSources[0].referrer).toBe("string");
    expect(typeof body.trafficSources[0].visits).toBe("number");
  });

  it("export CSV body contains expected column headers", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/export.csv?startDate=2026-01-01&endDate=2026-01-02",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const csv = response.body;
    expect(csv).toContain("date,page_views,unique_users,avg_dwell_ms,total_dwell_ms");
    const lines = csv.split("\n").filter((line: string) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("summary rejects startDate after endDate", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/summary?startDate=2026-01-10&endDate=2026-01-01",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(400);
  });
});
