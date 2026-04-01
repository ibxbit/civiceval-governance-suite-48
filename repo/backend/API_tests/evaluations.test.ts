import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import evaluationsRoutes from "../src/routes/evaluations.js";

describe("evaluation routes", () => {
  const buildApp = async (
    role: "program_owner" | "participant" = "participant",
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

    let formId = 1;

    const queryFn = async <T>(text: string) => {
      if (text.includes("SELECT s.id AS session_id")) {
        return {
          rows: [
            {
              session_id: 1,
              user_id: 1,
              username: "participant",
              role,
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.evaluation_forms")) {
        return {
          rows: [
            {
              id: formId,
              activity_id: null,
              title: "Form",
              description: null,
              is_active: true,
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("FROM app.evaluation_forms") &&
        text.includes("WHERE id")
      ) {
        return {
          rows: [
            {
              id: formId,
              activity_id: null,
              title: "Form",
              description: null,
              is_active: true,
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.evaluation_questions")) {
        return {
          rows: [
            {
              id: 11,
              form_id: formId,
              prompt: "How was it?",
              response_type: "numeric_scale",
              is_required: true,
              order_index: 1,
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.evaluation_submissions")) {
        return {
          rows: [
            {
              id: 77,
              receipt_id: "EVR-TEST-123",
              submitted_at: new Date(),
            },
          ] as T[],
        };
      }

      return { rows: [] as T[] };
    };

    app.decorate("db", {
      query: queryFn,
      connect: async () =>
        ({ query: queryFn, release: () => undefined }) as never,
    } as unknown as Pool);

    await app.register(evaluationsRoutes, { prefix: "/api" });
    return app;
  };

  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
    "x-timestamp": String(Date.now()),
  });

  it("creates form successfully", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/evaluations/forms",
      headers: headers(token),
      payload: {
        title: "Form",
        questions: [
          { prompt: "How was it?", type: "numeric_scale", required: true },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("valid submission returns receipt id", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/evaluations/forms/1/submissions",
      headers: headers(token),
      payload: { responses: [{ questionId: 11, numericValue: 5 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().receiptId).toBeDefined();
  });

  it("missing required question returns 400", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/evaluations/forms/1/submissions",
      headers: headers(token),
      payload: { responses: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it("duplicate response returns 400", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/evaluations/forms/1/submissions",
      headers: headers(token),
      payload: {
        responses: [
          { questionId: 11, numericValue: 5 },
          { questionId: 11, numericValue: 4 },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("invalid question id returns 400", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/evaluations/forms/1/submissions",
      headers: headers(token),
      payload: { responses: [{ questionId: 999, numericValue: 5 }] },
    });
    expect(response.statusCode).toBe(400);
  });
});
