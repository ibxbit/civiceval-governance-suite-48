import { rm } from "node:fs/promises";
import { join } from "node:path";
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

const minimalPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF\n",
);

const minimalPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

const fakeVideo = Buffer.from("fake-video-content-for-testing");

const buildMultipartBody = (
  fieldName: string,
  filename: string,
  contentType: string,
  data: Buffer,
  boundary: string,
): Buffer =>
  Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

const buildEmptyMultipart = (boundary: string): Buffer =>
  Buffer.from(`--${boundary}--\r\n`);

describe("CMS Files – no-mock integration", () => {
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
    // Best-effort removal of any test files written today
    const today = new Date().toISOString().slice(0, 10);
    const storageDir = join(process.cwd(), "storage", "private", today);
    await rm(storageDir, { recursive: true, force: true }).catch(() =>
      undefined,
    );
    await app.close();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await cleanupDb(app.db);
  });

  // ------------------------------------------------------------------ helpers
  const uploadFile = async (
    token: string,
    filename: string,
    contentType: string,
    data: Buffer,
  ) => {
    const boundary = "----TestBoundary";
    const body = buildMultipartBody("file", filename, contentType, data, boundary);
    return app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
  };

  const generateLink = async (
    token: string,
    fileId: number,
    expiresInDays = 1,
  ) =>
    app.inject({
      method: "POST",
      url: `/api/cms/files/${fileId}/link`,
      headers: authHeaders(token),
      payload: { expiresInDays },
    });

  // ------------------------------------------------------------------ tests

  it.skipIf(!dbAvailable)(
    "uploads a valid PDF and returns file metadata",
    async () => {
      const { token } = await registerAndLogin(
        app,
        ADMIN_USERNAME,
        TEST_PASSWORD,
      );
      await app.db.query(
        "UPDATE app.users SET role = 'admin' WHERE username = $1",
        [ADMIN_USERNAME],
      );
      // Re-login to get a token with the updated role embedded in session
      const { token: adminToken } = await registerAndLogin(
        app,
        `${ADMIN_USERNAME}-2`,
        TEST_PASSWORD,
      );
      await app.db.query(
        "UPDATE app.users SET role = 'admin' WHERE username = $1",
        [`${ADMIN_USERNAME}-2`],
      );
      // Need a fresh login after role upgrade
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: `${ADMIN_USERNAME}-2`, password: TEST_PASSWORD },
      });
      const freshToken = loginRes.json<{ accessToken: string }>().accessToken;

      const response = await uploadFile(freshToken, "test.pdf", "application/pdf", minimalPdf);

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        id: unknown;
        name: unknown;
        mimeType: unknown;
        sizeBytes: unknown;
        hash: unknown;
        createdAt: unknown;
      }>();
      expect(typeof body.id).toBe("number");
      expect(typeof body.name).toBe("string");
      expect(body.mimeType).toBe("application/pdf");
      expect(typeof body.sizeBytes).toBe("number");
      expect((body.sizeBytes as number) > 0).toBe(true);
      expect(typeof body.hash).toBe("string");
      expect((body.hash as string).length).toBe(64);
      expect(typeof body.createdAt).toBe("string");
    },
  );

  it.skipIf(!dbAvailable)("rejects unsupported mime type", async () => {
    const adminUser = `${ADMIN_USERNAME}-reject`;
    await registerAndLogin(app, adminUser, TEST_PASSWORD);
    await app.db.query(
      "UPDATE app.users SET role = 'admin' WHERE username = $1",
      [adminUser],
    );
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: adminUser, password: TEST_PASSWORD },
    });
    const token = loginRes.json<{ accessToken: string }>().accessToken;

    const response = await uploadFile(
      token,
      "test.txt",
      "text/plain",
      Buffer.from("hello world"),
    );

    expect(response.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("rejects missing file", async () => {
    const adminUser = `${ADMIN_USERNAME}-missing`;
    await registerAndLogin(app, adminUser, TEST_PASSWORD);
    await app.db.query(
      "UPDATE app.users SET role = 'admin' WHERE username = $1",
      [adminUser],
    );
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: nonceHeaders(),
      payload: { username: adminUser, password: TEST_PASSWORD },
    });
    const token = loginRes.json<{ accessToken: string }>().accessToken;

    const boundary = "----EmptyBoundary";
    const body = buildEmptyMultipart(boundary);
    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("enforces auth – upload without token returns 401", async () => {
    const boundary = "----TestBoundary";
    const body = buildMultipartBody(
      "file",
      "test.pdf",
      "application/pdf",
      minimalPdf,
      boundary,
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...nonceHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)(
    "enforces role restriction – participant cannot upload",
    async () => {
      const participantUser = `${PARTICIPANT_USERNAME}-upload`;
      const { token } = await registerAndLogin(app, participantUser, TEST_PASSWORD);
      // participants stay as the default role (participant)

      const response = await uploadFile(
        token,
        "test.pdf",
        "application/pdf",
        minimalPdf,
      );

      expect(response.statusCode).toBe(403);
    },
  );

  it.skipIf(!dbAvailable)(
    "generates a valid file access link",
    async () => {
      const adminUser = `${ADMIN_USERNAME}-link`;
      await registerAndLogin(app, adminUser, TEST_PASSWORD);
      await app.db.query(
        "UPDATE app.users SET role = 'admin' WHERE username = $1",
        [adminUser],
      );
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: adminUser, password: TEST_PASSWORD },
      });
      const token = loginRes.json<{ accessToken: string }>().accessToken;

      const uploadRes = await uploadFile(token, "test.pdf", "application/pdf", minimalPdf);
      expect(uploadRes.statusCode).toBe(200);
      const { id: fileId } = uploadRes.json<{ id: number }>();

      const linkRes = await generateLink(token, fileId, 1);

      expect(linkRes.statusCode).toBe(200);
      const linkBody = linkRes.json<{
        token: unknown;
        expiresInSeconds: unknown;
      }>();
      expect(typeof linkBody.token).toBe("string");
      expect(linkBody.expiresInSeconds).toBe(86400);
    },
  );

  it.skipIf(!dbAvailable)(
    "file access returns file content for non-image non-pdf (video/mp4)",
    async () => {
      const adminUser = `${ADMIN_USERNAME}-video`;
      await registerAndLogin(app, adminUser, TEST_PASSWORD);
      await app.db.query(
        "UPDATE app.users SET role = 'admin' WHERE username = $1",
        [adminUser],
      );
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: adminUser, password: TEST_PASSWORD },
      });
      const token = loginRes.json<{ accessToken: string }>().accessToken;

      const uploadRes = await uploadFile(token, "test.mp4", "video/mp4", fakeVideo);
      expect(uploadRes.statusCode).toBe(200);
      const { id: fileId } = uploadRes.json<{ id: number }>();

      const linkRes = await generateLink(token, fileId, 1);
      expect(linkRes.statusCode).toBe(200);
      const { token: accessToken } = linkRes.json<{ token: string }>();

      const accessRes = await app.inject({
        method: "GET",
        url: `/api/cms/files/access/${accessToken}`,
      });

      expect(accessRes.statusCode).toBe(200);
      expect(accessRes.headers["content-type"]).toContain("video/mp4");
      expect(Buffer.from(accessRes.rawPayload)).toEqual(fakeVideo);
    },
  );

  it.skipIf(!dbAvailable)(
    "file access returns 401 for invalid token",
    async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/cms/files/access/invalid-garbage-token-xyz",
      });

      expect(response.statusCode).toBe(401);
    },
  );

  it.skipIf(!dbAvailable)(
    "PDF accessed through token returns 200 with application/pdf and different (watermarked) bytes",
    async () => {
      const adminUser = `${ADMIN_USERNAME}-pdfwm`;
      await registerAndLogin(app, adminUser, TEST_PASSWORD);
      await app.db.query(
        "UPDATE app.users SET role = 'admin' WHERE username = $1",
        [adminUser],
      );
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: adminUser, password: TEST_PASSWORD },
      });
      const token = loginRes.json<{ accessToken: string }>().accessToken;

      const uploadRes = await uploadFile(token, "test.pdf", "application/pdf", minimalPdf);
      expect(uploadRes.statusCode).toBe(200);
      const { id: fileId } = uploadRes.json<{ id: number }>();

      const linkRes = await generateLink(token, fileId, 1);
      expect(linkRes.statusCode).toBe(200);
      const { token: accessToken } = linkRes.json<{ token: string }>();

      const accessRes = await app.inject({
        method: "GET",
        url: `/api/cms/files/access/${accessToken}`,
      });

      expect(accessRes.statusCode).toBe(200);
      expect(accessRes.headers["content-type"]).toContain("application/pdf");
      // Watermarked PDF will be different (larger) than the original
      expect(Buffer.from(accessRes.rawPayload).equals(minimalPdf)).toBe(false);
    },
  );

  it.skipIf(!dbAvailable)(
    "image accessed through token returns 200 with correct content type and different (watermarked) bytes",
    async () => {
      const adminUser = `${ADMIN_USERNAME}-imgwm`;
      await registerAndLogin(app, adminUser, TEST_PASSWORD);
      await app.db.query(
        "UPDATE app.users SET role = 'admin' WHERE username = $1",
        [adminUser],
      );
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: nonceHeaders(),
        payload: { username: adminUser, password: TEST_PASSWORD },
      });
      const token = loginRes.json<{ accessToken: string }>().accessToken;

      const uploadRes = await uploadFile(token, "test.png", "image/png", minimalPng);
      expect(uploadRes.statusCode).toBe(200);
      const { id: fileId } = uploadRes.json<{ id: number }>();

      const linkRes = await generateLink(token, fileId, 1);
      expect(linkRes.statusCode).toBe(200);
      const { token: accessToken } = linkRes.json<{ token: string }>();

      const accessRes = await app.inject({
        method: "GET",
        url: `/api/cms/files/access/${accessToken}`,
      });

      expect(accessRes.statusCode).toBe(200);
      expect(accessRes.headers["content-type"]).toContain("image/png");
      // Watermarked image will have different bytes than the original
      expect(Buffer.from(accessRes.rawPayload).equals(minimalPng)).toBe(false);
    },
  );
});
