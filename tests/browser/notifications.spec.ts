import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
  "base64",
);

test("Alumni evidence uploads notify Staff for review without marking the profile tracked", async ({
  page,
  request,
  browser,
}, info) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await request.post("http://127.0.0.1:3100/__test/staff");
  await request.post("http://127.0.0.1:3100/__test/alumni");
  const staffContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const staff = await staffContext.newPage();
    await staff.goto("/login");
    await staff.locator("#email").fill("staff@example.test");
    await staff.locator("#password").fill("BrowserTest123!");
    await staff.getByRole("button", { name: "Sign in", exact: true }).click();
    await staff.waitForURL("**/dashboard");
    const untrack = await staff.request.post(
      "/api/alumni/000000000000000000000201/tracking-events",
      {
        headers: { Origin: "http://127.0.0.1:3101" },
        data: { isTracked: false, source: "manual", notes: "Awaiting evidence" },
      },
    );
    expect(untrack.status()).toBe(201);
    await page.goto("/login");
    await page.locator("#email").fill("alumni@example.test");
    await page.locator("#password").fill("BrowserTest123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/my-profile");
    await expect(page.getByRole("heading", { name: "Personal details", exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel("Choose evidence file").setInputFiles({
      name: "Tracking proof.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.getByRole("button", { name: "Upload file", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Preview Tracking proof.png", exact: true }),
    ).toBeVisible();
    expect((await (await page.request.get("/api/me/profile")).json()).isTracked).toBe(false);
    expect((await (await page.request.get("/api/notifications")).json()).items).toEqual([]);
    const headers = { Origin: "http://127.0.0.1:3101" };
    const photo = await page.request.post("/api/me/files", {
      headers,
      multipart: {
        kind: "image",
        file: { name: "Portrait.png", mimeType: "image/png", buffer: png },
      },
    });
    expect(photo.status()).toBe(201);
    const invalid = await page.request.post("/api/me/files", {
      headers,
      multipart: {
        kind: "evidence",
        file: { name: "Invalid.png", mimeType: "image/png", buffer: Buffer.from("invalid-image") },
      },
    });
    expect(invalid.status()).toBe(400);
    const managed = await staff.request.post("/api/files/evidence", {
      headers,
      multipart: {
        alumniId: "000000000000000000000201",
        kind: "evidence",
        file: { name: "Staff-proof.png", mimeType: "image/png", buffer: png },
      },
    });
    expect(managed.status()).toBe(201);
    const reviewFeed = await (await staff.request.get("/api/notifications")).json();
    expect(reviewFeed.items).toHaveLength(1);
    expect(reviewFeed.unreadCount).toBe(1);
    await staff.getByTestId("notifications-bell").click();
    const notice = staff.getByRole("menuitem", {
      name: /Test Alumni.*Tracking proof.png.*tracking review/,
    });
    await expect(notice).toBeVisible();
    await expect(staff.getByTestId("notifications-bell")).toHaveAccessibleName(
      "Notifications, 1 unread",
    );
    expect((await new AxeBuilder({ page: staff }).analyze()).violations).toEqual([]);
    await staff.screenshot({
      path: info.outputPath("staff-evidence-notification.png"),
      fullPage: true,
    });
    await notice.click();
    await staff.waitForURL(/\/alumni\/000000000000000000000201#evidence-/);
    await expect(
      staff.getByRole("link", { name: "Preview Tracking proof.png", exact: true }),
    ).toBeVisible();
    await expect(staff.getByTestId("notifications-bell")).toHaveAccessibleName("Notifications");
    const file = await staff.request.get(
      (await staff
        .getByRole("link", { name: "Preview Tracking proof.png", exact: true })
        .getAttribute("href"))!,
    );
    expect(file.status()).toBe(200);
    await staff.reload();
    await expect(staff.getByTestId("notifications-bell")).toHaveAccessibleName("Notifications");
    const notification = (await (await staff.request.get("/api/notifications")).json()).items[0];
    expect(notification.readAt).toBeTruthy();
    expect(
      (
        await page.request.patch(`/api/notifications/${notification.id}/read`, {
          headers: { Origin: "http://127.0.0.1:3101" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await staffContext.close();
  }
});
