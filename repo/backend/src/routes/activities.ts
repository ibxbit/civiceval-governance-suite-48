import { createHash, randomBytes } from "node:crypto";

import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { authGuard } from "../middleware/auth.js";
import { logAuditEvent } from "../middleware/audit.js";
import { nonceGuard } from "../middleware/nonce.js";
import { searchRateLimitConfig } from "../middleware/rate-limit.js";
import { roleGuard } from "../middleware/role.js";
import { maskNullableText, maskSensitiveDigits } from "../utils/masking.js";

const participationTypeSchema = z.enum(["individual", "team"]);

const activityBaseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  participationType: participationTypeSchema,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  registrationStartAt: z.coerce.date(),
  registrationEndAt: z.coerce.date(),
});

const activityCreateSchema = activityBaseSchema.superRefine((value, ctx) => {
  if (value.startsAt >= value.endsAt) {
    ctx.addIssue({
      code: "custom",
      message: "Activity start must be before end",
      path: ["startsAt"],
    });
  }

  if (value.registrationStartAt >= value.registrationEndAt) {
    ctx.addIssue({
      code: "custom",
      message: "Registration start must be before end",
      path: ["registrationStartAt"],
    });
  }

  if (value.registrationEndAt > value.startsAt) {
    ctx.addIssue({
      code: "custom",
      message: "Registration must close before activity start",
      path: ["registrationEndAt"],
    });
  }
});

const activityUpdateSchema = activityBaseSchema.partial();

const activityIdParamSchema = z.object({
  activityId: z.coerce.number().int().positive(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const activityListQuerySchema = paginationSchema.extend({
  status: z.enum(["upcoming", "active", "completed", "all"]).default("all"),
});

const activitySearchQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(120),
});

const checkinCodeCreateSchema = z.object({
  expiresInSeconds: z.coerce.number().int().min(60).max(900).default(300),
});

const checkinValidateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/),
});

type ActivityRow = {
  id: number;
  title: string;
  description: string | null;
  participation_type: "individual" | "team";
  starts_at: Date;
  ends_at: Date;
  registration_start_at: Date;
  registration_end_at: Date;
  created_by_user_id: number;
  created_at: Date;
  updated_at: Date;
};

type ActivityWindowRow = {
  starts_at: Date;
  ends_at: Date;
  registration_start_at: Date;
  registration_end_at: Date;
};

type ActivityDetailRow = ActivityRow & {
  registration_count: string;
};

type RegistrationRow = {
  id: number;
  activity_id: number;
  user_id: number;
  username: string;
  created_at: Date;
};

type CheckinCodeRow = {
  id: number;
};

type ActivityIdParams = z.infer<typeof activityIdParamSchema>;
type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
type CheckinCodeCreateInput = z.infer<typeof checkinCodeCreateSchema>;
type CheckinValidateInput = z.infer<typeof checkinValidateSchema>;

const activitiesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/activities",
    { preHandler: [authGuard, nonceGuard] },
    async (request) => {
    const query = activityListQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw fastify.httpErrors.badRequest("Invalid activity list query");
    }

    const offset = (query.data.page - 1) * query.data.limit;
    const statusWhere =
      query.data.status === "upcoming"
        ? "AND starts_at > NOW()"
        : query.data.status === "active"
          ? "AND starts_at <= NOW() AND ends_at >= NOW()"
          : query.data.status === "completed"
            ? "AND ends_at < NOW()"
            : "";

    const dataResult = await fastify.db.query<ActivityRow>(
      `
          SELECT
            id,
            title,
            description,
            participation_type,
            starts_at,
            ends_at,
            registration_start_at,
            registration_end_at,
            created_by_user_id,
            created_at,
            updated_at
          FROM app.activities
          WHERE deleted_at IS NULL
          ${statusWhere}
          ORDER BY starts_at DESC, id DESC
          LIMIT $1 OFFSET $2
        `,
      [query.data.limit, offset],
    );

    const totalResult = await fastify.db.query<{ total: string }>(
      `
          SELECT COUNT(*)::text AS total
          FROM app.activities
          WHERE deleted_at IS NULL
          ${statusWhere}
        `,
    );

    return {
      data: dataResult.rows.map(mapActivity),
      total: Number(totalResult.rows[0]?.total ?? "0"),
      page: query.data.page,
      limit: query.data.limit,
    };
    },
  );

  fastify.get(
    "/activities/search",
    {
      preHandler: [authGuard, nonceGuard],
      ...searchRateLimitConfig,
    },
    async (request) => {
      const query = activitySearchQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw fastify.httpErrors.badRequest("Invalid activity search query");
      }

      const offset = (query.data.page - 1) * query.data.limit;
      const wildcard = `%${query.data.q}%`;

      const dataResult = await fastify.db.query<ActivityRow>(
        `
          SELECT
            id,
            title,
            description,
            participation_type,
            starts_at,
            ends_at,
            registration_start_at,
            registration_end_at,
            created_by_user_id,
            created_at,
            updated_at
          FROM app.activities
          WHERE deleted_at IS NULL
            AND (title ILIKE $1 OR COALESCE(description, '') ILIKE $1)
          ORDER BY starts_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
        [wildcard, query.data.limit, offset],
      );

      const totalResult = await fastify.db.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM app.activities
          WHERE deleted_at IS NULL
            AND (title ILIKE $1 OR COALESCE(description, '') ILIKE $1)
        `,
        [wildcard],
      );

      return {
        data: dataResult.rows.map(mapActivity),
        total: Number(totalResult.rows[0]?.total ?? "0"),
        page: query.data.page,
        limit: query.data.limit,
        query: query.data.q,
      };
    },
  );

  fastify.get(
    "/activities/:activityId",
    { preHandler: [authGuard, nonceGuard] },
    async (request) => {
      const params = parseActivityIdParams(request.params, fastify);
      const result = await fastify.db.query<ActivityDetailRow>(
        `
          SELECT
            a.id,
            a.title,
            a.description,
            a.participation_type,
            a.starts_at,
            a.ends_at,
            a.registration_start_at,
            a.registration_end_at,
            a.created_by_user_id,
            a.created_at,
            a.updated_at,
            (
              SELECT COUNT(*)::text
              FROM app.activity_registrations ar
              WHERE ar.activity_id = a.id
                AND ar.cancelled_at IS NULL
            ) AS registration_count
          FROM app.activities a
          WHERE a.id = $1
            AND a.deleted_at IS NULL
          LIMIT 1
        `,
        [params.activityId],
      );

      const activity = result.rows[0];
      if (!activity) {
        throw fastify.httpErrors.notFound("Activity not found");
      }

      return {
        ...mapActivity(activity),
        registrationCount: Number(activity.registration_count),
      };
    },
  );

  fastify.get(
    "/activities/:activityId/registrations",
    {
      preHandler: [
        authGuard,
        roleGuard("program_owner", "admin", "reviewer"),
        nonceGuard,
      ],
    },
    async (request) => {
      const params = parseActivityIdParams(request.params, fastify);
      const pagination = paginationSchema.safeParse(request.query);
      if (!pagination.success) {
        throw fastify.httpErrors.badRequest("Invalid pagination query");
      }

      const offset = (pagination.data.page - 1) * pagination.data.limit;

      const dataResult = await fastify.db.query<RegistrationRow>(
        `
          SELECT
            ar.id,
            ar.activity_id,
            ar.user_id,
            u.username,
            ar.created_at
          FROM app.activity_registrations ar
          INNER JOIN app.users u ON u.id = ar.user_id
          WHERE ar.activity_id = $1
            AND ar.cancelled_at IS NULL
          ORDER BY ar.created_at DESC, ar.id DESC
          LIMIT $2 OFFSET $3
        `,
        [params.activityId, pagination.data.limit, offset],
      );

      const totalResult = await fastify.db.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM app.activity_registrations
          WHERE activity_id = $1
            AND cancelled_at IS NULL
        `,
        [params.activityId],
      );

      return {
        data: dataResult.rows.map((registration) => ({
          id: registration.id,
          activityId: registration.activity_id,
          userId: registration.user_id,
          username: maskSensitiveDigits(registration.username),
          createdAt: registration.created_at,
        })),
        total: Number(totalResult.rows[0]?.total ?? "0"),
        page: pagination.data.page,
        limit: pagination.data.limit,
      };
    },
  );

  fastify.post(
    "/activities",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const body = parseActivityCreate(request.body, fastify);

      const result = await fastify.db.query<ActivityRow>(
        `
          INSERT INTO app.activities (
            title,
            description,
            participation_type,
            starts_at,
            ends_at,
            registration_start_at,
            registration_end_at,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING
            id,
            title,
            description,
            participation_type,
            starts_at,
            ends_at,
            registration_start_at,
            registration_end_at,
            created_by_user_id,
            created_at,
            updated_at
        `,
        [
          body.title,
          body.description ?? null,
          body.participationType,
          body.startsAt,
          body.endsAt,
          body.registrationStartAt,
          body.registrationEndAt,
          request.auth.userId,
        ],
      );

      const created = mapActivity(result.rows[0]);
      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "activity.create",
        entityType: "activity",
        entityId: created.id,
        details: { title: created.title },
        ipAddress: request.ip,
      });

      return created;
    },
  );

  fastify.put(
    "/activities/:activityId",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const params = parseActivityIdParams(request.params, fastify);
      const body = parseActivityUpdate(request.body, fastify);

      if (Object.keys(body).length === 0) {
        throw fastify.httpErrors.badRequest("At least one field is required");
      }

      const existingResult = await fastify.db.query<ActivityWindowRow>(
        `
          SELECT starts_at, ends_at, registration_start_at, registration_end_at
          FROM app.activities
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [params.activityId],
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        throw fastify.httpErrors.notFound("Activity not found");
      }

      const startsAt = body.startsAt ?? existing.starts_at;
      const endsAt = body.endsAt ?? existing.ends_at;
      const registrationStartAt =
        body.registrationStartAt ?? existing.registration_start_at;
      const registrationEndAt =
        body.registrationEndAt ?? existing.registration_end_at;

      validateActivityWindow(
        { startsAt, endsAt, registrationStartAt, registrationEndAt },
        fastify,
      );

      const updateResult = await fastify.db.query<ActivityRow>(
        `
          UPDATE app.activities
          SET
            title = COALESCE($2, title),
            description = CASE
              WHEN $3::text IS NULL THEN description
              ELSE $3::text
            END,
            participation_type = COALESCE($4, participation_type),
            starts_at = COALESCE($5, starts_at),
            ends_at = COALESCE($6, ends_at),
            registration_start_at = COALESCE($7, registration_start_at),
            registration_end_at = COALESCE($8, registration_end_at),
            updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING
            id,
            title,
            description,
            participation_type,
            starts_at,
            ends_at,
            registration_start_at,
            registration_end_at,
            created_by_user_id,
            created_at,
            updated_at
        `,
        [
          params.activityId,
          body.title ?? null,
          body.description ?? null,
          body.participationType ?? null,
          body.startsAt ?? null,
          body.endsAt ?? null,
          body.registrationStartAt ?? null,
          body.registrationEndAt ?? null,
        ],
      );

      const activity = updateResult.rows[0];
      if (!activity) {
        throw fastify.httpErrors.notFound("Activity not found");
      }

      const updatedActivity = mapActivity(activity);
      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "activity.update",
        entityType: "activity",
        entityId: updatedActivity.id,
        details: { title: updatedActivity.title },
        ipAddress: request.ip,
      });

      return updatedActivity;
    },
  );

  fastify.delete(
    "/activities/:activityId",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const params = parseActivityIdParams(request.params, fastify);

      const removed = await fastify.db.query(
        `
          UPDATE app.activities
          SET deleted_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
        `,
        [params.activityId],
      );

      if (removed.rowCount === 0) {
        throw fastify.httpErrors.notFound("Activity not found");
      }

      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "activity.delete",
        entityType: "activity",
        entityId: params.activityId,
        ipAddress: request.ip,
      });

      return { success: true };
    },
  );

  fastify.post(
    "/activities/:activityId/register",
    { preHandler: [authGuard, roleGuard("participant"), nonceGuard] },
    async (request) => {
      const params = parseActivityIdParams(request.params, fastify);

      const registration = await fastify.db.query<{ id: number }>(
        `
          INSERT INTO app.activity_registrations (activity_id, user_id)
          SELECT a.id, $2
          FROM app.activities a
          WHERE a.id = $1
            AND a.deleted_at IS NULL
            AND NOW() >= a.registration_start_at
            AND NOW() <= a.registration_end_at
          ON CONFLICT (activity_id, user_id)
          DO UPDATE
          SET cancelled_at = NULL,
              updated_at = NOW()
          RETURNING id
        `,
        [params.activityId, request.auth.userId],
      );

      if (!registration.rows[0]) {
        throw fastify.httpErrors.badRequest(
          "Registration window is closed or activity is unavailable",
        );
      }

      return { success: true };
    },
  );

  fastify.post(
    "/activities/:activityId/checkin-code",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const params = parseActivityIdParams(request.params, fastify);
      const body = parseCheckinCodeCreate(request.body, fastify);

      const activityWindow = await fastify.db.query<{
        starts_at: Date;
        ends_at: Date;
      }>(
        `
          SELECT starts_at, ends_at
          FROM app.activities
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [params.activityId],
      );

      const activity = activityWindow.rows[0];
      if (!activity) {
        throw fastify.httpErrors.notFound("Activity not found");
      }

      const now = new Date();
      if (now < activity.starts_at || now > activity.ends_at) {
        throw fastify.httpErrors.badRequest(
          "Check-in is not active for this activity",
        );
      }

      const code = generateCheckinCode();
      const codeHash = hashCheckinCode(code);

      const insertCode = await fastify.db.query<CheckinCodeRow>(
        `
          INSERT INTO app.activity_checkin_codes (
            activity_id,
            code_hash,
            created_by_user_id,
            expires_at
          )
          VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second'))
          RETURNING id
        `,
        [
          params.activityId,
          codeHash,
          request.auth.userId,
          body.expiresInSeconds,
        ],
      );

      return {
        checkinCodeId: insertCode.rows[0].id,
        code,
        expiresInSeconds: body.expiresInSeconds,
      };
    },
  );

  fastify.post(
    "/activities/:activityId/checkin",
    { preHandler: [authGuard, roleGuard("participant"), nonceGuard] },
    async (request) => {
      const params = parseActivityIdParams(request.params, fastify);
      const body = parseCheckinValidate(request.body, fastify);
      const codeHash = hashCheckinCode(body.code);

      const client = await fastify.db.connect();

      try {
        await client.query("BEGIN");

        const registration = await client.query<{ id: number }>(
          `
            SELECT id
            FROM app.activity_registrations
            WHERE activity_id = $1
              AND user_id = $2
              AND cancelled_at IS NULL
            LIMIT 1
          `,
          [params.activityId, request.auth.userId],
        );

        if (!registration.rows[0]) {
          throw fastify.httpErrors.forbidden(
            "Registration required before check-in",
          );
        }

        const checkinCode = await client.query<{ id: number }>(
          `
            SELECT id
            FROM app.activity_checkin_codes
            WHERE activity_id = $1
              AND code_hash = $2
              AND revoked_at IS NULL
              AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [params.activityId, codeHash],
        );

        const code = checkinCode.rows[0];
        if (!code) {
          throw fastify.httpErrors.unauthorized(
            "Invalid or expired check-in code",
          );
        }

        const insertedCheckin = await client.query<{ id: number }>(
          `
            INSERT INTO app.activity_checkins (activity_id, user_id, checkin_code_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (activity_id, user_id)
            DO NOTHING
            RETURNING id
          `,
          [params.activityId, request.auth.userId, code.id],
        );

        if (!insertedCheckin.rows[0]) {
          throw fastify.httpErrors.conflict("Participant has already checked in");
        }

        await client.query("COMMIT");
        return { success: true };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );
};

const parseActivityCreate = (
  input: unknown,
  fastify: FastifyInstance,
): ActivityCreateInput => {
  const parsed = activityCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw fastify.httpErrors.badRequest("Invalid activity payload");
  }
  return parsed.data;
};

const parseActivityUpdate = (
  input: unknown,
  fastify: FastifyInstance,
): ActivityUpdateInput => {
  const parsed = activityUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw fastify.httpErrors.badRequest("Invalid activity payload");
  }
  return parsed.data;
};

const parseActivityIdParams = (
  input: unknown,
  fastify: FastifyInstance,
): ActivityIdParams => {
  const parsed = activityIdParamSchema.safeParse(input);
  if (!parsed.success) {
    throw fastify.httpErrors.badRequest("Invalid activity id");
  }
  return parsed.data;
};

const parseCheckinCodeCreate = (
  input: unknown,
  fastify: FastifyInstance,
): CheckinCodeCreateInput => {
  const parsed = checkinCodeCreateSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw fastify.httpErrors.badRequest("Invalid check-in code payload");
  }
  return parsed.data;
};

const parseCheckinValidate = (
  input: unknown,
  fastify: FastifyInstance,
): CheckinValidateInput => {
  const parsed = checkinValidateSchema.safeParse(input);
  if (!parsed.success) {
    throw fastify.httpErrors.badRequest("Invalid check-in payload");
  }
  return parsed.data;
};

const validateActivityWindow = (
  window: {
    startsAt: Date;
    endsAt: Date;
    registrationStartAt: Date;
    registrationEndAt: Date;
  },
  fastify: FastifyInstance,
): void => {
  if (window.startsAt >= window.endsAt) {
    throw fastify.httpErrors.badRequest("Activity start must be before end");
  }

  if (window.registrationStartAt >= window.registrationEndAt) {
    throw fastify.httpErrors.badRequest(
      "Registration start must be before end",
    );
  }

  if (window.registrationEndAt > window.startsAt) {
    throw fastify.httpErrors.badRequest(
      "Registration must close before activity start",
    );
  }
};

const mapActivity = (row: ActivityRow) => ({
  id: row.id,
  title: maskSensitiveDigits(row.title),
  description: maskNullableText(row.description),
  participationType: row.participation_type,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  registrationStartAt: row.registration_start_at,
  registrationEndAt: row.registration_end_at,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const generateCheckinCode = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";

  for (let index = 0; index < 8; index += 1) {
    code += alphabet[bytes[index] % alphabet.length];
  }

  return code;
};

const hashCheckinCode = (code: string): string =>
  createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

export default activitiesRoutes;
