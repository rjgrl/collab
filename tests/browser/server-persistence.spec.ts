import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { openProfileTab } from "./profile-tabs-helper";
import { selectOption } from "./select-helper";

const id = "000000000000000000000201";
async function loginFaculty(page: Page, request: APIRequestContext) {
  expect((await request.post("http://127.0.0.1:3100/__test/reset")).ok()).toBe(true);
  expect((await request.post("http://127.0.0.1:3100/__test/staff")).ok()).toBe(true);
  await page.goto("/login");
  await page.locator("#email").fill("staff@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard");
}

test("profile CRUD refreshes from the server immediately and failed edits never become saved data", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await loginFaculty(page, request);
  await page.goto(`/alumni/${id}`);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Edit Student Details", exact: true });
  await dialog
    .getByRole("textbox", { name: "Batch", exact: true })
    .fill("Server persistence regression");
  await dialog.getByRole("spinbutton", { name: "Graduation Year", exact: true }).fill("2020");
  await dialog.getByRole("button", { name: "Save Student Details", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("definition").filter({ hasText: "Server persistence regression" }),
  ).toBeVisible();
  let stored = await (await page.request.get(`/api/v1/alumni/${id}`)).json();
  expect(stored.batch).toBe("Server persistence regression");

  await page.route(`**/api/v1/alumni/${id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic backend unavailable", code: "SERVICE_UNAVAILABLE" }),
    });
  });
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit Student Details", exact: true });
  await dialog
    .getByRole("textbox", { name: "Batch", exact: true })
    .fill("Must not be saved locally");
  await dialog.getByRole("button", { name: "Save Student Details", exact: true }).click();
  await expect(dialog.getByText("Synthetic backend unavailable", { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  stored = await (await page.request.get(`/api/v1/alumni/${id}`)).json();
  expect(stored.batch).toBe("Server persistence regression");
  expect(
    await page.evaluate(() =>
      [localStorage, sessionStorage].some((storage) =>
        Object.values(storage).some((value) => String(value).includes("Must not be saved locally")),
      ),
    ),
  ).toBe(false);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.unroute(`**/api/v1/alumni/${id}`);
  await page.reload();
  await expect(
    page.getByRole("definition").filter({ hasText: "Server persistence regression" }),
  ).toBeVisible();

  await openProfileTab(page, "Employment");
  await page.getByRole("button", { name: "Add Employment", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Employer", exact: true })
    .fill("Server-backed employer");
  await page.getByRole("button", { name: "Save Employment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Server-backed employer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Server-backed employer", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Position", exact: true })
    .fill("Updated without reload");
  await page.getByRole("button", { name: "Save Employment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Updated without reload", { exact: true })).toBeVisible();
  stored = await (await page.request.get(`/api/v1/alumni/${id}`)).json();
  expect(
    stored.employments.find(
      (job: { employer: string }) => job.employer === "Server-backed employer",
    ).jobTitle,
  ).toBe("Updated without reload");
  await page.getByRole("button", { name: "Remove Server-backed employer", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Server-backed employer", exact: true }),
  ).toHaveCount(0);
  stored = await (await page.request.get(`/api/v1/alumni/${id}`)).json();
  expect(
    stored.employments.some(
      (job: { employer: string }) => job.employer === "Server-backed employer",
    ),
  ).toBe(false);
});

test("account names refresh immediately from the API and remain correct after reload", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await loginFaculty(page, request);
  await page.goto("/settings");
  await page
    .getByRole("heading", { name: "Personal Details", exact: true })
    .locator("..")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit Personal Details", exact: true });
  await dialog.getByRole("textbox", { name: "First Name", exact: true }).fill("Server");
  await dialog.getByRole("textbox", { name: "Last Name", exact: true }).fill("Faculty");
  await selectOption(dialog.getByRole("combobox", { name: "Gender", exact: true }), "Male");
  await dialog.getByRole("button", { name: "Save Personal Details", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const stored = await (await page.request.get("/api/v1/auth/me")).json();
  expect(stored.firstName).toBe("Server");
  expect(stored.lastName).toBe("Faculty");
  await expect(page.getByText(stored.name, { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(stored.name, { exact: true }).first()).toBeVisible();
});
