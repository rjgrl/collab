import { test, expect } from "@playwright/test";
import { selectOption } from "./select-helper";

test("signup checks institutional email before continuing and drops the Philippine trunk zero", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
  await page.getByRole("button", { name: "Need an account? Sign Up" }).click();
  await page.getByRole("textbox", { name: "First Name", exact: true }).fill("Test");
  await page.getByRole("textbox", { name: "Last Name", exact: true }).fill("Graduate");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("person@gmail.com");
  const phone = page.getByRole("textbox", { name: "Phone Number", exact: true });
  await phone.fill("09363954203");
  await phone.blur();
  expect((await phone.inputValue()).replace(/\D/g, "")).toBe("9363954203");
  await selectOption(page.getByRole("combobox", { name: "Gender", exact: true }), "Male");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Use your BukSU institutional email (@buksu.edu.ph or @student.buksu.edu.ph).", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Degree Program", exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("person@student.buksu.edu.ph");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create Account", exact: true })).toBeVisible();
});

test("the local robot checkbox aligns with Forgot Password", async ({ page }) => {
  await page.route(/\/api(?:\/v1)?\/auth\/config$/, async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({
      json: { ...config, recaptcha: { enabled: true, live: false, siteKey: null } },
    });
  });
  await page.goto("/login");
  const robot = page.getByRole("checkbox", { name: "I am not a robot" });
  const forgot = page.getByRole("link", { name: "Forgot Password?" });
  await expect(robot).toBeVisible();
  const a = (await robot.boundingBox())!,
    b = (await forgot.boundingBox())!;
  expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(12);
});
