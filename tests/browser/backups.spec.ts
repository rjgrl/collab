import { existsSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

const toolsPresent = existsSync(
  path.resolve(
    process.env.MONGODB_TOOLS_DIR ??
      `.tools/mongodb-database-tools-${process.platform === "win32" ? "windows" : "ubuntu2204"}-x86_64-100.20.1/bin`,
  ),
);
const axe = async (page: Page, scope?: string) => {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  return (await (scope ? builder.include(scope) : builder).analyze()).violations;
};

test("Super Admins manage backups", async ({ page, request }) => {
  test.setTimeout(120_000);
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  await page.goto("/settings/backups");
  await expect(page.getByRole("heading", { name: "Backups", exact: true })).toBeVisible();

  // Schedule round-trip.
  const save = await page.request.put("/api/backups/schedule", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: { frequency: "weekly", time: "03:30", weekday: 1, retention: 5 },
  });
  expect(save.status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel("Time (Asia/Manila)")).toHaveValue("03:30");
  await expect(page.getByLabel("Backups to keep")).toHaveValue("5");
  await page.getByLabel("Backups to keep").fill("6");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Backup schedule saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Backups to keep")).toHaveValue("6");
  expect(await axe(page)).toEqual([]);

  test.skip(!toolsPresent, "Run pnpm tools:mongodb before the backup browser test.");
  await page.getByRole("button", { name: "Back up now" }).click();
  const row = page.getByRole("row").filter({ hasText: "Manual" });
  await expect(row).toContainText("Succeeded", { timeout: 60_000 });
  await expect(row).toContainText("Yes");
  await expect(page.getByLabel("Import encrypted backup")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import and verify" })).toBeDisabled();
  await row.getByRole("button", { name: /^Restore backup from/ }).click();
  const dialog = page.getByRole("dialog", { name: "Restore backup", exact: true });
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Restore this backup" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Authenticator code").fill("123456");
  await dialog.getByLabel("Type RESTORE to confirm").fill("restore");
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Type RESTORE to confirm").fill("RESTORE");
  await expect(submit).toBeEnabled();
  // Scoped to the dialog: the page was checked above and a success toast may still be fading.
  expect(await axe(page, "[role=dialog]")).toEqual([]);
  // Never submitted: a real restore would replace the shared browser-test database.
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Backups are hidden and refused for non-administrators", async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await request.post("http://127.0.0.1:3100/__test/staff");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("staff@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Backups", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/backups")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/backups", { headers: { Origin: "http://127.0.0.1:3101" } })
    ).status(),
  ).toBe(403);
});
