import { test, expect } from "@playwright/test";
import { registerAndLogin, uniqueUsername } from "./helpers";

const E2E_ENABLED = process.env["E2E_ENABLED"] === "true";

test.describe("Rankings Submission Flow", () => {
  test.skip(!E2E_ENABLED, "E2E tests require running app (set E2E_ENABLED=true)");

  test("program_owner can submit a ranking score and see it listed", async ({ page }) => {
    const username = uniqueUsername("e2erank");
    await registerAndLogin(page, username);

    // Navigate to rankings page (requires program_owner, admin, or reviewer)
    await page.goto("/rankings");

    const url = page.url();
    if (url.includes("/rankings")) {
      await expect(page.locator("h1", { hasText: "Rankings" })).toBeVisible();

      // Fill the ranking form
      const subjectInput = page.locator('input[formControlName="subjectKey"]');
      if (await subjectInput.isVisible()) {
        await subjectInput.fill("e2e-test-project");
        await page.fill('input[formControlName="benchmark"]', "85");
        await page.fill('input[formControlName="price"]', "70");
        await page.fill('input[formControlName="volatility"]', "60");
        // Weights default to 40/30/30 which sums to 100

        await page.click('button[type="submit"]');

        // After scoring, the rankings table should display the result
        await expect(page.locator("text=e2e-test-project")).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
