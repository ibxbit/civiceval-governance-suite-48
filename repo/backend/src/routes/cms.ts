import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";

import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { z } from "zod";

import { authGuard } from "../middleware/auth.js";
import { logAuditEvent } from "../middleware/audit.js";
import { nonceGuard } from "../middleware/nonce.js";
import { roleGuard } from "../middleware/role.js";

const MAX_FILE_SIZE = 250 * 1024 * 1024;
const MAX_LINK_DAYS = 7;
const STORAGE_ROOT = join(process.cwd(), "storage", "private");

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
]);

const sensitiveWords = ["password", "ssn", "credit card", "secret", "api key"];

const createContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  richText: z.string().trim().min(1).max(200_000),
  fileIds: z.array(z.coerce.number().int().positive()).max(100).optional(),
});

const updateContentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  richText: z.string().trim().min(1).max(200_000).optional(),
  fileIds: z.array(z.coerce.number().int().positive()).max(100).optional(),
});

const contentIdParamsSchema = z.object({
  contentId: z.coerce.number().int().positive(),
});

const contentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["draft", "published", "all"]).default("all"),
});

const fileIdParamsSchema = z.object({
  fileId: z.coerce.number().int().positive(),
});

const rollbackSchema = z.object({
  versionNumber: z.coerce.number().int().positive(),
});

const fileLinkSchema = z.object({
  expiresInDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LINK_DAYS)
    .default(MAX_LINK_DAYS),
});

const accessTokenSchema = z.object({
  fid: z.coerce.number().int().positive(),
  uid: z.coerce.number().int().positive(),
  purpose: z.literal("cms-file-access"),
});

type FileRow = {
  id: number;
  original_name: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  sha256_hash: string;
  storage_path: string;
  uploaded_by_user_id: number;
  created_at: Date;
};

type ContentRow = {
  id: number;
  title: string;
  rich_text: string;
  status: "draft" | "published";
  file_ids: number[];
  version_number: number;
  created_by_user_id: number;
  updated_by_user_id: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type VersionRow = {
  id: number;
  content_id: number;
  version_number: number;
  title: string;
  rich_text: string;
  status: "draft" | "published";
  file_ids: number[];
  action: "create" | "update" | "publish" | "rollback";
  created_by_user_id: number;
  created_at: Date;
};

const cmsRoutes: FastifyPluginAsync = async (fastify) => {
  await mkdir(STORAGE_ROOT, { recursive: true });

  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1,
      fields: 10,
    },
  });

  fastify.get("/cms/content", { preHandler: [authGuard] }, async (request) => {
    const query = contentListQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw fastify.httpErrors.badRequest("Invalid content list query");
    }

    const offset = (query.data.page - 1) * query.data.limit;
    const dataStatusWhere =
      query.data.status === "all" ? "" : "AND status = $3";
    const countStatusWhere =
      query.data.status === "all" ? "" : "AND status = $1";

    const params =
      query.data.status === "all"
        ? [query.data.limit, offset]
        : [query.data.limit, offset, query.data.status];

    const dataResult = await fastify.db.query<ContentRow>(
      `
        SELECT
          id,
          title,
          rich_text,
          status,
          file_ids,
          version_number,
          created_by_user_id,
          updated_by_user_id,
          published_at,
          created_at,
          updated_at
        FROM app.cms_content
        WHERE archived_at IS NULL
        ${dataStatusWhere}
        ORDER BY updated_at DESC, id DESC
        LIMIT $1 OFFSET $2
      `,
      params,
    );

    const totalResult = await fastify.db.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM app.cms_content
        WHERE archived_at IS NULL
        ${countStatusWhere}
      `,
      query.data.status === "all" ? [] : [query.data.status],
    );

    return {
      data: dataResult.rows.map(mapContent),
      total: Number(totalResult.rows[0]?.total ?? "0"),
      page: query.data.page,
      limit: query.data.limit,
    };
  });

  fastify.get(
    "/cms/content/:contentId",
    { preHandler: [authGuard] },
    async (request) => {
      const params = contentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid content id");
      }

      const result = await fastify.db.query<ContentRow>(
        `
          SELECT
            id,
            title,
            rich_text,
            status,
            file_ids,
            version_number,
            created_by_user_id,
            updated_by_user_id,
            published_at,
            created_at,
            updated_at
          FROM app.cms_content
          WHERE id = $1
            AND archived_at IS NULL
          LIMIT 1
        `,
        [params.data.contentId],
      );

      const content = result.rows[0];
      if (!content) {
        throw fastify.httpErrors.notFound("Content not found");
      }

      return mapContent(content);
    },
  );

  fastify.post(
    "/cms/files/upload",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const filePart = await request.file();
      if (!filePart) {
        throw fastify.httpErrors.badRequest("File is required");
      }

      if (!allowedMimeTypes.has(filePart.mimetype)) {
        throw fastify.httpErrors.badRequest("Unsupported file type");
      }

      const extension = extname(filePart.filename || "").toLowerCase();
      const storageId = randomUUID();
      const dateDir = new Date().toISOString().slice(0, 10);
      const targetDir = join(STORAGE_ROOT, dateDir);
      const targetPath = join(targetDir, `${storageId}${extension}`);
      const relativeStoragePath = `${dateDir}/${storageId}${extension}`;

      await mkdir(targetDir, { recursive: true });

      const digest = createHash("sha256");
      const writeStream = createWriteStream(targetPath, { flags: "wx" });

      filePart.file.on("data", (chunk: Buffer) => {
        digest.update(chunk);
      });

      await pipeline(filePart.file, writeStream);

      const fileStats = await stat(targetPath);
      if (fileStats.size > MAX_FILE_SIZE) {
        throw fastify.httpErrors.payloadTooLarge("File exceeds maximum size");
      }

      const sha256Hash = digest.digest("hex");

      const insertResult = await fastify.db.query<FileRow>(
        `
          INSERT INTO app.cms_files (
            original_name,
            mime_type,
            extension,
            size_bytes,
            sha256_hash,
            storage_path,
            uploaded_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            id,
            original_name,
            mime_type,
            extension,
            size_bytes,
            sha256_hash,
            storage_path,
            uploaded_by_user_id,
            created_at
        `,
        [
          filePart.filename,
          filePart.mimetype,
          extension || "",
          fileStats.size,
          sha256Hash,
          relativeStoragePath,
          request.auth.userId,
        ],
      );

      const file = insertResult.rows[0];
      return {
        id: file.id,
        name: file.original_name,
        mimeType: file.mime_type,
        sizeBytes: file.size_bytes,
        hash: file.sha256_hash,
        createdAt: file.created_at,
      };
    },
  );

  fastify.post(
    "/cms/files/:fileId/link",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const params = fileIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid file id");
      }

      const parsed = fileLinkSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid link payload");
      }

      const fileExists = await fastify.db.query<{ id: number }>(
        `
          SELECT id
          FROM app.cms_files
          WHERE id = $1
          LIMIT 1
        `,
        [params.data.fileId],
      );

      if (!fileExists.rows[0]) {
        throw fastify.httpErrors.notFound("File not found");
      }

      const expiresInSeconds = parsed.data.expiresInDays * 24 * 60 * 60;
      const token = fastify.jwt.sign(
        {
          fid: params.data.fileId,
          uid: request.auth.userId,
          purpose: "cms-file-access",
        },
        { expiresIn: `${expiresInSeconds}s` },
      );

      return {
        token,
        expiresInSeconds,
      };
    },
  );

  fastify.get("/cms/files/access/:token", async (request, reply) => {
    const tokenParam = z
      .object({ token: z.string().min(10) })
      .safeParse(request.params);
    if (!tokenParam.success) {
      throw fastify.httpErrors.badRequest("Invalid access token");
    }

    let payload: unknown;
    try {
      payload = fastify.jwt.verify(tokenParam.data.token);
    } catch {
      throw fastify.httpErrors.unauthorized("Invalid or expired access token");
    }

    const parsedPayload = accessTokenSchema.safeParse(payload);
    if (!parsedPayload.success) {
      throw fastify.httpErrors.unauthorized("Invalid access token payload");
    }

    const fileResult = await fastify.db.query<FileRow>(
      `
        SELECT
          id,
          original_name,
          mime_type,
          extension,
          size_bytes,
          sha256_hash,
          storage_path,
          uploaded_by_user_id,
          created_at
        FROM app.cms_files
        WHERE id = $1
        LIMIT 1
      `,
      [parsedPayload.data.fid],
    );

    const file = fileResult.rows[0];
    if (!file) {
      throw fastify.httpErrors.notFound("File not found");
    }

    const absolutePath = join(STORAGE_ROOT, file.storage_path);
    await stat(absolutePath).catch(() => {
      throw fastify.httpErrors.notFound("Stored file not found");
    });

    reply.header("Content-Type", file.mime_type);
    reply.header(
      "Content-Disposition",
      `inline; filename="${sanitizeFilename(file.original_name)}"`,
    );

    const watermark = buildConfidentialWatermark();

    if (file.mime_type === "application/pdf") {
      const sourceBuffer = await readFile(absolutePath);
      const watermarked = await applyPdfWatermark(sourceBuffer, watermark);
      reply.header("Content-Length", String(watermarked.length));
      return reply.send(Buffer.from(watermarked));
    }

    if (file.mime_type.startsWith("image/")) {
      const sourceBuffer = await readFile(absolutePath);
      const watermarked = await applyImageWatermark(
        sourceBuffer,
        file.mime_type,
        watermark,
      );
      reply.header("Content-Length", String(watermarked.length));
      return reply.send(watermarked);
    }

    reply.header("Content-Length", String(file.size_bytes));
    return reply.send(createReadStream(absolutePath));
  });

  fastify.post(
    "/cms/content",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const parsed = createContentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid content payload");
      }

      validateSensitiveText(parsed.data.title, parsed.data.richText, fastify);
      const validatedFileIds = await validateFileIds(
        parsed.data.fileIds ?? [],
        fastify,
      );

      const client = await fastify.db.connect();
      try {
        await client.query("BEGIN");

        const contentInsert = await client.query<ContentRow>(
          `
            INSERT INTO app.cms_content (
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id
            )
            VALUES ($1, $2, 'draft', $3, 1, $4, $4)
            RETURNING
              id,
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id,
              published_at,
              created_at,
              updated_at
          `,
          [
            parsed.data.title,
            parsed.data.richText,
            validatedFileIds,
            request.auth.userId,
          ],
        );

        const content = contentInsert.rows[0];

        await client.query(
          `
            INSERT INTO app.cms_content_versions (
              content_id,
              version_number,
              title,
              rich_text,
              status,
              file_ids,
              action,
              created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'create', $7)
          `,
          [
            content.id,
            content.version_number,
            content.title,
            content.rich_text,
            content.status,
            content.file_ids,
            request.auth.userId,
          ],
        );

        await client.query("COMMIT");
        return mapContent(content);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.put(
    "/cms/content/:contentId",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const params = contentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid content id");
      }

      const parsed = updateContentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid content payload");
      }

      if (Object.keys(parsed.data).length === 0) {
        throw fastify.httpErrors.badRequest("At least one field is required");
      }

      const client = await fastify.db.connect();
      try {
        await client.query("BEGIN");

        const existingResult = await client.query<ContentRow>(
          `
            SELECT
              id,
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id,
              published_at,
              created_at,
              updated_at
            FROM app.cms_content
            WHERE id = $1
              AND archived_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [params.data.contentId],
        );

        const existing = existingResult.rows[0];
        if (!existing) {
          throw fastify.httpErrors.notFound("Content not found");
        }

        if (existing.status !== "draft") {
          throw fastify.httpErrors.badRequest(
            "Only draft content can be edited",
          );
        }

        const nextTitle = parsed.data.title ?? existing.title;
        const nextRichText = parsed.data.richText ?? existing.rich_text;
        validateSensitiveText(nextTitle, nextRichText, fastify);

        const nextFileIds =
          parsed.data.fileIds !== undefined
            ? await validateFileIds(parsed.data.fileIds, fastify)
            : existing.file_ids;

        const nextVersionNumber = existing.version_number + 1;

        const updatedResult = await client.query<ContentRow>(
          `
            UPDATE app.cms_content
            SET
              title = $2,
              rich_text = $3,
              file_ids = $4,
              version_number = $5,
              updated_by_user_id = $6,
              updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id,
              published_at,
              created_at,
              updated_at
          `,
          [
            existing.id,
            nextTitle,
            nextRichText,
            nextFileIds,
            nextVersionNumber,
            request.auth.userId,
          ],
        );

        const updated = updatedResult.rows[0];

        await client.query(
          `
            INSERT INTO app.cms_content_versions (
              content_id,
              version_number,
              title,
              rich_text,
              status,
              file_ids,
              action,
              created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'update', $7)
          `,
          [
            updated.id,
            updated.version_number,
            updated.title,
            updated.rich_text,
            updated.status,
            updated.file_ids,
            request.auth.userId,
          ],
        );

        await client.query("COMMIT");
        return mapContent(updated);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.post(
    "/cms/content/:contentId/publish",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const params = contentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid content id");
      }

      const client = await fastify.db.connect();
      try {
        await client.query("BEGIN");

        const existingResult = await client.query<ContentRow>(
          `
            SELECT
              id,
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id,
              published_at,
              created_at,
              updated_at
            FROM app.cms_content
            WHERE id = $1
              AND archived_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [params.data.contentId],
        );

        const existing = existingResult.rows[0];
        if (!existing) {
          throw fastify.httpErrors.notFound("Content not found");
        }

        if (existing.status === "published") {
          throw fastify.httpErrors.badRequest("Content is already published");
        }

        const nextVersionNumber = existing.version_number + 1;
        const publishedResult = await client.query<ContentRow>(
          `
            UPDATE app.cms_content
            SET
              status = 'published',
              version_number = $2,
              updated_by_user_id = $3,
              updated_at = NOW(),
              published_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id,
              published_at,
              created_at,
              updated_at
          `,
          [existing.id, nextVersionNumber, request.auth.userId],
        );

        const published = publishedResult.rows[0];

        await client.query(
          `
            INSERT INTO app.cms_content_versions (
              content_id,
              version_number,
              title,
              rich_text,
              status,
              file_ids,
              action,
              created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'publish', $7)
          `,
          [
            published.id,
            published.version_number,
            published.title,
            published.rich_text,
            published.status,
            published.file_ids,
            request.auth.userId,
          ],
        );

        await client.query("COMMIT");
        await logAuditEvent(fastify, {
          userId: request.auth.userId,
          action: "content.publish",
          entityType: "content",
          entityId: published.id,
          details: { versionNumber: published.version_number },
          ipAddress: request.ip,
        });
        return mapContent(published);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.post(
    "/cms/content/:contentId/rollback",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const params = contentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid content id");
      }

      const body = rollbackSchema.safeParse(request.body);
      if (!body.success) {
        throw fastify.httpErrors.badRequest("Invalid rollback payload");
      }

      const client = await fastify.db.connect();
      try {
        await client.query("BEGIN");

        const currentResult = await client.query<ContentRow>(
          `
            SELECT
              id,
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id,
              published_at,
              created_at,
              updated_at
            FROM app.cms_content
            WHERE id = $1
              AND archived_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [params.data.contentId],
        );

        const current = currentResult.rows[0];
        if (!current) {
          throw fastify.httpErrors.notFound("Content not found");
        }

        const sourceResult = await client.query<VersionRow>(
          `
            SELECT
              id,
              content_id,
              version_number,
              title,
              rich_text,
              status,
              file_ids,
              action,
              created_by_user_id,
              created_at
            FROM app.cms_content_versions
            WHERE content_id = $1
              AND version_number = $2
            LIMIT 1
          `,
          [current.id, body.data.versionNumber],
        );

        const source = sourceResult.rows[0];
        if (!source) {
          throw fastify.httpErrors.notFound("Version not found");
        }

        validateSensitiveText(source.title, source.rich_text, fastify);

        const nextVersionNumber = current.version_number + 1;

        const rolledBackResult = await client.query<ContentRow>(
          `
            UPDATE app.cms_content
            SET
              title = $2,
              rich_text = $3,
              status = 'draft',
              file_ids = $4,
              version_number = $5,
              updated_by_user_id = $6,
              updated_at = NOW(),
              published_at = NULL
            WHERE id = $1
            RETURNING
              id,
              title,
              rich_text,
              status,
              file_ids,
              version_number,
              created_by_user_id,
              updated_by_user_id,
              published_at,
              created_at,
              updated_at
          `,
          [
            current.id,
            source.title,
            source.rich_text,
            source.file_ids,
            nextVersionNumber,
            request.auth.userId,
          ],
        );

        const rolledBack = rolledBackResult.rows[0];

        await client.query(
          `
            INSERT INTO app.cms_content_versions (
              content_id,
              version_number,
              title,
              rich_text,
              status,
              file_ids,
              action,
              created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'rollback', $7)
          `,
          [
            rolledBack.id,
            rolledBack.version_number,
            rolledBack.title,
            rolledBack.rich_text,
            rolledBack.status,
            rolledBack.file_ids,
            request.auth.userId,
          ],
        );

        await client.query("COMMIT");
        await logAuditEvent(fastify, {
          userId: request.auth.userId,
          action: "content.rollback",
          entityType: "content",
          entityId: rolledBack.id,
          details: {
            restoredFromVersion: body.data.versionNumber,
            versionNumber: rolledBack.version_number,
          },
          ipAddress: request.ip,
        });
        return mapContent(rolledBack);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.get(
    "/cms/content/:contentId/versions",
    { preHandler: [authGuard] },
    async (request) => {
      const params = contentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid content id");
      }

      const versionsResult = await fastify.db.query<VersionRow>(
        `
          SELECT
            id,
            content_id,
            version_number,
            title,
            rich_text,
            status,
            file_ids,
            action,
            created_by_user_id,
            created_at
          FROM app.cms_content_versions
          WHERE content_id = $1
          ORDER BY version_number DESC
        `,
        [params.data.contentId],
      );

      return {
        versions: versionsResult.rows.map((version) => ({
          id: version.id,
          versionNumber: version.version_number,
          title: version.title,
          status: version.status,
          fileIds: version.file_ids,
          action: version.action,
          createdByUserId: version.created_by_user_id,
          createdAt: version.created_at,
        })),
      };
    },
  );
};

const mapContent = (content: ContentRow) => ({
  id: content.id,
  title: content.title,
  richText: content.rich_text,
  status: content.status,
  fileIds: content.file_ids,
  versionNumber: content.version_number,
  createdByUserId: content.created_by_user_id,
  updatedByUserId: content.updated_by_user_id,
  publishedAt: content.published_at,
  createdAt: content.created_at,
  updatedAt: content.updated_at,
});

const validateSensitiveText = (
  title: string,
  richText: string,
  fastify: FastifyInstance,
): void => {
  const normalized = `${title} ${richText}`.toLowerCase();
  for (const word of sensitiveWords) {
    if (normalized.includes(word)) {
      throw fastify.httpErrors.badRequest("Content contains blocked terms");
    }
  }
};

const validateFileIds = async (
  fileIds: number[],
  fastify: FastifyInstance,
): Promise<number[]> => {
  if (fileIds.length === 0) {
    return [];
  }

  const unique = Array.from(new Set(fileIds));
  const result = await fastify.db.query<{ id: number }>(
    `
      SELECT id
      FROM app.cms_files
      WHERE id = ANY($1::bigint[])
    `,
    [unique],
  );

  if (result.rows.length !== unique.length) {
    throw fastify.httpErrors.badRequest("One or more file ids are invalid");
  }

  return unique;
};

const sanitizeFilename = (filename: string): string =>
  filename.replace(/[^a-zA-Z0-9._-]/g, "_");

const buildConfidentialWatermark = (): string => {
  const timestamp = new Date().toISOString();
  return `CONFIDENTIAL - CivicEval Agency - ${timestamp}`;
};

const applyPdfWatermark = async (
  source: Uint8Array,
  watermarkText: string,
): Promise<Uint8Array> => {
  const document = await PDFDocument.load(source);
  const font = await document.embedFont(StandardFonts.HelveticaBold);

  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(watermarkText, {
      x: width * 0.12,
      y: height * 0.55,
      size: Math.max(14, Math.floor(width / 35)),
      font,
      color: rgb(0, 0, 0),
      opacity: 0.24,
      rotate: degrees(-28),
    });
  }

  return document.save();
};

const applyImageWatermark = async (
  source: Buffer,
  mimeType: string,
  watermarkText: string,
): Promise<Buffer> => {
  const image = sharp(source, { animated: true });
  const metadata = await image.metadata();
  const width = metadata.width ?? 1280;
  const height = metadata.height ?? 720;
  const textSize = Math.max(18, Math.floor(width / 28));

  const overlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${Math.floor(width * 0.1)}, ${Math.floor(height * 0.6)}) rotate(-25)">
        <text
          x="0"
          y="0"
          fill="rgba(255, 255, 255, 0.42)"
          stroke="rgba(0, 0, 0, 0.35)"
          stroke-width="1"
          font-family="Arial, sans-serif"
          font-size="${textSize}"
          font-weight="700"
        >${escapeXml(watermarkText)}</text>
      </g>
    </svg>
  `;

  const pipelineBuilder = image.composite([
    {
      input: Buffer.from(overlay),
      gravity: "center",
    },
  ]);

  if (mimeType === "image/jpeg") {
    return pipelineBuilder.jpeg().toBuffer();
  }
  if (mimeType === "image/png") {
    return pipelineBuilder.png().toBuffer();
  }
  if (mimeType === "image/webp") {
    return pipelineBuilder.webp().toBuffer();
  }
  if (mimeType === "image/gif") {
    return pipelineBuilder.gif().toBuffer();
  }

  return pipelineBuilder.toBuffer();
};

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export default cmsRoutes;
