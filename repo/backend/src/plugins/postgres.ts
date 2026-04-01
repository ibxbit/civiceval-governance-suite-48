import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { Pool } from "pg";

const postgresPlugin: FastifyPluginAsync = async (fastify) => {
  const pool = new Pool({
    connectionString: fastify.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    await pool.end().catch(() => undefined);
    fastify.log.error({ err: error }, "Database connection failed");
    throw fastify.httpErrors.internalServerError("Database connection failed");
  }

  fastify.decorate("db", pool);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
};

export default fp(postgresPlugin, {
  name: "postgres-plugin",
  dependencies: ["env-plugin"],
});
