import { describe, expect, it } from "vitest";

import { nonceGuard } from "../src/middleware/nonce.js";

const httpErrors = {
  badRequest: (message: string) =>
    Object.assign(new Error(message), { statusCode: 400 }),
  unauthorized: (message: string) =>
    Object.assign(new Error(message), { statusCode: 401 }),
  conflict: (message: string) =>
    Object.assign(new Error(message), { statusCode: 409 }),
};

const server = { httpErrors } as unknown as Parameters<
  typeof nonceGuard
>[0]["server"];

describe("nonce guard", () => {
  it("rejects missing nonce", async () => {
    const request = {
      headers: { "x-timestamp": String(Date.now()) },
      server,
    } as never;
    await expect(
      nonceGuard.call(server as never, request, {} as never),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects expired timestamp", async () => {
    const request = {
      headers: {
        "x-nonce": "NONCE-12345678901234",
        "x-timestamp": String(Date.now() - 61_000),
      },
      server,
    } as never;

    await expect(
      nonceGuard.call(server as never, request, {} as never),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects replayed nonce", async () => {
    const headers = {
      "x-nonce": "NONCE-REPLAY-123456",
      "x-timestamp": String(Date.now()),
    };
    const request = { headers, server } as never;

    await expect(
      nonceGuard.call(server as never, request, {} as never),
    ).resolves.toBeUndefined();
    await expect(
      nonceGuard.call(server as never, request, {} as never),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("accepts valid nonce and timestamp", async () => {
    const request = {
      headers: {
        "x-nonce": "VALID-NONCE-12345678",
        "x-timestamp": String(Date.now()),
      },
      server,
    } as never;

    await expect(
      nonceGuard.call(server as never, request, {} as never),
    ).resolves.toBeUndefined();
  });
});
