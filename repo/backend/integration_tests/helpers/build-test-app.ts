/**
 * Shared integration test harness.
 *
 * Registers ALL route plugins together (health, auth, activities, analytics,
 * evaluations, cms, moderation-ranking) against a single Fastify instance so
 * that the full middleware stack – JWT, rate-limit, error handler, nonce guard,
 * role guard – is exercised the same way it is in production.
 *
 * The real postgres plugin is replaced by a lightweight mock: callers supply a
 * `queryFn` that the mock `db.query` and `db.connect` both forward to, letting
 * individual test suites control exactly what rows come back without spinning up
 * a real database.
 */

import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";

import activitiesRoutes from "../../src/routes/activities.js";
import analyticsRoutes from "../../src/routes/analytics.js";
import authRoutes from "../../src/routes/auth.js";
import cmsRoutes from "../../src/routes/cms.js";
import evaluationsRoutes from "../../src/routes/evaluations.js";
import healthRoutes from "../../src/routes/health.js";
import moderationRankingRoutes from "../../src/routes/moderation-ranking.js";

/** The minimal DB query function the mock pool needs. */
export type QueryFn = <T>(
  text: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>;

const TEST_JWT_SECRET = "test-secret-test-secret-test-secret-1234";

/**
 * Build a fully-bootstrapped Fastify instance that mirrors `buildApp()` in
 * `src/app.ts`, but replaces the real postgres pool with a controllable mock.
 *
 * @param queryFn - The function that will be called for every `db.query` and
 *   `db.connect().query` invocation.  Return appropriate row sets from your
 *   test's state arrays.
 */
export const buildTestApp = async (
  queryFn: QueryFn,
): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });

  // ---- sensible (httpErrors, etc.) ----------------------------------------
  await app.register(sensible);

  // ---- env decoration (mirrors env plugin) ---------------------------------
  app.decorate("env", {
    HOST: "0.0.0.0",
    PORT: 3000,
    NODE_ENV: "test" as const,
    DATABASE_URL: "postgres://localhost/test",
    CORS_ORIGIN: "*",
    JWT_SECRET: TEST_JWT_SECRET,
  });

  // ---- JWT (mirrors security plugin) --------------------------------------
  await app.register(jwt, {
    secret: TEST_JWT_SECRET,
    sign: {
      iss: "eaglepoint-api",
      expiresIn: "30m",
    },
  });

  // ---- rate-limit (mirrors security plugin) --------------------------------
  await app.register(rateLimit, {
    global: true,
    max: 1_000,        // high cap so tests never hit it accidentally
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      error: {
        message: "Too many requests",
        statusCode: 429,
        retryAfter: Math.ceil(context.ttl / 1000),
      },
    }),
  });

  // ---- mock db decoration (mirrors postgres plugin) -----------------------
  const mockPool: Partial<Pool> = {
    query: queryFn as unknown as Pool["query"],
    connect: async () => {
      return {
        query: queryFn as unknown as Pool["query"],
        release: () => undefined,
      } as never;
    },
  };

  app.decorate("db", mockPool as Pool);

  // ---- CORS (mirrors app.ts) -----------------------------------------------
  await app.register(cors, {
    origin: true,       // accept all origins in tests
    credentials: true,
  });

  // ---- error handler (exact copy from app.ts) -----------------------------
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

  // ---- ALL route plugins (same order as app.ts) ----------------------------
  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(activitiesRoutes, { prefix: "/api" });
  await app.register(analyticsRoutes, { prefix: "/api" });
  await app.register(evaluationsRoutes, { prefix: "/api" });
  await app.register(cmsRoutes, { prefix: "/api" });
  await app.register(moderationRankingRoutes, { prefix: "/api" });

  return app;
};

// ---------------------------------------------------------------------------
// Shared header helpers
// ---------------------------------------------------------------------------

/** Returns fresh x-nonce + x-timestamp headers for a single request. */
export const nonceHeaders = (): Record<string, string> => ({
  "x-nonce": `nonce-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
  "x-timestamp": String(Date.now()),
});

/** Returns Authorization + nonce headers for authenticated requests. */
export const authHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  ...nonceHeaders(),
});
