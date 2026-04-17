import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import healthRoutes from "../src/routes/health.js";

describe("health routes", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(sensible);
    app.decorate("env", {
      HOST: "0.0.0.0",
      PORT: 3000,
      NODE_ENV: "test",
      DATABASE_URL: "https://example.com",
      CORS_ORIGIN: "*",
      JWT_SECRET: "test-secret-test-secret-test-secret",
    });

    const queryFn = async <T>(text: string) => {
      if (text.includes("SELECT NOW()")) {
        return { rows: [{ now: "2026-01-15T12:00:00.000Z" }] as T[] };
      }
      return { rows: [] as T[] };
    };

    app.decorate("db", {
      query: queryFn,
      connect: async () =>
        ({ query: queryFn, release: () => undefined }) as never,
    } as unknown as Pool);

    await app.register(healthRoutes, { prefix: "/api" });
    return app;
  };

  it("returns status ok with timestamp and environment", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBe("2026-01-15T12:00:00.000Z");
    expect(body.environment).toBe("test");
  });

  it("returns correct response shape", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(
      ["environment", "status", "timestamp"].sort(),
    );
  });

  it("does not require authentication", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
  });

  it("returns 404 for non-existent health sub-paths", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health/details",
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects non-GET methods", async () => {
    const app = await buildApp();
    const post = await app.inject({
      method: "POST",
      url: "/api/health",
    });
    expect(post.statusCode).toBe(404);

    const del = await app.inject({
      method: "DELETE",
      url: "/api/health",
    });
    expect(del.statusCode).toBe(404);
  });
});
