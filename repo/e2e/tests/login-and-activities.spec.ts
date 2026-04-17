import { test, expect } from "@playwright/test";

const E2E_ENABLED = process.env["E2E_ENABLED"] === "true";

test.describe("Login and Activities Flow", () => {
  test.skip(
    !E2E_ENABLED,
    "E2E tests require running app (set E2E_ENABLED=true)",
  );

  test("user can register, login, and see activities page", async ({
    page,
  }) => {
    // Navigate to login page
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible();

    // Generate unique username to avoid conflicts on repeat runs
    const username = `e2euser${Date.now().toString(36)}`;
    const password = "TestAdmin@12345678";

    // The toggle button in login mode reads "Need an account? Register"
    // Clicking it switches to register mode
    const registerToggle = page.locator("button", {
      hasText: "Need an account? Register",
    });
    await expect(registerToggle).toBeVisible();
    await registerToggle.click();

    // Fill and submit the registration form
    await page.fill('input[formControlName="username"]', username);
    await page.fill('input[formControlName="password"]', password);
    await page.click('button[type="submit"]');

    // After successful registration the component resets to login mode and
    // shows "Registration successful. Sign in using your new credentials."
    await expect(
      page.locator("p.error", {
        hasText: "Registration successful",
      }),
    ).toBeVisible({ timeout: 10000 });

    // The toggle now shows "Need an account? Register" again (back in login mode).
    // Username field still holds the value; password was cleared by the component.
    // Re-enter the password and sign in.
    await page.fill('input[formControlName="password"]', password);
    await page.click('button[type="submit"]');

    // Should redirect to /activities after a successful login
    await page.waitForURL("**/activities", { timeout: 10000 });
    await expect(page).toHaveURL(/\/activities/);

    // The activities page renders a section with an h1 "Activities"
    await expect(page.locator("h1", { hasText: "Activities" })).toBeVisible();

    // Body must be present (basic sanity check for authenticated shell)
    await expect(page.locator("body")).toBeVisible();
  });
});
