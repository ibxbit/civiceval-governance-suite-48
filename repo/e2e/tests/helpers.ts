import { type Page, expect } from "@playwright/test";

export const TEST_PASSWORD = "TestAdmin@12345678";

export const registerAndLogin = async (
  page: Page,
  username: string,
): Promise<void> => {
  await page.goto("/login");
  await expect(page.locator("form")).toBeVisible();

  const registerToggle = page.locator("button", {
    hasText: "Need an account? Register",
  });
  await expect(registerToggle).toBeVisible();
  await registerToggle.click();

  await page.fill('input[formControlName="username"]', username);
  await page.fill('input[formControlName="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await expect(
    page.locator("p.error", { hasText: "Registration successful" }),
  ).toBeVisible({ timeout: 10000 });

  await page.fill('input[formControlName="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL("**/activities", { timeout: 10000 });
};

export const loginOnly = async (
  page: Page,
  username: string,
): Promise<void> => {
  await page.goto("/login");
  await expect(page.locator("form")).toBeVisible();
  await page.fill('input[formControlName="username"]', username);
  await page.fill('input[formControlName="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/activities", { timeout: 10000 });
};

export const uniqueUsername = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}`;
