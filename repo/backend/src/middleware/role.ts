import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { UserRole } from "../types/auth.js";

export const roleGuard = (
  ...allowedRoles: UserRole[]
): preHandlerHookHandler => {
  const allowed = new Set<UserRole>(allowedRoles);

  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.auth || !allowed.has(request.auth.role)) {
      throw request.server.httpErrors.forbidden(
        "Insufficient role permissions",
      );
    }
  };
};
