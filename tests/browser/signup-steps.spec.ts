import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { selectOption } from "./select-helper";

for (const theme of ["light", "dark"] as const) {
  test(`sign-up steps remain accessible with CAPTCHA in ${theme} mode`, async ({
    page,
    request,
  }, testInfo) => {
    await request.post("http://127.0.0.1:3100/__test/reset");
    await page.addInitScript((value) => localStorage.setItem("vite-ui-theme", value), theme);
    await page.route(/\/api(?:\/v1)?\/auth\/config$/, async (route) => {
      const response = await route.fetch();
      const config = await response.json();
      await route.fulfill({
        json: { ...config, recaptcha: { ...config.recaptcha, enabled: true, live: false } },
      });
    });
    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 1366, height: 768 });
    }
    await page.goto("/login");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
    await expect(
      page.getByRole("heading", { name: "Create Your Alumni Account", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Phone Number", exact: true })).toHaveAttribute(
      "placeholder",
      "Enter Phone Number",
    );
    const captcha = page.getByRole("checkbox", { name: "I am not a robot" });
    await expect(captcha).toHaveCount(0);
    await expect(page.locator('[aria-current="step"]')).toHaveText("1.Personal Details");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);

    await page.getByRole("textbox", { name: "First Name", exact: true }).fill("Maria");
    await page.getByRole("textbox", { name: "Last Name", exact: true }).fill("Santos");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("steps@example.test");
    await page.getByRole("textbox", { name: "Phone Number", exact: true }).fill("+639171234567");
    await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Female");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(captcha).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText("2.Studies & Password");
    await expect(page.getByRole("button", { name: "Create Account", exact: true })).toBeDisabled();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    if (testInfo.project.name === "desktop") {
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        768,
      );
      await expect(
        page.getByRole("button", { name: "Create Account", exact: true }),
      ).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: testInfo.outputPath(`signup-${theme}.png`), fullPage: true });
  });
}
