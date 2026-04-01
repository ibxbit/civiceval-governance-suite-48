import type { AppEnv } from "../config/env.js";
import type { AuthContext } from "./auth.js";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    env: AppEnv;
    db: Pool;
  }

  interface FastifyRequest {
    auth: AuthContext;
  }
}
