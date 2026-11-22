import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

import { enrollAdministrator } from "./security-helper";
import { selectOption } from "./select-helper";

const pathIs = (request: Request, suffix: string) =>
  new URL(request.url()).pathname.endsWith(suffix);

async function captureDownload(page: Page, button: string, suffix: string) {
  const [request] = await Promise.all([
    page.waitForRequest((request) => pathIs(request, suffix)),
    page.waitForEvent("download"),
    page.getByRole("button", { name: button, exact: true }).click(),
  ]);
  return new URL(request.url()).searchParams;
}

for (const theme of ["light", "dark"] as const) {
  test(`Reports groups filters and preserves export scopes in ${theme} mode`, async ({
    page,
    request,
  }, info) => {
    test.setTimeout(90_000);
    await request.post("http://127.0.0.1:3100/__test/reset");
    await page.addInitScript((value) => localStorage.setItem("vite-ui-theme", value), theme);
    await page.setViewportSize(
      info.project.name === "desktop" ? { width: 1440, height: 900 } : { width: 320, height: 740 },
    );
    await page.goto("/login");
    await page.locator("#email").fill("admin@example.test");
    await page.locator("#password").fill("BrowserTest123!");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await enrollAdministrator(page);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await expect(page.getByLabel("Batch", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Batch", { exact: true })).toHaveCount(0);

    const ids = [
      "report-college",
      "report-department",
      "report-program",
      "report-graduation-year",
      "report-tracking",
    ];
    expect(
      await page
        .locator(ids.map((id) => `#${id}`).join(","))
        .evaluateAll((nodes) => nodes.map((node) => node.id)),
    ).toEqual(ids);
    for (const label of [
      "College",
      "Department",
      "Program",
      "Graduation Year",
      "Tracking Status",
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    const college = (await page.locator("#report-college").boundingBox())!;
    const department = (await page.locator("#report-department").boundingBox())!;
    const program = (await page.locator("#report-program").boundingBox())!;
    const year = (await page.locator("#report-graduation-year").boundingBox())!;
    if (info.project.name === "desktop") {
      expect(college.y).toBe(department.y);
      expect(department.y).toBe(program.y);
      expect(year.y).toBeGreaterThan(college.y + college.height);
    } else {
      expect(college.x).toBe(department.x);
      expect(department.y).toBeGreaterThan(college.y);
      expect(program.y).toBeGreaterThan(department.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`reports-${theme}.png`), fullPage: true });

    await page.route(/\/reports\/alumni\.csv(?:\?|$)/, (route) =>
      route.fulfill({ json: { csv: "Name\n", fileName: "alumni.csv", count: 0 } }),
    );
    await page.route(/\/reports\/(?:alumni|assignments)\.pdf(?:\?|$)/, (route) =>
      route.fulfill({ contentType: "application/pdf", body: "%PDF-1.7\n%%EOF" }),
    );
    await page.route(/\/integrations\/google-sheets\/exports$/, (route) =>
      route.fulfill({ json: { ok: true, count: 0 } }),
    );
    expect(
      Object.fromEntries(await captureDownload(page, "Download CSV", "/reports/alumni.csv")),
    ).toEqual({ tracked: "all" });
    await selectOption(
      page.getByRole("combobox", { name: "College", exact: true }),
      "000000000000000000000300",
    );
    await selectOption(
      page.getByRole("combobox", { name: "Department", exact: true }),
      "000000000000000000000301",
    );
    await selectOption(
      page.getByRole("combobox", { name: "Program", exact: true }),
      "000000000000000000000302",
    );
    await page.getByRole("spinbutton", { name: "Graduation Year", exact: true }).fill("2024");
    const summaryRequest = page.waitForRequest(
      (request) =>
        pathIs(request, "/reports") &&
        new URL(request.url()).searchParams.get("tracked") === "tracked",
    );
    await selectOption(
      page.getByRole("combobox", { name: "Tracking Status", exact: true }),
      "tracked",
    );
    expect(Object.fromEntries(new URL((await summaryRequest).url()).searchParams)).toEqual({
      departmentId: "000000000000000000000301",
      tracked: "tracked",
    });
    await expect(page.getByRole("combobox", { name: "Department", exact: true })).toHaveText(
      "Synthetic IT",
    );
    const expected = {
      collegeId: "000000000000000000000300",
      departmentId: "000000000000000000000301",
      programId: "000000000000000000000302",
      graduationYear: "2024",
      tracked: "tracked",
    };
    const csv = await captureDownload(page, "Download CSV", "/reports/alumni.csv");
    expect(Object.fromEntries(csv)).toEqual(expected);
    expect(csv.has("batch")).toBe(false);
    const pdf = await captureDownload(page, "Download PDF", "/reports/alumni.pdf");
    expect(Object.fromEntries(pdf)).toEqual(expected);
    expect(pdf.has("batch")).toBe(false);
    const assignments = await captureDownload(
      page,
      "Assignment Report (PDF)",
      "/reports/assignments.pdf",
    );
    expect([...assignments]).toEqual([]);
    const sheetsRequest = page.waitForRequest((request) =>
      pathIs(request, "/integrations/google-sheets/exports"),
    );
    await page.getByRole("button", { name: "Export to Google Sheets", exact: true }).click();
    expect((await sheetsRequest).postDataJSON()).toEqual({
      departmentId: "000000000000000000000301",
      tracked: "tracked",
    });

    const user = await (await page.request.get("/api/v1/auth/me")).json();
    let readOnly = true;
    await page.route(/\/auth\/me$/, async (route) => {
      await route.fulfill({
        json: {
          ...user,
          roles: readOnly ? user.roles : ["department_head"],
          permissions: readOnly
            ? user.permissions.filter((permission: string) => permission !== "reports.export")
            : user.permissions,
        },
      });
    });
    await page.reload();
    await expect(
      page.getByText("You can view totals but cannot export.", { exact: true }),
    ).toBeVisible();
    for (const name of [
      "Download CSV",
      "Download PDF",
      "Assignment Report (PDF)",
      "Export to Google Sheets",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    readOnly = false;
    await page.reload();
    await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Assignment Report (PDF)", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export to Google Sheets", exact: true }),
    ).toBeVisible();
  });
}
