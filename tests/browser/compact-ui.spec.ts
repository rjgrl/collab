import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

test("audit details, integration statuses and account controls remain compact and accessible", async ({
  page,
  request,
}, info) => {
  test.setTimeout(180_000);
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  const departments = await (await page.request.get("/api/departments")).json();
  const department = departments[0];
  expect(department).toBeTruthy();
  const description = "A detailed synthetic audit record. ".repeat(45) + "END OF RECORDED SUMMARY";
  const updated = await page.request.patch(`/api/departments/${department.id}`, {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: { name: department.name, description },
  });
  expect(updated.status()).toBe(200);

  await page.goto("/settings/integrations");
  const forms = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Google Forms", exact: true }) });
  await forms.getByRole("button", { name: "Enable Google Forms", exact: true }).click();
  await expect(forms.getByText("Enabled", { exact: true })).toBeVisible();
  await forms.getByRole("button", { name: "Disable Google Forms", exact: true }).click();
  await expect(forms.getByText("Disabled", { exact: true })).toBeVisible();

  async function inspect(name: string) {
    await page.waitForLoadState("networkidle");
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
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  }
  const widths = info.project.name === "mobile" ? [375] : [768, 1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
      await page.goto("/audit");
      await page
        .getByRole("textbox", { name: "Search audit log", exact: true })
        .fill("END OF RECORDED SUMMARY");
      const row = page.getByRole("row").filter({ hasText: "END OF RECORDED SUMMARY" });
      const trigger = row.getByRole("button", { name: /^View audit details/ });
      await expect(trigger).toBeVisible();
      const preview = row.locator(".line-clamp-2");
      expect(await preview.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(44);
      expect(await preview.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      );
      await inspect(`audit-compact-${theme}-${width}`);
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Audit event details", exact: true });
      await expect(dialog).toContainText(description);
      await inspect(`audit-full-summary-${theme}-${width}`);
      const body = dialog.locator("[data-dialog-body]");
      await dialog.getByRole("region", { name: "Full summary", exact: true }).focus();
      if (await body.evaluate((element) => element.scrollHeight > element.clientHeight)) {
        await body.evaluate((element) => {
          element.scrollTop = 0;
        });
        await page.keyboard.press("PageDown");
        await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page.goto("/settings/integrations");
      const enabled = page.locator('.status-badge[data-tone="active"]').first();
      const disabled = page.locator('.status-badge[data-tone="disabled"]').first();
      await expect(enabled).toHaveText("Enabled");
      await expect(disabled).toHaveText("Disabled");
      const green = await enabled.evaluate((element) =>
        getComputedStyle(element)
          .color.match(/[\d.]+/g)!
          .map(Number),
      );
      const red = await disabled.evaluate((element) =>
        getComputedStyle(element)
          .color.match(/[\d.]+/g)!
          .map(Number),
      );
      expect(green[1]!).toBeGreaterThan(green[0]!);
      expect(red[0]!).toBeGreaterThan(red[1]!);
      await inspect(`integrations-${theme}-${width}`);
      await page.goto("/settings");
      const personal = page
        .locator('[data-slot="card"]')
        .filter({ has: page.getByRole("heading", { name: "Personal details", exact: true }) });
      const header = personal.locator('[data-slot="card-header"]');
      await expect(
        header.getByRole("status", { name: "Email verification", exact: true }),
      ).toHaveText("Verified");
      const country = page.getByRole("combobox", { name: "Country calling code", exact: true });
      const phone = page.getByRole("textbox", { name: "Phone number", exact: true });
      const left = (await country.boundingBox())!;
      const right = (await phone.boundingBox())!;
      expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(left.x + left.width - right.x)).toBeLessThanOrEqual(1);
      expect(left.width).toBeLessThanOrEqual(120);
      await country.focus();
      expect(
        await phone.locator("..").evaluate((element) => getComputedStyle(element).boxShadow),
      ).not.toBe("none");
      await inspect(`account-verified-${theme}-${width}`);
    }
  }
  await request.post("http://127.0.0.1:3100/__test/legacy-unverified-email");
  await page.goto("/settings");
  const personal = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Personal details", exact: true }) });
  await expect(
    personal.locator('[data-slot="card-header"]').getByText("Not verified", { exact: true }),
  ).toBeVisible();
  const verify = personal.getByRole("button", { name: "Verify recovery email", exact: true });
  await expect(
    personal
      .locator('[data-slot="card-header"]')
      .getByRole("button", { name: "Verify recovery email", exact: true }),
  ).toBeVisible();
  await inspect(`account-unverified-${info.project.name}`);
  await verify.click();
  await expect(
    page.getByRole("dialog", { name: "Verify recovery email", exact: true }),
  ).toBeVisible();
});
