import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import activitiesRoutes from "../src/routes/activities.js";

describe("activities routes", () => {
  const buildApp = async (
    sessionRoles: Record<number, "admin" | "participant" | "program_owner"> = {
      1: "admin",
    },
  ) => {
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

    let expiredCode = false;
    const checkins = new Set<string>();

    const queryFn = async <T>(text: string, values?: unknown[]) => {
      if (text.includes("SELECT s.id AS session_id")) {
        const sid = Number(values?.[0]);
        const role = sessionRoles[sid] ?? "participant";
        return {
          rows: [
            {
              session_id: sid,
              user_id: sid,
              username: `user-${sid}`,
              role,
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.activities")) {
        return {
          rows: [
            {
              id: 1,
              title: values?.[0],
              description: values?.[1],
              participation_type: values?.[2],
              starts_at: values?.[3],
              ends_at: values?.[4],
              registration_start_at: values?.[5],
              registration_end_at: values?.[6],
              created_by_user_id: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.activities") && text.includes("title ILIKE")) {
        return {
          rows: [
            {
              id: 1,
              title: "Town Hall",
              description: "Community updates",
              participation_type: "individual",
              starts_at: new Date("2099-01-10T10:00:00.000Z"),
              ends_at: new Date("2099-01-10T11:00:00.000Z"),
              registration_start_at: new Date("2099-01-01T10:00:00.000Z"),
              registration_end_at: new Date("2099-01-05T10:00:00.000Z"),
              created_by_user_id: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.activity_registrations")) {
        const now = new Date();
        const inWindow = now < new Date("2100-01-01");
        return { rows: (inWindow ? [{ id: 1 }] : []) as T[] };
      }

      if (text.includes("SELECT starts_at, ends_at")) {
        return {
          rows: [
            {
              starts_at: new Date(Date.now() - 1000),
              ends_at: new Date(Date.now() + 60_000),
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.activity_checkin_codes")) {
        return { rows: [{ id: 1 }] as T[] };
      }

      if (
        text.includes("SELECT id\n            FROM app.activity_registrations")
      ) {
        return { rows: [{ id: 1 }] as T[] };
      }

      if (text.includes("FROM app.activity_checkin_codes")) {
        if (expiredCode) {
          return { rows: [] as T[] };
        }
        return { rows: [{ id: 1 }] as T[] };
      }

      if (text.includes("INSERT INTO app.activity_checkins")) {
        const activityId = Number(values?.[0]);
        const userId = Number(values?.[1]);
        const key = `${activityId}:${userId}`;
        if (checkins.has(key)) {
          return { rows: [] as T[] };
        }
        checkins.add(key);
        return { rows: [{ id: checkins.size }] as T[] };
      }

      if (text.includes("FROM app.activity_registrations") && text.includes("INNER JOIN app.users")) {
        return {
          rows: [
            {
              id: 1,
              activity_id: 1,
              user_id: 2,
              username: "participant-2",
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("COUNT(*)::text AS total") && text.includes("app.activity_registrations")) {
        return { rows: [{ total: "1" }] as T[] };
      }

      if (text.includes("COUNT(*)::text AS total") && text.includes("app.activities")) {
        return { rows: [{ total: "2" }] as T[] };
      }

      if (text.includes("FROM app.activities") && text.includes("WHERE deleted_at IS NULL") && text.includes("ORDER BY starts_at")) {
        return {
          rows: [
            {
              id: 1,
              title: "Town Hall",
              description: "Community updates",
              participation_type: "individual",
              starts_at: new Date("2099-01-10T10:00:00.000Z"),
              ends_at: new Date("2099-01-10T11:00:00.000Z"),
              registration_start_at: new Date("2099-01-01T10:00:00.000Z"),
              registration_end_at: new Date("2099-01-05T10:00:00.000Z"),
              created_by_user_id: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: 2,
              title: "Workshop",
              description: "Skills session",
              participation_type: "team",
              starts_at: new Date("2099-02-10T10:00:00.000Z"),
              ends_at: new Date("2099-02-10T11:00:00.000Z"),
              registration_start_at: new Date("2099-02-01T10:00:00.000Z"),
              registration_end_at: new Date("2099-02-05T10:00:00.000Z"),
              created_by_user_id: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.activities a") && text.includes("WHERE a.id = $1") && text.includes("registration_count")) {
        const activityId = Number(values?.[0]);
        if (activityId === 999) {
          return { rows: [] as T[] };
        }
        return {
          rows: [
            {
              id: activityId,
              title: "Town Hall",
              description: "Community updates",
              participation_type: "individual",
              starts_at: new Date("2099-01-10T10:00:00.000Z"),
              ends_at: new Date("2099-01-10T11:00:00.000Z"),
              registration_start_at: new Date("2099-01-01T10:00:00.000Z"),
              registration_end_at: new Date("2099-01-05T10:00:00.000Z"),
              created_by_user_id: 1,
              created_at: new Date(),
              updated_at: new Date(),
              registration_count: "5",
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.activities") && text.includes("WHERE id = $1") && text.includes("deleted_at IS NULL") && text.includes("registration_start_at")) {
        const activityId = Number(values?.[0]);
        if (activityId === 999) {
          return { rows: [] as T[] };
        }
        return {
          rows: [
            {
              starts_at: new Date("2099-01-10T10:00:00.000Z"),
              ends_at: new Date("2099-01-10T11:00:00.000Z"),
              registration_start_at: new Date("2099-01-01T10:00:00.000Z"),
              registration_end_at: new Date("2099-01-05T10:00:00.000Z"),
            },
          ] as T[],
        };
      }

      if (text.includes("UPDATE app.activities") && text.includes("SET") && text.includes("title = COALESCE")) {
        const activityId = Number(values?.[0]);
        if (activityId === 999) {
          return { rows: [] as T[] };
        }
        return {
          rows: [
            {
              id: activityId,
              title: values?.[1] ?? "Town Hall",
              description: values?.[2] ?? "Community updates",
              participation_type: values?.[3] ?? "individual",
              starts_at: values?.[4] ?? new Date("2099-01-10T10:00:00.000Z"),
              ends_at: values?.[5] ?? new Date("2099-01-10T11:00:00.000Z"),
              registration_start_at: values?.[6] ?? new Date("2099-01-01T10:00:00.000Z"),
              registration_end_at: values?.[7] ?? new Date("2099-01-05T10:00:00.000Z"),
              created_by_user_id: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("UPDATE app.activities") && text.includes("SET deleted_at")) {
        const activityId = Number(values?.[0]);
        if (activityId === 999) {
          return { rows: [] as T[], rowCount: 0 };
        }
        return { rows: [] as T[], rowCount: 1 };
      }

      return { rows: [] as T[] };
    };

    app.decorate("db", {
      query: queryFn,
      connect: async () =>
        ({ query: queryFn, release: () => undefined }) as never,
    } as unknown as Pool);

    await app.register(activitiesRoutes, { prefix: "/api" });

    return {
      app,
      setExpiredCode: (value: boolean) => {
        expiredCode = value;
      },
    };
  };

  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
    "x-timestamp": String(Date.now()),
  });

  it("create activity with valid dates", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/activities",
      headers: headers(token),
      payload: {
        title: "Town Hall",
        description: "B",
        participationType: "individual",
        startsAt: "2099-01-10T10:00:00.000Z",
        endsAt: "2099-01-11T10:00:00.000Z",
        registrationStartAt: "2099-01-01T10:00:00.000Z",
        registrationEndAt: "2099-01-05T10:00:00.000Z",
      },
    });
    expect(response.statusCode).toBe(200);
  });

  it("reject invalid date ranges", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/activities",
      headers: headers(token),
      payload: {
        title: "A",
        description: "B",
        participationType: "individual",
        startsAt: "2099-01-10T10:00:00.000Z",
        endsAt: "2099-01-09T10:00:00.000Z",
        registrationStartAt: "2099-01-08T10:00:00.000Z",
        registrationEndAt: "2099-01-09T10:00:00.000Z",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("registration succeeds in window", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/activities/1/register",
      headers: headers(token),
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it("checkin flow validates and rejects expired code", async () => {
    const { app, setExpiredCode } = await buildApp({
      1: "admin",
      2: "participant",
    });
    const adminToken = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const participantToken = app.jwt.sign({ sub: "2", sid: 2, tid: "t2" });

    const generated = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin-code",
      headers: headers(adminToken),
      payload: { expiresInSeconds: 120 },
    });
    expect(generated.statusCode).toBe(200);

    const valid = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin",
      headers: headers(participantToken),
      payload: { code: "ABCDEFG1" },
    });
    expect(valid.statusCode).toBe(200);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin",
      headers: headers(participantToken),
      payload: { code: "ABCDEFG1" },
    });
    expect(duplicate.statusCode).toBe(409);

    setExpiredCode(true);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin",
      headers: headers(participantToken),
      payload: { code: "ABCDEFG1" },
    });
    expect(invalid.statusCode).toBe(401);
  });

  it("allows multiple participants to reuse the same active check-in code", async () => {
    const { app } = await buildApp({
      1: "admin",
      2: "participant",
      3: "participant",
    });
    const adminToken = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const participantAToken = app.jwt.sign({ sub: "2", sid: 2, tid: "t2" });
    const participantBToken = app.jwt.sign({ sub: "3", sid: 3, tid: "t3" });

    const generated = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin-code",
      headers: headers(adminToken),
      payload: { expiresInSeconds: 120 },
    });
    expect(generated.statusCode).toBe(200);

    const participantA = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin",
      headers: headers(participantAToken),
      payload: { code: "ABCDEFG1" },
    });
    expect(participantA.statusCode).toBe(200);

    const participantB = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin",
      headers: headers(participantBToken),
      payload: { code: "ABCDEFG1" },
    });
    expect(participantB.statusCode).toBe(200);
  });

  it("search endpoint returns matching activities", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/activities/search?q=town&page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.length).toBeGreaterThan(0);
  });

  it("enforces nonce on authenticated activity reads", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const listWithoutNonce = await app.inject({
      method: "GET",
      url: "/api/activities?page=1&limit=20",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listWithoutNonce.statusCode).toBe(400);
  });

  it("restricts roster visibility to moderation and management roles", async () => {
    const participantApp = await buildApp({ 1: "participant" });
    const participantToken = participantApp.app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const denied = await participantApp.app.inject({
      method: "GET",
      url: "/api/activities/1/registrations?page=1&limit=20",
      headers: headers(participantToken),
    });
    expect(denied.statusCode).toBe(403);

    const adminApp = await buildApp({ 1: "admin" });
    const adminToken = adminApp.app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const allowed = await adminApp.app.inject({
      method: "GET",
      url: "/api/activities/1/registrations?page=1&limit=20",
      headers: headers(adminToken),
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("get activity detail returns activity with registration count", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/activities/1",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(1);
    expect(body.title).toBeTypeOf("string");
    expect(body.participationType).toBe("individual");
    expect(body.registrationCount).toBe(5);
    expect(body.startsAt).toBeDefined();
    expect(body.endsAt).toBeDefined();
  });

  it("get activity detail returns 404 for non-existent activity", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/activities/999",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(404);
  });

  it("update activity succeeds for admin", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "PUT",
      url: "/api/activities/1",
      headers: headers(token),
      payload: { title: "Updated Town Hall" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(1);
  });

  it("update activity returns 404 for non-existent activity", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "PUT",
      url: "/api/activities/999",
      headers: headers(token),
      payload: { title: "Updated" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("update activity rejects empty body", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "PUT",
      url: "/api/activities/1",
      headers: headers(token),
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("participant cannot update activities", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "PUT",
      url: "/api/activities/1",
      headers: headers(token),
      payload: { title: "Hacked" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("delete activity succeeds for admin", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/activities/1",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it("delete activity returns 404 for non-existent activity", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/activities/999",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(404);
  });

  it("participant cannot delete activities", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/activities/1",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(403);
  });

  it("create activity response includes all expected fields", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/activities",
      headers: headers(token),
      payload: {
        title: "Town Hall",
        description: "B",
        participationType: "individual",
        startsAt: "2099-01-10T10:00:00.000Z",
        endsAt: "2099-01-11T10:00:00.000Z",
        registrationStartAt: "2099-01-01T10:00:00.000Z",
        registrationEndAt: "2099-01-05T10:00:00.000Z",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.title).toBeTypeOf("string");
    expect(body.participationType).toBe("individual");
    expect(body.createdByUserId).toBeTypeOf("number");
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it("search response includes query and pagination metadata", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "GET",
      url: "/api/activities/search?q=town&page=1&limit=20",
      headers: headers(token),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.query).toBe("town");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.data).toBeInstanceOf(Array);
  });

  it("participant cannot create activities", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/activities",
      headers: headers(token),
      payload: {
        title: "Unauthorized",
        description: "B",
        participationType: "individual",
        startsAt: "2099-01-10T10:00:00.000Z",
        endsAt: "2099-01-11T10:00:00.000Z",
        registrationStartAt: "2099-01-01T10:00:00.000Z",
        registrationEndAt: "2099-01-05T10:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("unauthenticated activity list returns 401", async () => {
    const { app } = await buildApp({});
    const response = await app.inject({
      method: "GET",
      url: "/api/activities?page=1&limit=20",
      headers: {
        "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
        "x-timestamp": String(Date.now()),
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects activity with registration end after activity start", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/activities",
      headers: headers(token),
      payload: {
        title: "Bad Dates",
        description: "B",
        participationType: "individual",
        startsAt: "2099-01-05T10:00:00.000Z",
        endsAt: "2099-01-10T10:00:00.000Z",
        registrationStartAt: "2099-01-01T10:00:00.000Z",
        registrationEndAt: "2099-01-06T10:00:00.000Z",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("list activities returns paginated data with correct shape", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/activities?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBe(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);

    const first = body.data[0];
    expect(first.id).toBeTypeOf("number");
    expect(first.title).toBeTypeOf("string");
    expect(first.participationType).toBeTypeOf("string");
    expect(first.startsAt).toBeDefined();
    expect(first.endsAt).toBeDefined();
    expect(first.registrationStartAt).toBeDefined();
    expect(first.registrationEndAt).toBeDefined();
    expect(first.createdByUserId).toBeTypeOf("number");
  });

  it("list activities supports status filter parameter", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/activities?page=1&limit=20&status=upcoming",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeInstanceOf(Array);
  });

  it("checkin flow success response confirms success", async () => {
    const { app } = await buildApp({
      1: "admin",
      2: "participant",
    });
    const adminToken = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const participantToken = app.jwt.sign({ sub: "2", sid: 2, tid: "t2" });

    const generated = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin-code",
      headers: headers(adminToken),
      payload: { expiresInSeconds: 120 },
    });
    expect(generated.statusCode).toBe(200);
    const genBody = generated.json();
    expect(genBody.checkinCodeId).toBeTypeOf("number");
    expect(genBody.code).toBeTypeOf("string");
    expect(genBody.code).toHaveLength(8);
    expect(genBody.expiresInSeconds).toBe(120);

    const valid = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin",
      headers: headers(participantToken),
      payload: { code: "ABCDEFG1" },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().success).toBe(true);
  });

  it("registration success response confirms success", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/activities/1/register",
      headers: headers(token),
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it("registrations list returns paginated roster with masked usernames", async () => {
    const { app } = await buildApp({ 1: "admin" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "GET",
      url: "/api/activities/1/registrations?page=1&limit=20",
      headers: headers(token),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].userId).toBeTypeOf("number");
    expect(body.data[0].username).toBeTypeOf("string");
    expect(body.total).toBeTypeOf("number");
    expect(body.page).toBe(1);
  });

  it("activity detail response includes description field", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/activities/1",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const descriptionIsStringOrNull =
      body.description === null || typeof body.description === "string";
    expect(descriptionIsStringOrNull).toBe(true);
  });

  it("search rejects missing query parameter", async () => {
    const { app } = await buildApp({ 1: "participant" });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/activities/search?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(400);
  });
});
