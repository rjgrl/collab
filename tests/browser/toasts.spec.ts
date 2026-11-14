import { test, expect, type Page } from "@playwright/test";

const FIXTURE = "http://127.0.0.1:3100/__test";

/** Fires toasts through the app's own Sonner instance (the exact module URL the page loaded). */
async function fire(page: Page, toasts: [type: "success" | "error", message: string][]) {
  await page.evaluate(async (list) => {
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => /\/deps\/sonner\.js/.test(name));
    if (!url) throw new Error("sonner module not loaded");
    const { toast } = await import(/* @vite-ignore */ url);
    for (const [type, message] of list) {
      toast[type](message, { duration: 60_000 });
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }, toasts);
}

const shown = (page: Page) => page.locator('[data-sonner-toast][data-removed="false"]');

test("toasts form a list of at most three, newest kept, duplicates shown once", async ({
  page,
  request,
}, info) => {
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await page.goto("/login");
  await page.locator("#email").fill("staff@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.locator("[data-sonner-toast]").first().waitFor();
  await fire(page, [
    ["error", "Request failed. Try again."],
    ["error", "Request failed. Try again."],
    ["error", "Request failed. Try again."],
  ]);
  // The same message three times shows once.
  await expect(shown(page).filter({ hasText: "Request failed. Try again." })).toHaveCount(1);

  await fire(page, [
    ["success", "First"],
    ["success", "Second"],
    ["success", "Third"],
    ["success", "Fourth"],
  ]);
  await expect(shown(page)).toHaveCount(3);
  await expect(shown(page)).toHaveText([/Fourth/, /Third/, /Second/]);
  // Older toasts are gone for good, not just hidden until there is room again.
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /First|Request failed/ }),
  ).toHaveCount(0);

  // A list, not an overlapping stack.
  const boxes = await shown(page).evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }),
  );
  boxes.sort((a, b) => a.top - b.top);
  for (let i = 1; i < boxes.length; i++)
    expect(boxes[i]!.top, "toasts must not overlap").toBeGreaterThanOrEqual(
      boxes[i - 1]!.bottom - 1,
    );
  await page.screenshot({ path: info.outputPath("toasts.png") });

  // Closing one does not bring an old toast back.
  await shown(page).filter({ hasText: "Second" }).locator("[data-close-button]").click();
  await expect(shown(page)).toHaveCount(2);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "First" })).toHaveCount(0);
});

test("a replaced toast fades out instead of vanishing", async ({ page, request }) => {
  test.skip(test.info().project.name !== "desktop");
  await request.post(`${FIXTURE}/reset`);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await fire(page, [
    ["success", "One"],
    ["success", "Two"],
    ["success", "Three"],
  ]);
  await expect(shown(page)).toHaveCount(3);
  const oldest = page.locator("[data-sonner-toast]").filter({ hasText: "One" });
  const transition = oldest.evaluate((el) => {
    return new Promise<string>((resolve) => {
      const observer = new MutationObserver(() => {
        if (el.getAttribute("data-removed") === "true") {
          observer.disconnect();
          const style = getComputedStyle(el);
          resolve(`${style.transitionProperty}|${style.transitionDuration}`);
        }
      });
      observer.observe(el, { attributes: true });
    });
  });
  await fire(page, [["success", "Four"]]);
  const [properties, durations] = (await transition).split("|");
  expect(properties).toContain("opacity");
  expect(durations).toContain("0.2s");
  await expect(oldest).toHaveCount(0);
});
