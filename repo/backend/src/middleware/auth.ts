import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthTokenPayload, UserRole } from "../types/auth.js";

type SessionRow = {
  session_id: number;
  user_id: number;
  username: string;
  role: UserRole;
};

export const authGuard = async function (
  this: FastifyInstance,
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const payload = await request.jwtVerify<AuthTokenPayload>();

  const userId = Number(payload.sub);
  if (
    !Number.isInteger(userId) ||
    !Number.isInteger(payload.sid) ||
    !payload.tid
  ) {
    throw this.httpErrors.unauthorized("Invalid access token");
  }

  const sessionQuery = await this.db.query<SessionRow>(
    `
      SELECT s.id AS session_id, u.id AS user_id, u.username, u.role
      FROM app.sessions s
      INNER JOIN app.users u ON u.id = s.user_id
      WHERE s.id = $1
        AND s.user_id = $2
        AND s.token_id = $3
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [payload.sid, userId, payload.tid],
  );

  const session = sessionQuery.rows[0];
  if (!session) {
    throw this.httpErrors.unauthorized("Session expired or invalid");
  }

  await this.db.query(
    `
      UPDATE app.sessions
      SET last_activity_at = NOW(),
          expires_at = NOW() + INTERVAL '30 minutes'
      WHERE id = $1
    `,
    [session.session_id],
  );

  request.auth = {
    userId: session.user_id,
    username: session.username,
    sessionId: session.session_id,
    role: session.role,
  };
};
