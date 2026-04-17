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

describe("CMS Content & Policy – no-mock integration", () => {
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

  /** Create content as program_owner and return the response. */
  const createContent = async (
    token: string,
    overrides: Record<string, unknown> = {},
  ) =>
    app.inject({
      method: "POST",
      url: "/api/cms/content",
      headers: authHeaders(token),
      payload: {
        title: "Test Content Title",
        richText: "Some rich text content",
        fileIds: [],
        ...overrides,
      },
    });

  /**
   * Set the sensitive-words policy to the provided words list then force a
   * cache reload so the new list takes effect immediately (bypasses the 60s
   * TTL that would otherwise cause stale reads).
   */
  const setPolicyAndReload = async (adminToken: string, words: string[]) => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/cms/policy/sensitive-words",
      headers: authHeaders(adminToken),
      payload: { words },
    });
    if (putRes.statusCode !== 200) {
      throw new Error(
        `PUT sensitive-words failed: ${putRes.statusCode} ${putRes.body}`,
      );
    }

    const reloadRes = await app.inject({
      method: "POST",
      url: "/api/cms/policy/sensitive-words/reload",
      headers: authHeaders(adminToken),
    });
    if (reloadRes.statusCode !== 200) {
      throw new Error(
        `reload failed: ${reloadRes.statusCode} ${reloadRes.body}`,
      );
    }
  };

  // ------------------------------------------------------------------ tests

  // a) admin reads sensitive words
  it.skipIf(!dbAvailable)(
    "admin reads sensitive words",
    async () => {
      const adminToken = await getAdminToken("-read-sw");
      const res = await app.inject({
        method: "GET",
        url: "/api/cms/policy/sensitive-words",
        headers: authHeaders(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ words: unknown }>();
      expect(Array.isArray(body.words)).toBe(true);
    },
  );

  // b) non-admin cannot read sensitive words (403)
  it.skipIf(!dbAvailable)(
    "non-admin cannot read sensitive words (403)",
    async () => {
      const participantToken = await getParticipantToken("-sw-403");
      const res = await app.inject({
        method: "GET",
        url: "/api/cms/policy/sensitive-words",
        headers: authHeaders(participantToken),
      });
      expect(res.statusCode).toBe(403);
    },
  );

  // c) admin reloads sensitive words
  it.skipIf(!dbAvailable)(
    "admin reloads sensitive words",
    async () => {
      const adminToken = await getAdminToken("-reload-sw");
      const res = await app.inject({
        method: "POST",
        url: "/api/cms/policy/sensitive-words/reload",
        headers: authHeaders(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ words: unknown; refreshed: unknown }>();
      expect(Array.isArray(body.words)).toBe(true);
      expect(body.refreshed).toBe(true);
    },
  );

  // d) admin updates sensitive words policy
  it.skipIf(!dbAvailable)(
    "admin updates sensitive words policy",
    async () => {
      const adminToken = await getAdminToken("-put-sw");
      const res = await app.inject({
        method: "PUT",
        url: "/api/cms/policy/sensitive-words",
        headers: authHeaders(adminToken),
        payload: { words: ["blocked", "forbidden"] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ words: string[] }>();
      expect(Array.isArray(body.words)).toBe(true);
      expect(body.words).toContain("blocked");
      expect(body.words).toContain("forbidden");
    },
  );

  // e) empty words array rejected
  it.skipIf(!dbAvailable)(
    "empty words array rejected",
    async () => {
      const adminToken = await getAdminToken("-empty-sw");
      const res = await app.inject({
        method: "PUT",
        url: "/api/cms/policy/sensitive-words",
        headers: authHeaders(adminToken),
        payload: { words: [] },
      });
      expect(res.statusCode).toBe(400);
    },
  );

  // f) program_owner creates content
  it.skipIf(!dbAvailable)(
    "program_owner creates content",
    async () => {
      // First set a safe policy (no default "secret" word that might block us)
      const adminToken = await getAdminToken("-create-content-admin");
      await setPolicyAndReload(adminToken, ["badword", "forbidden"]);

      const ownerToken = await getProgramOwnerToken("-create-content");
      const res = await createContent(ownerToken, {
        title: "My First Content",
        richText: "Welcome to the governance platform.",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        id: unknown;
        title: unknown;
        richText: unknown;
        status: unknown;
        versionNumber: unknown;
        publishedAt: unknown;
      }>();
      expect(typeof body.id).toBe("number");
      expect(body.title).toBe("My First Content");
      expect(body.richText).toBe("Welcome to the governance platform.");
      expect(body.status).toBe("draft");
      expect(body.versionNumber).toBe(1);
      expect(body.publishedAt).toBeNull();
    },
  );

  // g) content with blocked terms rejected
  it.skipIf(!dbAvailable)(
    "content with blocked terms rejected",
    async () => {
      const adminToken = await getAdminToken("-blocked-admin");
      await setPolicyAndReload(adminToken, ["blockedterm"]);

      const ownerToken = await getProgramOwnerToken("-blocked-content");
      const res = await createContent(ownerToken, {
        title: "Title with blockedterm inside",
        richText: "Normal content.",
      });
      expect(res.statusCode).toBe(400);
    },
  );

  // h) participant cannot create content (403)
  it.skipIf(!dbAvailable)(
    "participant cannot create content (403)",
    async () => {
      const participantToken = await getParticipantToken("-no-create-content");
      const res = await createContent(participantToken);
      expect(res.statusCode).toBe(403);
    },
  );

  // i) list content returns paginated results
  it.skipIf(!dbAvailable)(
    "list content returns paginated results",
    async () => {
      const adminToken = await getAdminToken("-list-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-list-content");
      const createRes = await createContent(ownerToken, {
        title: "Listable Content",
        richText: "Content to list.",
      });
      expect(createRes.statusCode).toBe(200);

      const participantToken = await getParticipantToken("-list-part");
      const listRes = await app.inject({
        method: "GET",
        url: "/api/cms/content?page=1&limit=20",
        headers: authHeaders(participantToken),
      });
      expect(listRes.statusCode).toBe(200);
      const body = listRes.json<{
        data: unknown[];
        total: number;
      }>();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(1);
    },
  );

  // j) list content supports status filter
  it.skipIf(!dbAvailable)(
    "list content supports status filter",
    async () => {
      const adminToken = await getAdminToken("-status-filter-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-status-filter");
      await createContent(ownerToken, {
        title: "Draft Content",
        richText: "This is a draft.",
      });

      const participantToken = await getParticipantToken("-status-filter-part");
      const listRes = await app.inject({
        method: "GET",
        url: "/api/cms/content?page=1&limit=20&status=draft",
        headers: authHeaders(participantToken),
      });
      expect(listRes.statusCode).toBe(200);
      const body = listRes.json<{ data: Array<{ status: string }> }>();
      expect(Array.isArray(body.data)).toBe(true);
      for (const item of body.data) {
        expect(item.status).toBe("draft");
      }
    },
  );

  // k) get content by id
  it.skipIf(!dbAvailable)(
    "get content by id",
    async () => {
      const adminToken = await getAdminToken("-get-by-id-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-get-by-id");
      const createRes = await createContent(ownerToken, {
        title: "Content By ID",
        richText: "Rich text for by-id test.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      const participantToken = await getParticipantToken("-get-by-id-part");
      const getRes = await app.inject({
        method: "GET",
        url: `/api/cms/content/${id}`,
        headers: authHeaders(participantToken),
      });
      expect(getRes.statusCode).toBe(200);
      const body = getRes.json<{
        id: unknown;
        title: unknown;
        richText: unknown;
        status: unknown;
        versionNumber: unknown;
        publishedAt: unknown;
        createdAt: unknown;
        updatedAt: unknown;
      }>();
      expect(body.id).toBe(id);
      expect(typeof body.title).toBe("string");
      expect(typeof body.richText).toBe("string");
      expect(typeof body.status).toBe("string");
      expect(typeof body.versionNumber).toBe("number");
      expect(typeof body.createdAt).toBe("string");
      expect(typeof body.updatedAt).toBe("string");
    },
  );

  // l) get content returns 404 for non-existent
  it.skipIf(!dbAvailable)(
    "get content returns 404 for non-existent",
    async () => {
      const participantToken = await getParticipantToken("-404-content");
      const res = await app.inject({
        method: "GET",
        url: "/api/cms/content/99999",
        headers: authHeaders(participantToken),
      });
      expect(res.statusCode).toBe(404);
    },
  );

  // m) search returns matching content
  it.skipIf(!dbAvailable)(
    "search returns matching content",
    async () => {
      const adminToken = await getAdminToken("-search-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-search-content");
      const createRes = await createContent(ownerToken, {
        title: "UniqueSearchTerm2026",
        richText: "Normal body text.",
      });
      expect(createRes.statusCode).toBe(200);

      const participantToken = await getParticipantToken("-search-part");
      const searchRes = await app.inject({
        method: "GET",
        url: "/api/cms/content/search?q=UniqueSearchTerm2026&page=1&limit=20",
        headers: authHeaders(participantToken),
      });
      expect(searchRes.statusCode).toBe(200);
      const body = searchRes.json<{ data: Array<{ title: string }> }>();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      const found = body.data.some((item) =>
        item.title.includes("UniqueSearchTerm2026"),
      );
      expect(found).toBe(true);
    },
  );

  // n) update content title
  it.skipIf(!dbAvailable)(
    "update content title",
    async () => {
      const adminToken = await getAdminToken("-update-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-update-content");
      const createRes = await createContent(ownerToken, {
        title: "Original Title",
        richText: "Some content.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id, versionNumber } = createRes.json<{
        id: number;
        versionNumber: number;
      }>();
      expect(versionNumber).toBe(1);

      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/cms/content/${id}`,
        headers: authHeaders(ownerToken),
        payload: { title: "Updated Title" },
      });
      expect(updateRes.statusCode).toBe(200);
      const updatedBody = updateRes.json<{
        title: string;
        versionNumber: number;
      }>();
      expect(updatedBody.title).toBe("Updated Title");
      expect(updatedBody.versionNumber).toBe(versionNumber + 1);
    },
  );

  // o) update rejects empty body
  it.skipIf(!dbAvailable)(
    "update rejects empty body",
    async () => {
      const adminToken = await getAdminToken("-update-empty-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-update-empty");
      const createRes = await createContent(ownerToken, {
        title: "Content For Empty Update",
        richText: "Body.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/cms/content/${id}`,
        headers: authHeaders(ownerToken),
        payload: {},
      });
      expect(updateRes.statusCode).toBe(400);
    },
  );

  // p) update rejects blocked terms
  it.skipIf(!dbAvailable)(
    "update rejects blocked terms",
    async () => {
      const adminToken = await getAdminToken("-update-blocked-admin");
      await setPolicyAndReload(adminToken, ["safeguard"]);

      const ownerToken = await getProgramOwnerToken("-update-blocked");
      const createRes = await createContent(ownerToken, {
        title: "Clean Title",
        richText: "Normal body.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      // Now update the policy to block "restricted" then update the content
      await setPolicyAndReload(adminToken, ["restricted"]);

      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/cms/content/${id}`,
        headers: authHeaders(ownerToken),
        payload: { title: "Title with restricted word" },
      });
      expect(updateRes.statusCode).toBe(400);
    },
  );

  // q) publish draft content
  it.skipIf(!dbAvailable)(
    "publish draft content",
    async () => {
      const adminToken = await getAdminToken("-publish-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-publish-content");
      const createRes = await createContent(ownerToken, {
        title: "Content To Publish",
        richText: "Ready to publish.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      const publishRes = await app.inject({
        method: "POST",
        url: `/api/cms/content/${id}/publish`,
        headers: authHeaders(ownerToken),
      });
      expect(publishRes.statusCode).toBe(200);
      const body = publishRes.json<{
        status: string;
        publishedAt: unknown;
      }>();
      expect(body.status).toBe("published");
      expect(body.publishedAt).not.toBeNull();
    },
  );

  // r) publish already-published content returns 400
  it.skipIf(!dbAvailable)(
    "publish already-published content returns 400",
    async () => {
      const adminToken = await getAdminToken("-pub-twice-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-pub-twice");
      const createRes = await createContent(ownerToken, {
        title: "Content Publish Twice",
        richText: "Will be published twice.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      // First publish
      const firstPublish = await app.inject({
        method: "POST",
        url: `/api/cms/content/${id}/publish`,
        headers: authHeaders(ownerToken),
      });
      expect(firstPublish.statusCode).toBe(200);

      // Second publish – should fail
      const secondPublish = await app.inject({
        method: "POST",
        url: `/api/cms/content/${id}/publish`,
        headers: authHeaders(ownerToken),
      });
      expect(secondPublish.statusCode).toBe(400);
    },
  );

  // s) rollback to previous version
  it.skipIf(!dbAvailable)(
    "rollback to previous version",
    async () => {
      const adminToken = await getAdminToken("-rollback-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-rollback-content");
      const createRes = await createContent(ownerToken, {
        title: "Original Content",
        richText: "Original body.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      // Update to create v2
      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/cms/content/${id}`,
        headers: authHeaders(ownerToken),
        payload: { title: "Updated Content" },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json<{ versionNumber: number }>().versionNumber).toBe(2);

      // Rollback to v1
      const rollbackRes = await app.inject({
        method: "POST",
        url: `/api/cms/content/${id}/rollback`,
        headers: authHeaders(ownerToken),
        payload: { versionNumber: 1 },
      });
      expect(rollbackRes.statusCode).toBe(200);
      const body = rollbackRes.json<{
        status: string;
        publishedAt: unknown;
        title: string;
      }>();
      expect(body.status).toBe("draft");
      expect(body.publishedAt).toBeNull();
      // The title should match v1's title
      expect(body.title).toBe("Original Content");
    },
  );

  // t) rollback to non-existent version returns 404
  it.skipIf(!dbAvailable)(
    "rollback to non-existent version returns 404",
    async () => {
      const adminToken = await getAdminToken("-rb-404-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-rb-404-content");
      const createRes = await createContent(ownerToken, {
        title: "Content For Bad Rollback",
        richText: "Body.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      const rollbackRes = await app.inject({
        method: "POST",
        url: `/api/cms/content/${id}/rollback`,
        headers: authHeaders(ownerToken),
        payload: { versionNumber: 999 },
      });
      expect(rollbackRes.statusCode).toBe(404);
    },
  );

  // u) versions list returns history
  it.skipIf(!dbAvailable)(
    "versions list returns history",
    async () => {
      const adminToken = await getAdminToken("-versions-admin");
      await setPolicyAndReload(adminToken, ["badword"]);

      const ownerToken = await getProgramOwnerToken("-versions-content");
      const createRes = await createContent(ownerToken, {
        title: "Versioned Content",
        richText: "Initial body.",
      });
      expect(createRes.statusCode).toBe(200);
      const { id } = createRes.json<{ id: number }>();

      // Make an update to create v2
      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/cms/content/${id}`,
        headers: authHeaders(ownerToken),
        payload: { title: "Versioned Content v2" },
      });
      expect(updateRes.statusCode).toBe(200);

      const participantToken = await getParticipantToken("-versions-part");
      const versionsRes = await app.inject({
        method: "GET",
        url: `/api/cms/content/${id}/versions`,
        headers: authHeaders(participantToken),
      });
      expect(versionsRes.statusCode).toBe(200);
      const body = versionsRes.json<{
        versions: Array<{ versionNumber: number }>;
      }>();
      expect(Array.isArray(body.versions)).toBe(true);
      expect(body.versions.length).toBeGreaterThanOrEqual(2);
      // Should be ordered descending by version number
      if (body.versions.length >= 2) {
        expect(body.versions[0].versionNumber).toBeGreaterThan(
          body.versions[1].versionNumber,
        );
      }
    },
  );

  // v) unauthenticated content list returns 401
  it.skipIf(!dbAvailable)(
    "unauthenticated content list returns 401",
    async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/cms/content?page=1&limit=20",
        headers: nonceHeaders(),
      });
      expect(res.statusCode).toBe(401);
    },
  );
});
