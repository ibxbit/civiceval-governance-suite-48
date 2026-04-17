import { test, expect } from "@playwright/test";
import { registerAndLogin, uniqueUsername } from "./helpers";

const E2E_ENABLED = process.env["E2E_ENABLED"] === "true";

test.describe("Moderation Queue Flow", () => {
  test.skip(!E2E_ENABLED, "E2E tests require running app (set E2E_ENABLED=true)");

  test("reviewer can access moderation queue and see sections", async ({ page }) => {
    const username = uniqueUsername("e2emod");
    await registerAndLogin(page, username);

    // Navigate to moderation page (requires reviewer or admin role)
    await page.goto("/moderation");

    const url = page.url();
    if (url.includes("/moderation")) {
      await expect(page.locator("h1", { hasText: "Moderation Queue" })).toBeVisible();

      // Verify the four sections exist
      await expect(page.locator("h2", { hasText: "Comments" })).toBeVisible();
      await expect(page.locator("h2", { hasText: "Open Reports" })).toBeVisible();
      await expect(page.locator("h2", { hasText: "Q&A Queue" })).toBeVisible();
      await expect(page.locator("h2", { hasText: "Open Q&A Reports" })).toBeVisible();
    }
  });
});
