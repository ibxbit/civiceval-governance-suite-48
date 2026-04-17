import { describe, expect, it } from "vitest";

import { roleGuard } from "../src/middleware/role.js";

const makeForbiddenError = (message: string) =>
  Object.assign(new Error(message), { statusCode: 403 });

const makeServer = () => ({
  httpErrors: {
    forbidden: (message: string) => makeForbiddenError(message),
  },
});

describe("roleGuard", () => {
  it("returns a function (preHandler)", () => {
    const handler = roleGuard("admin");
    expect(typeof handler).toBe("function");
  });

  it("resolves when auth role matches the single allowed role", async () => {
    const handler = roleGuard("admin");
    const server = makeServer();
    const request = {
      auth: { userId: 1, username: "alice", sessionId: 1, role: "admin" },
      server,
    } as never;

    await expect(handler.call(server as never, request, {} as never)).resolves.toBeUndefined();
  });

  it("resolves when auth role is one of multiple allowed roles", async () => {
    const handler = roleGuard("admin", "reviewer");
    const server = makeServer();

    const adminRequest = {
      auth: { userId: 1, username: "alice", sessionId: 1, role: "admin" },
      server,
    } as never;
    await expect(handler.call(server as never, adminRequest, {} as never)).resolves.toBeUndefined();

    const reviewerRequest = {
      auth: { userId: 2, username: "bob", sessionId: 2, role: "reviewer" },
      server,
    } as never;
    await expect(handler.call(server as never, reviewerRequest, {} as never)).resolves.toBeUndefined();
  });

  it("throws 403 when auth role is not in the allowed set", async () => {
    const handler = roleGuard("admin");
    const server = makeServer();
    const request = {
      auth: { userId: 3, username: "carol", sessionId: 3, role: "participant" },
      server,
    } as never;

    await expect(handler.call(server as never, request, {} as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws 403 when auth role is absent from a multi-role allowlist", async () => {
    const handler = roleGuard("admin", "program_owner");
    const server = makeServer();
    const request = {
      auth: { userId: 4, username: "dave", sessionId: 4, role: "reviewer" },
      server,
    } as never;

    await expect(handler.call(server as never, request, {} as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws 403 when request.auth is undefined", async () => {
    const handler = roleGuard("admin");
    const server = makeServer();
    const request = {
      auth: undefined,
      server,
    } as never;

    await expect(handler.call(server as never, request, {} as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws 403 when request.auth is null", async () => {
    const handler = roleGuard("admin");
    const server = makeServer();
    const request = {
      auth: null,
      server,
    } as never;

    await expect(handler.call(server as never, request, {} as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("works with a single allowed role that is not admin", async () => {
    const handler = roleGuard("participant");
    const server = makeServer();

    const allowed = {
      auth: { userId: 5, username: "eve", sessionId: 5, role: "participant" },
      server,
    } as never;
    await expect(handler.call(server as never, allowed, {} as never)).resolves.toBeUndefined();

    const denied = {
      auth: { userId: 6, username: "frank", sessionId: 6, role: "reviewer" },
      server,
    } as never;
    await expect(handler.call(server as never, denied, {} as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("includes the forbidden message in the thrown error", async () => {
    const handler = roleGuard("admin");
    const server = makeServer();
    const request = {
      auth: { userId: 7, username: "grace", sessionId: 7, role: "participant" },
      server,
    } as never;

    await expect(handler.call(server as never, request, {} as never)).rejects.toMatchObject({
      message: "Insufficient role permissions",
      statusCode: 403,
    });
  });
});
