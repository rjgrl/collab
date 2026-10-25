import { expect, type Locator } from "@playwright/test";

export async function selectOption(control: Locator, option: string | { label: string }) {
  await control.click();
  const page = control.page();
  const item =
    typeof option === "string"
      ? page.locator(`[role="option"][data-value=${JSON.stringify(option)}]`)
      : page.getByRole("option", { name: option.label, exact: true });
  await item.click();
  await expect(control).toHaveAttribute("aria-expanded", "false");
}
