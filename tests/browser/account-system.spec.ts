import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
  "base64",
);
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function upload(page: Page, filename: string) {
  await page.goto("/settings");
  const personal = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Personal details", exact: true }) });
  const photo = personal.getByRole("region", { name: "Profile photo", exact: true });
  await photo
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles({ name: filename, mimeType: "image/png", buffer: png });
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/me/photo") && r.request().method() === "POST",
  );
  await photo.getByRole("button", { name: /Upload photo|Replace photo/ }).click();
  expect((await response).status()).toBe(201);
  await expect(photo.getByRole("img", { name: /profile photo$/ })).toBeVisible();
  await expect
    .poll(() => photo.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator("header img")).toBeVisible();
  const image = await page.locator("header img").getAttribute("src");
  await expect(photo.getByRole("button", { name: "Remove photo", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.locator("header img")).toHaveAttribute("src", image!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return image!;
}

test("all account roles share personal photo controls and email changes require fresh confirmation", async ({
  page,
  request,
  browser,
}, info) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await request.post("http://127.0.0.1:3100/__test/reset");
  await request.post("http://127.0.0.1:3100/__test/staff");
  await request.post("http://127.0.0.1:3100/__test/alumni");
  await signIn(page, "admin@example.test");
  await enrollAdministrator(page);
  const adminPhoto = await upload(page, "Administrator photo.png");
  expect((await page.request.get(adminPhoto)).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Profile photo", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("admin-personal-details.png"), fullPage: true });

  // A second session proves revocation without bypassing the first session's MFA.
  await request.post("http://127.0.0.1:3101/api/auth/login", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: { email: "admin@example.test", password: "BrowserTest123!" },
  });
  expect((await (await request.get("http://127.0.0.1:3101/api/auth/me")).json()).email).toBe(
    "admin@example.test",
  );
  await page.getByRole("button", { name: "Change email", exact: true }).click();
  const change = page.getByRole("dialog", { name: "Change email address", exact: true });
  await change.getByLabel("New email address").fill("renamed.admin@example.test");
  await change.getByLabel("Current password").fill("incorrect");
  await change.getByRole("button", { name: "Send confirmation code", exact: true }).click();
  await expect(change.getByRole("alert")).toContainText("password is incorrect");
  await change.getByLabel("Current password").fill("BrowserTest123!");
  await change.getByRole("button", { name: "Send confirmation code", exact: true }).click();
  await expect(change.getByLabel("New email confirmation code")).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).email).toBe("admin@example.test");
  expect((await (await page.request.get("/api/auth/verification")).json()).pendingEmail).toBe(
    "renamed.admin@example.test",
  );
  await page.screenshot({ path: info.outputPath("pending-email-change.png"), fullPage: true });
  const { emailCode } = await (await request.get("http://127.0.0.1:3100/__test/code")).json();
  await change
    .getByLabel("New email confirmation code")
    .fill(emailCode === "000000" ? "111111" : "000000");
  await change.getByRole("button", { name: "Confirm new email", exact: true }).click();
  await expect(change.getByRole("alert")).toContainText("incorrect");
  await change.getByLabel("New email confirmation code").fill(emailCode);
  await change.getByRole("button", { name: "Confirm new email", exact: true }).click();
  await expect(change).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Email verification", exact: true })).toHaveText(
    "Verified",
  );
  const updated = await (await page.request.get("/api/auth/me")).json();
  expect(updated.email).toBe("renamed.admin@example.test");
  expect(updated.mfaVerified).toBe(true);
  expect(await (await request.get("http://127.0.0.1:3101/api/auth/me")).json()).toBeNull();
  await page.reload();
  await expect(page.getByText("renamed.admin@example.test", { exact: true })).toBeVisible();

  const roles = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
    viewport: page.viewportSize() ?? undefined,
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  try {
    const member = await roles.newPage();
    await signIn(member, "staff@example.test");
    await member.waitForURL("**/dashboard");
    const staffPhoto = await upload(member, "Staff photo.png");
    await member.screenshot({
      path: info.outputPath("staff-personal-details.png"),
      fullPage: true,
    });
    await signIn(member, "alumni@example.test");
    await member.waitForURL("**/my-profile");
    expect((await member.request.get(staffPhoto)).status()).toBe(403);
    const alumniPhoto = await upload(member, "Alumni photo.png");
    await member.goto("/my-profile");
    await expect(member.getByRole("img", { name: /profile photo$/ })).toBeVisible();
    await expect(member.locator("header img")).toHaveAttribute("src", alumniPhoto);
    await member.screenshot({ path: info.outputPath("alumni-profile-avatar.png"), fullPage: true });
    await page.goto("/alumni/000000000000000000000201");
    await expect(page.getByRole("heading", { name: "Profile photo", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Supporting evidence", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("File purpose")).toHaveCount(0);
    expect((await page.request.get(alumniPhoto)).status()).toBe(200);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath("admin-alumni-photo-evidence.png"),
      fullPage: true,
    });
    await member.goto("/settings");
    await member.getByRole("button", { name: "Remove photo", exact: true }).click();
    await expect(member.locator("header img")).toHaveCount(0);
    expect((await member.request.get(alumniPhoto)).status()).toBe(404);
    expect((await (await member.request.get("/api/me/profile")).json()).photoUrl).toBeNull();
  } finally {
    await roles.close();
  }
});
