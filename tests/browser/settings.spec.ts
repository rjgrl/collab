import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /Test Staff/ }).click();
});

test("group and individual controls save through oRPC and survive reload", async ({ page }) => {
  const master = page.getByRole("checkbox", { name: "Enable all evidence and files permissions" });
  await master.check();
  await expect(page.getByRole("checkbox", { name: /^Upload evidence/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /^Upload evidence/ }).uncheck();
  await expect(master).toHaveAttribute("aria-checked", "mixed");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save permissions", exact: true }).click();
  await expect(page.getByText("No unsaved changes", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Test Staff/ }).click();
  await expect(master).toHaveAttribute("aria-checked", "mixed");
  await expect(page.getByRole("checkbox", { name: /^Upload evidence/ })).not.toBeChecked();
  await master.check();
  await master.uncheck();
  await expect(page.getByRole("checkbox", { name: /^View evidence/ })).not.toBeChecked();
});

test("failed saves preserve the draft and stale saves require reload", async ({
  page,
  request,
}) => {
  await page.getByRole("checkbox", { name: /^View evidence/ }).check();
  await request.post("http://127.0.0.1:3100/__test/fail");
  await page.getByRole("button", { name: "Save permissions", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "draft has been preserved" }),
  ).toBeVisible();
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await request.post("http://127.0.0.1:3100/__test/concurrent");
  await page.getByRole("button", { name: "Save permissions", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This role changed" })).toBeVisible();
});

test("settings and grouped controls pass automated accessibility and fit the viewport", async ({
  page,
}, testInfo) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("roles.png"), fullPage: true });
  const master = page.getByRole("checkbox", { name: "Enable all evidence and files permissions" });
  await master.focus();
  await page.keyboard.press("Space");
  await expect(master).toBeChecked();
  await page
    .getByRole("navigation", { name: "Settings", exact: true })
    .getByRole("link", { name: "Integrations" })
    .click();
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google Drive", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disable Google Drive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Enable Google Drive", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable Google Drive", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("integrations.png"), fullPage: true });
});
