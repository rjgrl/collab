import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

const FIXTURE = "http://127.0.0.1:3100/__test";
test("a seeded admin configures Gmail without receiving the connection test at their own email", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await enrollAdministrator(page);
  const disabled = await page.request.post("/api/v1/integrations/email/disable", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: {},
  });
  expect(disabled.status()).toBe(200);
  await page.goto("/settings/integrations");
  await page.getByRole("button", { name: "Enable Email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Enable Email", exact: true });
  await expect(dialog.getByLabel(/HTTPS Gateway URL/i)).toHaveCount(0);
  await expect(dialog.getByLabel(/API Key/i)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Gmail Address", exact: true })
    .fill("demo.sender@gmail.com");
  await dialog.getByLabel(/^Gmail App Password/).fill("abcd efgh ijkl mnop");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/integrations/email/enable") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Test and Enable", exact: true }).click();
  expect((await saved).status()).toBe(201);
  await expect(dialog).toHaveCount(0);
  const sent = await (await request.get(`${FIXTURE}/code`)).json();
  expect(sent.lastEmailRecipient).toBe("demo.sender@gmail.com");
  expect(
    JSON.stringify(await (await page.request.get("/api/v1/integrations")).json()),
  ).not.toContain("abcd efgh ijkl mnop");
});
