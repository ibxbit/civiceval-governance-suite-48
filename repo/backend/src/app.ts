import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";

import { registerPlugins } from "./plugins/index.js";
import activitiesRoutes from "./routes/activities.js";
import analyticsRoutes from "./routes/analytics.js";
import authRoutes from "./routes/auth.js";
import cmsRoutes from "./routes/cms.js";
import evaluationsRoutes from "./routes/evaluations.js";
import healthRoutes from "./routes/health.js";
import moderationRankingRoutes from "./routes/moderation-ranking.js";

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
  });

  await app.register(sensible);
  await registerPlugins(app);

  await app.register(cors, {
    origin: app.env.CORS_ORIGIN === "*" ? true : app.env.CORS_ORIGIN,
    credentials: true,
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Unhandled server error");

    const statusCode =
      typeof error.statusCode === "number" && Number.isInteger(error.statusCode)
        ? error.statusCode
        : 500;
    const message =
      statusCode >= 500
        ? "Internal server error"
        : (error.message ?? "Request failed");

    void reply.status(statusCode).send({
      error: {
        message,
        statusCode,
      },
    });
  });

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(activitiesRoutes, { prefix: "/api" });
  await app.register(analyticsRoutes, { prefix: "/api" });
  await app.register(evaluationsRoutes, { prefix: "/api" });
  await app.register(cmsRoutes, { prefix: "/api" });
  await app.register(moderationRankingRoutes, { prefix: "/api" });

  return app;
};
