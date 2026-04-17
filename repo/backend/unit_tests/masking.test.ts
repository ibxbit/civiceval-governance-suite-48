import { describe, expect, it } from "vitest";

import {
  maskNullableText,
  maskSensitiveDigits,
} from "../src/utils/masking.js";

describe("masking utilities", () => {
  describe("maskSensitiveDigits", () => {
    it("masks digit groups of 6 or more, keeping last 4 visible", () => {
      expect(maskSensitiveDigits("123456")).toBe("**3456");
      expect(maskSensitiveDigits("1234567890")).toBe("******7890");
    });

    it("does not mask digit groups shorter than 6", () => {
      expect(maskSensitiveDigits("12345")).toBe("12345");
      expect(maskSensitiveDigits("1234")).toBe("1234");
      expect(maskSensitiveDigits("123")).toBe("123");
    });

    it("preserves non-digit text", () => {
      expect(maskSensitiveDigits("hello")).toBe("hello");
      expect(maskSensitiveDigits("abc-def")).toBe("abc-def");
    });

    it("masks multiple digit groups independently", () => {
      const result = maskSensitiveDigits("ID: 123456 phone: 9876543210");
      expect(result).toBe("ID: **3456 phone: ******3210");
    });

    it("handles empty string", () => {
      expect(maskSensitiveDigits("")).toBe("");
    });

    it("handles mixed content with short digit groups", () => {
      expect(maskSensitiveDigits("user-42 score: 99")).toBe(
        "user-42 score: 99",
      );
    });
  });

  describe("maskNullableText", () => {
    it("returns null for null input", () => {
      expect(maskNullableText(null)).toBeNull();
    });

    it("masks digit groups in non-null input", () => {
      expect(maskNullableText("SSN: 123456789")).toBe("SSN: *****6789");
    });

    it("returns empty string unchanged", () => {
      expect(maskNullableText("")).toBe("");
    });
  });
});
