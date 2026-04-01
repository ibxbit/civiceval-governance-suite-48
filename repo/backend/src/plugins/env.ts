import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

import { parseEnv } from "../config/env.js";

const envPlugin: FastifyPluginAsync = async (fastify) => {
  const env = parseEnv(process.env);
  fastify.decorate("env", env);
};

export default fp(envPlugin, {
  name: "env-plugin",
});
