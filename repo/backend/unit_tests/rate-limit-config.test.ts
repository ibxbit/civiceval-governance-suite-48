import { describe, expect, it } from "vitest";

import {
  loginRateLimitConfig,
  searchRateLimitConfig,
} from "../src/middleware/rate-limit.js";

describe("rate limit configs", () => {
  describe("loginRateLimitConfig", () => {
    it("has max of 10 requests", () => {
      expect(loginRateLimitConfig.config.rateLimit.max).toBe(10);
    });

    it("has timeWindow of '1 minute'", () => {
      expect(loginRateLimitConfig.config.rateLimit.timeWindow).toBe("1 minute");
    });
  });

  describe("searchRateLimitConfig", () => {
    it("has max of 20 requests", () => {
      expect(searchRateLimitConfig.config.rateLimit.max).toBe(20);
    });

    it("has timeWindow of '1 minute'", () => {
      expect(searchRateLimitConfig.config.rateLimit.timeWindow).toBe("1 minute");
    });
  });

  it("login limit is stricter than search limit (lower max)", () => {
    expect(loginRateLimitConfig.config.rateLimit.max).toBeLessThan(
      searchRateLimitConfig.config.rateLimit.max,
    );
  });
});
