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

    const queryFn = async <T>(text: string, values?: unknown[]) => {
      if (text.includes("SELECT s.id AS session_id")) {
        const sid = Number(values?.[0]);
        const role = sessionRoles[sid] ?? "participant";
        return {
          rows: [
            {
              session_id: sid,
              user_id: 1,
              username: "owner",
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
  });

  it("checkin flow validates and rejects expired code", async () => {
    const { app, setExpiredCode } = await buildApp({
      1: "admin",
      2: "participant",
    });
    const adminToken = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const participantToken = app.jwt.sign({ sub: "1", sid: 2, tid: "t2" });

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

    setExpiredCode(true);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/activities/1/checkin",
      headers: headers(participantToken),
      payload: { code: "ABCDEFG1" },
    });
    expect(invalid.statusCode).toBe(401);
  });
});
