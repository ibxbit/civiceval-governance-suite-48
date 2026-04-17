import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import {
  setupTestEnv,
  cleanupDb,
  canConnectToDb,
  nonceHeaders,
  authHeaders,
} from "./helpers/setup-db.js";
import { TEST_PASSWORD, registerAndLogin } from "./helpers/test-users.js";

describe("Evaluations – no-mock integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let dbAvailable = false;

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

  /** Register a user, upgrade role via DB, re-login and return fresh token. */
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

  const getAdminToken = async (suffix = "") => {
    const { token } = await registerWithRole(`admin${suffix}`, "admin");
    return token;
  };

  const getProgramOwnerToken = async (suffix = "") => {
    const { token } = await registerWithRole(
      `progowner${suffix}`,
      "program_owner",
    );
    return token;
  };

  const getParticipantToken = async (suffix = "") => {
    const { token } = await registerWithRole(
      `participant${suffix}`,
      "participant",
    );
    return token;
  };

  const getReviewerToken = async (suffix = "") => {
    const { token } = await registerWithRole(`reviewer${suffix}`, "reviewer");
    return token;
  };

  /** Create an evaluation form as program_owner. Returns the parsed body. */
  const createForm = async (
    token: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const payload = {
      title: "Test Evaluation Form",
      questions: [
        { prompt: "Rate this session", type: "numeric_scale", required: true },
        { prompt: "Any comments?", type: "comment", required: false },
      ],
      ...overrides,
    };
    return app.inject({
      method: "POST",
      url: "/api/evaluations/forms",
      headers: authHeaders(token),
      payload,
    });
  };

  // ------------------------------------------------------------------ tests

  // a) GET /api/evaluations/forms – list
  it.skipIf(!dbAvailable)(
    "lists evaluation forms with pagination",
    async () => {
      const ownerToken = await getProgramOwnerToken("-list-owner");
      const createRes = await createForm(ownerToken);
      expect(createRes.statusCode).toBe(200);

      const participantToken = await getParticipantToken("-list-part");
      const listRes = await app.inject({
        method: "GET",
        url: "/api/evaluations/forms?page=1&limit=20",
        headers: authHeaders(participantToken),
      });

      expect(listRes.statusCode).toBe(200);
      const body = listRes.json<{
        data: unknown[];
        total: number;
        page: number;
        limit: number;
      }>();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    },
  );

  // b) POST /api/evaluations/forms – create
  it.skipIf(!dbAvailable)(
    "program_owner creates evaluation form with questions",
    async () => {
      const ownerToken = await getProgramOwnerToken("-create");
      const res = await createForm(ownerToken, {
        title: "My New Form",
        questions: [
          {
            prompt: "Scale question",
            type: "numeric_scale",
            required: true,
          },
          { prompt: "Comment question", type: "comment", required: false },
        ],
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        id: unknown;
        title: unknown;
        isActive: unknown;
      }>();
      expect(typeof body.id).toBe("number");
      expect(typeof body.title).toBe("string");
      expect(body.isActive).toBe(true);

      // Verify questions were created in DB
      const dbResult = await app.db.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM app.evaluation_questions WHERE form_id = $1",
        [body.id],
      );
      expect(Number(dbResult.rows[0]?.count)).toBe(2);
    },
  );

  // c) participant cannot create forms (403)
  it.skipIf(!dbAvailable)(
    "participant cannot create forms (403)",
    async () => {
      const participantToken = await getParticipantToken("-no-create");
      const res = await createForm(participantToken);
      expect(res.statusCode).toBe(403);
    },
  );

  // d) rejects empty questions array
  it.skipIf(!dbAvailable)("rejects empty questions array", async () => {
    const ownerToken = await getProgramOwnerToken("-empty-q");
    const res = await createForm(ownerToken, { questions: [] });
    expect(res.statusCode).toBe(400);
  });

  // e) GET /api/evaluations/forms/:formId – returns form detail with questions
  it.skipIf(!dbAvailable)(
    "returns form detail with questions",
    async () => {
      const ownerToken = await getProgramOwnerToken("-detail");
      const createRes = await createForm(ownerToken, {
        title: "Detail Form",
        questions: [
          { prompt: "Q1", type: "numeric_scale", required: true },
          { prompt: "Q2", type: "comment", required: false },
        ],
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      const participantToken = await getParticipantToken("-detail-part");
      const getRes = await app.inject({
        method: "GET",
        url: `/api/evaluations/forms/${id}`,
        headers: authHeaders(participantToken),
      });

      expect(getRes.statusCode).toBe(200);
      const body = getRes.json<{
        id: unknown;
        title: unknown;
        questions: Array<{
          prompt: unknown;
          type: unknown;
          required: unknown;
          order: unknown;
        }>;
      }>();
      expect(body.id).toBe(id);
      expect(typeof body.title).toBe("string");
      expect(Array.isArray(body.questions)).toBe(true);
      expect(body.questions.length).toBe(2);
      for (const q of body.questions) {
        expect(typeof q.prompt).toBe("string");
        expect(typeof q.type).toBe("string");
        expect(typeof q.required).toBe("boolean");
        expect(typeof q.order).toBe("number");
      }
    },
  );

  // f) returns 404 for non-existent form
  it.skipIf(!dbAvailable)(
    "returns 404 for non-existent form",
    async () => {
      const participantToken = await getParticipantToken("-404");
      const res = await app.inject({
        method: "GET",
        url: "/api/evaluations/forms/99999",
        headers: authHeaders(participantToken),
      });
      expect(res.statusCode).toBe(404);
    },
  );

  // g) returns 404 for inactive form
  it.skipIf(!dbAvailable)(
    "returns 404 for inactive form",
    async () => {
      const ownerToken = await getProgramOwnerToken("-inactive");
      const createRes = await createForm(ownerToken, { title: "Inactive Form" });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      await app.db.query(
        "UPDATE app.evaluation_forms SET is_active = false WHERE id = $1",
        [id],
      );

      const participantToken = await getParticipantToken("-inactive-part");
      const getRes = await app.inject({
        method: "GET",
        url: `/api/evaluations/forms/${id}`,
        headers: authHeaders(participantToken),
      });
      expect(getRes.statusCode).toBe(404);
    },
  );

  // h) participant submits valid numeric response
  it.skipIf(!dbAvailable)(
    "participant submits valid numeric response",
    async () => {
      const ownerToken = await getProgramOwnerToken("-submit");
      const createRes = await createForm(ownerToken, {
        title: "Submittable Form",
        questions: [
          { prompt: "Rate 1-5", type: "numeric_scale", required: true },
        ],
      });
      expect(createRes.statusCode).toBe(200);
      const { id: formId } = createRes.json<{ id: number }>();

      // Get the question id from DB
      const qResult = await app.db.query<{ id: number }>(
        "SELECT id FROM app.evaluation_questions WHERE form_id = $1 LIMIT 1",
        [formId],
      );
      const questionId = qResult.rows[0].id;

      const participantToken = await getParticipantToken("-submit-part");
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/evaluations/forms/${formId}/submissions`,
        headers: authHeaders(participantToken),
        payload: {
          responses: [{ questionId, numericValue: 3 }],
        },
      });

      expect(submitRes.statusCode).toBe(200);
      const body = submitRes.json<{
        receiptId: string;
        submittedAt: unknown;
      }>();
      expect(body.receiptId.startsWith("EVR-")).toBe(true);
      expect(body.submittedAt).toBeDefined();
    },
  );

  // i) rejects submission with unknown questionId
  it.skipIf(!dbAvailable)(
    "rejects submission with unknown questionId",
    async () => {
      const ownerToken = await getProgramOwnerToken("-unknown-q");
      const createRes = await createForm(ownerToken, {
        title: "Form For Unknown Q",
        questions: [{ prompt: "Q1", type: "numeric_scale", required: false }],
      });
      expect(createRes.statusCode).toBe(200);
      const { id: formId } = createRes.json<{ id: number }>();

      const participantToken = await getParticipantToken("-unknown-q-part");
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/evaluations/forms/${formId}/submissions`,
        headers: authHeaders(participantToken),
        payload: { responses: [{ questionId: 99999, numericValue: 3 }] },
      });
      expect(submitRes.statusCode).toBe(400);
    },
  );

  // j) rejects duplicate question responses
  it.skipIf(!dbAvailable)(
    "rejects duplicate question responses",
    async () => {
      const ownerToken = await getProgramOwnerToken("-dup-q");
      const createRes = await createForm(ownerToken, {
        title: "Form For Dup Q",
        questions: [{ prompt: "Q1", type: "numeric_scale", required: false }],
      });
      expect(createRes.statusCode).toBe(200);
      const { id: formId } = createRes.json<{ id: number }>();

      const qResult = await app.db.query<{ id: number }>(
        "SELECT id FROM app.evaluation_questions WHERE form_id = $1 LIMIT 1",
        [formId],
      );
      const questionId = qResult.rows[0].id;

      const participantToken = await getParticipantToken("-dup-q-part");
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/evaluations/forms/${formId}/submissions`,
        headers: authHeaders(participantToken),
        payload: {
          responses: [
            { questionId, numericValue: 3 },
            { questionId, numericValue: 4 },
          ],
        },
      });
      expect(submitRes.statusCode).toBe(400);
    },
  );

  // k) rejects missing required answer
  it.skipIf(!dbAvailable)(
    "rejects missing required answer",
    async () => {
      const ownerToken = await getProgramOwnerToken("-missing-req");
      const createRes = await createForm(ownerToken, {
        title: "Required Form",
        questions: [
          {
            prompt: "Required question",
            type: "numeric_scale",
            required: true,
          },
          {
            prompt: "Optional question",
            type: "comment",
            required: false,
          },
        ],
      });
      expect(createRes.statusCode).toBe(200);
      const { id: formId } = createRes.json<{ id: number }>();

      // Get the optional question id (we submit that one and omit the required one)
      const qResult = await app.db.query<{ id: number; is_required: boolean }>(
        "SELECT id, is_required FROM app.evaluation_questions WHERE form_id = $1 ORDER BY order_index ASC",
        [formId],
      );
      const optionalQ = qResult.rows.find((r) => !r.is_required);
      if (!optionalQ) throw new Error("Expected an optional question");

      const participantToken = await getParticipantToken("-missing-req-part");
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/evaluations/forms/${formId}/submissions`,
        headers: authHeaders(participantToken),
        payload: {
          // only answer the optional question, omit the required one
          responses: [{ questionId: optionalQ.id, commentValue: "hello" }],
        },
      });
      expect(submitRes.statusCode).toBe(400);
    },
  );

  // l) rejects non-participant role (program_owner)
  it.skipIf(!dbAvailable)(
    "rejects non-participant role (403)",
    async () => {
      const ownerToken = await getProgramOwnerToken("-role-check");
      const createRes = await createForm(ownerToken, {
        title: "Role Check Form",
        questions: [
          { prompt: "Rate it", type: "numeric_scale", required: false },
        ],
      });
      expect(createRes.statusCode).toBe(200);
      const { id: formId } = createRes.json<{ id: number }>();

      const qResult = await app.db.query<{ id: number }>(
        "SELECT id FROM app.evaluation_questions WHERE form_id = $1 LIMIT 1",
        [formId],
      );
      const questionId = qResult.rows[0].id;

      // program_owner attempts to submit – should be 403
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/evaluations/forms/${formId}/submissions`,
        headers: authHeaders(ownerToken),
        payload: { responses: [{ questionId, numericValue: 3 }] },
      });
      expect(submitRes.statusCode).toBe(403);
    },
  );

  // Helper: create a form with one numeric question and submit as a participant
  const createFormAndSubmit = async (
    ownerSuffix: string,
    participantSuffix: string,
  ) => {
    const ownerToken = await getProgramOwnerToken(ownerSuffix);
    const createRes = await createForm(ownerToken, {
      title: `Form ${ownerSuffix}`,
      questions: [
        { prompt: "Rate it", type: "numeric_scale", required: true },
      ],
    });
    expect(createRes.statusCode).toBe(200);
    const { id: formId } = createRes.json<{ id: number }>();

    const qResult = await app.db.query<{ id: number }>(
      "SELECT id FROM app.evaluation_questions WHERE form_id = $1 LIMIT 1",
      [formId],
    );
    const questionId = qResult.rows[0].id;

    const participantToken = await getParticipantToken(participantSuffix);
    const submitRes = await app.inject({
      method: "POST",
      url: `/api/evaluations/forms/${formId}/submissions`,
      headers: authHeaders(participantToken),
      payload: { responses: [{ questionId, numericValue: 4 }] },
    });
    expect(submitRes.statusCode).toBe(200);
    const { receiptId } = submitRes.json<{ receiptId: string }>();
    return { formId, receiptId, participantToken };
  };

  // m) owner retrieves own receipt
  it.skipIf(!dbAvailable)(
    "owner retrieves own receipt",
    async () => {
      const { receiptId, formId, participantToken } =
        await createFormAndSubmit("-receipt-owner", "-receipt-part");

      const getRes = await app.inject({
        method: "GET",
        url: `/api/evaluations/submissions/${receiptId}`,
        headers: authHeaders(participantToken),
      });

      expect(getRes.statusCode).toBe(200);
      const body = getRes.json<{
        receiptId: unknown;
        formId: unknown;
        submittedAt: unknown;
      }>();
      expect(body.receiptId).toBe(receiptId);
      expect(body.formId).toBe(formId);
      expect(body.submittedAt).toBeDefined();
    },
  );

  // n) different participant gets 404
  it.skipIf(!dbAvailable)(
    "different participant gets 404",
    async () => {
      const { receiptId } = await createFormAndSubmit(
        "-diff-owner",
        "-diff-partA",
      );

      const otherToken = await getParticipantToken("-diff-partB");
      const getRes = await app.inject({
        method: "GET",
        url: `/api/evaluations/submissions/${receiptId}`,
        headers: authHeaders(otherToken),
      });
      expect(getRes.statusCode).toBe(404);
    },
  );

  // o) reviewer can access any receipt
  it.skipIf(!dbAvailable)(
    "reviewer can access any receipt",
    async () => {
      const { receiptId } = await createFormAndSubmit(
        "-rev-owner",
        "-rev-part",
      );

      const reviewerToken = await getReviewerToken("-rev");
      const getRes = await app.inject({
        method: "GET",
        url: `/api/evaluations/submissions/${receiptId}`,
        headers: authHeaders(reviewerToken),
      });
      expect(getRes.statusCode).toBe(200);
    },
  );

  // p) admin can access any receipt
  it.skipIf(!dbAvailable)(
    "admin can access any receipt",
    async () => {
      const { receiptId } = await createFormAndSubmit(
        "-adm-owner",
        "-adm-part",
      );

      const adminToken = await getAdminToken("-adm");
      const getRes = await app.inject({
        method: "GET",
        url: `/api/evaluations/submissions/${receiptId}`,
        headers: authHeaders(adminToken),
      });
      expect(getRes.statusCode).toBe(200);
    },
  );

  // q) unauthenticated returns 401
  it.skipIf(!dbAvailable)(
    "unauthenticated receipt GET returns 401",
    async () => {
      const { receiptId } = await createFormAndSubmit(
        "-unauth-owner",
        "-unauth-part",
      );

      const getRes = await app.inject({
        method: "GET",
        url: `/api/evaluations/submissions/${receiptId}`,
        headers: nonceHeaders(),
      });
      expect(getRes.statusCode).toBe(401);
    },
  );
});
