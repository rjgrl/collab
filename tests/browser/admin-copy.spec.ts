import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { enrollAdministrator } from "./security-helper";

for (const theme of ["light", "dark"] as const) {
  test(`admin branding and formal headings remain readable in ${theme} mode`, async ({
    page,
    request,
  }, info) => {
    test.setTimeout(90_000);
    await request.post("http://127.0.0.1:3100/__test/reset");
    await page.addInitScript((value) => localStorage.setItem("vite-ui-theme", value), theme);
    await page.goto("/login");
    await page.locator("#email").fill("admin@example.test");
    await page.locator("#password").fill("BrowserTest123!");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await enrollAdministrator(page);
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));

    if (info.project.name === "desktop") {
      const sidebar = page.locator("aside");
      await expect(sidebar.getByText("Alumni Tracking System", { exact: true })).toBeVisible();
      const university = sidebar.getByText("BukSU - College of Technologies", {
        exact: true,
      });
      await expect(university).toBeVisible();
      expect(
        await university.evaluate(
          (element) =>
            element.scrollWidth <= element.clientWidth &&
            element.scrollHeight <= element.clientHeight,
        ),
      ).toBe(true);
      await expect(sidebar.getByRole("link", { name: "Audit Log", exact: true })).toBeVisible();
      await expect(sidebar.getByText("Academic Structure", { exact: true })).toBeVisible();
    } else {
      await page.getByRole("button", { name: "Open Menu", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Audit Log", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.screenshot({
      path: info.outputPath(`admin-dashboard-${theme}.png`),
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);

    const account = await (await page.request.get("/api/auth/me")).json();
    for (const [route, title] of [
      ["/colleges", "Colleges"],
      ["/departments", "Departments"],
      ["/programs", "Programs"],
      ["/alumni", "Alumni"],
      ["/faculty", "Faculty"],
      ["/reports", "Reports"],
      ["/settings", "Account"],
      ["/settings/users", "Members"],
      ["/settings/roles", "Roles and Permissions"],
      ["/settings/integrations", "Integrations"],
      ["/settings/backups", "Backups"],
      ["/audit", "Audit Log"],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      if (route === "/settings") {
        await expect(page.getByRole("heading", { name: account.name, exact: true })).toBeVisible();
        await expect(page.getByText("Personal Details", { exact: true })).toBeVisible();
        await expect(page.getByText("Sign-In & Security", { exact: true })).toBeVisible();
      }
      if (route === "/departments") {
        await page.getByRole("button", { name: "Add Department", exact: true }).click();
        await expect(
          page.getByRole("dialog", { name: "Add Department", exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    }
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  });
}
