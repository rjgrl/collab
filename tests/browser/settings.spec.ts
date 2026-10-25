import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /Test Staff/ }).click();
});

test("group and individual controls save through REST and survive reload", async ({ page }) => {
  const master = page.getByRole("switch", { name: "Enable all evidence and files permissions" });
  await master.check();
  await expect(page.getByRole("switch", { name: /^Upload evidence/ })).toBeChecked();
  await page.getByRole("switch", { name: /^Upload evidence/ }).uncheck();
  await expect(master).not.toBeChecked();
  await expect(page.getByText(/Partially enabled/)).toBeVisible();
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save permissions", exact: true }).click();
  await expect(page.getByText("No unsaved changes", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Test Staff/ }).click();
  await expect(master).not.toBeChecked();
  await expect(page.getByText(/Partially enabled/)).toBeVisible();
  await expect(page.getByRole("switch", { name: /^Upload evidence/ })).not.toBeChecked();
  await master.check();
  await master.uncheck();
  await expect(page.getByRole("switch", { name: /^View evidence/ })).not.toBeChecked();
});

test("failed saves preserve the draft and stale saves require reload", async ({
  page,
  request,
}) => {
  await page.getByRole("switch", { name: /^View evidence/ }).check();
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
  const master = page.getByRole("switch", { name: "Enable all evidence and files permissions" });
  await master.focus();
  await page.keyboard.press("Space");
  await expect(master).toBeChecked();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
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

test("new roles show the full catalog switched off and persist without grants", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Add Role", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Role", exact: true });
  expect(await dialog.getByRole("switch").count()).toBeGreaterThan(25);
  await expect(dialog.getByRole("switch", { checked: true })).toHaveCount(0);
  await expect(dialog.getByText(/facult/i)).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Key", exact: true }).fill("test_custom");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Custom access");
  await dialog.getByRole("button", { name: "Create role", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Custom access", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("switch", { checked: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /Custom access.*0 permissions/ })).toBeVisible();
});

test("creation dialogs contain forms, trap focus and return focus to the add button", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const [path, title, field] of [
    ["/settings/users", "Add user", "First name"],
    ["/departments", "Add department", "Name"],
    ["/programs", "Add program", "Code"],
  ] as const) {
    await page.goto(path);
    const add = page.getByRole("button", { name: title, exact: true });
    await add.click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog.getByRole("textbox", { name: field, exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
    await dialog.getByRole("button", { name: "Close dialog" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
  }
  await page.goto("/faculties");
  await expect(page.getByRole("heading", { name: "Faculty", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/faculty")).status()).toBe(404);
});

test("account controls remain reachable and role dialogs scroll internally", async ({
  page,
}, testInfo) => {
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "Save permissions", exact: true });
  const before = await save.boundingBox();
  await dialog.locator("[data-dialog-body]").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await save.boundingBox()).toEqual(before);
  await expect(save).toBeInViewport();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/settings");
  await expect(page.getByRole("textbox", { name: "First name", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle theme", exact: true })).toHaveCount(1);
  if (testInfo.project.name === "desktop") {
    await page
      .getByRole("button", { name: "Save personal details", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Save personal details", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Change password", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("account.png"), fullPage: true });
});
