import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import evaluationsRoutes from "../src/routes/evaluations.js";

describe("evaluation routes", () => {
  const buildApp = async (
    sessionById: Record<number, { userId: number; role: "program_owner" | "participant" | "reviewer" }> = {
      1: { userId: 1, role: "participant" },
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

    let formId = 1;

    const queryFn = async <T>(text: string, values?: unknown[]) => {
      if (text.includes("SELECT s.id AS session_id")) {
        const sid = Number(values?.[0]);
        const session = sessionById[sid] ?? { userId: 1, role: "participant" };
        return {
          rows: [
            {
              session_id: sid,
              user_id: session.userId,
              username: `user-${session.userId}`,
              role: session.role,
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

      if (text.includes("FROM app.evaluation_forms") && text.includes("WHERE id")) {
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

      if (text.includes("FROM app.evaluation_submissions") && text.includes("receipt_id = $1")) {
        const receiptId = String(values?.[0] ?? "");
        if (receiptId === "EVR-OWNER-1001") {
          return {
            rows: [
              {
                receipt_id: receiptId,
                form_id: 1,
                submitted_by_user_id: 1,
                submitted_at: new Date(),
              },
            ] as T[],
          };
        }

        if (receiptId === "EVR-OWNER-2002") {
          return {
            rows: [
              {
                receipt_id: receiptId,
                form_id: 1,
                submitted_by_user_id: 2,
                submitted_at: new Date(),
              },
            ] as T[],
          };
        }
      }

      return { rows: [] as T[] };
    };

    app.decorate("db", {
      query: queryFn,
      connect: async () => ({ query: queryFn, release: () => undefined }) as never,
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
    const app = await buildApp({ 1: { userId: 1, role: "program_owner" } });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/evaluations/forms",
      headers: headers(token),
      payload: {
        title: "Form",
        questions: [{ prompt: "How was it?", type: "numeric_scale", required: true }],
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("valid submission returns receipt id", async () => {
    const app = await buildApp({ 1: { userId: 1, role: "participant" } });
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

  it("enforces receipt ownership and reviewer override", async () => {
    const app = await buildApp({
      1: { userId: 1, role: "participant" },
      2: { userId: 2, role: "participant" },
      3: { userId: 3, role: "reviewer" },
    });

    const user1Token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const user2Token = app.jwt.sign({ sub: "2", sid: 2, tid: "t2" });
    const reviewerToken = app.jwt.sign({ sub: "3", sid: 3, tid: "t3" });

    const ownerAccess = await app.inject({
      method: "GET",
      url: "/api/evaluations/submissions/EVR-OWNER-1001",
      headers: headers(user1Token),
    });
    expect(ownerAccess.statusCode).toBe(200);

    const unauthorizedAccess = await app.inject({
      method: "GET",
      url: "/api/evaluations/submissions/EVR-OWNER-1001",
      headers: headers(user2Token),
    });
    expect(unauthorizedAccess.statusCode).toBe(404);

    const reviewerAccess = await app.inject({
      method: "GET",
      url: "/api/evaluations/submissions/EVR-OWNER-2002",
      headers: headers(reviewerToken),
    });
    expect(reviewerAccess.statusCode).toBe(200);
  });

  it("requires nonce for authenticated form reads", async () => {
    const app = await buildApp({ 1: { userId: 1, role: "participant" } });
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/evaluations/forms?page=1&limit=20",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
  });
});
