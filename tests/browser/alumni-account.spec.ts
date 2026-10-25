import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Alumni save country-specific phone numbers and use focused profile and account pages", async ({
  page,
  request,
}, info) => {
  test.setTimeout(180_000);
  await request.post("http://127.0.0.1:3100/__test/reset");
  await request.post("http://127.0.0.1:3100/__test/alumni");
  await request.post("http://127.0.0.1:3100/__test/local-contact-policy", {
    data: { enabled: true },
  });
  await page.goto("/login");
  await page.locator("#email").fill("alumni@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/my-profile");
  await expect(
    page.getByRole("heading", { name: "Supporting evidence", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personal details", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Choose profile photo")).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("combobox", { name: "Gender", exact: true }).selectOption("Male");
  const countries = page.getByRole("combobox", { name: "Country calling code", exact: true });
  const phone = page.getByRole("textbox", { name: "Phone number", exact: true });
  await expect(countries).toHaveValue("PH");
  expect(await countries.locator("option").count()).toBeGreaterThan(200);
  for (const [country, national, canonical] of [
    ["US", "(213) 373-4253", "+12133734253"],
    ["GB", "020 7946 0958", "+442079460958"],
    ["AU", "0412 345 678", "+61412345678"],
  ] as const) {
    await countries.selectOption(country);
    await phone.fill(national);
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/profile") && response.request().method() === "PATCH",
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Save personal details", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await page.reload();
    await expect(countries).toHaveValue(country);
    const stored = await (await page.request.get("/api/auth/verification")).json();
    expect(stored.phoneNumber).toBe(canonical);
    expect(stored.phoneVerified).toBe(false);
  }
  await phone.fill("+81 90-1234-5678");
  await expect(countries).toHaveValue("JP");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/profile") && response.request().method() === "PATCH",
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Save personal details", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(countries).toHaveValue("JP");
  expect((await (await page.request.get("/api/auth/verification")).json()).phoneNumber).toBe(
    "+819012345678",
  );

  for (const width of info.project.name === "mobile" ? [375] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
      for (const route of ["my-profile", "settings"]) {
        await page.goto(`/${route}`);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1")).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`${route}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
});
