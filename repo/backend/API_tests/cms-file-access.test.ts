import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

import cmsRoutes from "../src/routes/cms.js";

// JWT tokens can exceed the Fastify default maxParamLength of 100 chars.
// Set it high enough to hold the tokens used in these tests.
const MAX_PARAM_LEN = 1000;

const STORAGE_ROOT = join(process.cwd(), "storage", "private");
const TEST_DATE_DIR = "2026-01-01";
const TEST_FILENAME = "test-file-access-uuid.mp4";
const TEST_STORAGE_PATH = `${TEST_DATE_DIR}/${TEST_FILENAME}`;
const TEST_ABSOLUTE_PATH = join(STORAGE_ROOT, TEST_DATE_DIR, TEST_FILENAME);
const TEST_FILE_CONTENT = Buffer.from("fake-mp4-video-bytes-for-testing");

const buildApp = async (storagePath: string = TEST_STORAGE_PATH) => {
  const app = Fastify({ maxParamLength: MAX_PARAM_LEN });
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

  const fileRow = {
    id: 1,
    original_name: "test-video.mp4",
    mime_type: "video/mp4",
    extension: ".mp4",
    size_bytes: TEST_FILE_CONTENT.length,
    sha256_hash: "deadbeefdeadbeef",
    storage_path: storagePath,
    uploaded_by_user_id: 1,
    created_at: new Date("2026-01-01T00:00:00Z"),
  };

  const queryFn = async <T>(text: string, values?: unknown[]) => {
    if (text.includes("FROM app.cms_sensitive_terms") || text.includes("SELECT term")) {
      return { rows: [] as T[] };
    }
    if (text.includes("FROM app.cms_files") && text.includes("WHERE id = $1")) {
      const fid = Number(values?.[0]);
      if (fid === 999) return { rows: [] as T[] };
      return { rows: [fileRow] as T[] };
    }
    return { rows: [] as T[] };
  };

  app.decorate("db", {
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => undefined }) as never,
  } as unknown as Pool);

  await app.register(cmsRoutes, { prefix: "/api" });
  return app;
};

describe("GET /api/cms/files/access/:token", () => {
  beforeAll(async () => {
    await mkdir(join(STORAGE_ROOT, TEST_DATE_DIR), { recursive: true });
    await writeFile(TEST_ABSOLUTE_PATH, TEST_FILE_CONTENT);
  });

  afterAll(async () => {
    await rm(TEST_ABSOLUTE_PATH, { force: true });
  });

  it("valid token returns 200 with file content and correct Content-Type for video/mp4", async () => {
    const app = await buildApp();
    const accessToken = app.jwt.sign(
      { fid: 1, uid: 1, purpose: "cms-file-access" },
      { expiresIn: "1h" },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/cms/files/access/${accessToken}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("video/mp4");
    expect(response.rawPayload).toEqual(TEST_FILE_CONTENT);
  });

  it("returns correct Content-Disposition header with sanitized filename", async () => {
    const app = Fastify({ maxParamLength: MAX_PARAM_LEN });
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

    const specialFileRow = {
      id: 2,
      original_name: "test video file!.mp4",
      mime_type: "video/mp4",
      extension: ".mp4",
      size_bytes: TEST_FILE_CONTENT.length,
      sha256_hash: "deadbeef",
      storage_path: TEST_STORAGE_PATH,
      uploaded_by_user_id: 1,
      created_at: new Date("2026-01-01T00:00:00Z"),
    };

    const queryFn = async <T>(text: string, _values?: unknown[]) => {
      if (text.includes("FROM app.cms_sensitive_terms") || text.includes("SELECT term")) {
        return { rows: [] as T[] };
      }
      if (text.includes("FROM app.cms_files") && text.includes("WHERE id = $1")) {
        return { rows: [specialFileRow] as T[] };
      }
      return { rows: [] as T[] };
    };
    app.decorate("db", {
      query: queryFn,
      connect: async () => ({ query: queryFn, release: () => undefined }) as never,
    } as unknown as Pool);
    await app.register(cmsRoutes, { prefix: "/api" });

    const accessToken = app.jwt.sign(
      { fid: 2, uid: 1, purpose: "cms-file-access" },
      { expiresIn: "1h" },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/cms/files/access/${accessToken}`,
    });

    expect(response.statusCode).toBe(200);
    const disposition = response.headers["content-disposition"] as string;
    expect(disposition).toContain("inline");
    expect(disposition).toContain("filename=");
    // sanitizeFilename replaces special chars (space, !) with underscores
    expect(disposition).not.toContain("!");
    expect(disposition).toContain("test_video_file_.mp4");
  });

  it("returns 401 for an invalid/garbage token", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/files/access/this.is.not.a.valid.jwt.token.abc",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for a token with tampered signature", async () => {
    const app = await buildApp();

    // Construct a JWT with valid header+payload structure but a wrong HMAC signature
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        fid: 1,
        uid: 1,
        purpose: "cms-file-access",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    // 32-byte signature (correct length for HS256) filled with zeros - will not match the real HMAC
    const badSig = Buffer.alloc(32).toString("base64url");
    const tamperedToken = `${header}.${payload}.${badSig}`;

    const response = await app.inject({
      method: "GET",
      url: `/api/cms/files/access/${tamperedToken}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 404 when file record does not exist in DB (fid not found)", async () => {
    const app = await buildApp();
    const accessToken = app.jwt.sign(
      { fid: 999, uid: 1, purpose: "cms-file-access" },
      { expiresIn: "1h" },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/cms/files/access/${accessToken}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 400 for token string that is too short", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/files/access/short",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns Content-Length header matching file size", async () => {
    const app = await buildApp();
    const accessToken = app.jwt.sign(
      { fid: 1, uid: 1, purpose: "cms-file-access" },
      { expiresIn: "1h" },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/cms/files/access/${accessToken}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-length"]).toBe(String(TEST_FILE_CONTENT.length));
  });
});
