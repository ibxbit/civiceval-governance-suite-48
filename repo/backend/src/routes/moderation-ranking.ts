import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { authGuard } from "../middleware/auth.js";
import { logAuditEvent } from "../middleware/audit.js";
import { nonceGuard } from "../middleware/nonce.js";
import { roleGuard } from "../middleware/role.js";
import { maskNullableText, maskSensitiveDigits } from "../utils/masking.js";

const commentIdParamsSchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

const reportIdParamsSchema = z.object({
  reportId: z.coerce.number().int().positive(),
});

const createCommentSchema = z.object({
  contentId: z.coerce.number().int().positive().optional(),
  body: z.string().trim().min(1).max(2000),
});

const pinCommentSchema = z.object({
  pinned: z.boolean().default(true),
});

const reportCommentSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  details: z.string().trim().max(1000).optional(),
});

const resolveReportSchema = z.object({
  action: z.enum(["approve", "block", "dismiss"]),
  note: z.string().trim().max(500).optional(),
});

const rankingInputSchema = z.object({
  subjectKey: z.string().trim().min(1).max(120),
  benchmark: z.coerce.number().min(0).max(100),
  price: z.coerce.number().min(0).max(100),
  volatility: z.coerce.number().min(0).max(100),
  weights: z.object({
    benchmark: z.coerce.number().min(0).max(100),
    price: z.coerce.number().min(0).max(100),
    volatility: z.coerce.number().min(0).max(100),
  }),
});

const commentsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "approved", "blocked", "all"]).default("all"),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type CommentRow = {
  id: number;
  content_id: number | null;
  body: string;
  status: "pending" | "approved" | "blocked";
  pinned: boolean;
  created_by_user_id: number;
  moderated_by_user_id: number | null;
  moderation_note: string | null;
  moderated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ReportRow = {
  id: number;
  comment_id: number;
  reason: string;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  handled_by_user_id: number | null;
  handled_at: Date | null;
  resolution_note: string | null;
  created_by_user_id: number;
  created_at: Date;
};

type RankingRow = {
  id: number;
  subject_key: string;
  benchmark_value: number;
  price_value: number;
  volatility_value: number;
  benchmark_weight: number;
  price_weight: number;
  volatility_weight: number;
  score: number;
  created_by_user_id: number;
  created_at: Date;
};

const moderationRankingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/moderation/comments",
    { preHandler: [authGuard] },
    async (request) => {
      const query = commentsListQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw fastify.httpErrors.badRequest("Invalid comments query");
      }

      const offset = (query.data.page - 1) * query.data.limit;
      const statusWhere = query.data.status === "all" ? "" : "AND status = $3";
      const params =
        query.data.status === "all"
          ? [query.data.limit, offset]
          : [query.data.limit, offset, query.data.status];

      const dataResult = await fastify.db.query<CommentRow>(
        `
          SELECT
            id,
            content_id,
            body,
            status,
            pinned,
            created_by_user_id,
            moderated_by_user_id,
            moderation_note,
            moderated_at,
            created_at,
            updated_at
          FROM app.comments
          WHERE 1=1
          ${statusWhere}
          ORDER BY pinned DESC, updated_at DESC, id DESC
          LIMIT $1 OFFSET $2
        `,
        params,
      );

      const totalResult = await fastify.db.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM app.comments
          WHERE 1=1
          ${query.data.status === "all" ? "" : "AND status = $1"}
        `,
        query.data.status === "all" ? [] : [query.data.status],
      );

      return {
        data: dataResult.rows.map(mapComment),
        total: Number(totalResult.rows[0]?.total ?? "0"),
        page: query.data.page,
        limit: query.data.limit,
      };
    },
  );

  fastify.get(
    "/moderation/reports",
    { preHandler: [authGuard, roleGuard("reviewer", "admin")] },
    async (request) => {
      const pagination = paginationSchema.safeParse(request.query);
      if (!pagination.success) {
        throw fastify.httpErrors.badRequest("Invalid reports query");
      }

      const offset = (pagination.data.page - 1) * pagination.data.limit;
      const dataResult = await fastify.db.query<ReportRow>(
        `
          SELECT
            id,
            comment_id,
            reason,
            details,
            status,
            handled_by_user_id,
            handled_at,
            resolution_note,
            created_by_user_id,
            created_at
          FROM app.comment_reports
          WHERE status = 'open'
          ORDER BY created_at DESC, id DESC
          LIMIT $1 OFFSET $2
        `,
        [pagination.data.limit, offset],
      );

      const totalResult = await fastify.db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM app.comment_reports WHERE status = 'open'`,
      );

      return {
        data: dataResult.rows.map(mapReport),
        total: Number(totalResult.rows[0]?.total ?? "0"),
        page: pagination.data.page,
        limit: pagination.data.limit,
      };
    },
  );

  fastify.post(
    "/moderation/comments",
    {
      preHandler: [authGuard, roleGuard("participant", "reviewer"), nonceGuard],
    },
    async (request) => {
      const parsed = createCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid comment payload");
      }

      const inserted = await fastify.db.query<CommentRow>(
        `
          INSERT INTO app.comments (
            content_id,
            body,
            status,
            pinned,
            created_by_user_id
          )
          VALUES ($1, $2, 'pending', FALSE, $3)
          RETURNING
            id,
            content_id,
            body,
            status,
            pinned,
            created_by_user_id,
            moderated_by_user_id,
            moderation_note,
            moderated_at,
            created_at,
            updated_at
        `,
        [parsed.data.contentId ?? null, parsed.data.body, request.auth.userId],
      );

      return mapComment(inserted.rows[0]);
    },
  );

  fastify.post(
    "/moderation/comments/:commentId/approve",
    { preHandler: [authGuard, roleGuard("reviewer", "admin"), nonceGuard] },
    async (request) => {
      const params = commentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid comment id");
      }

      const updated = await fastify.db.query<CommentRow>(
        `
          UPDATE app.comments
          SET
            status = 'approved',
            moderated_by_user_id = $2,
            moderated_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            content_id,
            body,
            status,
            pinned,
            created_by_user_id,
            moderated_by_user_id,
            moderation_note,
            moderated_at,
            created_at,
            updated_at
        `,
        [params.data.commentId, request.auth.userId],
      );

      if (!updated.rows[0]) {
        throw fastify.httpErrors.notFound("Comment not found");
      }

      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "moderation.approve",
        entityType: "comment",
        entityId: updated.rows[0].id,
        ipAddress: request.ip,
      });

      return mapComment(updated.rows[0]);
    },
  );

  fastify.post(
    "/moderation/comments/:commentId/pin",
    { preHandler: [authGuard, roleGuard("reviewer", "admin"), nonceGuard] },
    async (request) => {
      const params = commentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid comment id");
      }

      const body = pinCommentSchema.safeParse(request.body ?? {});
      if (!body.success) {
        throw fastify.httpErrors.badRequest("Invalid pin payload");
      }

      const updated = await fastify.db.query<CommentRow>(
        `
          UPDATE app.comments
          SET
            pinned = $2,
            moderated_by_user_id = $3,
            moderated_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            content_id,
            body,
            status,
            pinned,
            created_by_user_id,
            moderated_by_user_id,
            moderation_note,
            moderated_at,
            created_at,
            updated_at
        `,
        [params.data.commentId, body.data.pinned, request.auth.userId],
      );

      if (!updated.rows[0]) {
        throw fastify.httpErrors.notFound("Comment not found");
      }

      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "moderation.pin",
        entityType: "comment",
        entityId: updated.rows[0].id,
        details: { pinned: body.data.pinned },
        ipAddress: request.ip,
      });

      return mapComment(updated.rows[0]);
    },
  );

  fastify.post(
    "/moderation/comments/:commentId/block",
    { preHandler: [authGuard, roleGuard("reviewer", "admin"), nonceGuard] },
    async (request) => {
      const params = commentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid comment id");
      }

      const updated = await fastify.db.query<CommentRow>(
        `
          UPDATE app.comments
          SET
            status = 'blocked',
            pinned = FALSE,
            moderated_by_user_id = $2,
            moderated_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            content_id,
            body,
            status,
            pinned,
            created_by_user_id,
            moderated_by_user_id,
            moderation_note,
            moderated_at,
            created_at,
            updated_at
        `,
        [params.data.commentId, request.auth.userId],
      );

      if (!updated.rows[0]) {
        throw fastify.httpErrors.notFound("Comment not found");
      }

      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "moderation.block",
        entityType: "comment",
        entityId: updated.rows[0].id,
        ipAddress: request.ip,
      });

      return mapComment(updated.rows[0]);
    },
  );

  fastify.post(
    "/moderation/comments/:commentId/reports",
    {
      preHandler: [authGuard, roleGuard("participant", "reviewer"), nonceGuard],
    },
    async (request) => {
      const params = commentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid comment id");
      }

      const body = reportCommentSchema.safeParse(request.body);
      if (!body.success) {
        throw fastify.httpErrors.badRequest("Invalid report payload");
      }

      const inserted = await fastify.db.query<ReportRow>(
        `
          INSERT INTO app.comment_reports (
            comment_id,
            reason,
            details,
            status,
            created_by_user_id
          )
          VALUES ($1, $2, $3, 'open', $4)
          RETURNING
            id,
            comment_id,
            reason,
            details,
            status,
            handled_by_user_id,
            handled_at,
            resolution_note,
            created_by_user_id,
            created_at
        `,
        [
          params.data.commentId,
          body.data.reason,
          body.data.details ?? null,
          request.auth.userId,
        ],
      );

      return mapReport(inserted.rows[0]);
    },
  );

  fastify.post(
    "/moderation/reports/:reportId/handle",
    { preHandler: [authGuard, roleGuard("reviewer", "admin"), nonceGuard] },
    async (request) => {
      const params = reportIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest("Invalid report id");
      }

      const body = resolveReportSchema.safeParse(request.body);
      if (!body.success) {
        throw fastify.httpErrors.badRequest("Invalid report handling payload");
      }

      const client = await fastify.db.connect();
      try {
        await client.query("BEGIN");

        const reportResult = await client.query<ReportRow>(
          `
            SELECT
              id,
              comment_id,
              reason,
              details,
              status,
              handled_by_user_id,
              handled_at,
              resolution_note,
              created_by_user_id,
              created_at
            FROM app.comment_reports
            WHERE id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [params.data.reportId],
        );

        const report = reportResult.rows[0];
        if (!report) {
          throw fastify.httpErrors.notFound("Report not found");
        }

        if (report.status !== "open") {
          throw fastify.httpErrors.badRequest(
            "Report has already been handled",
          );
        }

        if (body.data.action === "approve") {
          await client.query(
            `
              UPDATE app.comments
              SET
                status = 'approved',
                moderated_by_user_id = $2,
                moderated_at = NOW(),
                updated_at = NOW()
              WHERE id = $1
            `,
            [report.comment_id, request.auth.userId],
          );
        }

        if (body.data.action === "block") {
          await client.query(
            `
              UPDATE app.comments
              SET
                status = 'blocked',
                pinned = FALSE,
                moderated_by_user_id = $2,
                moderated_at = NOW(),
                updated_at = NOW()
              WHERE id = $1
            `,
            [report.comment_id, request.auth.userId],
          );
        }

        const nextStatus =
          body.data.action === "dismiss" ? "dismissed" : "resolved";

        const handled = await client.query<ReportRow>(
          `
            UPDATE app.comment_reports
            SET
              status = $2,
              handled_by_user_id = $3,
              handled_at = NOW(),
              resolution_note = $4
            WHERE id = $1
            RETURNING
              id,
              comment_id,
              reason,
              details,
              status,
              handled_by_user_id,
              handled_at,
              resolution_note,
              created_by_user_id,
              created_at
          `,
          [report.id, nextStatus, request.auth.userId, body.data.note ?? null],
        );

        await client.query("COMMIT");
        await logAuditEvent(fastify, {
          userId: request.auth.userId,
          action: "moderation.report.handle",
          entityType: "report",
          entityId: handled.rows[0].id,
          details: { action: body.data.action, status: nextStatus },
          ipAddress: request.ip,
        });
        return mapReport(handled.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.post(
    "/rankings/score",
    {
      preHandler: [authGuard, roleGuard("program_owner", "admin"), nonceGuard],
    },
    async (request) => {
      const parsed = rankingInputSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid ranking payload");
      }

      const weights = parsed.data.weights;
      const totalWeight =
        weights.benchmark + weights.price + weights.volatility;
      if (Math.abs(totalWeight - 100) > 0.000_001) {
        throw fastify.httpErrors.badRequest("Weights must sum to 100");
      }

      const score = calculateScore({
        benchmark: parsed.data.benchmark,
        price: parsed.data.price,
        volatility: parsed.data.volatility,
        benchmarkWeight: weights.benchmark,
        priceWeight: weights.price,
        volatilityWeight: weights.volatility,
      });

      const inserted = await fastify.db.query<RankingRow>(
        `
          INSERT INTO app.rankings (
            subject_key,
            benchmark_value,
            price_value,
            volatility_value,
            benchmark_weight,
            price_weight,
            volatility_weight,
            score,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING
            id,
            subject_key,
            benchmark_value,
            price_value,
            volatility_value,
            benchmark_weight,
            price_weight,
            volatility_weight,
            score,
            created_by_user_id,
            created_at
        `,
        [
          parsed.data.subjectKey,
          parsed.data.benchmark,
          parsed.data.price,
          parsed.data.volatility,
          weights.benchmark,
          weights.price,
          weights.volatility,
          score,
          request.auth.userId,
        ],
      );

      return mapRanking(inserted.rows[0]);
    },
  );

  fastify.get("/rankings/latest", { preHandler: [authGuard] }, async () => {
    const latest = await fastify.db.query<RankingRow>(
      `
        SELECT DISTINCT ON (subject_key)
          id,
          subject_key,
          benchmark_value,
          price_value,
          volatility_value,
          benchmark_weight,
          price_weight,
          volatility_weight,
          score,
          created_by_user_id,
          created_at
        FROM app.rankings
        ORDER BY subject_key ASC, created_at DESC, id DESC
      `,
    );

    return {
      rankings: latest.rows.map(mapRanking),
    };
  });
};

const calculateScore = (input: {
  benchmark: number;
  price: number;
  volatility: number;
  benchmarkWeight: number;
  priceWeight: number;
  volatilityWeight: number;
}): number => {
  const raw =
    input.benchmark * (input.benchmarkWeight / 100) +
    input.price * (input.priceWeight / 100) +
    input.volatility * (input.volatilityWeight / 100);

  return Math.round(raw * 1000) / 1000;
};

const mapComment = (comment: CommentRow) => ({
  id: comment.id,
  contentId: comment.content_id,
  body: maskSensitiveDigits(comment.body),
  status: comment.status,
  pinned: comment.pinned,
  createdByUserId: comment.created_by_user_id,
  moderatedByUserId: comment.moderated_by_user_id,
  moderationNote: maskNullableText(comment.moderation_note),
  moderatedAt: comment.moderated_at,
  createdAt: comment.created_at,
  updatedAt: comment.updated_at,
});

const mapReport = (report: ReportRow) => ({
  id: report.id,
  commentId: report.comment_id,
  reason: maskSensitiveDigits(report.reason),
  details: maskNullableText(report.details),
  status: report.status,
  handledByUserId: report.handled_by_user_id,
  handledAt: report.handled_at,
  resolutionNote: maskNullableText(report.resolution_note),
  createdByUserId: report.created_by_user_id,
  createdAt: report.created_at,
});

const mapRanking = (ranking: RankingRow) => ({
  id: ranking.id,
  subjectKey: maskSensitiveDigits(ranking.subject_key),
  benchmark: ranking.benchmark_value,
  price: ranking.price_value,
  volatility: ranking.volatility_value,
  weights: {
    benchmark: ranking.benchmark_weight,
    price: ranking.price_weight,
    volatility: ranking.volatility_weight,
  },
  score: ranking.score,
  createdByUserId: ranking.created_by_user_id,
  createdAt: ranking.created_at,
});

export default moderationRankingRoutes;
