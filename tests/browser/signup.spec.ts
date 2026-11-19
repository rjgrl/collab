import { selectOption } from "./select-helper";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

async function expectCenteredPanels(page: Page, height: number) {
  const panels = page.locator("main > div");
  const left = (await panels.nth(0).boundingBox())!;
  const right = (await panels.nth(1).boundingBox())!;
  const content = (await panels.nth(1).locator(":scope > div").boundingBox())!;
  expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(content.x + content.width / 2 - (right.x + right.width / 2))).toBeLessThanOrEqual(
    2,
  );
  expect(Math.abs(content.y + content.height / 2 - height / 2)).toBeLessThanOrEqual(2);
}

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
});

test("signed-out branding uses the university seal and tinted building", async ({
  page,
}, testInfo) => {
  const seal = page.locator('img[src="/brand/buksu-cot-seal.webp"]:visible');
  await expect(seal).toHaveCount(1);
  expect(await seal.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  const building = page.locator('img[src="/brand/cot-building.webp"]');
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(building).toBeVisible();
    expect(
      await building.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);
    await expect(
      page.getByText("Keep Every Graduate Connected to Bukidnon State University."),
    ).toBeVisible();
    await expect(
      page.getByText("Academic leaders monitor progress across their scope"),
    ).toBeVisible();
  } else {
    await expect(building).toBeHidden();
  }
});

test("signup collects contact details and rejects an existing email", async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/alumni", { data: { institutional: true } });
  // The institutional-email reminder belongs to sign-up, not sign-in.
  const reminder = "Use your BukSU institutional email. Personal email addresses are not accepted.";
  await expect(page.getByText(reminder)).toHaveCount(0);
  await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveAccessibleDescription(reminder);
  await expect(page.getByText(reminder)).toBeVisible();
  await page.getByRole("textbox", { name: "First Name", exact: true }).fill("Duplicate");
  await page.getByRole("textbox", { name: "Last Name", exact: true }).fill("Account");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("ALUMNI@STUDENT.BUKSU.EDU.PH");
  const phone = page.getByRole("textbox", { name: "Phone Number", exact: true });
  await expect(phone).toHaveAttribute("required", "");
  await phone.fill("+639171234567");
  const gender = page.getByRole("combobox", { name: "Gender", exact: true });
  await expect(gender).toHaveAttribute("aria-required", "true");
  await gender.click();
  await expect(page.getByRole("option")).toHaveText(["Select Gender", "Male", "Female"]);
  await page.keyboard.press("Escape");
  await selectOption(gender, "Female");
  await page.getByRole("button", { name: "Add Facebook Profile", exact: true }).click();
  const facebook = page.getByRole("textbox", { name: "Facebook Profile Link (Optional)" });
  await expect(facebook).toBeFocused();
  await expect(facebook).toHaveAttribute("type", "url");
  await expect(facebook).not.toHaveAttribute("required");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Student Number", exact: true }).fill("NEW-SYNTHETIC");
  await selectOption(
    page.getByRole("combobox", { name: "Degree Program", exact: true }),
    "000000000000000000000302",
  );
  await page.locator("#password").fill("SyntheticPassword123!");
  await page.getByLabel(/^Confirm Password/).fill("SyntheticPassword123!");
  const year = page.getByRole("spinbutton", { name: "Graduation Year", exact: true });
  await expect(year).toHaveAttribute("required", "");
  expect(await year.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  await year.fill("2024");
  const response = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/auth/signup"),
  );
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  expect((await response).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("Google is available in both modes when configured and enabled", async ({ page, request }) => {
  // Hidden (not a disabled placeholder) while Google sign-in is off, in both modes.
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In with Google" })).toHaveCount(0);
  await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
  await expect(page.getByRole("button", { name: "Sign Up with Google" })).toHaveCount(0);
  await request.post("http://127.0.0.1:3100/__test/google");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign In with Google" })).toHaveAttribute(
    "href",
    "/api/auth/google",
  );
  await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
  await expect(page.getByRole("button", { name: "Sign Up with Google" })).toHaveAttribute(
    "href",
    "/api/auth/google",
  );
});

test("signup stores separated compound names and the actual custom suffix", async ({ page }) => {
  await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
  await page.getByRole("textbox", { name: "First Name", exact: true }).fill("  María José  ");
  await page.getByRole("textbox", { name: "Last Name", exact: true }).fill("Dela Cruz-O’Neill");
  await expect(page.getByRole("textbox", { name: "Middle Name (Optional)" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Middle Name or Suffix", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Name Extension / Suffix (Optional)", exact: true })
    .fill("de la Casa");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("structured.names@student.buksu.edu.ph");
  await page.getByRole("textbox", { name: "Phone Number", exact: true }).fill("+639171234567");
  await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Female");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Student Number", exact: true }).fill("NEW-SYNTHETIC");
  await selectOption(
    page.getByRole("combobox", { name: "Degree Program", exact: true }),
    "000000000000000000000302",
  );
  await page.locator("#password").fill("SyntheticPassword123!");
  await page.getByLabel(/^Confirm Password/).fill("SyntheticPassword123!");
  await page.getByRole("spinbutton", { name: "Graduation Year", exact: true }).fill("2024");
  const signupRequest = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/auth/signup"),
  );
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  const payload = (await signupRequest).postDataJSON();
  expect(payload.password).toBe("SyntheticPassword123!");
  expect(Object.keys(payload).some((key) => /confirm/i.test(key))).toBe(false);
  await page.waitForURL("**/complete-profile");
  const user = await (await page.request.get("/api/auth/me")).json();
  expect(user.firstName).toBe("María José");
  expect(user.middleName).toBe("");
  expect(user.lastName).toBe("Dela Cruz-O’Neill");
  expect(user.suffix).toBe("de la Casa");
  expect(user.name).toBe("María José Dela Cruz-O’Neill de la Casa");
  expect((await page.request.get("/api/alumni")).status()).toBe(403);
});

test("existing password accounts can save missing contact details", async ({ page, request }) => {
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await enrollAdministrator(page);
  await request.post("http://127.0.0.1:3100/__test/incomplete");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/complete-profile$/);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("textbox", { name: "Phone Number", exact: true }).fill("+639171234567");
  await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Male");
  await page.getByRole("button", { name: "Save Contact Details" }).click();
  await page.waitForURL("**/dashboard");
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("both sign-up steps fit laptop screens and retain entries when going back", async ({
  page,
}, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  let signupRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/auth/signup")) signupRequests++;
  });
  const sizes = desktop
    ? [
        { width: 1440, height: 900 },
        { width: 1366, height: 768 },
      ]
    : [
        { width: 390, height: 844 },
        { width: 320, height: 640 },
      ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto("/login");
    await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
    await expect(page.getByRole("heading", { name: "Step 1: Personal Details" })).toBeFocused();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Degree Program", exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("textbox", { name: "First Name", exact: true }).fill("Maria");
    await page.getByRole("textbox", { name: "Last Name", exact: true }).fill("Santos");
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("steps@student.buksu.edu.ph");
    await page.getByRole("textbox", { name: "Phone Number", exact: true }).fill("+639171234567");
    await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Female");
    if (desktop) {
      await expectCenteredPanels(page, size.height);
      await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeInViewport({
        ratio: 1,
      });
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        size.height,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`signup-personal-${size.width}.png`),
      fullPage: true,
    });
    await page.getByRole("textbox", { name: "Email", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Step 2: Studies and Password" })).toBeFocused();
    expect(signupRequests).toBe(0);
    const submit = page.getByRole("button", { name: "Create Account", exact: true });
    await expect(submit).toBeDisabled();
    await page.getByRole("textbox", { name: "Student Number", exact: true }).fill("KEPT-123");
    await page.getByRole("spinbutton", { name: "Graduation Year", exact: true }).fill("2024");
    await page.locator("#password").fill("SyntheticPassword123!");
    await page.getByLabel(/^Confirm Password/).fill("SyntheticPassword123!");
    if (desktop) {
      await expectCenteredPanels(page, size.height);
      await expect(submit).toBeInViewport({ ratio: 1 });
      await expect(
        page.getByRole("button", { name: "Already registered? Sign In" }),
      ).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        size.height,
      );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
    await page.screenshot({
      path: testInfo.outputPath(`signup-studies-${size.width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "First Name", exact: true })).toHaveValue(
      "Maria",
    );
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(
      "steps@student.buksu.edu.ph",
    );
    await expect(page.getByRole("combobox", { name: "Gender", exact: true })).toContainText(
      "Female",
    );
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Student Number", exact: true })).toHaveValue(
      "KEPT-123",
    );
    await expect(page.locator("#password")).toHaveValue("SyntheticPassword123!");
    await expect(page.getByLabel(/^Confirm Password/)).toHaveValue("SyntheticPassword123!");
    await expect(
      page.getByRole("spinbutton", { name: "Graduation Year", exact: true }),
    ).toHaveValue("2024");
  }
});
