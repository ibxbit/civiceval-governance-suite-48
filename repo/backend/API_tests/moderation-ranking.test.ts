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

      if (text.includes("INSERT INTO app.qna_reports") && !text.includes("UPDATE")) {
        return {
          rows: [
            {
              id: 7,
              qna_id: Number(values?.[0]),
              reason: String(values?.[1]),
              details: values?.[2] ?? null,
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

      if (text.includes("UPDATE app.qna_reports")) {
        return {
          rows: [
            {
              id: 7,
              qna_id: 3,
              reason: "abuse",
              details: null,
              status: String(values?.[1] ?? "resolved"),
              handled_by_user_id: 1,
              handled_at: new Date(),
              resolution_note: values?.[3] ?? null,
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

      if (text.includes("COUNT(*)::text AS total") && text.includes("app.comments")) {
        return { rows: [{ total: "1" }] as T[] };
      }

      if (text.includes("FROM app.comments") && text.includes("ORDER BY pinned")) {
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

      if (text.includes("INSERT INTO app.comment_reports")) {
        return {
          rows: [
            {
              id: 5,
              comment_id: Number(values?.[0]),
              reason: String(values?.[1]),
              details: values?.[2] ?? null,
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

      if (text.includes("FROM app.comment_reports") && text.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 5,
              comment_id: 1,
              reason: "spam",
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

      if (text.includes("FROM app.comment_reports") && text.includes("WHERE status = 'open'")) {
        return {
          rows: [
            {
              id: 5,
              comment_id: 1,
              reason: "spam",
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

      if (text.includes("UPDATE app.comment_reports")) {
        return {
          rows: [
            {
              id: 5,
              comment_id: 1,
              reason: "spam",
              details: null,
              status: "resolved",
              handled_by_user_id: 1,
              handled_at: new Date(),
              resolution_note: values?.[3] ?? null,
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("DISTINCT ON (subject_key)")) {
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
            {
              id: 2,
              subject_key: "project-b",
              benchmark_value: 60,
              price_value: 70,
              volatility_value: 50,
              benchmark_weight: 50,
              price_weight: 25,
              volatility_weight: 25,
              score: 60,
              created_by_user_id: 1,
              created_at: new Date(),
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

  it("comment pin and unpin", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const pin = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/pin",
      headers: headers(token),
      payload: { pinned: true },
    });
    expect(pin.statusCode).toBe(200);
    expect(pin.json().pinned).toBe(true);

    const unpin = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/pin",
      headers: headers(token),
      payload: { pinned: false },
    });
    expect(unpin.statusCode).toBe(200);
    expect(unpin.json().pinned).toBe(false);
  });

  it("comment pin defaults to true when no payload", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const pin = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/pin",
      headers: headers(token),
      payload: {},
    });
    expect(pin.statusCode).toBe(200);
    expect(pin.json().pinned).toBe(true);
  });

  it("participant cannot pin comments", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/pin",
      headers: headers(token),
      payload: { pinned: true },
    });
    expect(response.statusCode).toBe(403);
  });

  it("create comment report", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/reports",
      headers: headers(token),
      payload: { reason: "spam content", details: "This is clearly spam" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.commentId).toBe(1);
    expect(body.status).toBe("open");
    expect(body.createdAt).toBeDefined();
  });

  it("comment report rejects short reason", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/reports",
      headers: headers(token),
      payload: { reason: "ab" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("handle comment report with approve action", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/reports/5/handle",
      headers: headers(token),
      payload: { action: "approve" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(5);
    expect(body.status).toBe("resolved");
    expect(body.handledByUserId).toBeTypeOf("number");
    expect(body.handledAt).not.toBeNull();
  });

  it("handle comment report with block action", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/reports/5/handle",
      headers: headers(token),
      payload: { action: "block", note: "Confirmed violation" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("resolved");
  });

  it("handle comment report with dismiss action", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/reports/5/handle",
      headers: headers(token),
      payload: { action: "dismiss" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("handle report rejects invalid action", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/reports/5/handle",
      headers: headers(token),
      payload: { action: "delete" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("participant cannot handle reports", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/reports/5/handle",
      headers: headers(token),
      payload: { action: "approve" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("qna list returns paginated results", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/qna?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.total).toBeTypeOf("number");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("qna list supports status filter", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/qna?page=1&limit=20&status=pending",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
  });

  it("participant cannot list qna", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/qna?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(403);
  });

  it("qna pin and unpin", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const pin = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/pin",
      headers: headers(token),
      payload: { pinned: true },
    });
    expect(pin.statusCode).toBe(200);
    expect(pin.json().pinned).toBe(true);

    const unpin = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/pin",
      headers: headers(token),
      payload: { pinned: false },
    });
    expect(unpin.statusCode).toBe(200);
    expect(unpin.json().pinned).toBe(false);
  });

  it("participant cannot pin qna", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/pin",
      headers: headers(token),
      payload: { pinned: true },
    });

    expect(response.statusCode).toBe(403);
  });

  it("qna reports list returns open reports", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/qna/reports?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].status).toBe("open");
    expect(body.total).toBeTypeOf("number");
    expect(body.page).toBe(1);
  });

  it("participant cannot view qna reports", async () => {
    const app = await buildApp("participant");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/qna/reports?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(403);
  });

  it("rankings latest returns latest per subject", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/rankings/latest",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rankings).toBeInstanceOf(Array);
    expect(body.rankings.length).toBe(2);
    expect(body.rankings[0].score).toBeTypeOf("number");
    expect(body.rankings[0].weights).toBeDefined();
    expect(body.rankings[0].weights.benchmark).toBeTypeOf("number");
    expect(body.rankings[0].weights.price).toBeTypeOf("number");
    expect(body.rankings[0].weights.volatility).toBeTypeOf("number");
  });

  it("ranking score response includes all expected fields", async () => {
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
    const body = response.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.score).toBe(81);
    expect(body.benchmark).toBe(90);
    expect(body.price).toBe(80);
    expect(body.volatility).toBe(70);
    expect(body.weights.benchmark).toBe(40);
    expect(body.weights.price).toBe(30);
    expect(body.weights.volatility).toBe(30);
    expect(body.createdByUserId).toBeTypeOf("number");
    expect(body.createdAt).toBeDefined();
  });

  it("participant cannot submit rankings", async () => {
    const app = await buildApp("participant");
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

    expect(response.statusCode).toBe(403);
  });

  it("comment create response includes expected fields", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments",
      headers: headers(token),
      payload: { body: "test comment" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.status).toBe("pending");
    expect(body.pinned).toBe(false);
    expect(body.createdByUserId).toBeTypeOf("number");
    expect(body.createdAt).toBeDefined();
  });

  it("comment create rejects empty body", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments",
      headers: headers(token),
      payload: { body: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("admin cannot create comments (only participant and reviewer)", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments",
      headers: headers(token),
      payload: { body: "admin comment" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("qna create returns expected fields", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/qna",
      headers: headers(token),
      payload: { questionText: "What is the process?" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.status).toBe("pending");
    expect(body.pinned).toBe(false);
    expect(body.createdByUserId).toBeTypeOf("number");
  });

  it("qna report create", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/reports",
      headers: headers(token),
      payload: { reason: "inappropriate content" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.qnaId).toBe(3);
    expect(body.status).toBe("open");
  });

  it("qna report handle with approve action", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/reports/7/handle",
      headers: headers(token),
      payload: { action: "approve" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBeTypeOf("string");
    expect(body.handledByUserId).toBeTypeOf("number");
    expect(body.handledAt).not.toBeNull();
  });

  it("unauthenticated ranking request returns 401", async () => {
    const app = await buildApp("admin");

    const response = await app.inject({
      method: "GET",
      url: "/api/rankings/latest",
      headers: {
        "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
        "x-timestamp": String(Date.now()),
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("comment moderation approve returns correct status transition", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    await app.inject({
      method: "POST",
      url: "/api/moderation/comments",
      headers: headers(token),
      payload: { body: "test" },
    });

    const approved = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/approve",
      headers: headers(token),
      payload: {},
    });

    expect(approved.statusCode).toBe(200);
    const body = approved.json();
    expect(body.status).toBe("approved");
    expect(body.moderatedByUserId).toBeTypeOf("number");
    expect(body.moderatedAt).not.toBeNull();
  });

  it("blocking a comment resets pinned to false", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

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

  it("comment report with details includes details in response", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/reports",
      headers: headers(token),
      payload: { reason: "spam", details: "detailed explanation" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.reason).toBe("string");
    expect(typeof body.details).toBe("string");
  });

  it("qna list response items have correct shape", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/qna?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    const item = body.data[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("questionText");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("pinned");
    expect(item).toHaveProperty("createdByUserId");
  });

  it("qna approve returns correct status in response body", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/qna/3/approve",
      headers: headers(token),
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("approved");
    expect(body.moderatedAt).not.toBeNull();
  });

  it("comment approve response includes moderatedByUserId and moderatedAt", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/approve",
      headers: headers(token),
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.moderatedByUserId).toBe("number");
    expect(typeof body.moderatedAt).toBe("string");
  });

  it("rankings score rejects missing subjectKey", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: headers(token),
      payload: {
        benchmark: 90,
        price: 80,
        volatility: 70,
        weights: { benchmark: 40, price: 30, volatility: 30 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rankings score rejects negative benchmark value", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: headers(token),
      payload: {
        subjectKey: "project-a",
        benchmark: -1,
        price: 80,
        volatility: 70,
        weights: { benchmark: 40, price: 30, volatility: 30 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("comment create with optional contentId", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments",
      headers: headers(token),
      payload: { body: "test", contentId: 5 },
    });

    expect(response.statusCode).toBe(200);
  });

  it("comment report with details field", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/comments/1/reports",
      headers: headers(token),
      payload: { reason: "spam content", details: "This is abusive" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.details).toBe("string");
  });

  it("handle report with note parameter", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/reports/5/handle",
      headers: headers(token),
      payload: { action: "dismiss", note: "False positive" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.resolutionNote).toBeDefined();
  });

  it("qna create with optional answerText", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/qna",
      headers: headers(token),
      payload: { questionText: "How?", answerText: "Like this" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.answerText).toBeDefined();
  });

  it("qna create with optional activityId", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/moderation/qna",
      headers: headers(token),
      payload: { questionText: "Why?", activityId: 42 },
    });

    expect(response.statusCode).toBe(200);
  });

  it("rankings score rejects zero-length subjectKey", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: headers(token),
      payload: {
        subjectKey: "",
        benchmark: 90,
        price: 80,
        volatility: 70,
        weights: { benchmark: 40, price: 30, volatility: 30 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rankings score rejects benchmark above 100", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: headers(token),
      payload: {
        subjectKey: "project-a",
        benchmark: 101,
        price: 50,
        volatility: 50,
        weights: { benchmark: 40, price: 30, volatility: 30 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rankings score rejects negative price", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: headers(token),
      payload: {
        subjectKey: "project-a",
        benchmark: 90,
        price: -1,
        volatility: 70,
        weights: { benchmark: 40, price: 30, volatility: 30 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("comment list response items have correct shape", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/comments?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(typeof item.id).toBe("number");
      expect(typeof item.body).toBe("string");
      expect(typeof item.status).toBe("string");
      expect(typeof item.pinned).toBe("boolean");
      expect(typeof item.createdByUserId).toBe("number");
      expect(item.createdAt).toBeDefined();
    }
  });

  it("qna list items have expected fields", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/qna?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    const item = body.data[0];
    expect(item.id).toBeDefined();
    expect(item.questionText).toBeDefined();
    expect(item.status).toBeDefined();
    expect(typeof item.pinned).toBe("boolean");
    expect(item.createdByUserId).toBeDefined();
    expect(item.createdAt).toBeDefined();
  });

  it("comment report list items have expected structure", async () => {
    const app = await buildApp("reviewer");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/moderation/reports?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    const item = body.data[0];
    expect(item.id).toBeDefined();
    expect(item.commentId).toBeDefined();
    expect(typeof item.reason).toBe("string");
    expect(item.status).toBeDefined();
    expect(item.createdByUserId).toBeDefined();
    expect(item.createdAt).toBeDefined();
  });
});
