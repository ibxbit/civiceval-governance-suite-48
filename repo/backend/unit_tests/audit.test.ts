import { describe, expect, it, vi } from "vitest";

import { logAuditEvent } from "../src/middleware/audit.js";

const makeFastify = () => ({
  db: {
    query: vi.fn().mockResolvedValue(undefined),
  },
});

const EXPECTED_SQL = expect.stringContaining(
  "INSERT INTO app.audit_logs",
);

describe("logAuditEvent", () => {
  it("calls db.query with the correct SQL template", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      action: "login",
      entityType: "user",
    });

    expect(fastify.db.query).toHaveBeenCalledOnce();
    expect(fastify.db.query).toHaveBeenCalledWith(EXPECTED_SQL, expect.any(Array));
  });

  it("passes all provided values in the correct parameter positions", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      userId: 42,
      action: "update_policy",
      entityType: "policy",
      entityId: 7,
      details: { field: "title", from: "old", to: "new" },
      ipAddress: "192.168.1.10",
    });

    expect(fastify.db.query).toHaveBeenCalledWith(
      EXPECTED_SQL,
      [
        42,
        "update_policy",
        "policy",
        7,
        JSON.stringify({ field: "title", from: "old", to: "new" }),
        "192.168.1.10",
      ],
    );
  });

  it("passes null for userId when not provided", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      action: "system_event",
      entityType: "system",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
  });

  it("passes null for userId when explicitly null", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      userId: null,
      action: "system_event",
      entityType: "system",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
  });

  it("passes null for entityId when not provided", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      userId: 1,
      action: "login",
      entityType: "user",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBeNull();
  });

  it("passes null for entityId when explicitly null", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      userId: 1,
      action: "login",
      entityType: "user",
      entityId: null,
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBeNull();
  });

  it("defaults details to serialised empty object when not provided", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      action: "login",
      entityType: "user",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBe(JSON.stringify({}));
  });

  it("serialises provided details to JSON", async () => {
    const fastify = makeFastify();
    const details = { reason: "scheduled", count: 3 };
    await logAuditEvent(fastify as never, {
      action: "purge",
      entityType: "session",
      details,
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBe(JSON.stringify(details));
  });

  it("passes null for ipAddress when not provided", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      action: "login",
      entityType: "user",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBeNull();
  });

  it("passes null for ipAddress when explicitly null", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      action: "login",
      entityType: "user",
      ipAddress: null,
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBeNull();
  });

  it("passes the provided ipAddress through unchanged", async () => {
    const fastify = makeFastify();
    await logAuditEvent(fastify as never, {
      action: "login",
      entityType: "user",
      ipAddress: "10.0.0.1",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBe("10.0.0.1");
  });

  it("awaits db.query and resolves to undefined", async () => {
    const fastify = makeFastify();
    await expect(
      logAuditEvent(fastify as never, { action: "noop", entityType: "test" }),
    ).resolves.toBeUndefined();
  });
});
