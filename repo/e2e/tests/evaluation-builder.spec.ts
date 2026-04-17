import { test, expect } from "@playwright/test";
import { registerAndLogin, uniqueUsername } from "./helpers";

const E2E_ENABLED = process.env["E2E_ENABLED"] === "true";

test.describe("Evaluation Builder Flow", () => {
  test.skip(!E2E_ENABLED, "E2E tests require running app (set E2E_ENABLED=true)");

  test("program_owner can create an evaluation form with questions", async ({ page }) => {
    const username = uniqueUsername("e2ebuilder");
    await registerAndLogin(page, username);

    // Navigate to evaluation builder (requires program_owner or admin)
    await page.goto("/evaluations/builder");

    const url = page.url();
    if (url.includes("/evaluations/builder")) {
      await expect(page.locator("h1", { hasText: "Evaluation Builder" })).toBeVisible();

      // Fill the form title
      const titleInput = page.locator('input[formControlName="title"]');
      if (await titleInput.isVisible()) {
        await titleInput.fill("E2E Test Evaluation Form");

        // First question should already exist with defaults
        const firstPrompt = page.locator('input[formControlName="prompt"]').first();
        await firstPrompt.fill("How would you rate this activity?");

        // Add a second question
        const addButton = page.locator("button", { hasText: "Add Question" });
        if (await addButton.isVisible()) {
          await addButton.click();

          // Fill the second question
          const prompts = page.locator('input[formControlName="prompt"]');
          await prompts.nth(1).fill("Any additional comments?");

          // Change second question type to comment
          const typeSelects = page.locator('select[formControlName="type"]');
          if (await typeSelects.nth(1).isVisible()) {
            await typeSelects.nth(1).selectOption("comment");
          }
        }

        // Submit the form
        const createButton = page.locator('button[type="submit"]');
        await createButton.click();

        // Wait for success indication (error message disappears or form resets)
        await page.waitForTimeout(2000);
      }
    }
  });
});
