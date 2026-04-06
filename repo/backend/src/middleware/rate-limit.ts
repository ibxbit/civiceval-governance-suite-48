export const loginRateLimitConfig = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
  },
} as const;

export const searchRateLimitConfig = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: "1 minute",
    },
  },
} as const;
