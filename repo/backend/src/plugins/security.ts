import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";

const securityPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, {
    secret: fastify.env.JWT_SECRET,
    sign: {
      iss: "eaglepoint-api",
      expiresIn: "30m",
    },
  });

  await fastify.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      error: {
        message: "Too many requests",
        statusCode: 429,
        retryAfter: Math.ceil(context.ttl / 1000),
      },
    }),
  });
};

export default fp(securityPlugin, {
  name: "security-plugin",
  dependencies: ["env-plugin"],
});
