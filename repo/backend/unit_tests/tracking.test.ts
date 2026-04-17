import { describe, expect, it, vi } from "vitest";

import { recordAnalyticsEvent } from "../src/analytics/tracking.js";
import type { AnalyticsEventInput } from "../src/analytics/tracking.js";

const makeFastify = () => ({
  db: {
    query: vi.fn().mockResolvedValue(undefined),
  },
});

const EXPECTED_SQL = expect.stringContaining(
  "INSERT INTO app.analytics_events",
);

const baseInput: AnalyticsEventInput = {
  eventType: "page_view",
  pagePath: "/home",
  userId: 10,
};

describe("recordAnalyticsEvent", () => {
  it("calls db.query with the correct SQL template", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput });

    expect(fastify.db.query).toHaveBeenCalledOnce();
    expect(fastify.db.query).toHaveBeenCalledWith(EXPECTED_SQL, expect.any(Array));
  });

  it("passes all provided values in the correct parameter positions", async () => {
    const fastify = makeFastify();
    const occurredAt = new Date("2026-01-15T08:00:00.000Z");
    await recordAnalyticsEvent(fastify as never, {
      eventType: "search_click",
      pagePath: "/search",
      userId: 99,
      contentId: 55,
      referrer: "https://example.com",
      dwellMs: 4200,
      occurredAt,
    });

    expect(fastify.db.query).toHaveBeenCalledWith(
      EXPECTED_SQL,
      ["search_click", "/search", 99, 55, "https://example.com", 4200, occurredAt],
    );
  });

  it("passes null for contentId when not provided", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBeNull();
  });

  it("passes null for contentId when explicitly null", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput, contentId: null });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBeNull();
  });

  it("passes null for referrer when not provided", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBeNull();
  });

  it("passes null for referrer when explicitly null", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput, referrer: null });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBeNull();
  });

  it("passes the provided referrer through unchanged", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, {
      ...baseInput,
      referrer: "https://gov.example.org/portal",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBe("https://gov.example.org/portal");
  });

  it("passes null for dwellMs when not provided", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBeNull();
  });

  it("passes null for dwellMs when explicitly null", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput, dwellMs: null });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBeNull();
  });

  it("passes the provided dwellMs value through unchanged", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, { ...baseInput, dwellMs: 3750 });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBe(3750);
  });

  it("uses the provided occurredAt date when given", async () => {
    const fastify = makeFastify();
    const occurredAt = new Date("2026-03-01T12:00:00.000Z");
    await recordAnalyticsEvent(fastify as never, { ...baseInput, occurredAt });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[6]).toBe(occurredAt);
  });

  it("defaults occurredAt to a recent Date when not provided", async () => {
    const fastify = makeFastify();
    const before = new Date();
    await recordAnalyticsEvent(fastify as never, { ...baseInput });
    const after = new Date();

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    const ts = params[6] as Date;
    expect(ts).toBeInstanceOf(Date);
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("handles event type: dwell", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, {
      ...baseInput,
      eventType: "dwell",
      dwellMs: 8000,
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe("dwell");
  });

  it("handles event type: read_complete", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, {
      ...baseInput,
      eventType: "read_complete",
      contentId: 12,
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe("read_complete");
  });

  it("handles event type: search", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, {
      ...baseInput,
      eventType: "search",
      pagePath: "/search?q=budget",
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe("search");
    expect(params[1]).toBe("/search?q=budget");
  });

  it("handles event type: search_click", async () => {
    const fastify = makeFastify();
    await recordAnalyticsEvent(fastify as never, {
      ...baseInput,
      eventType: "search_click",
      contentId: 88,
    });

    const [, params] = fastify.db.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe("search_click");
  });

  it("awaits db.query and resolves to undefined", async () => {
    const fastify = makeFastify();
    await expect(
      recordAnalyticsEvent(fastify as never, { ...baseInput }),
    ).resolves.toBeUndefined();
  });
});
