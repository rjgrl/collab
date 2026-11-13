import { expect, type Page } from "@playwright/test";

/** Opens one section of an alumni profile (staff detail page or My profile). */
export async function openProfileTab(page: Page, name: string) {
  const tab = page
    .getByRole("navigation", { name: "Profile sections" })
    .getByRole("link", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-current", "page");
}
