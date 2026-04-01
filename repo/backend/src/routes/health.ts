import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => {
    const dbResult = await fastify.db.query<{ now: string }>(
      "SELECT NOW()::text AS now",
    );

    return {
      status: "ok",
      timestamp: dbResult.rows[0]?.now ?? new Date().toISOString(),
      environment: fastify.env.NODE_ENV,
    };
  });
};

export default healthRoutes;
