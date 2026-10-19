import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
});

test("signup collects contact details and rejects an existing email", async ({ page }) => {
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Duplicate account");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("ADMIN@EXAMPLE.TEST");
  const phone = page.getByRole("textbox", { name: "Phone number", exact: true });
  await expect(phone).toHaveAttribute("required", "");
  await phone.fill("+639171234567");
  const gender = page.getByRole("combobox", { name: "Gender", exact: true });
  await expect(gender).toHaveAttribute("required", "");
  await expect(gender.locator("option")).toHaveText(["Select gender", "Male", "Female"]);
  await gender.selectOption("Female");
  const facebook = page.getByRole("textbox", { name: "Facebook profile link (optional)" });
  await expect(facebook).toHaveAttribute("type", "url");
  await expect(facebook).not.toHaveAttribute("required");
  await page.locator("#password").fill("SyntheticPassword123!");
  const response = page.waitForResponse((response) => response.url().endsWith("/api/auth/signup"));
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await response).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("Google is available in both modes when configured and enabled", async ({ page, request }) => {
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeDisabled();
  await request.post("http://127.0.0.1:3100/__test/google");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toHaveAttribute(
    "href",
    "/api/auth/google",
  );
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await expect(page.getByRole("button", { name: "Sign up with Google" })).toHaveAttribute(
    "href",
    "/api/auth/google",
  );
});

test("existing password accounts can save missing contact details", async ({ page, request }) => {
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  await request.post("http://127.0.0.1:3100/__test/incomplete");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/complete-profile$/);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("textbox", { name: "Phone number", exact: true }).fill("+639171234567");
  await page.getByRole("combobox", { name: "Gender", exact: true }).selectOption("Male");
  await page.getByRole("button", { name: "Save contact details" }).click();
  await page.waitForURL("**/dashboard");
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
});
