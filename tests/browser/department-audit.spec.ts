import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

test("departments have no code fields and audit summaries preserve each individual change", async ({
  page,
  request,
}, info) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  await page.goto("/departments");
  await page.getByRole("button", { name: "Add department", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add department", exact: true });
  await expect(dialog.getByLabel(/Code/)).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Audit Science");
  await dialog.getByRole("textbox", { name: "Description", exact: true }).fill("First description");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "Audit Science" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit department", exact: true });
  await expect(dialog.getByLabel(/Code/)).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Natural Sciences");
  await dialog
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Second description");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ hasText: "Natural Sciences" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Edit department", exact: true });
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Final Sciences");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/audit");
  await page
    .getByRole("textbox", { name: "Search audit log", exact: true })
    .fill("departments.update");
  const firstChange = page.getByRole("row").filter({ hasText: "Audit Science" });
  await expect(firstChange).toContainText('name: "Audit Science" → "Natural Sciences"');
  await expect(firstChange).toContainText(
    'description: "First description" → "Second description"',
  );
  await expect(firstChange).toContainText("admin@example.test");
  await expect(firstChange).not.toContainText("Current identity");
  await expect(firstChange).not.toContainText("Final Sciences");
  const recordedTime = await firstChange.locator("time").getAttribute("datetime");
  expect(Number.isNaN(Date.parse(recordedTime!))).toBe(false);
  const secondChange = page.getByRole("row").filter({ hasText: "Final Sciences" });
  await expect(secondChange).toContainText('name: "Natural Sciences" → "Final Sciences"');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("department-audit.png"), fullPage: true });
});
