import { expect, test } from "@playwright/test";

// Google's enterprise.js is stubbed: the test proves the page loads the Fraud Defense
// (Enterprise) script, renders the checkbox with the right action, and submits its token.
const SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const STUB = `
  window.__captcha = [];
  window.grecaptcha = { enterprise: {
    render(element, options) {
      window.__captcha.push({ sitekey: options.sitekey, action: options.action });
      const box = document.createElement("button");
      box.type = "button";
      box.textContent = "Stub checkbox";
      box.onclick = () => options.callback("stub-token-" + options.action);
      element.append(box);
      return 0;
    },
    reset() {},
  } };
  window.collabCaptchaReady?.();
`;

test("sign-in renders the Enterprise checkbox and sends its LOGIN token", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  const scripts: string[] = [];
  await page.route(/https:\/\/www\.google\.com\/recaptcha\/.*/, async (route) => {
    scripts.push(route.request().url());
    await route.fulfill({ contentType: "text/javascript", body: STUB });
  });
  await page.route(/\/api(?:\/v1)?\/auth\/config$/, async (route) => {
    const config = await (await route.fetch()).json();
    await route.fulfill({
      json: { ...config, recaptcha: { enabled: true, live: true, siteKey: SITE_KEY } },
    });
  });
  let sent: Record<string, unknown> | undefined;
  await page.route(/\/api(?:\/v1)?\/auth\/login$/, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      json: { error: "Complete the reCAPTCHA check again.", code: "BAD_REQUEST" },
    });
  });

  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("someone@example.com");
  await page.locator("#password").fill("Example-password-1");
  const submit = page.getByRole("button", { name: "Sign In", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Stub checkbox" }).click();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByRole("alert").filter({ hasText: "reCAPTCHA check again" })).toBeVisible();
  expect(
    scripts.some((url) => url.startsWith("https://www.google.com/recaptcha/enterprise.js")),
  ).toBe(true);
  expect(scripts.some((url) => url.includes("/recaptcha/api.js"))).toBe(false);
  expect(await page.evaluate(() => (window as any).__captcha[0])).toEqual({
    sitekey: SITE_KEY,
    action: "LOGIN",
  });
  expect(sent?.recaptchaToken).toBe("stub-token-LOGIN");
  // A rejected attempt resets the widget so the user must tick it again.
  await expect(submit).toBeDisabled();
});
