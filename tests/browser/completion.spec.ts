import { selectOption } from "./select-helper";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
});
test("managed members default to Staff while Alumni self-register and legacy records remain visible", async ({
  page,
  request,
}, info) => {
  await request.post("http://127.0.0.1:3100/__test/alumni", { data: { unlinked: true } });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  await page.goto("/settings/users");
  await expect(page.getByRole("button", { name: "Link alumni profile", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Add user", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add user", exact: true });
  await expect(dialog.getByRole("checkbox", { name: "Staff", exact: true })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Super Admin", exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  for (const name of ["Alumni", "Viewer"])
    await expect(dialog.getByRole("checkbox", { name, exact: true })).toHaveCount(0);
  for (const name of [
    "Phone number",
    "Student number",
    "Gender",
    "Degree program",
    "Facebook profile link",
  ])
    await expect(dialog.getByLabel(name, { exact: true })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "First name", exact: true }).fill("Managed");
  await dialog.getByRole("textbox", { name: "Last name", exact: true }).fill("Staff");
  await dialog.getByRole("textbox", { name: "Email", exact: true }).fill("managed@example.test");
  await dialog.locator("#password").fill("Synthetic managed staff passphrase 123!");
  await dialog.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const member = page.getByRole("row").filter({ hasText: "managed@example.test" });
  await expect(member.getByRole("cell", { name: "Test Staff", exact: true })).toBeVisible();
  await page.goto("/alumni");
  await expect(page.getByRole("button", { name: "Add alumni", exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/Alumni self-register to create their account and profile/),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "managed@example.test" })).toHaveCount(0);
  const pending = page.getByRole("row").filter({ hasText: "alumni@example.test" });
  await expect(pending.getByText("Awaiting profile completion", { exact: true })).toBeVisible();
  await page.goto("/alumni/new");
  await expect(page).toHaveURL(/\/alumni$/);
  await expect(page.getByRole("dialog", { name: "Add alumni", exact: true })).toHaveCount(0);
  await expect(pending).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("alumni-accounts.png"), fullPage: true });
});

test("legacy Alumni accounts complete missing academic details before entering the application", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/alumni", { data: { unlinked: true } });
  await request.post("http://127.0.0.1:3100/__test/local-contact-policy", {
    data: { enabled: true },
  });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("alumni@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/complete-profile");
  await page.getByRole("textbox", { name: "Phone number", exact: true }).fill("+639171234569");
  await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Male");
  await page.getByRole("textbox", { name: "Student number", exact: true }).fill("LEGACY-NEW-001");
  await selectOption(
    page.getByRole("combobox", { name: "Degree program", exact: true }),
    "000000000000000000000302",
  );
  await page.getByRole("spinbutton", { name: "Graduation year", exact: true }).fill("2020");
  await page.getByRole("button", { name: "Save contact details", exact: true }).click();
  await page.waitForURL("**/my-profile");
  expect((await (await page.request.get("/api/me/profile")).json()).studentNumber).toBe(
    "LEGACY-NEW-001",
  );
  await expect(page.getByTestId("account-role")).toHaveText("Alumni");
});

test("local Alumni registration persists academic identity, employment and owned files without contact delivery", async ({
  page,
  request,
}, info) => {
  await request.post("http://127.0.0.1:3100/__test/local-contact-policy", {
    data: { enabled: true },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await page.getByRole("textbox", { name: "First name", exact: true }).fill("María José");
  await page.getByRole("textbox", { name: "Last name", exact: true }).fill("Dela Cruz");
  await page.getByLabel("Name extension / suffix (optional)").fill("de la Casa");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("registered.alumni@example.test");
  await page.getByRole("textbox", { name: "Phone number", exact: true }).fill("+639171234567");
  await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Female");
  await page.getByRole("textbox", { name: "Student number", exact: true }).fill("REGISTERED-001");
  await selectOption(
    page.getByRole("combobox", { name: "Degree program", exact: true }),
    "000000000000000000000302",
  );
  await page.locator("#password").fill("A synthetic university password 123!");
  await page.getByRole("spinbutton", { name: "Graduation year", exact: true }).fill("2024");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL("**/my-profile");
  await expect(page.getByTestId("account-role")).toHaveText("Alumni");
  const initial = await (await page.request.get("/api/auth/verification")).json();
  expect(initial.emailVerified).toBe(false);
  expect(initial.phoneVerified).toBe(false);
  expect(initial.ready).toBe(true);
  await expect(page.getByRole("link", { name: "Alumni", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add employment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add employment", exact: true });
  await dialog.getByRole("textbox", { name: "Employer", exact: true }).fill("Synthetic University");
  await dialog.getByRole("textbox", { name: "Position", exact: true }).fill("Graduate researcher");
  await dialog.getByRole("textbox", { name: "Industry", exact: true }).fill("Education");
  await dialog.getByRole("textbox", { name: "Location", exact: true }).fill("Manila");
  await dialog.getByLabel("Start date", { exact: true }).fill("2025-01-01");
  await dialog.getByRole("checkbox", { name: "This is my current job" }).check();
  await page.getByRole("button", { name: "Save employment", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Synthetic University/ })).toBeVisible();
  await expect(page.getByText("Graduate researcher", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Edit Synthetic University/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Position", exact: true })
    .fill("Research fellow");
  await page.getByRole("button", { name: "Save employment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Research fellow", { exact: true })).toBeVisible();
  await selectOption(page.getByLabel("Related employment (optional)"), {
    label: "Synthetic University",
  });
  await page
    .getByLabel("Choose evidence file")
    .setInputFiles({ name: "Employment proof.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(page.getByText("Upload complete.", { exact: true })).toBeVisible();
  const preview = page.getByRole("link", { name: "Preview Employment proof.png", exact: true });
  const fileResponse = await page.request.get((await preview.getAttribute("href"))!);
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-disposition"]).toContain("inline");
  await expect(page.getByLabel("File purpose")).toHaveCount(0);
  await expect(page.getByLabel("Choose profile photo")).toHaveCount(0);
  await page.goto("/settings");
  const personal = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Personal details", exact: true }) });
  const photo = personal.getByRole("region", { name: "Profile photo", exact: true });
  await expect(photo).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Preview Employment proof.png", exact: true }),
  ).toHaveCount(0);
  await photo
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles({ name: "Profile photo.png", mimeType: "image/png", buffer: png });
  const uploadResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/me/photo") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload photo", exact: true }).click();
  expect((await uploadResponse).status()).toBe(201);
  await expect(photo.getByRole("img", { name: /profile photo$/ })).toBeVisible();
  await expect
    .poll(() =>
      photo
        .getByRole("img", { name: /profile photo$/ })
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.mouse.move(0, 0);
  // Audit a stable frame after the transient success toast has finished fading.
  await expect(page.getByText("Profile photo updated", { exact: true })).toHaveCount(0, {
    timeout: 10000,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("account-profile-photo.png"), fullPage: true });
  await page.reload();
  await expect(photo.getByRole("img", { name: /profile photo$/ })).toBeVisible();
  await page.goto("/my-profile");
  await expect(page.getByRole("img", { name: /profile photo$/ })).toHaveCount(1);
  await expect(page.locator("header img")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Preview Profile photo.png", exact: true }),
  ).toHaveCount(0);
  await expect(preview).toBeVisible();
  await page.screenshot({ path: info.outputPath("my-profile-complete.png"), fullPage: true });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove Employment proof.png", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await page.goto("/statistics");
  await expect(page.getByText("Totals withheld for privacy.", { exact: false })).toBeVisible();
  await request.post("http://127.0.0.1:3100/__test/local-contact-policy", {
    data: { enabled: false },
  });
  await page.goto("/my-profile");
  await expect(page).toHaveURL(/\/complete-profile$/);
  const strict = await (await page.request.get("/api/auth/verification")).json();
  expect(strict.emailVerified).toBe(false);
  expect(strict.phoneVerified).toBe(false);
  expect(strict.ready).toBe(false);
});

test("Staff persist employment edits and archives without Faculty navigation", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/staff");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("staff@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByTestId("account-role")).toHaveText("Staff");
  await expect(page.getByRole("link", { name: "Faculty", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/faculty")).status()).toBe(404);
  await page.goto("/alumni/000000000000000000000201");
  await page.getByRole("button", { name: "Add employment", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Employer", exact: true })
    .fill("Synthetic Staff Employer");
  await page.getByRole("button", { name: "Save employment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Synthetic Staff Employer", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Position", exact: true })
    .fill("Updated by staff");
  await page.getByRole("button", { name: "Save employment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Updated by staff", { exact: true })).toBeVisible();
  await page.goto("/alumni");
  const profileRow = page
    .getByRole("row")
    .filter({ has: page.locator('a[href="/alumni/000000000000000000000201"]') });
  await expect(profileRow.getByText("Profile only", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await profileRow.getByRole("button", { name: /^Archive / }).click();
  await expect(profileRow).toHaveCount(0);
  expect((await page.request.get("/api/alumni/000000000000000000000201")).status()).toBe(404);
  expect((await (await page.request.get("/api/dashboard")).json()).graduates).toBe(1);
});
