import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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

const tabs = (page: Page) => page.getByRole("navigation", { name: "Profile sections" });
const openTab = (page: Page) => tabs(page).locator('[aria-current="page"]');
const studentDetails = (page: Page) =>
  page.getByRole("heading", { name: "Student details", exact: true });
const addEmployment = (page: Page) =>
  page.getByRole("button", { name: "Add employment", exact: true });
const evidence = (page: Page) =>
  page.getByRole("heading", { name: "Supporting evidence", exact: true });
const trackingNotes = (page: Page) => page.getByRole("textbox", { name: "Tracking notes" });

async function expectAccessibleAndFitting(page: Page) {
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

test("staff reach each alumni profile section from tabs under the tracked status", async ({
  page,
  request,
}, info) => {
  test.setTimeout(180_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await signIn(page, "staff@example.test", "dashboard");
  await page.goto(PROFILE);

  // The bar opens on Details without changing the address, so existing links keep working.
  await expect(tabs(page).getByRole("link")).toHaveText([
    "Details",
    "Employment",
    "Tracking",
    "Change history",
  ]);
  await expect(openTab(page)).toHaveText("Details");
  expect(new URL(page.url()).search).toBe("");

  // It sits below the tracked status and above the section it controls.
  const badge = page
    .locator("h1")
    .locator("..")
    .getByText(/^(Tracked|Untracked)$/);
  const [badgeBox, barBox, sectionBox] = [
    (await badge.boundingBox())!,
    (await tabs(page).boundingBox())!,
    (await studentDetails(page).boundingBox())!,
  ];
  expect(barBox.y).toBeGreaterThanOrEqual(badgeBox.y + badgeBox.height);
  expect(sectionBox.y).toBeGreaterThanOrEqual(barBox.y + barBox.height);

  // Only the open section is on the page.
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await expect(addEmployment(page)).toHaveCount(0);
  await expect(evidence(page)).toHaveCount(0);
  await expect(trackingNotes(page)).toHaveCount(0);

  await openProfileTab(page, "Employment");
  await expect(page).toHaveURL(/\?tab=employment$/);
  await expect(addEmployment(page)).toBeVisible();
  // Supporting evidence lives under the job list.
  expect((await evidence(page).boundingBox())!.y).toBeGreaterThan(
    (await addEmployment(page).boundingBox())!.y,
  );
  await expect(studentDetails(page)).toHaveCount(0);

  await openProfileTab(page, "Tracking");
  await expect(page).toHaveURL(/\?tab=tracking$/);
  // With no events yet, the table's message fits without sideways scrolling, even on phones.
  const trackingTable = page.getByRole("region", { name: "Tracking history" });
  await expect(trackingTable).toContainText("No tracking events yet");
  expect(await trackingTable.evaluate((table) => table.scrollWidth <= table.clientWidth)).toBe(
    true,
  );
  await trackingNotes(page).fill("Unsaved follow-up");
  await expect(addEmployment(page)).toHaveCount(0);

  await openProfileTab(page, "Change history");
  await expect(page).toHaveURL(/\?tab=history$/);
  await expect(page.getByRole("region", { name: "Change history" })).toBeVisible();
  await expect(trackingNotes(page)).toHaveCount(0);

  // Notes typed but not saved are still there after visiting another tab.
  await openProfileTab(page, "Tracking");
  await expect(trackingNotes(page)).toHaveValue("Unsaved follow-up");

  // Reload and Back follow the tab in the address.
  await page.reload();
  await expect(openTab(page)).toHaveText("Tracking");
  await page.goBack();
  await expect(openTab(page)).toHaveText("Change history");

  // Keyboard: Enter opens the focused tab and Tab moves on to the next one.
  await tabs(page).getByRole("link", { name: "Details", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(openTab(page)).toHaveText("Details");
  await expect(studentDetails(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(tabs(page).getByRole("link", { name: "Employment", exact: true })).toBeFocused();

  // Unknown tabs fall back to Details; evidence links that predate the tabs open Employment.
  await page.goto(`${PROFILE}?tab=nonsense`);
  await expect(openTab(page)).toHaveText("Details");
  await expect(page).toHaveURL(/\/alumni\/000000000000000000000201$/);
  await page.goto(`${PROFILE}#evidence-000000000000000000000000`);
  await expect(openTab(page)).toHaveText("Employment");
  await expect(page).toHaveURL(/\?tab=employment#evidence-000000000000000000000000$/);
  await expect(evidence(page)).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
    for (const tab of ["details", "employment", "tracking", "history"]) {
      await page.goto(tab === "details" ? PROFILE : `${PROFILE}?tab=${tab}`);
      await expect(openTab(page)).toBeVisible();
      await expectAccessibleAndFitting(page);
      await page.screenshot({ path: info.outputPath(`${tab}-${theme}.png`), fullPage: true });
    }
  }
});

test("faculty trackers get no Change history tab, even from the address", async ({
  page,
  request,
}) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`, { data: { roleLevel: "faculty" } });
  await request.post(`${FIXTURE}/assign-staff`);
  await signIn(page, "staff@example.test", "dashboard");
  await page.goto(`${PROFILE}?tab=history`);
  await expect(tabs(page).getByRole("link")).toHaveText(["Details", "Employment", "Tracking"]);
  await expect(openTab(page)).toHaveText("Details");
  await expect(page).toHaveURL(/\/alumni\/000000000000000000000201$/);
  await expect(studentDetails(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Change history" })).toHaveCount(0);
});

test("Alumni switch between Employment and Evidence on My profile", async ({
  page,
  request,
}, info) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/alumni`);
  await signIn(page, "alumni@example.test", "my-profile");

  await expect(tabs(page).getByRole("link")).toHaveText(["Employment", "Evidence"]);
  await expect(openTab(page)).toHaveText("Employment");
  await expect(addEmployment(page)).toBeVisible();
  await expect(evidence(page)).toHaveCount(0);

  await openProfileTab(page, "Evidence");
  await expect(page).toHaveURL(/\/my-profile\?tab=evidence$/);
  await expect(evidence(page)).toBeVisible();
  await expect(addEmployment(page)).toHaveCount(0);
  await page.reload();
  await expect(openTab(page)).toHaveText("Evidence");
  await expectAccessibleAndFitting(page);
  await page.screenshot({ path: info.outputPath("my-profile-evidence.png"), fullPage: true });

  // Staff-only sections never become tabs for Alumni.
  await page.goto("/my-profile?tab=tracking");
  await expect(openTab(page)).toHaveText("Employment");
  await expect(page).toHaveURL(/\/my-profile$/);
  await expect(page.getByText(/^(Tracked|Untracked)$/)).toHaveCount(0);
  await expectAccessibleAndFitting(page);
});

test("a slow alumni profile shows a page-shaped skeleton instead of a spinner", async ({
  page,
  request,
}, info) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await signIn(page, "staff@example.test", "dashboard");
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/v1\/alumni\/000000000000000000000201$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(PROFILE);
  const loading = page.getByRole("status").filter({ hasText: "Loading" });
  await expect(loading).toBeVisible();
  await expect(loading.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  // The profile request is still held, so check without waiting for the network to go idle.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("profile-skeleton.png"), fullPage: true });
  release();
  await expect(page.locator("h1")).toHaveText("Test Alumni");
  await expect(loading).toHaveCount(0);
});
