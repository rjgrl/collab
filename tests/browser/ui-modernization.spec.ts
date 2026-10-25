import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

test("workspace remains accessible across screen sizes and themes", async ({
  page,
  request,
}, info) => {
  test.setTimeout(300_000);
  const widths = info.project.name === "mobile" ? [375] : [768, 1024, 1440];
  const metrics: object[] = [];
  const routes = [
    "dashboard",
    "departments",
    "programs",
    "alumni",
    "alumni/000000000000000000000201",
    "reports",
    "audit",
    "settings",
    "settings/users",
    "settings/roles",
    "settings/integrations",
    "security",
  ];
  await request.post("http://127.0.0.1:3100/__test/reset");
  await request.post("http://127.0.0.1:3100/__test/staff");
  await request.post("http://127.0.0.1:3100/__test/alumni");

  async function inspect(name: string) {
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      fontLoaded: [...document.fonts].some(
        (font) => font.family === "Inter Variable" && font.status === "loaded",
      ),
    }));
    expect
      .soft(dimensions.scrollWidth, `${name} document overflow`)
      .toBeLessThanOrEqual(dimensions.width);
    expect.soft(dimensions.fontLoaded, `${name} local font`).toBe(true);
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations;
    expect.soft(violations, `${name} accessibility`).toEqual([]);
    metrics.push({ name, ...dimensions, violations: violations.map((item) => item.id) });
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  }

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.goto("/login");
      await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
      await page.reload();
      await inspect(`login-${theme}-${width}`);
      await page.getByRole("button", { name: "Need an account? Sign up", exact: true }).click();
      await inspect(`signup-${theme}-${width}`);
      await page.goto("/reset-password");
      await inspect(`reset-password-${theme}-${width}`);
    }
  }
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
      for (const route of routes) {
        await page.goto(`/${route}`);
        await inspect(`${route.replaceAll("/", "-")}-${theme}-${width}`);
        if (route === "departments") {
          const cell = page.locator("td.text-right").first();
          expect(
            await cell.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)),
          ).toBeGreaterThan(0);
          await page.getByRole("button", { name: "Add department", exact: true }).click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await inspect(`department-dialog-${theme}-${width}`);
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
        }
      }
    }
  }
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.getByTestId("notifications-bell").click();
  await expect(page.getByRole("menuitem", { name: "No notifications." })).toBeVisible();
  await inspect(`notifications-${info.project.name}`);
  await page.keyboard.press("Escape");
  if (info.project.name === "mobile") {
    const targets = await page.locator("header button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    for (const target of targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Departments", exact: true })).toBeVisible();
    await inspect("mobile-navigation");
  }

  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ status: 503, json: { message: "Synthetic outage" } }),
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("alert").filter({ hasText: "Could not load dashboard" })).toBeVisible(
    { timeout: 15_000 },
  );
  await page.unroute("**/api/dashboard");
  await page
    .getByRole("alert")
    .filter({ hasText: "Could not load dashboard" })
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load dashboard" })).toHaveCount(
    0,
  );

  await page.goto("/login");
  await page.locator("#email").fill("alumni@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/my-profile");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
      for (const route of ["my-profile", "statistics"]) {
        await page.goto(`/${route}`);
        await inspect(`${route}-${theme}-${width}`);
      }
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transition = await page
    .getByTestId("notifications-bell")
    .evaluate((button) => getComputedStyle(button).transitionDuration);
  expect(transition.split(",").every((duration) => parseFloat(duration) <= 0.001)).toBe(true);
  await info.attach("layout-metrics", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
});

test("account completion stays usable across sizes and themes", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  await request.post("http://127.0.0.1:3100/__test/reset");
  await request.post("http://127.0.0.1:3100/__test/alumni", { data: { unlinked: true } });
  await page.goto("/login");
  await page.locator("#email").fill("alumni@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/complete-profile");
  for (const width of info.project.name === "mobile" ? [375] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Complete and verify your account",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`complete-profile-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
});
