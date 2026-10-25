import { selectOption } from "./select-helper";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
});

test("signup collects contact details and rejects an existing email", async ({ page }) => {
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await page.getByRole("textbox", { name: "First name", exact: true }).fill("Duplicate");
  await page.getByRole("textbox", { name: "Last name", exact: true }).fill("Account");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("ADMIN@EXAMPLE.TEST");
  const phone = page.getByRole("textbox", { name: "Phone number", exact: true });
  await expect(phone).toHaveAttribute("required", "");
  await phone.fill("+639171234567");
  const gender = page.getByRole("combobox", { name: "Gender", exact: true });
  await expect(gender).toHaveAttribute("aria-required", "true");
  await gender.click();
  await expect(page.getByRole("option")).toHaveText(["Select gender", "Male", "Female"]);
  await page.keyboard.press("Escape");
  await selectOption(gender, "Female");
  const facebook = page.getByRole("textbox", { name: "Facebook profile link (optional)" });
  await expect(facebook).toHaveAttribute("type", "url");
  await expect(facebook).not.toHaveAttribute("required");
  await page.getByRole("textbox", { name: "Student number", exact: true }).fill("NEW-SYNTHETIC");
  await selectOption(
    page.getByRole("combobox", { name: "Degree program", exact: true }),
    "000000000000000000000302",
  );
  await page.locator("#password").fill("SyntheticPassword123!");
  const year = page.getByRole("spinbutton", { name: "Graduation year", exact: true });
  await expect(year).toHaveAttribute("required", "");
  expect(await year.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  await year.fill("2024");
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

test("signup stores separated compound names and the actual custom suffix", async ({ page }) => {
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await page.getByRole("textbox", { name: "First name", exact: true }).fill("  María José  ");
  await page.getByRole("textbox", { name: "Last name", exact: true }).fill("Dela Cruz-O’Neill");
  await page
    .getByRole("combobox", { name: "Name extension / suffix (optional)", exact: true })
    .fill("de la Casa");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("structured.names@example.test");
  await page.getByRole("textbox", { name: "Phone number", exact: true }).fill("+639171234567");
  await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Female");
  await page.getByRole("textbox", { name: "Student number", exact: true }).fill("NEW-SYNTHETIC");
  await selectOption(
    page.getByRole("combobox", { name: "Degree program", exact: true }),
    "000000000000000000000302",
  );
  await page.locator("#password").fill("SyntheticPassword123!");
  await page.getByRole("spinbutton", { name: "Graduation year", exact: true }).fill("2024");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL("**/complete-profile");
  const user = await (await page.request.get("/api/auth/me")).json();
  expect(user.firstName).toBe("María José");
  expect(user.middleName).toBe("");
  expect(user.lastName).toBe("Dela Cruz-O’Neill");
  expect(user.suffix).toBe("de la Casa");
  expect(user.name).toBe("María José Dela Cruz-O’Neill de la Casa");
  expect((await page.request.get("/api/alumni")).status()).toBe(403);
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
  await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Male");
  await page.getByRole("button", { name: "Save contact details" }).click();
  await page.waitForURL("**/dashboard");
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
});
