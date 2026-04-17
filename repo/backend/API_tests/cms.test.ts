import Fastify from "fastify";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import cmsRoutes from "../src/routes/cms.js";

describe("cms routes", () => {
  const buildApp = async (role: "program_owner" | "admin" = "program_owner") => {
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

    let version = 1;
    let sensitiveTerms = ["password", "ssn", "credit card", "secret", "api key"];

    const queryFn = async <T>(text: string, values?: unknown[]) => {
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

      if (text.includes("UPDATE app.cms_sensitive_terms") && text.includes("SET is_active = FALSE")) {
        sensitiveTerms = [];
        return { rows: [] as T[] };
      }

      if (text.includes("INSERT INTO app.cms_sensitive_terms")) {
        const term = String(values?.[0] ?? "");
        sensitiveTerms = [...sensitiveTerms, term];
        return { rows: [] as T[] };
      }

      if (text.includes("FROM app.cms_sensitive_terms")) {
        return {
          rows: sensitiveTerms.map((term) => ({ term })) as T[],
        };
      }

      if (text.includes("INSERT INTO app.cms_content ")) {
        version = 1;
        return {
          rows: [
            {
              id: 1,
              title: values?.[0],
              rich_text: values?.[1],
              status: "draft",
              file_ids: values?.[2] ?? [],
              version_number: 1,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("UPDATE app.cms_content") &&
        text.includes("status = 'published'")
      ) {
        version += 1;
        return {
          rows: [
            {
              id: 1,
              title: "title",
              rich_text: "text",
              status: "published",
              file_ids: [],
              version_number: version,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("UPDATE app.cms_content") &&
        text.includes("status = 'draft'")
      ) {
        version += 1;
        return {
          rows: [
            {
              id: 1,
              title: "rollback",
              rich_text: "rollback",
              status: "draft",
              file_ids: [],
              version_number: version,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("UPDATE app.cms_content") &&
        text.includes("title = $2")
      ) {
        version += 1;
        return {
          rows: [
            {
              id: 1,
              title: values?.[1],
              rich_text: values?.[2],
              status: "draft",
              file_ids: values?.[3] ?? [],
              version_number: version,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("FROM app.cms_content") &&
        text.includes("FOR UPDATE")
      ) {
        return {
          rows: [
            {
              id: 1,
              title: "title",
              rich_text: "text",
              status: "draft",
              file_ids: [],
              version_number: version,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("FROM app.cms_content_versions") &&
        text.includes("version_number = $2")
      ) {
        return {
          rows: [
            {
              id: 2,
              content_id: 1,
              version_number: 1,
              title: "title",
              rich_text: "text",
              status: "draft",
              file_ids: [],
              action: "update",
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (
        text.includes("FROM app.cms_content_versions") &&
        text.includes("ORDER BY version_number")
      ) {
        return {
          rows: [
            {
              id: 3,
              content_id: 1,
              version_number: 3,
              title: "t",
              rich_text: "r",
              status: "published",
              file_ids: [],
              action: "publish",
              created_by_user_id: 1,
              created_at: new Date(),
            },
            {
              id: 2,
              content_id: 1,
              version_number: 2,
              title: "t",
              rich_text: "r",
              status: "draft",
              file_ids: [],
              action: "update",
              created_by_user_id: 1,
              created_at: new Date(),
            },
            {
              id: 1,
              content_id: 1,
              version_number: 1,
              title: "t",
              rich_text: "r",
              status: "draft",
              file_ids: [],
              action: "create",
              created_by_user_id: 1,
              created_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("SELECT id\n      FROM app.cms_files")) {
        return { rows: [] as T[] };
      }

      if (text.includes("FROM app.cms_content") && text.includes("WHERE archived_at IS NULL") && text.includes("ORDER BY updated_at") && !text.includes("ILIKE")) {
        return {
          rows: [
            {
              id: 1,
              title: "First Article",
              rich_text: "Some text",
              status: "draft",
              file_ids: [],
              version_number: 1,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: 2,
              title: "Published Content",
              rich_text: "Body text",
              status: "published",
              file_ids: [1],
              version_number: 3,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("COUNT(*)::text AS total") && text.includes("cms_content") && text.includes("archived_at IS NULL") && !text.includes("ILIKE")) {
        return { rows: [{ total: "2" }] as T[] };
      }

      if (text.includes("FROM app.cms_content") && text.includes("ILIKE") && text.includes("rich_text ILIKE")) {
        return {
          rows: [
            {
              id: 1,
              title: "matching title",
              rich_text: "matching text",
              status: "draft",
              file_ids: [],
              version_number: 1,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("COUNT(*)::text AS total") && text.includes("cms_content") && text.includes("ILIKE")) {
        return { rows: [{ total: "1" }] as T[] };
      }

      if (text.includes("FROM app.cms_content") && text.includes("WHERE id = $1") && text.includes("archived_at IS NULL") && !text.includes("FOR UPDATE")) {
        const contentId = Number(values?.[0]);
        if (contentId === 999) {
          return { rows: [] as T[] };
        }
        return {
          rows: [
            {
              id: contentId,
              title: "title",
              rich_text: "text",
              status: "draft",
              file_ids: [],
              version_number: 1,
              created_by_user_id: 1,
              updated_by_user_id: 1,
              published_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ] as T[],
        };
      }

      if (text.includes("FROM app.cms_files") && text.includes("WHERE id = $1") && !text.includes("ANY")) {
        const fileId = Number(values?.[0]);
        if (fileId === 999) {
          return { rows: [] as T[] };
        }
        return {
          rows: [
            {
              id: fileId,
              original_name: "test.pdf",
              mime_type: "application/pdf",
              extension: ".pdf",
              size_bytes: 1024,
              sha256_hash: "abc123",
              storage_path: "2026-01-01/test.pdf",
              uploaded_by_user_id: 1,
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

    await app.register(cmsRoutes, { prefix: "/api" });
    return app;
  };

  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-1234567890`,
    "x-timestamp": String(Date.now()),
  });

  it("content lifecycle and versions", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const create = await app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "title", richText: "text", fileIds: [] },
    });
    expect(create.statusCode).toBe(200);

    const update = await app.inject({
      method: "PUT",
      url: "/api/cms/content/1",
      headers: headers(token),
      payload: { title: "title2", richText: "text2" },
    });
    expect(update.statusCode).toBe(200);

    const publish = await app.inject({
      method: "POST",
      url: "/api/cms/content/1/publish",
      headers: headers(token),
      payload: {},
    });
    expect(publish.statusCode).toBe(200);

    const versions = await app.inject({
      method: "GET",
      url: "/api/cms/content/1/versions",
      headers: headers(token),
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().versions.length).toBeGreaterThan(0);

    const rollback = await app.inject({
      method: "POST",
      url: "/api/cms/content/1/rollback",
      headers: headers(token),
      payload: { versionNumber: 1 },
    });
    expect(rollback.statusCode).toBe(200);
  });

  it("rejects blocked terms", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "contains password", richText: "text", fileIds: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("uses configurable sensitive-word policy", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const updatePolicy = await app.inject({
      method: "PUT",
      url: "/api/cms/policy/sensitive-words",
      headers: headers(token),
      payload: { words: ["classified", "title"] },
    });
    expect(updatePolicy.statusCode).toBe(200);

    const allowsOldTerm = await app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "contains password", richText: "text", fileIds: [] },
    });
    expect(allowsOldTerm.statusCode).toBe(200);

    const blocksNewTerm = await app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "contains classified", richText: "text", fileIds: [] },
    });
    expect(blocksNewTerm.statusCode).toBe(400);

    const blockedPublish = await app.inject({
      method: "POST",
      url: "/api/cms/content/1/publish",
      headers: headers(token),
      payload: {},
    });
    expect(blockedPublish.statusCode).toBe(400);
  });

  it("enforces nonce on authenticated cms reads", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const listWithoutNonce = await app.inject({
      method: "GET",
      url: "/api/cms/content?page=1&limit=20",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listWithoutNonce.statusCode).toBe(400);
  });

  it("content search returns matching results", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content/search?q=matching&page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.total).toBeTypeOf("number");
    expect(body.query).toBe("matching");
    expect(body.page).toBe(1);
  });

  it("content search rejects empty query", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content/search?q=&page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(400);
  });

  it("admin can read sensitive words policy", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/policy/sensitive-words",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.words).toBeInstanceOf(Array);
    expect(body.words.length).toBeGreaterThan(0);
  });

  it("non-admin cannot read sensitive words policy", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/policy/sensitive-words",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(403);
  });

  it("admin can reload sensitive words", async () => {
    const app = await buildApp("admin");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/policy/sensitive-words/reload",
      headers: headers(token),
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.words).toBeInstanceOf(Array);
    expect(body.refreshed).toBe(true);
  });

  it("non-admin cannot reload sensitive words", async () => {
    const app = await buildApp("program_owner");
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/policy/sensitive-words/reload",
      headers: headers(token),
      payload: {},
    });

    expect(response.statusCode).toBe(403);
  });

  it("content detail returns content by id", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content/1",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(1);
    expect(body.title).toBeTypeOf("string");
    expect(body.richText).toBeTypeOf("string");
    expect(body.status).toBe("draft");
    expect(body.versionNumber).toBeTypeOf("number");
  });

  it("content detail returns 404 for non-existent content", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content/999",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(404);
  });

  it("file link generation succeeds for existing file", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/1/link",
      headers: headers(token),
      payload: { expiresInDays: 3 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.token).toBeTypeOf("string");
    expect(body.expiresInSeconds).toBe(3 * 24 * 60 * 60);
  });

  it("file link returns 404 for non-existent file", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/999/link",
      headers: headers(token),
      payload: { expiresInDays: 3 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("file access rejects invalid token", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/files/access/invalid-token-value-here",
    });

    expect(response.statusCode).toBe(401);
  });

  it("content create response includes all expected fields", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "new content", richText: "body text", fileIds: [] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.title).toBe("new content");
    expect(body.richText).toBe("body text");
    expect(body.status).toBe("draft");
    expect(body.versionNumber).toBe(1);
    expect(body.createdByUserId).toBeTypeOf("number");
    expect(body.publishedAt).toBeNull();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it("publish response transitions status to published", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    await app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "content", richText: "body", fileIds: [] },
    });

    const publish = await app.inject({
      method: "POST",
      url: "/api/cms/content/1/publish",
      headers: headers(token),
      payload: {},
    });

    expect(publish.statusCode).toBe(200);
    const body = publish.json();
    expect(body.status).toBe("published");
    expect(body.publishedAt).not.toBeNull();
    expect(body.versionNumber).toBeGreaterThan(1);
  });

  it("rollback response transitions status back to draft", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    await app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "content", richText: "body", fileIds: [] },
    });

    const rollback = await app.inject({
      method: "POST",
      url: "/api/cms/content/1/rollback",
      headers: headers(token),
      payload: { versionNumber: 1 },
    });

    expect(rollback.statusCode).toBe(200);
    const body = rollback.json();
    expect(body.status).toBe("draft");
    expect(body.publishedAt).toBeNull();
  });

  it("participant cannot create content", async () => {
    const app = await buildApp("program_owner");
    app.decorate("_testRole", "participant");

    const participantApp = Fastify();
    await participantApp.register(sensible);
    await participantApp.register(jwt, { secret: "test-secret-test-secret-test-secret" });
    participantApp.decorate("env", {
      HOST: "0.0.0.0",
      PORT: 3000,
      NODE_ENV: "test",
      DATABASE_URL: "https://example.com",
      CORS_ORIGIN: "*",
      JWT_SECRET: "test-secret-test-secret-test-secret",
    });
    const queryFn = async <T>(text: string) => {
      if (text.includes("SELECT s.id AS session_id")) {
        return {
          rows: [
            { session_id: 1, user_id: 1, username: "user", role: "participant" },
          ] as T[],
        };
      }
      return { rows: [] as T[] };
    };
    participantApp.decorate("db", {
      query: queryFn,
      connect: async () =>
        ({ query: queryFn, release: () => undefined }) as never,
    } as unknown as Pool);
    await participantApp.register(cmsRoutes, { prefix: "/api" });

    const token = participantApp.jwt.sign({ sub: "1", sid: 1, tid: "t1" });
    const response = await participantApp.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: headers(token),
      payload: { title: "test", richText: "body", fileIds: [] },
    });
    expect(response.statusCode).toBe(403);
  });

  it("list content returns paginated data with correct shape", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBe(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);

    const first = body.data[0];
    expect(first.id).toBeTypeOf("number");
    expect(first.title).toBeTypeOf("string");
    expect(first.richText).toBeTypeOf("string");
    expect(first.status).toBeTypeOf("string");
    expect(first.versionNumber).toBeTypeOf("number");
    expect(first.createdByUserId).toBeTypeOf("number");
    expect(first.createdAt).toBeDefined();
    expect(first.updatedAt).toBeDefined();
  });

  it("list content supports status filter", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content?page=1&limit=20&status=draft",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeInstanceOf(Array);
  });

  it("file link defaults to 7 days when no expiry specified", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/1/link",
      headers: headers(token),
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.expiresInSeconds).toBe(7 * 24 * 60 * 60);
  });

  it("versions list response has correct shape", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content/1/versions",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.versions).toBeInstanceOf(Array);
    expect(body.versions.length).toBeGreaterThan(0);
    expect(body.versions[0].versionNumber).toBeTypeOf("number");
    expect(body.versions[0].action).toBeTypeOf("string");
    expect(body.versions[0].createdByUserId).toBeTypeOf("number");
  });

  it("update rejects content with sensitive terms", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "PUT",
      url: "/api/cms/content/1",
      headers: headers(token),
      payload: { title: "contains password", richText: "safe body text" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("content list response items have fileIds array", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/cms/content?page=1&limit=20",
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(item.fileIds).toBeInstanceOf(Array);
    }
  });

  it("file link rejects expiresInDays greater than 7", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "1", sid: 1, tid: "t1" });

    const response = await app.inject({
      method: "POST",
      url: "/api/cms/files/1/link",
      headers: headers(token),
      payload: { expiresInDays: 10 },
    });

    expect(response.statusCode).toBe(400);
  });
});
