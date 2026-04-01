import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const NONCE_HEADER = "x-nonce";
const TIMESTAMP_HEADER = "x-timestamp";
const MAX_SKEW_MS = 60_000;
const nonceStore = new Map<string, number>();

let operationCount = 0;

export const nonceGuard = async function (
  this: FastifyInstance,
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const nonce = request.headers[NONCE_HEADER];
  const timestampHeader = request.headers[TIMESTAMP_HEADER];

  if (typeof nonce !== "string" || nonce.length < 16 || nonce.length > 128) {
    throw this.httpErrors.badRequest("Invalid nonce header");
  }

  const timestampRaw =
    typeof timestampHeader === "string" || typeof timestampHeader === "number"
      ? Number(timestampHeader)
      : Number.NaN;

  if (!Number.isFinite(timestampRaw)) {
    throw this.httpErrors.badRequest("Invalid timestamp header");
  }

  const now = Date.now();

  if (Math.abs(now - timestampRaw) > MAX_SKEW_MS) {
    throw this.httpErrors.unauthorized("Request timestamp expired");
  }

  const nonceExpiration = nonceStore.get(nonce);
  if (nonceExpiration && nonceExpiration > now) {
    throw this.httpErrors.conflict("Replay request detected");
  }

  nonceStore.set(nonce, now + MAX_SKEW_MS);

  operationCount += 1;
  if (operationCount >= 200) {
    operationCount = 0;
    for (const [key, expiresAt] of nonceStore.entries()) {
      if (expiresAt <= now) {
        nonceStore.delete(key);
      }
    }
  }
};
