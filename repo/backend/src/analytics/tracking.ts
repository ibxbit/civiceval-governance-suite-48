import type { FastifyInstance } from "fastify";

export type AnalyticsEventInput = {
  eventType:
    | "page_view"
    | "dwell"
    | "read_complete"
    | "search"
    | "search_click";
  pagePath: string;
  userId: number;
  contentId?: number | null;
  referrer?: string | null;
  dwellMs?: number | null;
  occurredAt?: Date;
};

export const recordAnalyticsEvent = async (
  fastify: FastifyInstance,
  input: AnalyticsEventInput,
): Promise<void> => {
  await fastify.db.query(
    `
      INSERT INTO app.analytics_events (
        event_type,
        page_path,
        user_id,
        content_id,
        referrer,
        dwell_ms,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.eventType,
      input.pagePath,
      input.userId,
      input.contentId ?? null,
      input.referrer ?? null,
      input.dwellMs ?? null,
      input.occurredAt ?? new Date(),
    ],
  );
};
