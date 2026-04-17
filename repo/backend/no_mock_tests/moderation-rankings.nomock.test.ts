import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import {
  setupTestEnv,
  cleanupDb,
  canConnectToDb,
  authHeaders,
  nonceHeaders,
} from "./helpers/setup-db.js";
import { TEST_PASSWORD, registerAndLogin } from "./helpers/test-users.js";

describe("Moderation & Rankings – no-mock integration", () => {
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

  /** Create a comment as the given user and return the response. */
  const createComment = async (token: string, bodyText = "A test comment body") =>
    app.inject({
      method: "POST",
      url: "/api/moderation/comments",
      headers: authHeaders(token),
      payload: { body: bodyText },
    });

  /** Create a QnA entry as the given user and return the response. */
  const createQna = async (token: string, questionText = "What is the process?") =>
    app.inject({
      method: "POST",
      url: "/api/moderation/qna",
      headers: authHeaders(token),
      payload: { questionText },
    });

  // ================================================================== COMMENT ENDPOINTS

  it.skipIf(!dbAvailable)("reviewer creates a comment", async () => {
    const { token } = await registerWithRole("reviewer-create-comment", "reviewer");

    const res = await createComment(token, "This is a reviewer comment");

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: unknown;
      body: unknown;
      status: unknown;
      pinned: unknown;
      createdByUserId: unknown;
    }>();
    expect(typeof body.id).toBe("number");
    expect(typeof body.body).toBe("string");
    expect(body.status).toBe("pending");
    expect(body.pinned).toBe(false);
    expect(typeof body.createdByUserId).toBe("number");
  });

  it.skipIf(!dbAvailable)("participant creates a comment", async () => {
    const { token } = await registerWithRole("participant-create-comment", "participant");

    const res = await createComment(token, "This is a participant comment");

    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: unknown; status: unknown }>();
    expect(typeof body.id).toBe("number");
    expect(body.status).toBe("pending");
  });

  it.skipIf(!dbAvailable)("admin cannot create comments (403)", async () => {
    const { token } = await registerWithRole("admin-create-comment", "admin");

    const res = await createComment(token, "Admin trying to comment");

    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("reviewer approves comment", async () => {
    const { token } = await registerWithRole("reviewer-approve-comment", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const approveRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/approve`,
      headers: authHeaders(token),
    });

    expect(approveRes.statusCode).toBe(200);
    const body = approveRes.json<{
      status: unknown;
      moderatedByUserId: unknown;
      moderatedAt: unknown;
    }>();
    expect(body.status).toBe("approved");
    expect(body.moderatedByUserId).toBeDefined();
    expect(body.moderatedAt).not.toBeNull();
  });

  it.skipIf(!dbAvailable)("reviewer blocks comment", async () => {
    const { token } = await registerWithRole("reviewer-block-comment", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const blockRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/block`,
      headers: authHeaders(token),
    });

    expect(blockRes.statusCode).toBe(200);
    const body = blockRes.json<{ status: unknown; pinned: unknown }>();
    expect(body.status).toBe("blocked");
    expect(body.pinned).toBe(false);
  });

  it.skipIf(!dbAvailable)("reviewer pins comment", async () => {
    const { token } = await registerWithRole("reviewer-pin-comment", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    // Approve first
    await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/approve`,
      headers: authHeaders(token),
    });

    const pinRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/pin`,
      headers: authHeaders(token),
      payload: { pinned: true },
    });

    expect(pinRes.statusCode).toBe(200);
    const body = pinRes.json<{ pinned: unknown }>();
    expect(body.pinned).toBe(true);
  });

  it.skipIf(!dbAvailable)("blocking a pinned comment resets pin", async () => {
    const { token } = await registerWithRole("reviewer-block-pinned", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    // Approve and pin
    await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/approve`,
      headers: authHeaders(token),
    });
    await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/pin`,
      headers: authHeaders(token),
      payload: { pinned: true },
    });

    // Now block
    const blockRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/block`,
      headers: authHeaders(token),
    });

    expect(blockRes.statusCode).toBe(200);
    const body = blockRes.json<{ pinned: unknown; status: unknown }>();
    expect(body.pinned).toBe(false);
    expect(body.status).toBe("blocked");
  });

  it.skipIf(!dbAvailable)("participant cannot approve (403)", async () => {
    const { token: reviewerToken } = await registerWithRole(
      "reviewer-for-auth-test",
      "reviewer",
    );
    const { token: participantToken } = await registerWithRole(
      "participant-no-approve",
      "participant",
    );

    const createRes = await createComment(reviewerToken);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const approveRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/approve`,
      headers: authHeaders(participantToken),
    });

    expect(approveRes.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("list comments as reviewer", async () => {
    const { token } = await registerWithRole("reviewer-list-comments", "reviewer");

    // Create a comment first
    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/moderation/comments?page=1&limit=20",
      headers: authHeaders(token),
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json<{
      data: Array<{
        id: unknown;
        body: unknown;
        status: unknown;
        pinned: unknown;
        createdByUserId: unknown;
      }>;
      total: unknown;
    }>();
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect((body.total as number) >= 1).toBe(true);
    const item = body.data[0];
    expect(typeof item?.id).toBe("number");
    expect(typeof item?.body).toBe("string");
    expect(typeof item?.status).toBe("string");
    expect(typeof item?.pinned).toBe("boolean");
    expect(typeof item?.createdByUserId).toBe("number");
  });

  it.skipIf(!dbAvailable)("participant cannot list comments (403)", async () => {
    const { token } = await registerWithRole("participant-list-comments", "participant");

    const res = await app.inject({
      method: "GET",
      url: "/api/moderation/comments?page=1&limit=20",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(403);
  });

  // ================================================================== COMMENT REPORTS

  it.skipIf(!dbAvailable)("reviewer creates comment report", async () => {
    const { token } = await registerWithRole("reviewer-create-report", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "spam content" },
    });

    expect(reportRes.statusCode).toBe(200);
    const body = reportRes.json<{
      id: unknown;
      commentId: unknown;
      reason: unknown;
      status: unknown;
    }>();
    expect(typeof body.id).toBe("number");
    expect(typeof body.commentId).toBe("number");
    expect(typeof body.reason).toBe("string");
    expect(body.status).toBe("open");
  });

  it.skipIf(!dbAvailable)("report with details", async () => {
    const { token } = await registerWithRole("reviewer-report-details", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "spam content", details: "This comment promotes spam links" },
    });

    expect(reportRes.statusCode).toBe(200);
    const body = reportRes.json<{ details: unknown }>();
    expect(typeof body.details).toBe("string");
  });

  it.skipIf(!dbAvailable)("list open reports", async () => {
    const { token } = await registerWithRole("reviewer-list-reports", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "inappropriate content" },
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/moderation/reports?page=1&limit=20",
      headers: authHeaders(token),
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json<{
      data: Array<{ status: unknown }>;
      total: unknown;
    }>();
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.total as number) >= 1).toBe(true);
    const item = body.data[0];
    expect(item?.status).toBe("open");
  });

  it.skipIf(!dbAvailable)("handle report with approve", async () => {
    const { token } = await registerWithRole("reviewer-handle-approve", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "needs review" },
    });
    expect(reportRes.statusCode).toBe(200);
    const { id: reportId } = reportRes.json<{ id: number }>();

    const handleRes = await app.inject({
      method: "POST",
      url: `/api/moderation/reports/${reportId}/handle`,
      headers: authHeaders(token),
      payload: { action: "approve" },
    });

    expect(handleRes.statusCode).toBe(200);
    const body = handleRes.json<{ status: unknown }>();
    expect(body.status).toBe("resolved");
  });

  it.skipIf(!dbAvailable)("handle report with block", async () => {
    const { token } = await registerWithRole("reviewer-handle-block", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "harmful content" },
    });
    expect(reportRes.statusCode).toBe(200);
    const { id: reportId } = reportRes.json<{ id: number }>();

    const handleRes = await app.inject({
      method: "POST",
      url: `/api/moderation/reports/${reportId}/handle`,
      headers: authHeaders(token),
      payload: { action: "block" },
    });

    expect(handleRes.statusCode).toBe(200);
    const body = handleRes.json<{ status: unknown }>();
    expect(body.status).toBe("resolved");
  });

  it.skipIf(!dbAvailable)("handle report with dismiss", async () => {
    const { token } = await registerWithRole("reviewer-handle-dismiss", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "false alarm" },
    });
    expect(reportRes.statusCode).toBe(200);
    const { id: reportId } = reportRes.json<{ id: number }>();

    const handleRes = await app.inject({
      method: "POST",
      url: `/api/moderation/reports/${reportId}/handle`,
      headers: authHeaders(token),
      payload: { action: "dismiss" },
    });

    expect(handleRes.statusCode).toBe(200);
    const body = handleRes.json<{ status: unknown }>();
    expect(body.status).toBe("dismissed");
  });

  it.skipIf(!dbAvailable)("handle already-handled report returns 400", async () => {
    const { token } = await registerWithRole("reviewer-double-handle", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "test double handle" },
    });
    expect(reportRes.statusCode).toBe(200);
    const { id: reportId } = reportRes.json<{ id: number }>();

    // Handle once
    const firstHandle = await app.inject({
      method: "POST",
      url: `/api/moderation/reports/${reportId}/handle`,
      headers: authHeaders(token),
      payload: { action: "dismiss" },
    });
    expect(firstHandle.statusCode).toBe(200);

    // Handle again – should fail
    const secondHandle = await app.inject({
      method: "POST",
      url: `/api/moderation/reports/${reportId}/handle`,
      headers: authHeaders(token),
      payload: { action: "approve" },
    });

    expect(secondHandle.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("invalid action returns 400", async () => {
    const { token } = await registerWithRole("reviewer-invalid-action", "reviewer");

    const createRes = await createComment(token);
    expect(createRes.statusCode).toBe(200);
    const { id: commentId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/comments/${commentId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "test invalid action" },
    });
    expect(reportRes.statusCode).toBe(200);
    const { id: reportId } = reportRes.json<{ id: number }>();

    const handleRes = await app.inject({
      method: "POST",
      url: `/api/moderation/reports/${reportId}/handle`,
      headers: authHeaders(token),
      payload: { action: "delete" },
    });

    expect(handleRes.statusCode).toBe(400);
  });

  // ================================================================== QNA ENDPOINTS

  it.skipIf(!dbAvailable)("reviewer creates QnA entry", async () => {
    const { token } = await registerWithRole("reviewer-create-qna", "reviewer");

    const res = await createQna(token, "What is the governance process?");

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: unknown;
      questionText: unknown;
      status: unknown;
      pinned: unknown;
    }>();
    expect(typeof body.id).toBe("number");
    expect(typeof body.questionText).toBe("string");
    expect(body.status).toBe("pending");
    expect(body.pinned).toBe(false);
  });

  it.skipIf(!dbAvailable)("approve QnA", async () => {
    const { token } = await registerWithRole("reviewer-approve-qna", "reviewer");

    const createRes = await createQna(token, "How do I register for activities?");
    expect(createRes.statusCode).toBe(200);
    const { id: qnaId } = createRes.json<{ id: number }>();

    const approveRes = await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/approve`,
      headers: authHeaders(token),
    });

    expect(approveRes.statusCode).toBe(200);
    const body = approveRes.json<{ status: unknown }>();
    expect(body.status).toBe("approved");
  });

  it.skipIf(!dbAvailable)("block QnA", async () => {
    const { token } = await registerWithRole("reviewer-block-qna", "reviewer");

    const createRes = await createQna(token, "Some inappropriate question");
    expect(createRes.statusCode).toBe(200);
    const { id: qnaId } = createRes.json<{ id: number }>();

    const blockRes = await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/block`,
      headers: authHeaders(token),
    });

    expect(blockRes.statusCode).toBe(200);
    const body = blockRes.json<{ status: unknown; pinned: unknown }>();
    expect(body.status).toBe("blocked");
    expect(body.pinned).toBe(false);
  });

  it.skipIf(!dbAvailable)("pin QnA", async () => {
    const { token } = await registerWithRole("reviewer-pin-qna", "reviewer");

    const createRes = await createQna(token, "Important question to pin");
    expect(createRes.statusCode).toBe(200);
    const { id: qnaId } = createRes.json<{ id: number }>();

    // Approve first
    await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/approve`,
      headers: authHeaders(token),
    });

    const pinRes = await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/pin`,
      headers: authHeaders(token),
      payload: { pinned: true },
    });

    expect(pinRes.statusCode).toBe(200);
    const body = pinRes.json<{ pinned: unknown }>();
    expect(body.pinned).toBe(true);
  });

  it.skipIf(!dbAvailable)("list QnA with status filter", async () => {
    const { token } = await registerWithRole("reviewer-list-qna", "reviewer");

    // Create and approve a QnA entry
    const createRes = await createQna(token, "Question for listing test");
    expect(createRes.statusCode).toBe(200);
    const { id: qnaId } = createRes.json<{ id: number }>();

    await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/approve`,
      headers: authHeaders(token),
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/moderation/qna?status=approved",
      headers: authHeaders(token),
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json<{
      data: Array<{ status: unknown }>;
      total: unknown;
    }>();
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      expect(item.status).toBe("approved");
    }
  });

  it.skipIf(!dbAvailable)("participant cannot list QnA (403)", async () => {
    const { token } = await registerWithRole("participant-list-qna", "participant");

    const res = await app.inject({
      method: "GET",
      url: "/api/moderation/qna?page=1&limit=20",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(403);
  });

  // ================================================================== QNA REPORTS

  it.skipIf(!dbAvailable)("create QnA report", async () => {
    const { token } = await registerWithRole("reviewer-create-qna-report", "reviewer");

    const createRes = await createQna(token, "Question to report");
    expect(createRes.statusCode).toBe(200);
    const { id: qnaId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "misleading content" },
    });

    expect(reportRes.statusCode).toBe(200);
    const body = reportRes.json<{
      id: unknown;
      qnaId: unknown;
      reason: unknown;
      status: unknown;
    }>();
    expect(typeof body.id).toBe("number");
    expect(typeof body.qnaId).toBe("number");
    expect(typeof body.reason).toBe("string");
    expect(body.status).toBe("open");
  });

  it.skipIf(!dbAvailable)("list QnA reports", async () => {
    const { token } = await registerWithRole("reviewer-list-qna-reports", "reviewer");

    // Create a QnA and report it
    const createRes = await createQna(token, "Question to list in reports");
    expect(createRes.statusCode).toBe(200);
    const { id: qnaId } = createRes.json<{ id: number }>();

    await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "test qna report" },
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/moderation/qna/reports",
      headers: authHeaders(token),
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json<{
      data: Array<unknown>;
      total: unknown;
    }>();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it.skipIf(!dbAvailable)("handle QnA report", async () => {
    const { token } = await registerWithRole("reviewer-handle-qna-report", "reviewer");

    const createRes = await createQna(token, "Question to handle report on");
    expect(createRes.statusCode).toBe(200);
    const { id: qnaId } = createRes.json<{ id: number }>();

    const reportRes = await app.inject({
      method: "POST",
      url: `/api/moderation/qna/${qnaId}/reports`,
      headers: authHeaders(token),
      payload: { reason: "content for handling" },
    });
    expect(reportRes.statusCode).toBe(200);
    const { id: reportId } = reportRes.json<{ id: number }>();

    const handleRes = await app.inject({
      method: "POST",
      url: `/api/moderation/qna/reports/${reportId}/handle`,
      headers: authHeaders(token),
      payload: { action: "approve" },
    });

    expect(handleRes.statusCode).toBe(200);
    const body = handleRes.json<{ status: unknown }>();
    expect(body.status).toBe("resolved");
  });

  it.skipIf(!dbAvailable)("participant cannot view QnA reports (403)", async () => {
    const { token } = await registerWithRole("participant-qna-reports", "participant");

    const res = await app.inject({
      method: "GET",
      url: "/api/moderation/qna/reports",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(403);
  });

  // ================================================================== RANKINGS

  it.skipIf(!dbAvailable)("program_owner submits ranking score", async () => {
    const { token } = await registerWithRole("program-owner-score", "program_owner");

    const res = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: authHeaders(token),
      payload: {
        subjectKey: "subject-alpha",
        benchmark: 90,
        price: 80,
        volatility: 70,
        weights: { benchmark: 50, price: 30, volatility: 20 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: unknown;
      score: unknown;
      benchmark: unknown;
      price: unknown;
      volatility: unknown;
      weights: unknown;
      createdByUserId: unknown;
    }>();
    expect(typeof body.id).toBe("number");
    expect(typeof body.score).toBe("number");
    expect(typeof body.benchmark).toBe("number");
    expect(typeof body.price).toBe("number");
    expect(typeof body.volatility).toBe("number");
    expect(typeof body.weights).toBe("object");
    expect(typeof body.createdByUserId).toBe("number");
  });

  it.skipIf(!dbAvailable)("weights not summing to 100 returns 400", async () => {
    const { token } = await registerWithRole("program-owner-bad-weights", "program_owner");

    const res = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: authHeaders(token),
      payload: {
        subjectKey: "subject-beta",
        benchmark: 90,
        price: 80,
        volatility: 70,
        weights: { benchmark: 40, price: 30, volatility: 20 },
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("participant cannot submit rankings (403)", async () => {
    const { token } = await registerWithRole("participant-no-ranking", "participant");

    const res = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: authHeaders(token),
      payload: {
        subjectKey: "subject-gamma",
        benchmark: 90,
        price: 80,
        volatility: 70,
        weights: { benchmark: 50, price: 30, volatility: 20 },
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("latest rankings returns per-subject latest", async () => {
    const { token } = await registerWithRole("program-owner-latest", "program_owner");

    const subjectOne = "subject-latest-one";
    const subjectTwo = "subject-latest-two";

    // Submit two scores for subject one
    const firstScore = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: authHeaders(token),
      payload: {
        subjectKey: subjectOne,
        benchmark: 60,
        price: 70,
        volatility: 80,
        weights: { benchmark: 50, price: 30, volatility: 20 },
      },
    });
    expect(firstScore.statusCode).toBe(200);

    const secondScore = await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: authHeaders(token),
      payload: {
        subjectKey: subjectOne,
        benchmark: 90,
        price: 85,
        volatility: 75,
        weights: { benchmark: 50, price: 30, volatility: 20 },
      },
    });
    expect(secondScore.statusCode).toBe(200);
    const secondScoreBody = secondScore.json<{ score: number; subjectKey: string }>();

    // Submit one score for subject two
    await app.inject({
      method: "POST",
      url: "/api/rankings/score",
      headers: authHeaders(token),
      payload: {
        subjectKey: subjectTwo,
        benchmark: 50,
        price: 60,
        volatility: 40,
        weights: { benchmark: 50, price: 30, volatility: 20 },
      },
    });

    const latestRes = await app.inject({
      method: "GET",
      url: "/api/rankings/latest",
      headers: authHeaders(token),
    });

    expect(latestRes.statusCode).toBe(200);
    const body = latestRes.json<{
      rankings: Array<{ subjectKey: string; score: number }>;
    }>();
    expect(Array.isArray(body.rankings)).toBe(true);

    // Find both subjects in rankings
    const subjectOneRanking = body.rankings.find(
      (r) => r.subjectKey === subjectOne,
    );
    const subjectTwoRanking = body.rankings.find(
      (r) => r.subjectKey === subjectTwo,
    );

    expect(subjectOneRanking).toBeDefined();
    expect(subjectTwoRanking).toBeDefined();

    // The score for subject one should match the most recent submission
    expect(subjectOneRanking?.score).toBe(secondScoreBody.score);
  });

  it.skipIf(!dbAvailable)("unauthenticated ranking request returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/rankings/latest",
      headers: nonceHeaders(),
    });

    expect(res.statusCode).toBe(401);
  });
});
