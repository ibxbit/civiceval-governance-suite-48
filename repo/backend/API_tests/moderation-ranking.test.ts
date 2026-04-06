import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import moderationRankingRoutes from "../src/routes/moderation-ranking.js";

describe("moderation and ranking routes", () => {
  const buildApp = async (role: "admin" | "reviewer" | "participant" = "admin") => {
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

    let commentStatus: "pending" | "approved" | "blocked" = "pending";
    let pinned = false;
    let qnaStatus: "pending" | "approved" | "blocked" = "pending";
    let qnaPinned = false;

    const queryFn = async <T>(text: string, values?: unknown[]) => {
      if (text.includes("SELECT s.id AS session_id")) {
        return {
          rows: [
            {
              session_id: 1,
              user_id: 1,
              username: "reviewer",
              role,
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.comments")) {
        commentStatus = "pending";
        pinned = false;
      }

      if (text.includes("INSERT INTO app.qna_entries")) {
        qnaStatus = "pending";
        qnaPinned = false;
      }

      if (text.includes("status = 'approved'")) {
        commentStatus = "approved";
      }

      if (text.includes("status = 'blocked'")) {
        commentStatus = "blocked";
        pinned = false;
      }

      if (text.includes("UPDATE app.qna_entries") && text.includes("status = 'approved'")) {
        qnaStatus = "approved";
      }

      if (text.includes("UPDATE app.qna_entries") && text.includes("status = 'blocked'")) {
        qnaStatus = "blocked";
        qnaPinned = false;
      }

      if (text.includes("SET\n            pinned")) {
        pinned = Boolean(values?.[1]);
      }

      if (text.includes("UPDATE app.qna_entries") && text.includes("SET\n            pinned")) {
        qnaPinned = Boolean(values?.[1]);
      }

      if (text.includes("INSERT INTO app.rankings")) {
        return {
          rows: [
            {
              id: 1,
              subject_key: "project-a",
              benchmark_value: 90,
              price_value: 80,
              volatility_value: 70,
              benchmark_weight: 40,
              price_weight: 30,
              volatility_weight: 30,
              score: 81,
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("UPDATE app.comments") ||
        text.includes("INSERT INTO app.comments")
      ) {
        return {
          rows: [
            {
              id: 1,
              content_id: null,
              body: "body",
              status: commentStatus,
              pinned,
              created_by_user_id: 1,
              moderated_by_user_id: 1,
              moderation_note: null,
              moderated_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("UPDATE app.qna_entries") ||
        text.includes("INSERT INTO app.qna_entries")
      ) {
        return {
          rows: [
            {
              id: 3,
              activity_id: null,
              question_text: "question",
              answer_text: null,
              status: qnaStatus,
              pinned: qnaPinned,
              created_by_user_id: 1,
              moderated_by_user_id: 1,
              moderation_note: null,
              moderated_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.qna_entries") && text.includes("ORDER BY pinned")) {
        return {
          rows: [
            {
              id: 3,
              activity_id: null,
              question_text: "question",
              answer_text: null,
              status: qnaStatus,
              pinned: qnaPinned,
              created_by_user_id: 1,
              moderated_by_user_id: 1,
              moderation_note: null,
              moderated_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.qna_reports") && text.includes("WHERE status = 'open'")) {
        return {
          rows: [
            {
              id: 7,
              qna_id: 3,
              reason: "abuse",
              details: null,
              status: "open",
              handled_by_user_id: null,
              handled_at: null,
              resolution_note: null,
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.qna_reports") && text.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 7,
              qna_id: 3,
              reason: "abuse",
              details: null,
              status: "open",
              handled_by_user_id: null,
              handled_at: null,
              resolution_note: null,
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("INSERT INTO app.qna_reports") || text.includes("UPDATE app.qna_reports")) {
        return {
          rows: [
            {
              id: 7,
              qna_id: 3,
              reason: "abuse",
              details: null,
              status: "resolved",
              handled_by_user_id: 1,
              handled_at: new Date(),
              resolution_note: null,
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("COUNT(*)::text AS total") && text.includes("app.qna_entries")) {
        return { rows: [{ total: "1" }] as T[] };
      }

      if (text.includes("COUNT(*)::text AS total") && text.includes("app.qna_reports")) {
        return { rows: [{ total: "1" }] as T[] };
      }

      return { rows: [] as T[] };
    };

    app.decorate("db", {
      query: queryFn,
      connect: async () =>
        ({ query: queryFn, release: () => undefined }) as never,
    } as unknown as Pool);

    await app.register(moderationRankingRoutes, { prefix: "/api" });
    return app;
  };

  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
    "x-timestamp": String(Date.now()),
  });

  it("accepts valid weights summing to 100 and computes score", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: headers(token),
      payload: {
        subjectKey: "project-a",
        benchmark: 90,
        price: 80,
        volatility: 70,
        weights: { benchmark: 40, price: 30, volatility: 30 },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().score).toBe(81);
  });

  it("rejects weights not summing to 100", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: headers(token),
      payload: {
        subjectKey: "project-a",
        benchmark: 90,
        price: 80,
        volatility: 70,
        weights: { benchmark: 40, price: 30, volatility: 20 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("comment moderation lifecycle", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const created = await app.inject({
      method: "POST",
      url: "/api/moderation/comments",
      headers: headers(token),
      payload: { body: "comment" },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().status).toBe("pending");

    const approved = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/approve",
      headers: headers(token),
      payload: {},
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe("approved");

    const blocked = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/block",
      headers: headers(token),
      payload: {},
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json().status).toBe("blocked");
    expect(blocked.json().pinned).toBe(false);
  });

  it("denies participant access to moderation queue reads", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const commentsResponse = await app.inject({
      method: "GET",
      url: "/api/moderation/comments?page=1&limit=20",
      headers: headers(token),
    });
    expect(commentsResponse.statusCode).toBe(403);

    const reportsResponse = await app.inject({
      method: "GET",
      url: "/api/moderation/reports?page=1&limit=20",
      headers: headers(token),
    });
    expect(reportsResponse.statusCode).toBe(403);
  });

  it("supports qna moderation lifecycle", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const created = await app.inject({
      method: "POST",
      url: "/api/moderation/qna",
      headers: headers(token),
      payload: { questionText: "How is this scored?" },
    });
    expect(created.statusCode).toBe(200);

    const approved = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/approve",
      headers: headers(token),
      payload: {},
    });
    expect(approved.statusCode).toBe(200);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/block",
      headers: headers(token),
      payload: {},
    });
    expect(blocked.statusCode).toBe(200);

    const report = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/reports",
      headers: headers(token),
      payload: { reason: "abuse" },
    });
    expect(report.statusCode).toBe(200);

    const handled = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/reports/7/handle",
      headers: headers(token),
      payload: { action: "approve" },
    });
    expect(handled.statusCode).toBe(200);
  });

  it("enforces nonce on authenticated moderation reads", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const withoutNonce = await app.inject({
      method: "GET",
      url: "/api/moderation/comments?page=1&limit=20",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(withoutNonce.statusCode).toBe(400);
  });
});
