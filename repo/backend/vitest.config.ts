import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["unit_tests/**/*.test.ts", "API_tests/**/*.test.ts"],
  },
});
