import { test, expect } from "@playwright/test";

const E2E_ENABLED = process.env["E2E_ENABLED"] === "true";

test.describe("Evaluation Submission Flow", () => {
  test.skip(
    !E2E_ENABLED,
    "E2E tests require running app (set E2E_ENABLED=true)",
  );

  test("participant can navigate to evaluation submit page", async ({
    page,
  }) => {
    const username = `e2eeval${Date.now().toString(36)}`;
    const password = "TestAdmin@12345678";

    // --- Registration ---
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible();

    // Switch to register mode. Toggle text in login mode is "Need an account? Register".
    const registerToggle = page.locator("button", {
      hasText: "Need an account? Register",
    });
    await expect(registerToggle).toBeVisible();
    await registerToggle.click();

    await page.fill('input[formControlName="username"]', username);
    await page.fill('input[formControlName="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for the success message that confirms registration and mode reset
    await expect(
      page.locator("p.error", {
        hasText: "Registration successful",
      }),
    ).toBeVisible({ timeout: 10000 });

    // --- Login ---
    // Component has reverted to login mode; username field still populated,
    // password was cleared. Fill password and submit.
    await page.fill('input[formControlName="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL("**/activities", { timeout: 10000 });
    await expect(page).toHaveURL(/\/activities/);

    // --- Navigate to evaluation submit page ---
    // New users receive the default "participant" role, which is the only role
    // allowed on /evaluations/submit (see app.routes.ts roleGuard data).
    await page.goto("/evaluations/submit");
    await expect(page).toHaveURL(/\/evaluations\/submit/);

    // The submit page renders a visible h1 and the form-ID loader form
    await expect(
      page.locator("h1", { hasText: "Submit Evaluation" }),
    ).toBeVisible();

    await expect(
      page.locator('input[formControlName="formId"]'),
    ).toBeVisible();
  });
});
