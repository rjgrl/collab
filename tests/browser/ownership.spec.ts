import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
});

test("Alumni with historical MFA enrollment edit personal details only in Settings Account", async ({
  page,
  request,
}, testInfo) => {
  await request.post("http://127.0.0.1:3100/__test/alumni");
  await request.post("http://127.0.0.1:3100/__test/local-contact-policy", {
    data: { enabled: true },
  });
  await signIn(page, "alumni@example.test");
  await expect(page).toHaveURL(/\/my-profile$/);
  await expect(page.getByRole("heading", { name: "My Profile", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alumni", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("textbox", { name: "First name", exact: true }).fill("María José");
  await page.getByRole("textbox", { name: "Middle name (optional)", exact: true }).fill("");
  await page.getByRole("textbox", { name: "Last name", exact: true }).fill("Dela Cruz-O’Neill");
  await page
    .getByRole("combobox", { name: "Name extension / suffix (optional)", exact: true })
    .fill("de la Casa");
  await page.getByRole("textbox", { name: "Phone number", exact: true }).fill("+639171234567");
  await page.getByRole("combobox", { name: "Gender", exact: true }).selectOption("Female");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/profile") && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save personal details", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveValue(
    "María José",
  );
  await expect(
    page.getByRole("combobox", { name: "Name extension / suffix (optional)", exact: true }),
  ).toHaveValue("de la Casa");
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.name).toBe("María José Dela Cruz-O’Neill de la Casa");
  expect(me.mfaRequired).toBe(false);
  expect(me.mfaEnrolled).toBe(true);
  expect(me.mfaVerified).toBe(false);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("my-profile.png"), fullPage: true });
  await page.goto("/alumni/000000000000000000000202");
  await expect(page).toHaveURL(/\/my-profile$/);
});

test("Alumni cannot use direct URLs or submitted identifiers to reach management resources", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/alumni");
  await signIn(page, "alumni@example.test");
  await page.waitForURL("**/my-profile");
  const headers = { Origin: "http://127.0.0.1:3101" };
  for (const path of [
    "/api/alumni",
    "/api/alumni/000000000000000000000202",
    "/api/users",
    "/api/roles",
    "/api/dashboard",
    "/api/reports",
  ])
    expect((await page.request.get(path)).status()).toBe(403);
  for (const body of [
    { alumniId: "000000000000000000000202" },
    { userId: "000000000000000000000001" },
    { roles: ["super_admin"] },
    { studentNumber: "FORGED" },
    { programId: "000000000000000000000302" },
    { isTracked: false },
  ]) {
    expect((await page.request.patch("/api/me/profile", { headers, data: body })).status()).toBe(
      400,
    );
  }
  expect(
    (
      await page.request.patch("/api/alumni/000000000000000000000202", {
        headers,
        data: { firstName: "FORGED" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/alumni/000000000000000000000202/employments", {
        headers,
        data: { employer: "FORGED" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/alumni/000000000000000000000202/tracking-events", {
        headers,
        data: { isTracked: true },
      })
    ).status(),
  ).toBe(403);
});

test("Staff with historical MFA enrollment retain management access without a challenge", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/staff");
  await signIn(page, "staff@example.test");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/alumni");
  await expect(page.getByRole("heading", { name: "Alumni", exact: true })).toBeVisible();
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.mfaRequired).toBe(false);
  expect(me.mfaEnrolled).toBe(true);
  expect((await page.request.get("/api/alumni")).status()).toBe(200);
});

test("signing into another account clears the prior private profile cache before refetch", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/alumni");
  await request.post("http://127.0.0.1:3100/__test/other-alumni");
  await signIn(page, "alumni@example.test");
  await page.waitForURL("**/my-profile");
  await expect(page.getByRole("heading", { name: "Test Alumni", exact: true })).toBeVisible();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/me/profile", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await signIn(page, "other.alumni@example.test");
    await page.waitForURL("**/my-profile");
    await expect(
      page.getByRole("status").filter({ hasText: "Loading your profile" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test Alumni", exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { name: "Second Graduate", exact: true })).toBeVisible();
});
