import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { selectOption } from "./select-helper";

test("styled dropdowns support keyboard, custom suffixes and both themes", async ({
  page,
  request,
}, info) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  for (const theme of ["light", "dark"]) {
    await page.goto("/login");
    await page.evaluate((value) => localStorage.setItem("vite-ui-theme", value), theme);
    await page.reload();
    await page.getByRole("button", { name: "Need an account? Sign up" }).click();
    const suffix = page.getByRole("combobox", {
      name: "Name extension / suffix (optional)",
      exact: true,
    });
    await suffix.click();
    await expect(page.getByRole("option")).toHaveText(["Jr.", "Sr.", "II", "III", "IV", "V"]);
    await expect(page.locator('[data-slot="autocomplete-content"]')).toBeVisible();
    await suffix.press("ArrowDown");
    await suffix.press("Enter");
    await expect(suffix).toHaveValue("Jr.");
    await suffix.fill("de la Casa");
    await suffix.press("Escape");
    await expect(suffix).toBeFocused();
    await suffix.press("Tab");
    await expect(suffix).toHaveValue("de la Casa");
    await suffix.fill("");
    await page.getByRole("button", { name: "Show suggestions", exact: true }).click();
    await page.getByRole("option", { name: "III", exact: true }).click();
    await expect(suffix).toHaveValue("III");

    const gender = page.getByRole("combobox", { name: "Gender", exact: true });
    expect(
      await page
        .locator('input[name="registration-program"]')
        .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
    ).toBe(true);
    expect(
      await page
        .locator('input[name="account-gender"]')
        .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
    ).toBe(true);
    await gender.click();
    await expect(page.locator('[data-slot="select-content"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(gender).toBeFocused();
    await gender.press("ArrowDown");
    await expect(gender).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("role")))
      .toBe("option");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(gender).toHaveText("Female");
    expect(
      await page
        .locator('input[name="account-gender"]')
        .evaluate((input: HTMLInputElement) => input.checkValidity()),
    ).toBe(true);
    await selectOption(gender, "Male");
    const program = page.getByRole("combobox", { name: "Degree program", exact: true });
    await selectOption(program, "000000000000000000000302");
    expect(
      await page
        .locator('input[name="registration-program"]')
        .evaluate((input: HTMLInputElement) => input.checkValidity()),
    ).toBe(true);

    const country = page.getByRole("combobox", { name: "Country calling code", exact: true });
    await selectOption(country, "US");
    await expect(country).toHaveText("US +1");
    await country.click();
    await expect(
      page.getByRole("option", { name: "United States (+1)", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`country-dropdown-${theme}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await suffix.fill("");
    await suffix.click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`suffix-dropdown-${theme}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
  }
});
