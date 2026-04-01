import type { FastifyInstance } from "fastify";

type AuditEventInput = {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
};

export const logAuditEvent = async (
  fastify: FastifyInstance,
  event: AuditEventInput,
): Promise<void> => {
  await fastify.db.query(
    `
      INSERT INTO app.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        ip_address
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    `,
    [
      event.userId ?? null,
      event.action,
      event.entityType,
      event.entityId ?? null,
      JSON.stringify(event.details ?? {}),
      event.ipAddress ?? null,
    ],
  );
};
