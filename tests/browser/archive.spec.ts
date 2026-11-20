import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";
const FIXTURE = "http://127.0.0.1:3100/__test";
const ID = "000000000000000000000201";

test("Super Admins browse and restore archived alumni; Faculty cannot use Archive", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/alumni`);
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await enrollAdministrator(page);
  const archived = await page.request.delete(`/api/v1/alumni/${ID}`, {
    headers: { Origin: "http://127.0.0.1:3101" },
  });
  expect(archived.status()).toBe(200);
  await page.goto("/archive");
  const row = page.getByRole("row").filter({ hasText: "SYNTHETIC-OWN" });
  await expect(row).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await row.getByRole("button", { name: /^Restore/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/v1/alumni/${ID}`)).status()).toBe(200);
  await request.post(`${FIXTURE}/staff`);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill("staff@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("link", { name: "Archive", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/v1/alumni/archived")).status()).toBe(403);
  expect(
    (
      await page.request.post(`/api/v1/alumni/${ID}/restore`, {
        headers: { Origin: "http://127.0.0.1:3101" },
      })
    ).status(),
  ).toBe(403);
});
