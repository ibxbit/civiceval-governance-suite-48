import { createHash, randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { authGuard } from "../middleware/auth.js";
import { logAuditEvent } from "../middleware/audit.js";
import { nonceGuard } from "../middleware/nonce.js";
import { loginRateLimitConfig } from "../middleware/rate-limit.js";
import { roleGuard } from "../middleware/role.js";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../security/password.js";
import type { AuthTokenPayload } from "../types/auth.js";
import type { UserRole } from "../types/auth.js";
import { maskSensitiveDigits } from "../utils/masking.js";

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string(),
});

const updateRoleSchema = z.object({
  role: z.enum(["admin", "program_owner", "reviewer", "participant"]),
});

const userIdParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

const loginEventIdParamsSchema = z.object({
  eventId: z.coerce.number().int().positive(),
});

const loginEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  reviewed: z.enum(["all", "true", "false"]).default("false"),
});

const reviewLoginEventSchema = z.object({
  reviewNote: z.string().trim().max(1000).optional(),
});

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
};

type AttemptRow = {
  failed_count: number;
  locked_until: Date | null;
};

type SessionRow = {
  id: number;
};

type LoginEventRow = {
  id: number;
  user_id: number | null;
  username: string;
  success: boolean;
  user_agent: string | null;
  ip_address: string | null;
  is_unrecognized: boolean;
  reviewed_at: Date | null;
  reviewed_by_user_id: number | null;
  review_note: string | null;
  created_at: Date;
};

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/auth/register",
    { preHandler: [nonceGuard] },
    async (request) => {
      const parsed = credentialsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid registration payload");
      }

      const username = normalizeUsername(parsed.data.username);

      if (!validatePasswordStrength(parsed.data.password)) {
        throw fastify.httpErrors.badRequest(
          "Password must be at least 12 characters and include uppercase, lowercase, number, and special character",
        );
      }

      const passwordHash = await hashPassword(parsed.data.password);

      try {
        const created = await fastify.db.query<{
          id: number;
          username: string;
          role: UserRole;
        }>(
          `
          INSERT INTO app.users (username, password_hash)
          VALUES ($1, $2)
          RETURNING id, username, role
        `,
          [username, passwordHash],
        );

        const user = created.rows[0];

        await logAuditEvent(fastify, {
          userId: user.id,
          action: "auth.register.success",
          entityType: "user",
          entityId: user.id,
          details: { username: user.username, role: user.role },
          ipAddress: request.ip,
        });

        return {
          user: {
            id: user.id,
            username: maskSensitiveDigits(user.username),
            role: user.role,
          },
        };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw fastify.httpErrors.conflict("Username already exists");
        }

        throw fastify.httpErrors.internalServerError("Registration failed");
      }
    },
  );

  fastify.get(
    "/auth/login-events/unrecognized",
    { preHandler: [authGuard, roleGuard("admin")] },
    async (request) => {
      const query = loginEventListQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw fastify.httpErrors.badRequest("Invalid login events query");
      }

      const offset = (query.data.page - 1) * query.data.limit;
      const reviewedWhere =
        query.data.reviewed === "true"
          ? "AND reviewed_at IS NOT NULL"
          : query.data.reviewed === "false"
            ? "AND reviewed_at IS NULL"
            : "";

      const eventsResult = await fastify.db.query<LoginEventRow>(
        `
          SELECT
            id,
            user_id,
            username,
            success,
            user_agent,
            ip_address,
            is_unrecognized,
            reviewed_at,
            reviewed_by_user_id,
            review_note,
            created_at
          FROM app.auth_login_events
          WHERE is_unrecognized = TRUE
            ${reviewedWhere}
          ORDER BY created_at DESC, id DESC
          LIMIT $1 OFFSET $2
        `,
        [query.data.limit, offset],
      );

      const totalResult = await fastify.db.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM app.auth_login_events
          WHERE is_unrecognized = TRUE
            ${reviewedWhere}
        `,
      );

      return {
        data: eventsResult.rows.map((event) => ({
          id: event.id,
          userId: event.user_id,
          username: maskSensitiveDigits(event.username),
          success: event.success,
          userAgent: event.user_agent,
          ipAddress: event.ip_address
            ? maskSensitiveDigits(event.ip_address)
            : null,
          isUnrecognized: event.is_unrecognized,
          reviewedAt: event.reviewed_at,
          reviewedByUserId: event.reviewed_by_user_id,
          reviewNote: event.review_note,
          createdAt: event.created_at,
        })),
        total: Number(totalResult.rows[0]?.total ?? "0"),
        page: query.data.page,
        limit: query.data.limit,
      };
    },
  );

  fastify.post(
    "/auth/login-events/:eventId/review",
    { preHandler: [authGuard, roleGuard("admin"), nonceGuard] },
    async (request) => {
      const params = loginEventIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid login event id");
      }

      const body = reviewLoginEventSchema.safeParse(request.body ?? {});
      if (!body.success) {
        throw fastify.httpErrors.badRequest("Invalid review payload");
      }

      const reviewedResult = await fastify.db.query<{ id: number }>(
        `
          UPDATE app.auth_login_events
          SET reviewed_at = NOW(),
              reviewed_by_user_id = $2,
              review_note = $3
          WHERE id = $1
            AND is_unrecognized = TRUE
          RETURNING id
        `,
        [
          params.data.eventId,
          request.auth.userId,
          body.data.reviewNote ?? null,
        ],
      );

      if (!reviewedResult.rows[0]) {
        throw fastify.httpErrors.notFound("Login event not found");
      }

      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "auth.unrecognized_login.review",
        entityType: "login_event",
        entityId: params.data.eventId,
        details: { hasReviewNote: Boolean(body.data.reviewNote) },
        ipAddress: request.ip,
      });

      return { success: true };
    },
  );

  fastify.post(
    "/auth/users/:userId/role",
    { preHandler: [authGuard, roleGuard("admin"), nonceGuard] },
    async (request) => {
      const params = userIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid user id");
      }

      const body = updateRoleSchema.safeParse(request.body);
      if (!body.success) {
        throw fastify.httpErrors.badRequest("Invalid role payload");
      }

      const result = await fastify.db.query<{ id: number; role: UserRole }>(
        `
          UPDATE app.users
          SET role = $2,
              updated_at = NOW()
          WHERE id = $1
          RETURNING id, role
        `,
        [params.data.userId, body.data.role],
      );

      const user = result.rows[0];
      if (!user) {
        throw fastify.httpErrors.notFound("User not found");
      }

      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "auth.role.change",
        entityType: "user",
        entityId: user.id,
        details: { role: user.role },
        ipAddress: request.ip,
      });

      return { id: user.id, role: user.role };
    },
  );

  fastify.post(
    "/auth/login",
    {
      preHandler: [nonceGuard],
      ...loginRateLimitConfig,
    },
    async (request) => {
      const parsed = credentialsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid login payload");
      }

      const username = normalizeUsername(parsed.data.username);
      const userAgent = request.headers["user-agent"] ?? null;
      const ipAddress = request.ip;
      const deviceFingerprint = buildDeviceFingerprint(userAgent, ipAddress);

      const client = await fastify.db.connect();

      try {
        await client.query("BEGIN");

        const attemptResult = await client.query<AttemptRow>(
          `
            SELECT failed_count, locked_until
            FROM app.login_attempts
            WHERE username = $1
            FOR UPDATE
          `,
          [username],
        );

        const attempt = attemptResult.rows[0];
        if (
          attempt?.locked_until &&
          new Date(attempt.locked_until) > new Date()
        ) {
          throw fastify.httpErrors.locked("Account temporarily locked");
        }

        const userResult = await client.query<UserRow>(
          `
            SELECT id, username, password_hash, role
            FROM app.users
            WHERE username = $1
            LIMIT 1
          `,
          [username],
        );

        const user = userResult.rows[0];
        const passwordValid = user
          ? await verifyPassword(parsed.data.password, user.password_hash)
          : false;

        if (!user || !passwordValid) {
          const lockInfo = await incrementFailedLogin(
            client,
            username,
            attempt,
          );
          await client.query("COMMIT");

          if (lockInfo.locked) {
            await logAuditEvent(fastify, {
              action: "auth.login.locked",
              entityType: "user",
              details: { username },
              ipAddress: request.ip,
            });
            throw fastify.httpErrors.locked("Account temporarily locked");
          }

          await logAuditEvent(fastify, {
            action: "auth.login.failure",
            entityType: "user",
            details: { username },
            ipAddress: request.ip,
          });

          await client.query(
            `
              INSERT INTO app.auth_login_events (
                user_id,
                username,
                success,
                device_fingerprint,
                user_agent,
                ip_address,
                is_unrecognized
              )
              VALUES ($1, $2, FALSE, $3, $4, $5, FALSE)
            `,
            [
              user?.id ?? null,
              username,
              deviceFingerprint,
              userAgent,
              ipAddress,
            ],
          );

          throw fastify.httpErrors.unauthorized("Invalid credentials");
        }

        const knownDeviceResult = await client.query<{ id: number }>(
          `
            SELECT id
            FROM app.login_devices
            WHERE user_id = $1
              AND device_fingerprint = $2
            LIMIT 1
          `,
          [user.id, deviceFingerprint],
        );

        const isUnrecognizedDevice = !knownDeviceResult.rows[0];
        if (isUnrecognizedDevice) {
          await client.query(
            `
              INSERT INTO app.login_devices (
                user_id,
                device_fingerprint,
                user_agent,
                ip_address,
                first_seen_at,
                last_seen_at
              )
              VALUES ($1, $2, $3, $4, NOW(), NOW())
              ON CONFLICT (user_id, device_fingerprint)
              DO UPDATE SET
                user_agent = EXCLUDED.user_agent,
                ip_address = EXCLUDED.ip_address,
                last_seen_at = NOW()
            `,
            [user.id, deviceFingerprint, userAgent, ipAddress],
          );
        } else {
          await client.query(
            `
              UPDATE app.login_devices
              SET user_agent = $3,
                  ip_address = $4,
                  last_seen_at = NOW()
              WHERE user_id = $1
                AND device_fingerprint = $2
            `,
            [user.id, deviceFingerprint, userAgent, ipAddress],
          );
        }

        await client.query(
          `
            INSERT INTO app.auth_login_events (
              user_id,
              username,
              success,
              device_fingerprint,
              user_agent,
              ip_address,
              is_unrecognized
            )
            VALUES ($1, $2, TRUE, $3, $4, $5, $6)
          `,
          [
            user.id,
            user.username,
            deviceFingerprint,
            userAgent,
            ipAddress,
            isUnrecognizedDevice,
          ],
        );

        await client.query(
          `DELETE FROM app.login_attempts WHERE username = $1`,
          [username],
        );

        const tokenId = randomUUID();
        const sessionResult = await client.query<SessionRow>(
          `
            INSERT INTO app.sessions (user_id, token_id, last_activity_at, expires_at)
            VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 minutes')
            RETURNING id
          `,
          [user.id, tokenId],
        );

        await client.query("COMMIT");

        const session = sessionResult.rows[0];
        const tokenPayload: AuthTokenPayload = {
          sub: String(user.id),
          sid: session.id,
          tid: tokenId,
        };

        const accessToken = await fastify.jwt.sign(tokenPayload);

        await logAuditEvent(fastify, {
          userId: user.id,
          action: "auth.login.success",
          entityType: "session",
          entityId: session.id,
          details: { username: user.username, role: user.role },
          ipAddress: request.ip,
        });

        if (isUnrecognizedDevice) {
          await logAuditEvent(fastify, {
            userId: user.id,
            action: "auth.login.unrecognized_device",
            entityType: "user",
            entityId: user.id,
            details: { userAgent, ipAddress, deviceFingerprint },
            ipAddress: request.ip,
          });
        }

        return {
          accessToken,
          user: {
            id: user.id,
            username: maskSensitiveDigits(user.username),
            role: user.role,
          },
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.get("/auth/me", { preHandler: [authGuard] }, async (request) => {
    return {
      user: {
        id: request.auth.userId,
        username: maskSensitiveDigits(request.auth.username),
        role: request.auth.role,
      },
    };
  });

  fastify.post(
    "/auth/logout",
    { preHandler: [authGuard, nonceGuard] },
    async (request) => {
      await fastify.db.query(
        `
          UPDATE app.sessions
          SET revoked_at = NOW()
          WHERE id = $1 AND revoked_at IS NULL
        `,
        [request.auth.sessionId],
      );

      return {
        success: true,
      };
    },
  );
};

const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase();

const buildDeviceFingerprint = (
  userAgent: string | string[] | undefined | null,
  ipAddress: string,
): string => {
  const ua = Array.isArray(userAgent)
    ? (userAgent[0] ?? "")
    : (userAgent ?? "");
  return createHash("sha256").update(`${ua}|${ipAddress}`).digest("hex");
};

const incrementFailedLogin = async (
  client: {
    query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  username: string,
  previousAttempt?: AttemptRow,
): Promise<{ locked: boolean }> => {
  const currentCount =
    previousAttempt?.locked_until && previousAttempt.locked_until <= new Date()
      ? 0
      : (previousAttempt?.failed_count ?? 0);
  const nextCount = currentCount + 1;
  const shouldLock = nextCount >= 5;

  await client.query(
    `
      INSERT INTO app.login_attempts (username, failed_count, first_failed_at, last_failed_at, locked_until)
      VALUES ($1, $2, NOW(), NOW(), CASE WHEN $3 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END)
      ON CONFLICT (username)
      DO UPDATE
      SET failed_count = EXCLUDED.failed_count,
          last_failed_at = NOW(),
          first_failed_at = CASE
            WHEN app.login_attempts.locked_until IS NOT NULL AND app.login_attempts.locked_until <= NOW()
              THEN NOW()
            ELSE app.login_attempts.first_failed_at
          END,
          locked_until = CASE WHEN $3 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
    `,
    [username, nextCount, shouldLock],
  );

  return { locked: shouldLock };
};

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error.code as unknown) : undefined;
  return code === "23505";
};

export default authRoutes;
