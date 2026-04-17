import { test, expect } from "@playwright/test";
import { registerAndLogin, uniqueUsername } from "./helpers";

const E2E_ENABLED = process.env["E2E_ENABLED"] === "true";

test.describe("Logout Flow", () => {
  test.skip(!E2E_ENABLED, "E2E tests require running app (set E2E_ENABLED=true)");

  test("user can log out and is redirected to login", async ({ page }) => {
    const username = uniqueUsername("e2elogout");
    await registerAndLogin(page, username);

    await expect(page).toHaveURL(/\/activities/);

    const logoutButton = page.locator("button.logout");
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();

    await page.waitForURL("**/login", { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
