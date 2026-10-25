import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
});

test("local Admin first login enters without an authenticator and strict mode restores enrollment", async ({
  page,
  request,
}, info) => {
  await request.post("http://127.0.0.1:3100/__test/local-mfa-policy", { data: { enabled: true } });
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  const identity = await (await page.request.get("/api/auth/me")).json();
  expect(identity.mfaRequired).toBe(false);
  expect(identity.mfaEnrolled).toBe(false);
  expect(identity.mfaVerified).toBe(false);
  expect((await page.request.get("/api/users")).status()).toBe(200);
  await expect(page.getByTestId("account-role")).toHaveText("Administrator");
  expect(
    await page
      .getByTestId("account-role")
      .evaluate(
        (element) =>
          element.getBoundingClientRect().top >=
          element.previousElementSibling!.getBoundingClientRect().bottom - 1,
      ),
  ).toBe(true);
  await expect(page.getByRole("link", { name: "Faculty", exact: true })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Integrations", exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0, { timeout: 10000 });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("local-admin-role.png"), fullPage: true });
  await request.post("http://127.0.0.1:3100/__test/local-mfa-policy", { data: { enabled: false } });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/security$/);
  expect((await page.request.get("/api/users")).status()).toBe(403);
});

for (const legacyIntegrations of [false, true]) {
  test(`Staff cannot see or reach integrations (${legacyIntegrations ? "historical grants" : "default permissions"})`, async ({
    page,
    request,
  }, info) => {
    await request.post("http://127.0.0.1:3100/__test/staff", { data: { legacyIntegrations } });
    await page.goto("/login");
    await page.locator("#email").fill("staff@example.test");
    await page.locator("#password").fill("BrowserTest123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByTestId("account-role")).toHaveText("Staff");
    await expect(page.getByRole("link", { name: "Faculty", exact: true })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Integrations", exact: true })).toHaveCount(0);
    await page.goto("/settings/integrations");
    await expect(page).toHaveURL(/\/settings\/?$/);
    expect((await page.request.get("/api/integrations")).status()).toBe(403);
    expect(
      (
        await page.request.patch("/api/integrations/recaptcha", {
          headers: { Origin: "http://127.0.0.1:3101" },
          data: { enabled: false },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/reports");
    await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export to Google Sheets", exact: true }),
    ).toHaveCount(0);
    expect((await page.request.get("/api/faculty")).status()).toBe(404);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath("staff-role.png"), fullPage: true });
  });
}
