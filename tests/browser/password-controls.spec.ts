import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { selectOption } from "./select-helper";

for (const theme of ["light", "dark"] as const) {
  test(`password visibility and confirmation work independently in ${theme} mode`, async ({
    page,
    request,
  }, info) => {
    await request.post("http://127.0.0.1:3100/__test/reset");
    await page.addInitScript((value) => localStorage.setItem("vite-ui-theme", value), theme);
    if (info.project.name === "desktop") await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    let authRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/auth\/(login|signup)$/.test(request.url()))
        authRequests++;
    });
    const password = page.locator("#password");
    const typed = "SyntheticPassword123!";
    await password.fill(typed);
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    const show = page.getByRole("button", { name: "Show Password", exact: true });
    await expect(show).toHaveAttribute("type", "button");
    await show.focus();
    await page.keyboard.press("Space");
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(typed);
    await expect(page.getByRole("button", { name: "Hide Password", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(authRequests).toBe(0);

    await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
    await page.getByRole("textbox", { name: "First Name", exact: true }).fill("Maria");
    await page.getByRole("textbox", { name: "Last Name", exact: true }).fill("Santos");
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("visibility@student.buksu.edu.ph");
    await page.getByRole("textbox", { name: "Phone Number", exact: true }).fill("+639171234567");
    await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Female");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await selectOption(
      page.getByRole("combobox", { name: "Degree Program", exact: true }),
      "000000000000000000000302",
    );
    await page.getByRole("textbox", { name: "Student Number", exact: true }).fill("VISIBILITY-123");
    await page.getByRole("spinbutton", { name: "Graduation Year", exact: true }).fill("2024");
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveAttribute("autocomplete", "new-password");
    const confirmation = page.getByLabel(/^Confirm Password/);
    await expect(confirmation).toHaveAccessibleName("Confirm Password");
    const submit = page.getByRole("button", { name: "Create Account", exact: true });
    await expect(confirmation).toHaveAttribute("required", "");
    await expect(confirmation).toHaveAttribute("autocomplete", "new-password");
    expect(await confirmation.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(
      false,
    );
    await expect(submit).toBeDisabled();
    await confirmation.fill("DifferentPassword123!");
    await confirmation.press("Tab");
    await expect(page.getByText("Passwords do not match.", { exact: true })).toBeVisible();
    await expect(confirmation).toHaveAttribute("aria-invalid", "true");
    await expect(submit).toBeDisabled();
    await page
      .locator("form")
      .evaluate((form) =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
    await expect(confirmation).toBeFocused();
    expect(authRequests).toBe(0);

    await confirmation.fill(typed);
    await expect(page.getByText("Passwords do not match.", { exact: true })).toHaveCount(0);
    await expect(submit).toBeEnabled();
    await page.getByRole("button", { name: "Show Password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(confirmation).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show Confirm Password", exact: true }).click();
    await expect(confirmation).toHaveAttribute("type", "text");
    await expect(confirmation).toHaveValue(typed);
    await page.getByRole("button", { name: "Hide Password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(confirmation).toHaveAttribute("type", "text");
    expect(authRequests).toBe(0);

    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(password).toHaveValue(typed);
    await expect(confirmation).toHaveValue(typed);
    await expect(password).toHaveAttribute("type", "password");
    await expect(confirmation).toHaveAttribute("type", "password");
    if (info.project.name === "desktop") {
      await expect(submit).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        768,
      );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`password-controls-${theme}.png`),
      fullPage: true,
    });
  });
}
