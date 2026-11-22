import { test, expect, type Page } from "@playwright/test";
import { enrollAdministrator } from "./security-helper";

const FIXTURE = "http://127.0.0.1:3100/__test";
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("Super Admin can delegate and revoke integration access for Faculty", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`, { data: { unenrolled: true } });
  await signIn(page, "admin@example.test");
  await enrollAdministrator(page);
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /Test Staff/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Super Admin only", { exact: true })).toHaveCount(0);
  const read = dialog.getByRole("switch", { name: /^View Integrations/ });
  await expect(read).toBeEnabled();
  await expect(read).toHaveAccessibleName(/Requires MFA when enabled/);
  await expect(dialog.getByRole("switch", { name: /^Manage Roles/ })).toBeEnabled();
  await read.click();
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Save Changes", exact: true })).toBeDisabled();

  const delegated = await browser.newContext();
  try {
    const faculty = await delegated.newPage();
    await signIn(faculty, "staff@example.test");
    await enrollAdministrator(faculty);
    await faculty.goto("/settings/integrations");
    await expect(faculty.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
    expect((await faculty.request.get("/api/v1/integrations")).status()).toBe(200);
    expect((await faculty.request.get("/api/v1/roles")).status()).toBe(403);
    // A read grant is not a write grant.
    expect(
      (
        await faculty.request.post("/api/v1/integrations/recaptcha/disable", {
          headers: { Origin: "http://127.0.0.1:3101" },
          data: {},
        })
      ).status(),
    ).toBe(403);

    await read.click();
    await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Save Changes", exact: true })).toBeDisabled();
    expect((await faculty.request.get("/api/v1/integrations")).status()).toBe(401);
    await signIn(faculty, "staff@example.test");
    expect((await faculty.request.get("/api/v1/integrations")).status()).toBe(403);
  } finally {
    await delegated.close();
  }
});

test("editing Super Admin grants preserves the last access manager and a rejected draft", async ({
  page,
  request,
}) => {
  await request.post(`${FIXTURE}/reset`);
  await signIn(page, "admin@example.test");
  await enrollAdministrator(page);
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /^Test Admin Synthetic administrator/ }).click();
  const dialog = page.getByRole("dialog");
  const write = dialog.getByRole("switch", { name: /^Manage Roles/ });
  await expect(write).toBeEnabled();
  await write.click();
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("at least one active Super Admin");
  await expect(write).not.toBeChecked();
  await expect(dialog.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  const me = await (await page.request.get("/api/v1/auth/me")).json();
  expect(me.permissions).toContain("roles.write");
});
