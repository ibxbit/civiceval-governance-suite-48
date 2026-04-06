import type { AppEnv } from "../config/env.js";
import type { AuthContext } from "./auth.js";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyHttpErrors {
    [name: string]: (...args: unknown[]) => Error;
  }

  interface FastifyInstance {
    env: AppEnv;
    db: Pool;
    httpErrors: FastifyHttpErrors;
  }

  interface FastifyRequest {
    auth: AuthContext;
  }
}
