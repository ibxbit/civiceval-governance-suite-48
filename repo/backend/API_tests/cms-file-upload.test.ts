import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import cmsRoutes from "../src/routes/cms.js";

const buildApp = async (role: "program_owner" | "admin" | "participant" = "program_owner") => {
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

  const queryFn = async <T>(text: string, _values?: unknown[]) => {
    if (text.includes("SELECT s.id AS session_id")) {
      return {
        rows: [
          {
            session_id: 1,
            user_id: 1,
            username: "owner",
            role,
          },
        ] as T[],
      };
    }

    if (text.includes("UPDATE app.sessions")) {
      return { rows: [] as T[] };
    }

    if (text.includes("SELECT term FROM app.cms_sensitive_terms") || text.includes("FROM app.cms_sensitive_terms")) {
      return { rows: [] as T[] };
    }

    if (text.includes("INSERT INTO app.cms_files")) {
      return {
        rows: [
          {
            id: 1,
            original_name: "test.png",
            mime_type: "image/png",
            extension: ".png",
            size_bytes: 13,
            sha256_hash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
            storage_path: "2026-01-01/test-uuid.png",
            uploaded_by_user_id: 1,
            created_at: new Date("2026-01-01T00:00:00Z"),
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

  await app.register(cmsRoutes, { prefix: "/api" });
  return app;
};

const authHeaders = (app: Awaited<ReturnType<typeof buildApp>>) => {
  const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
  return {
    authorization: `Bearer ${token}`,
    "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
    "x-timestamp": String(Date.now()),
  };
};

const buildMultipartBody = (
  filename: string,
  contentType: string,
  fileData: Buffer | string,
) => {
  const boundary = "test-boundary-abc123";
  const data = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
};

describe("POST /api/cms/files/upload", () => {
  it("successful file upload returns 200 with file metadata", async () => {
    const app = await buildApp("program_owner");
    const { body, contentType } = buildMultipartBody(
      "test.png",
      "image/png",
      Buffer.from("fake-png-data"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(app),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    const body2 = response.json();
    expect(body2.id).toBeTypeOf("number");
    expect(body2.name).toBeTypeOf("string");
    expect(body2.mimeType).toBe("image/png");
    expect(body2.sizeBytes).toBeTypeOf("number");
    expect(body2.hash).toBeTypeOf("string");
    expect(body2.createdAt).toBeDefined();
  });

  it("admin can upload a file successfully", async () => {
    const app = await buildApp("admin");
    const { body, contentType } = buildMultipartBody(
      "document.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4 fake"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(app),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json();
    expect(responseBody.id).toBeDefined();
    expect(responseBody.hash).toBeTypeOf("string");
  });

  it("rejects unsupported MIME type with 400", async () => {
    const app = await buildApp("program_owner");
    const { body, contentType } = buildMultipartBody(
      "script.exe",
      "application/octet-stream",
      Buffer.from("MZ fake exe"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(app),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects text/plain MIME type with 400", async () => {
    const app = await buildApp("program_owner");
    const { body, contentType } = buildMultipartBody(
      "notes.txt",
      "text/plain",
      Buffer.from("some text content"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(app),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
  });

  it("participant role cannot upload (403)", async () => {
    const app = await buildApp("participant");
    const { body, contentType } = buildMultipartBody(
      "test.png",
      "image/png",
      Buffer.from("fake-png-data"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(app),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(403);
  });

  it("requires nonce header (400 without nonce)", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const { body, contentType } = buildMultipartBody(
      "test.png",
      "image/png",
      Buffer.from("fake-png-data"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        authorization: `Bearer ${token}`,
        "x-timestamp": String(Date.now()),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp("program_owner");
    const { body, contentType } = buildMultipartBody(
      "test.png",
      "image/png",
      Buffer.from("fake-png-data"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(401);
  });

  it("upload response includes all expected fields", async () => {
    const app = await buildApp("program_owner");
    const { body, contentType } = buildMultipartBody(
      "report.png",
      "image/png",
      Buffer.from("fake-png-bytes"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        ...authHeaders(app),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json();
    expect(responseBody.id).toBeTypeOf("number");
    expect(responseBody.name).toBeTypeOf("string");
    expect(responseBody.mimeType).toBeTypeOf("string");
    expect(responseBody.sizeBytes).toBeTypeOf("number");
    expect(responseBody.hash).toBeTypeOf("string");
    expect(responseBody.createdAt).toBeDefined();
  });

  it("upload with application/pdf MIME type succeeds", async () => {
    const pdfApp = Fastify();
    await pdfApp.register(sensible);
    await pdfApp.register(jwt, { secret: "test-secret-test-secret-test-secret" });
    pdfApp.decorate("env", {
      HOST: "0.0.0.0",
      PORT: 3000,
      NODE_ENV: "test",
      DATABASE_URL: "https://example.com",
      CORS_ORIGIN: "*",
      JWT_SECRET: "test-secret-test-secret-test-secret",
    });

    const pdfQueryFn = async <T>(text: string, _values?: unknown[]) => {
      if (text.includes("SELECT s.id AS session_id")) {
        return {
          rows: [
            { session_id: 1, user_id: 1, username: "owner", role: "program_owner" },
          ] as T[],
        };
      }
      if (text.includes("SELECT term FROM app.cms_sensitive_terms") || text.includes("FROM app.cms_sensitive_terms")) {
        return { rows: [] as T[] };
      }
      if (text.includes("INSERT INTO app.cms_files")) {
        return {
          rows: [
            {
              id: 2,
              original_name: "report.pdf",
              mime_type: "application/pdf",
              extension: ".pdf",
              size_bytes: 14,
              sha256_hash: "deadbeef1234deadbeef1234deadbeef1234deadbeef1234deadbeef1234dead",
              storage_path: "2026-01-01/report-uuid.pdf",
              uploaded_by_user_id: 1,
              created_at: new Date("2026-01-01T00:00:00Z"),
            },
          ] as T[],
        };
      }
      return { rows: [] as T[] };
    };

    pdfApp.decorate("db", {
      query: pdfQueryFn,
      connect: async () => ({ query: pdfQueryFn, release: () => undefined }) as never,
    } as unknown as Pool);
    await pdfApp.register(cmsRoutes, { prefix: "/api" });

    const pdfToken = pdfApp.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const { body, contentType } = buildMultipartBody(
      "report.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4 fake"),
    );

    const response = await pdfApp.inject({
      method: "POST",
      url: "/api/cms/files/upload",
      headers: {
        authorization: `Bearer ${pdfToken}`,
        "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
        "x-timestamp": String(Date.now()),
        "content-type": contentType,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json();
    expect(responseBody.mimeType).toBe("application/pdf");
  });
});
