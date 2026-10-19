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
});

test("Google users must create a matching password after recent verification", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/password-required");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/complete-profile$/);
  await expect(
    page.getByRole("heading", { name: "Create your password (required)" }),
  ).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveCount(0);
  await page.locator("#setup-password").fill("NewSyntheticPassword123!");
  await page.locator("#setup-confirmation").fill("DifferentSyntheticPassword123!");
  await expect(page.getByRole("button", { name: "Create password", exact: true })).toBeDisabled();
  await page.locator("#setup-confirmation").fill("NewSyntheticPassword123!");
  await page.getByRole("button", { name: "Create password", exact: true }).click();
  await page.waitForURL("**/dashboard");
});

test("expired Google verification cannot create a password or enter the app", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/password-required");
  await request.post("http://127.0.0.1:3100/__test/stale-google");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/complete-profile$/);
  await expect(page.locator("#setup-password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Verify with Google again" })).toHaveAttribute(
    "href",
    "/api/auth/google",
  );
  expect((await page.request.get("/api/files/synthetic-private-file")).status()).toBe(401);
});

test("email confirmation is enforced and SMS remains disconnected until a provider is wired", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/unverified");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/complete-profile$/);
  await expect
    .poll(
      async () => (await (await request.get("http://127.0.0.1:3100/__test/code")).json()).emailCode,
    )
    .toMatch(/^[0-9]{6}$/);
  const { emailCode } = await (await request.get("http://127.0.0.1:3100/__test/code")).json();
  await page.getByRole("textbox", { name: "Email verification code", exact: true }).fill(emailCode);
  await page.getByRole("button", { name: "Confirm email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify your email", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText(/SMS delivery is unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
  await expect(page).toHaveURL(/\/complete-profile$/);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  // This isolated fixture provides an in-memory adapter; production has no SMS provider.
  await request.post("http://127.0.0.1:3100/__test/connect-sms");
  await page.reload();
  await page.getByRole("button", { name: "Send SMS code" }).click();
  await page.getByRole("textbox", { name: "SMS verification code" }).fill("654321");
  await page.getByRole("button", { name: "Confirm phone", exact: true }).click();
  await page.waitForURL("**/dashboard");
});
