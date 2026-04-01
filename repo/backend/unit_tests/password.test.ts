import { describe, expect, it } from "vitest";

import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../src/security/password.js";

describe("password security", () => {
  it("passes with valid complex password", () => {
    expect(validatePasswordStrength("Admin@12345678")).toBe(true);
  });

  it("fails with short password", () => {
    expect(validatePasswordStrength("Aa1@short")).toBe(false);
  });

  it("fails missing complexity requirements", () => {
    expect(validatePasswordStrength("lowercaseonly123!")).toBe(false);
    expect(validatePasswordStrength("UPPERCASEONLY123!")).toBe(false);
    expect(validatePasswordStrength("NoNumberPassword!")).toBe(false);
    expect(validatePasswordStrength("NoSpecial12345")).toBe(false);
  });

  it("hashes and verifies password", async () => {
    const hash = await hashPassword("Admin@12345678");
    await expect(verifyPassword("Admin@12345678", hash)).resolves.toBe(true);
    await expect(verifyPassword("Wrong@12345678", hash)).resolves.toBe(false);
  });
});
