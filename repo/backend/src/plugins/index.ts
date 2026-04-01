import type { FastifyInstance } from "fastify";

import envPlugin from "./env.js";
import postgresPlugin from "./postgres.js";
import securityPlugin from "./security.js";

export const registerPlugins = async (
  fastify: FastifyInstance,
): Promise<void> => {
  await fastify.register(envPlugin);
  await fastify.register(securityPlugin);
  await fastify.register(postgresPlugin);
};
