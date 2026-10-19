import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("authentication reflows at 320 CSS pixels with password-manager semantics", async ({
  page,
  request,
}, testInfo) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/login");
  await expect(page.locator("#email")).toHaveAttribute("autocomplete", "email");
  await expect(page.locator("#password")).toHaveAttribute("autocomplete", "current-password");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("login-320.png"), fullPage: true });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Need an account? Sign up", exact: true }).click();
  await expect(page.locator("#password")).toHaveAttribute("autocomplete", "new-password");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("signup-320.png"), fullPage: true });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
