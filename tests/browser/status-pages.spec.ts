import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const FIXTURE = "http://127.0.0.1:3100/__test";
const PROFILE = "/alumni/000000000000000000000201";
const ORIGIN = { Origin: "http://127.0.0.1:3101" };

async function signIn(page: Page, email: string) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function expectAccessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

const atProfileTab = (tab: string) => (url: URL) =>
  url.pathname === PROFILE && url.search === `?tab=${tab}`;
const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const sessionEnded = (page: Page) =>
  page.getByRole("alertdialog", { name: "Your session has ended" });

test("unknown pages show a branded Page not found with a way home", async ({ page }, info) => {
  await page.goto("/no-such-page");
  await expect(heading(page, "Page not found")).toBeVisible();
  await expect(page.getByText("Error 404")).toBeVisible();
  await expect(page.getByText("Bukidnon State University")).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: info.outputPath("not-found.png"), fullPage: true });
  await page.getByRole("button", { name: "Go to home page", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("signed-in pages refuse what the role cannot open, inside the app", async ({
  page,
  request,
}, info) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await page.goto("/login");
  await signIn(page, "staff@example.test");
  await page.waitForURL("**/dashboard");

  await page.goto("/settings/backups");
  await expect(heading(page, "Access denied")).toBeVisible();
  await expect(page.getByText("Error 403")).toBeVisible();
  // Shown within the app: its header stays, and the status page adds no second brand header.
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Test Staff/ })).toBeVisible();
  await expect(heading(page, "Backups")).toHaveCount(0);
  await expectAccessible(page);
  await page.screenshot({ path: info.outputPath("access-denied.png"), fullPage: true });

  // A mistyped address inside the app is a 404 within the shell.
  await page.goto("/settings/no-such-section");
  await expect(heading(page, "Page not found")).toBeVisible();
  await expect(page.getByRole("button", { name: /Test Staff/ })).toBeVisible();
});

test("a page that cannot reach the server shows Something went wrong and recovers", async ({
  page,
}, info) => {
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.abort("connectionrefused"));
  await page.goto("/dashboard");
  await expect(heading(page, "Something went wrong")).toBeVisible();
  // No stack traces or raw error text reach the user.
  await expect(page.getByText(/TypeError|Failed to fetch|at \w+ \(/)).toHaveCount(0);
  await expectAccessible(page);
  await page.screenshot({ path: info.outputPath("error.png"), fullPage: true });
  await page.unroute(/\/api\/v1\/auth\/me$/);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);
});

async function signedInOnTrackingTab(page: Page, request: Page["request"]) {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await page.goto("/login");
  await signIn(page, "staff@example.test");
  await page.waitForURL("**/dashboard");
  await page.goto(`${PROFILE}?tab=tracking`);
  await expect(page.locator("h1")).toHaveText("Test Alumni");
  // The session is revoked behind the page's back (as on sign-out elsewhere or a password reset).
  expect((await page.request.post("/api/v1/auth/logout", { headers: ORIGIN })).status()).toBe(200);
}

test("when a session ends during an action, Okay leads to sign-in and back", async ({
  page,
  request,
}, info) => {
  await signedInOnTrackingTab(page, request);
  await page.getByRole("textbox", { name: "Tracking notes" }).fill("Called graduate");
  await page.getByRole("button", { name: "Mark tracked", exact: true }).click();
  const dialog = sessionEnded(page);
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(atProfileTab("tracking"));
  await expect(dialog).toContainText("Sign in again to continue where you left off.");
  const okay = dialog.getByRole("button", { name: "Okay", exact: true });
  await expect(okay).toBeFocused();
  // Escape does not dismiss it; only Okay does.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  // The refused request's error toast is cleared rather than stacked on the notice.
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  await expectAccessible(page);
  await page.screenshot({ path: info.outputPath("session-ended.png"), fullPage: true });

  await okay.click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(dialog).toHaveCount(0);
  await signIn(page, "staff@example.test");
  await expect(page).toHaveURL(atProfileTab("tracking"));
  await expect(page.getByRole("region", { name: "Tracking history" })).toBeVisible();
});

test("when a session ends before moving to another page, sign-in explains why", async ({
  page,
  request,
}) => {
  await signedInOnTrackingTab(page, request);
  await openProfileTabExpectingSignIn(page, "Employment");
  const dialog = sessionEnded(page);
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await dialog.getByRole("button", { name: "Okay", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await signIn(page, "staff@example.test");
  await expect(page).toHaveURL(atProfileTab("employment"));
});

async function openProfileTabExpectingSignIn(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Profile sections" })
    .getByRole("link", { name, exact: true })
    .click();
}

test("signing out on purpose, or a wrong password, never shows the session notice", async ({
  page,
  request,
}) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await page.goto("/login");
  await signIn(page, "staff@example.test");
  await page.waitForURL("**/dashboard");
  await page.getByRole("button", { name: /Test Staff/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.locator("#email").fill("staff@example.test");
  await page.locator("#password").fill("A wrong password 12345!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(sessionEnded(page)).toHaveCount(0);
});

test("sign-in ignores return addresses that leave the site", async ({ page, request }) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await page.goto("/login?redirect=%2F%2Fevil.example%2Fsteal");
  await signIn(page, "staff@example.test");
  await page.waitForURL("**/dashboard");
  expect(new URL(page.url()).host).toBe("127.0.0.1:3101");
});
