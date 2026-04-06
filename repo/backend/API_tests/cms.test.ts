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
});
