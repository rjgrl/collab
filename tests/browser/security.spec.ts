import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

async function login(page: import("@playwright/test").Page, password = "BrowserTest123!") {
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/security");
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
});
test("legacy accounts can confirm a recovery email without losing app access", async ({
  page,
  request,
}) => {
  await login(page);
  await enrollAdministrator(page);
  await request.post("http://127.0.0.1:3100/__test/legacy-unverified-email");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Verify recovery email", exact: true }).click();
  await page.getByRole("button", { name: "Send email code", exact: true }).click();
  await expect
    .poll(
      async () => (await (await request.get("http://127.0.0.1:3100/__test/code")).json()).emailCode,
    )
    .toMatch(/^[0-9]{6}$/);
  const { emailCode } = await (await request.get("http://127.0.0.1:3100/__test/code")).json();
  await page.locator("#recovery-email-code").fill(emailCode);
  await page.getByRole("button", { name: "Confirm recovery email", exact: true }).click();
  await expect(page.getByRole("status", { name: "Email verification", exact: true })).toHaveText(
    "Verified",
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});
test("admin enrollment, backend gate, logout and single-use recovery work", async ({ page }) => {
  await login(page);
  const denial = await page.request.get("/api/dashboard", {
    headers: { Origin: "http://127.0.0.1:3101" },
  });
  expect(denial.status()).toBe(403);
  expect(await denial.text()).toContain("authenticator");
  expect((await page.request.get("/api/files/synthetic")).status()).toBe(403);
  await expect(page.locator('[data-sonner-toast][data-visible="true"]').first()).toHaveCSS(
    "opacity",
    "1",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const { recoveryCode } = await enrollAdministrator(page);
  await page.goto("/security");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page);
  await page.locator("#mfa-code").fill(recoveryCode);
  await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/security");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page);
  await page.locator("#mfa-code").fill(recoveryCode);
  await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/invalid|used/);
});
test("forgot/reset password revokes the session and retains administrator MFA", async ({
  page,
  request,
}) => {
  await login(page);
  const { recoveryCode } = await enrollAdministrator(page);
  await page.goto("/reset-password");
  await page.locator("#reset-email").fill("admin@example.test");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "eligible account" })).toBeVisible();
  const { resetLink } = await (await request.get("http://127.0.0.1:3100/__test/reset-link")).json();
  expect(resetLink).toContain("#token=");
  await page.goto(resetLink);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const password = "A new private browser passphrase 6464";
  await page.locator("#reset-password").fill(password);
  await page.locator("#reset-confirmation").fill(password);
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password reset." })).toBeVisible();
  await login(page, password);
  await page.locator("#mfa-code").fill(recoveryCode);
  await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
  await page.waitForURL("**/dashboard");
});
