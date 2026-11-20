import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openProfileTab } from "./profile-tabs-helper";

const FIXTURE = "http://127.0.0.1:3100/__test";
const API = "http://127.0.0.1:3101/api/v1";
const ORIGIN = { Origin: "http://127.0.0.1:3101" };
const ALUMNUS = "000000000000000000000201";

test("a timestamp conflict keeps the draft and requires an explicit reload", async ({
  page,
  request,
}) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await page.goto("/login");
  await page.locator("#email").fill("staff@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(`/alumni/${ALUMNUS}`);
  await openProfileTab(page, "Details");

  // T1: this editor opens (its timestamp and snapshot are issued now).
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Student Details", exact: true });
  const batch = dialog.getByRole("textbox", { name: "Batch", exact: true });
  await batch.fill("My draft batch");
  const year = dialog.getByRole("spinbutton", { name: "Graduation Year", exact: true });
  await year.fill("2020");

  // T2: a newer edit reads and commits first.
  const newer = await page.request.post(`${API}/alumni/timestamp-edits`, {
    headers: ORIGIN,
    data: { purpose: "details", alumniIds: [ALUMNUS] },
  });
  expect(newer.status()).toBe(201);
  const committed = await page.request.patch(`${API}/alumni/${ALUMNUS}`, {
    headers: { ...ORIGIN, "X-Timestamp-Edit": (await newer.json()).token },
    data: {
      studentNumber: "SYNTHETIC-OWN",
      programId: "000000000000000000000302",
      graduationYear: 2020,
      batch: "Newer saved batch",
    },
  });
  expect(committed.status()).toBe(200);

  // T1's older write is rejected: nothing applied, draft kept, saving blocked.
  await dialog.getByRole("button", { name: "Save Student Details", exact: true }).click();
  const conflict = dialog.getByRole("alert").filter({ hasText: "This Edit Could Not Be Saved" });
  await expect(conflict).toBeVisible();
  await expect(batch).toHaveValue("My draft batch");
  await expect(
    dialog.getByRole("button", { name: "Save Student Details", exact: true }),
  ).toBeDisabled();
  const stored = await (await page.request.get(`${API}/alumni/${ALUMNUS}`)).json();
  expect(stored.batch).toBe("Newer saved batch");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);

  // Cancelling the discard confirmation keeps the draft.
  await conflict.getByRole("button", { name: "Reload Latest", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Discard Your Unsaved Entries?" });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(batch).toHaveValue("My draft batch");

  // Confirmed reload starts a fresh edit from the latest saved data.
  await conflict.getByRole("button", { name: "Reload Latest", exact: true }).click();
  await confirm.getByRole("button", { name: "Reload Latest", exact: true }).click();
  await expect(batch).toHaveValue("Newer saved batch");
  await expect(conflict).toHaveCount(0);
  await expect(year).toHaveValue("2020");
  await batch.fill("Reviewed batch");
  await dialog.getByRole("button", { name: "Save Student Details", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Reviewed batch", { exact: true })).toBeVisible();
});
