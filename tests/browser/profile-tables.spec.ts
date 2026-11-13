import { test, expect, type Page } from "@playwright/test";
import { openProfileTab } from "./profile-tabs-helper";

const FIXTURE = "http://127.0.0.1:3100/__test";
const PROFILE = "/alumni/000000000000000000000201";

async function signIn(page: Page, email: string, landing: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**/${landing}`);
}

test("staff see a tidy profile with paginated employment and change history", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await request.post(`${FIXTURE}/employments`, { data: { count: 12 } });
  await signIn(page, "staff@example.test", "dashboard");
  await page.goto(PROFILE);

  // Status sits in the header under the program, not among the actions.
  await expect(
    page
      .locator("h1")
      .locator("..")
      .getByText(/^(Tracked|Untracked)$/),
  ).toBeVisible();

  // Contacts sit beside Student details on desktop.
  const details = page.getByRole("heading", { name: "Student details", exact: true });
  const contacts = page.getByRole("heading", { name: "Contacts", exact: true });
  const [a, b] = [await details.boundingBox(), await contacts.boundingBox()];
  if (info.project.name === "desktop") {
    expect(b!.x).toBeGreaterThan(a!.x + 200);
    expect(Math.abs(b!.y - a!.y)).toBeLessThan(40);
  } else expect(b!.y).toBeGreaterThan(a!.y);

  // Sign-up contact details show in Contacts even before staff add any.
  const signup = page.getByRole("region", { name: "Sign-up contacts" });
  await expect(signup).toContainText("alumni@example.test");
  await expect(signup).toContainText("+639171234567");
  await expect(page.getByText("No contacts yet.")).toHaveCount(0);

  // Phones emulate a wider layout when anything overflows, so compare with the device width.
  expect(await page.evaluate(() => innerWidth)).toBe(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );

  await openProfileTab(page, "Employment");
  const jobs = page.getByRole("region", { name: "Employment history" }).locator("tbody tr");
  await expect(jobs).toHaveCount(10);
  await expect(page.getByText("Showing 1–10 of 12")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Employment pages" })
    .getByRole("button", { name: "Page 2", exact: true })
    .click();
  await expect(jobs).toHaveCount(2);

  // Each detail save adds a change-history row.
  await openProfileTab(page, "Details");
  for (const batch of ["Batch A", "Batch B"]) {
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit student details", exact: true });
    await dialog.getByRole("textbox", { name: "Batch", exact: true }).fill(batch);
    await dialog.getByRole("spinbutton", { name: "Graduation year", exact: true }).fill("2020");
    await dialog.getByRole("button", { name: "Save student details", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await openProfileTab(page, "Change history");
  const history = page.getByRole("region", { name: "Change history" }).locator("tbody tr");
  await expect(history.first()).toContainText("Updated student details");
  await expect(history.first()).toContainText("Batch: Batch A → Batch B");
  await expect(history.first()).toContainText("Test Staff");

  // Adding a job reads as plain values, with no null placeholders, raw keys or ISO timestamps.
  await openProfileTab(page, "Employment");
  await page.getByRole("button", { name: "Add employment", exact: true }).click();
  const job = page.getByRole("dialog", { name: "Add employment", exact: true });
  await job.getByRole("textbox", { name: "Employer", exact: true }).fill("Readable Corp");
  await job.getByLabel("Start date").fill("2023-07-07");
  await page.getByRole("button", { name: "Save employment", exact: true }).click();
  await expect(job).toHaveCount(0);
  await openProfileTab(page, "Change history");
  await expect(history.first()).toContainText("Added employment");
  await expect(history.first()).toContainText("Employer: Readable Corp");
  await expect(history.first()).toContainText("Start date: Jul 7, 2023");
  await expect(page.getByRole("region", { name: "Change history" })).not.toContainText(
    /null|employmentStatus|T00:00|[a-f\d]{24}/,
  );

  // Tracking entries describe what happened.
  await openProfileTab(page, "Tracking");
  await page.getByRole("textbox", { name: "Tracking notes" }).fill("Called graduate");
  await page.getByRole("button", { name: "Mark tracked", exact: true }).click();
  await expect(page.getByText("Tracking updated", { exact: true })).toBeVisible();
  await openProfileTab(page, "Change history");
  await expect(history.first()).toContainText("Marked tracked");
  await expect(history.first()).toContainText("Notes: Called graduate");

  // The "Tracking updated" toast sits bottom-right on desktop with its close button inside.
  if (info.project.name === "desktop") {
    const toasts = page.locator("[data-sonner-toast]");
    await expect(toasts.first()).toBeVisible();
    const toast = (await toasts.first().boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(toast.x + toast.width).toBeGreaterThan(viewport.width - 80);
    expect(toast.y + toast.height).toBeGreaterThan(viewport.height - 120);
    const close = (await toasts.first().locator("[data-close-button]").boundingBox())!;
    expect(close.x).toBeGreaterThan(toast.x + toast.width / 2);
    expect(close.x + close.width).toBeLessThanOrEqual(toast.x + toast.width);
    expect(close.y).toBeGreaterThanOrEqual(toast.y);
  } else {
    // On phones toasts sit at the top, clear of actions at the bottom of the screen.
    const toast = (await page.locator("[data-sonner-toast]").first().boundingBox())!;
    expect(toast.y).toBeLessThan(page.viewportSize()!.height / 3);
  }

  // Audit log names the user, with their email underneath, and reads like Change history.
  await page.goto("/audit");
  await expect(page.getByRole("columnheader", { name: "User", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Actor" })).toHaveCount(0);
  const entry = page.getByRole("row").filter({ hasText: "Readable Corp" }).first();
  await expect(entry).toContainText("staff@example.test");
  await expect(entry).toContainText("Employer: Readable Corp");
  await expect(entry).not.toContainText(/none →|T00:00|[a-f\d]{24}/);
});

test("faculty list defaults to 10 rows with a rows-per-page choice", async ({ page, request }) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await signIn(page, "staff@example.test", "dashboard");
  await page.goto("/faculty");
  const select = page.getByRole("combobox", { name: "Rows per page" });
  await expect(select).toHaveText("10");
  const response = page.waitForResponse(
    (r) => r.url().includes("/faculty?") && r.url().includes("pageSize=25"),
  );
  await select.click();
  await page.getByRole("option", { name: "25", exact: true }).click();
  expect((await response).status()).toBe(200);
});

test("Alumni never see or receive their tracking status", async ({ page, request }) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/alumni`);
  await signIn(page, "alumni@example.test", "my-profile");
  await expect(page.getByText("Tracking status")).toHaveCount(0);
  await expect(page.getByText(/^(Tracked|Untracked|Not yet tracked)$/)).toHaveCount(0);
  await expect(page.getByText("Local functionality testing", { exact: false })).toHaveCount(0);
  const profile = await (await page.request.get("/api/v1/me/profile")).json();
  expect(profile).not.toHaveProperty("isTracked");
  expect(profile).not.toHaveProperty("lastTrackedAt");
  expect(profile.trackingEvents).toEqual([]);
});
