import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["light", "dark"] as const) {
  test(`sign-in layout is balanced and readable in ${theme} mode`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem("vite-ui-theme", value), theme);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign In", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("Alumni Tracking System");
    await expect(page.getByRole("link", { name: "Forgot Password?", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));

    const desktop = testInfo.project.name === "desktop";
    const sizes = desktop
      ? [
          { width: 1024, height: 768 },
          { width: 1440, height: 900 },
          { width: 1920, height: 1080 },
          { width: 1280, height: 600 },
        ]
      : [
          { width: 390, height: 844 },
          { width: 320, height: 640 },
        ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      const title = page
        .getByText("Alumni Tracking System", { exact: true })
        .filter({ visible: true });
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("font-size", desktop ? "20px" : "18px");
      await expect(title).toHaveCSS("font-weight", "700");
      await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width,
      );
      expect(await page.evaluate(() => window.innerWidth)).toBe(size.width);

      if (desktop) {
        const panels = page.locator("main > div");
        const brandPanel = panels.nth(0);
        const formPanel = panels.nth(1);
        const brandGroup = brandPanel.locator(":scope > div").last();
        const brand = await brandPanel.boundingBox();
        const form = await formPanel.boundingBox();
        const group = await brandGroup.boundingBox();
        const content = await formPanel.locator(":scope > div").boundingBox();
        expect(brand).not.toBeNull();
        expect(form).not.toBeNull();
        expect(group).not.toBeNull();
        expect(content).not.toBeNull();
        expect(Math.abs(brand!.width - form!.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(group!.y + group!.height / 2 - size.height / 2)).toBeLessThanOrEqual(2);
        expect(
          Math.abs(content!.x + content!.width / 2 - (form!.x + form!.width / 2)),
        ).toBeLessThanOrEqual(2);
        expect(Math.abs(content!.y + content!.height / 2 - size.height / 2)).toBeLessThanOrEqual(2);
        await expect(
          page.getByText("Bukidnon State University - College of Technologies", { exact: true }),
        ).toBeVisible();
      }

      if (size.width === 1440 || size.width === 390) {
        await page.screenshot({
          path: testInfo.outputPath(`sign-in-${theme}.png`),
          fullPage: true,
        });
      }
    }

    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  });
}
