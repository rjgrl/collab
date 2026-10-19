import { expect, type Page } from "@playwright/test";
import { generate } from "otplib";

export async function enrollAdministrator(page: Page) {
  await page.waitForURL("**/security");
  await page.locator("#mfa-password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Set up authenticator", exact: true }).click();
  const setupKey = page.locator('[aria-label="Authenticator setup key"]');
  await expect(setupKey).toBeVisible();
  const secret = (await setupKey.textContent())!;
  await page.locator("#mfa-code").fill(await generate({ secret }));
  await page.getByRole("button", { name: "Confirm authenticator", exact: true }).click();
  await expect(page.getByText("Authenticator enabled.", { exact: false })).toBeVisible();
  const recoveryCode = (await page.locator("li.font-mono, ul.font-mono li").first().textContent())!;
  await page.getByLabel("I saved my recovery codes privately").check();
  await page.getByRole("button", { name: "Continue to application", exact: true }).click();
  await page.waitForURL("**/dashboard");
  return { secret, recoveryCode };
}
