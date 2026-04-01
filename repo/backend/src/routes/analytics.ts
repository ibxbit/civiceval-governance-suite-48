import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { recordAnalyticsEvent } from "../analytics/tracking.js";
import { authGuard } from "../middleware/auth.js";
import { logAuditEvent } from "../middleware/audit.js";
import { nonceGuard } from "../middleware/nonce.js";
import { roleGuard } from "../middleware/role.js";

const trackEventSchema = z.object({
  eventType: z.enum([
    "page_view",
    "dwell",
    "read_complete",
    "search",
    "search_click",
  ]),
  pagePath: z.string().trim().min(1).max(500),
  contentId: z.coerce.number().int().positive().optional(),
  referrer: z.string().trim().max(500).optional(),
  dwellMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
  occurredAt: z.coerce.date().optional(),
});

const analyticsFilterSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "startDate must be before or equal to endDate",
      });
    }
  });

type SummaryRow = {
  page_views: string;
  unique_users: string;
  avg_dwell_ms: string | null;
  total_dwell_ms: string | null;
};

type DailyRow = {
  date: string;
  page_views: string;
  unique_users: string;
  avg_dwell_ms: string | null;
  total_dwell_ms: string | null;
};

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/analytics/events",
    { preHandler: [authGuard, nonceGuard] },
    async (request) => {
      const parsed = trackEventSchema.safeParse(request.body);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid analytics event payload");
      }

      if (
        parsed.data.eventType === "dwell" &&
        parsed.data.dwellMs === undefined
      ) {
        throw fastify.httpErrors.badRequest(
          "dwellMs is required for dwell events",
        );
      }

      if (
        parsed.data.eventType !== "dwell" &&
        parsed.data.dwellMs !== undefined
      ) {
        throw fastify.httpErrors.badRequest(
          "dwellMs is only allowed for dwell events",
        );
      }

      await recordAnalyticsEvent(fastify, {
        eventType: parsed.data.eventType,
        pagePath: parsed.data.pagePath,
        userId: request.auth.userId,
        contentId: parsed.data.contentId,
        referrer: parsed.data.referrer,
        dwellMs: parsed.data.eventType === "dwell" ? parsed.data.dwellMs : null,
        occurredAt: parsed.data.occurredAt,
      });

      return { success: true };
    },
  );

  fastify.get(
    "/analytics/summary",
    { preHandler: [authGuard, roleGuard("program_owner", "admin")] },
    async (request) => {
      const parsed = analyticsFilterSchema.safeParse(request.query);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid analytics date filter");
      }

      const startDate = parsed.data.startDate;
      const endDate = new Date(parsed.data.endDate);
      endDate.setHours(23, 59, 59, 999);

      const summaryResult = await fastify.db.query<SummaryRow>(
        `
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'page_view')::text AS page_views,
          COUNT(DISTINCT user_id)::text AS unique_users,
          ROUND(AVG(dwell_ms) FILTER (WHERE event_type = 'dwell'), 2)::text AS avg_dwell_ms,
          COALESCE(SUM(dwell_ms) FILTER (WHERE event_type = 'dwell'), 0)::text AS total_dwell_ms
        FROM app.analytics_events
        WHERE occurred_at >= $1
          AND occurred_at <= $2
      `,
        [startDate, endDate],
      );

      const summary = summaryResult.rows[0];

      const readCompletionResult = await fastify.db.query<{ value: string }>(
        `
          SELECT CASE
            WHEN COUNT(*) FILTER (WHERE event_type = 'page_view') = 0 THEN '0'
            ELSE ROUND(
              (COUNT(*) FILTER (WHERE event_type = 'read_complete')::numeric /
               COUNT(*) FILTER (WHERE event_type = 'page_view')::numeric) * 100,
              2
            )::text
          END AS value
          FROM app.analytics_events
          WHERE occurred_at >= $1
            AND occurred_at <= $2
        `,
        [startDate, endDate],
      );

      const searchConversionResult = await fastify.db.query<{ value: string }>(
        `
          SELECT CASE
            WHEN COUNT(*) FILTER (WHERE event_type = 'search') = 0 THEN '0'
            ELSE ROUND(
              (COUNT(*) FILTER (WHERE event_type = 'search_click')::numeric /
               COUNT(*) FILTER (WHERE event_type = 'search')::numeric) * 100,
              2
            )::text
          END AS value
          FROM app.analytics_events
          WHERE occurred_at >= $1
            AND occurred_at <= $2
        `,
        [startDate, endDate],
      );

      const popularityResult = await fastify.db.query<{
        content_id: string;
        views: string;
      }>(
        `
          SELECT
            content_id::text,
            COUNT(*)::text AS views
          FROM app.analytics_events
          WHERE event_type = 'page_view'
            AND content_id IS NOT NULL
            AND occurred_at >= $1
            AND occurred_at <= $2
          GROUP BY content_id
          ORDER BY COUNT(*) DESC, content_id ASC
          LIMIT 10
        `,
        [startDate, endDate],
      );

      const trafficResult = await fastify.db.query<{
        referrer: string;
        count: string;
      }>(
        `
          SELECT
            referrer,
            COUNT(*)::text AS count
          FROM app.analytics_events
          WHERE referrer IS NOT NULL
            AND referrer <> ''
            AND occurred_at >= $1
            AND occurred_at <= $2
          GROUP BY referrer
          ORDER BY COUNT(*) DESC, referrer ASC
          LIMIT 10
        `,
        [startDate, endDate],
      );

      return {
        startDate,
        endDate,
        pageViews: Number(summary.page_views),
        uniqueUsers: Number(summary.unique_users),
        avgDwellMs: summary.avg_dwell_ms ? Number(summary.avg_dwell_ms) : 0,
        totalDwellMs: Number(summary.total_dwell_ms ?? 0),
        readCompletionRate: Number(readCompletionResult.rows[0]?.value ?? "0"),
        searchConversion: Number(searchConversionResult.rows[0]?.value ?? "0"),
        contentPopularity: popularityResult.rows.map((row) => ({
          contentId: Number(row.content_id),
          views: Number(row.views),
        })),
        trafficSources: trafficResult.rows.map((row) => ({
          referrer: row.referrer,
          visits: Number(row.count),
        })),
      };
    },
  );

  fastify.get(
    "/analytics/export.csv",
    { preHandler: [authGuard, roleGuard("program_owner", "admin")] },
    async (request, reply) => {
      const parsed = analyticsFilterSchema.safeParse(request.query);
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest("Invalid analytics date filter");
      }

      const startDate = parsed.data.startDate;
      const endDate = new Date(parsed.data.endDate);
      endDate.setHours(23, 59, 59, 999);

      const rows = await fastify.db.query<DailyRow>(
        `
          SELECT
            DATE(occurred_at)::text AS date,
            COUNT(*) FILTER (WHERE event_type = 'page_view')::text AS page_views,
            COUNT(DISTINCT user_id)::text AS unique_users,
            ROUND(AVG(dwell_ms) FILTER (WHERE event_type = 'dwell'), 2)::text AS avg_dwell_ms,
            COALESCE(SUM(dwell_ms) FILTER (WHERE event_type = 'dwell'), 0)::text AS total_dwell_ms
          FROM app.analytics_events
          WHERE occurred_at >= $1
            AND occurred_at <= $2
          GROUP BY DATE(occurred_at)
          ORDER BY DATE(occurred_at) ASC
        `,
        [startDate, endDate],
      );

      const header = [
        "date",
        "page_views",
        "unique_users",
        "avg_dwell_ms",
        "total_dwell_ms",
      ];
      const lines = [header.join(",")];

      for (const row of rows.rows) {
        lines.push(
          [
            row.date,
            row.page_views,
            row.unique_users,
            row.avg_dwell_ms ?? "0",
            row.total_dwell_ms ?? "0",
          ]
            .map((value) => csvEscape(value))
            .join(","),
        );
      }

      const csv = lines.join("\n");

      await logAuditEvent(fastify, {
        userId: request.auth.userId,
        action: "analytics.export.csv",
        entityType: "analytics",
        details: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          rows: rows.rows.length,
        },
        ipAddress: request.ip,
      });

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header(
        "Content-Disposition",
        `attachment; filename="analytics-${toDateSlug(startDate)}-${toDateSlug(endDate)}.csv"`,
      );

      return reply.send(csv);
    },
  );
};

const csvEscape = (value: string): string => {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
};

const toDateSlug = (date: Date): string => date.toISOString().slice(0, 10);

export default analyticsRoutes;
