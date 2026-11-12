import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

const FIXTURE = "http://127.0.0.1:3100/__test";
const PROFILE = "/alumni/000000000000000000000201";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMwTptpnDaTAUIBAB/uBMm6iK1UAAAAAElFTkSuQmCC",
  "base64",
);

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
}

async function uploadPhoto(page: Page) {
  await page.getByRole("button", { name: "Change photo", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Change profile photo", exact: true });
  const before = (await (await page.request.get("/api/v1/alumni/000000000000000000000201")).json())
    .photoUrl;
  await dialog
    .getByLabel("Choose profile photo", { exact: true })
    .setInputFiles({ name: "Graduate.png", mimeType: "image/png", buffer: png });
  // The chosen photo previews immediately, can be zoomed and moved, and is not saved yet.
  await expect(dialog.getByRole("img", { name: /Preview of the chosen photo/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByRole("slider", { name: "Zoom" })).toHaveValue("1.25");
  const frame = dialog.getByRole("group", { name: /Photo preview/ });
  await frame.focus();
  await page.keyboard.press("ArrowLeft");
  expect(
    (await (await page.request.get("/api/v1/alumni/000000000000000000000201")).json()).photoUrl,
  ).toBe(before);
  // Preview is centered above the controls.
  const box = (await frame.boundingBox())!;
  const dialogBox = (await dialog.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (dialogBox.x + dialogBox.width / 2))).toBeLessThan(4);
  expect(box.width).toBeGreaterThanOrEqual(200);
  await dialog.getByRole("button", { name: /Upload photo|Replace photo/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Test Alumni's profile photo" })).toBeVisible();
}

test("only Super Admins and the assigned faculty tracker change an alumnus photo", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await request.post(`${FIXTURE}/alumni`);
  await request.post(`${FIXTURE}/assign-staff`, { data: { assigned: false } });

  // A college head who can view the alumnus, but is not its tracker, sees the photo only.
  await signIn(page, "staff@example.test");
  await page.goto(PROFILE);
  await expect(page.getByRole("img", { name: "Test Alumni's profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toHaveCount(0);
  const denied = await page.request.delete("/api/v1/alumni/000000000000000000000201/photo", {
    headers: { Origin: "http://127.0.0.1:3101" },
  });
  expect(denied.status()).toBe(403);
  const deniedUpload = await page.request.post("/api/v1/files/evidence", {
    headers: { Origin: "http://127.0.0.1:3101" },
    multipart: {
      alumniId: "000000000000000000000201",
      kind: "image",
      file: { name: "x.png", mimeType: "image/png", buffer: png },
    },
  });
  expect(deniedUpload.status()).toBe(403);

  // Once directly assigned, the same faculty member can upload, replace and remove it.
  await request.post(`${FIXTURE}/assign-staff`, { data: { assigned: true } });
  await page.reload();
  await uploadPhoto(page);
  // The Profile PDF now carries the current photo beside the name.
  const pdf = await page.request.get("/api/v1/reports/alumni/000000000000000000000201/profile.pdf");
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).toString("latin1")).toMatch(/\/Subtype \/Image/);
  await uploadPhoto(page);

  // Re-opening loads the current photo so it can be zoomed and moved, then saved.
  const photoBefore = (
    await (await page.request.get("/api/v1/alumni/000000000000000000000201")).json()
  ).photoUrl;
  await page.getByRole("button", { name: "Change photo", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Change profile photo", exact: true });
  const current = dialog.getByRole("group", { name: /Photo preview/ });
  await expect(current.getByRole("img", { name: "Test Alumni's profile photo" })).toBeVisible();
  const save = dialog.getByRole("button", { name: "Save changes", exact: true });
  await expect(save).toBeDisabled();
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  // Dragging moves the image with a transform, not by re-laying out the page.
  const frameBox = (await current.boundingBox())!;
  await page.mouse.move(frameBox.x + 120, frameBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 150, frameBox.y + 130, { steps: 5 });
  await page.mouse.up();
  await expect(current.locator("img")).toHaveCSS("transform", /matrix/);
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/v1/alumni/000000000000000000000201")).json()).photoUrl,
  ).not.toBe(photoBefore);

  // Removing is staged: the dialog stays open and nothing changes until Save.
  await page.getByRole("button", { name: "Change photo", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Photo will be removed when you save.", { exact: false }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/alumni/000000000000000000000201")).json()).photoUrl,
  ).toBeTruthy();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Test Alumni's profile" })).toBeVisible();

  // With no photo, there is nothing to reposition: just the placeholder and Choose photo.
  await page.getByRole("button", { name: "Change photo", exact: true }).click();
  await expect(dialog.getByRole("group", { name: /Photo preview/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const audit = await (
    await page.request.get("/api/v1/alumni/000000000000000000000201/history")
  ).json();
  expect(audit.some((entry: { action: string }) => entry.action === "alumni.photo.remove")).toBe(
    true,
  );

  // Super Admins may change the photo without being assigned.
  await request.post(`${FIXTURE}/assign-staff`, { data: { assigned: false } });
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  await page.goto(PROFILE);
  await uploadPhoto(page);
});

test("tracking history is a paginated table", async ({ page, request }) => {
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await request.post(`${FIXTURE}/tracking-events`, { data: { count: 27 } });
  await signIn(page, "staff@example.test");
  await page.goto(PROFILE);
  const table = page.getByRole("region", { name: "Tracking history" });
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(10);
  // Newest first, with the tracker's name.
  await expect(rows.first()).toContainText("Synthetic tracking note 27");
  await expect(rows.first()).toContainText("Test Staff");
  await expect(page.getByText("Showing 1–10 of 27")).toBeVisible();
  const pager = page.getByRole("navigation", { name: "Tracking history pages" });
  await pager.getByRole("button", { name: "Page 3", exact: true }).click();
  await expect(rows).toHaveCount(7);
  await expect(page.getByText("Showing 21–27 of 27")).toBeVisible();
  await expect(pager.getByRole("button", { name: "Next page" })).toBeDisabled();

  await page.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { name: "25", exact: true }).click();
  await expect(rows).toHaveCount(25);
  await expect(page.getByText("Showing 1–25 of 27")).toBeVisible();

  // A new event returns to page 1 and appears at the top.
  await page.getByRole("textbox", { name: "Tracking notes" }).fill("Fresh follow-up");
  await page.getByRole("button", { name: "Mark tracked", exact: true }).click();
  await expect(rows.first()).toContainText("Fresh follow-up");
  await expect(page.getByText("Showing 1–25 of 28")).toBeVisible();

  const invalid = await page.request.get(
    "/api/v1/alumni/000000000000000000000201/tracking-events?pageSize=20",
  );
  expect(invalid.status()).toBe(400);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
