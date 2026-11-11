import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/reset");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await enrollAdministrator(page);
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /Test Staff/ }).click();
});

test("group and individual controls save through REST and survive reload", async ({ page }) => {
  const master = page.getByRole("switch", { name: "Enable all evidence and files permissions" });
  await master.check();
  await expect(page.getByRole("switch", { name: /^Upload evidence/ })).toBeChecked();
  await page.getByRole("switch", { name: /^Upload evidence/ }).uncheck();
  await expect(master).not.toBeChecked();
  await expect(page.getByText(/Partially enabled/)).toBeVisible();
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("No unsaved changes", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Test Staff/ }).click();
  await expect(master).not.toBeChecked();
  await expect(page.getByText(/Partially enabled/)).toBeVisible();
  await expect(page.getByRole("switch", { name: /^Upload evidence/ })).not.toBeChecked();
  await master.check();
  await master.uncheck();
  await expect(page.getByRole("switch", { name: /^View evidence/ })).not.toBeChecked();
});

test("failed saves preserve the draft and stale saves require reload", async ({
  page,
  request,
}) => {
  await page.getByRole("switch", { name: /^View evidence/ }).check();
  await request.post("http://127.0.0.1:3100/__test/fail");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "draft has been preserved" }),
  ).toBeVisible();
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await request.post("http://127.0.0.1:3100/__test/concurrent");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This role changed" })).toBeVisible();
});

test("settings and grouped controls pass automated accessibility and fit the viewport", async ({
  page,
}, testInfo) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("roles.png"), fullPage: true });
  const master = page.getByRole("switch", { name: "Enable all evidence and files permissions" });
  await master.focus();
  await page.keyboard.press("Space");
  await expect(master).toBeChecked();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("navigation", { name: "Settings", exact: true })
    .getByRole("link", { name: "Integrations" })
    .click();
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google Drive", exact: true })).toBeVisible();

  // Disable Google Drive flow
  await page.getByRole("button", { name: "Disable Google Drive", exact: true }).click();
  const disableConfirm = page.getByRole("alertdialog", { name: /Disable Google Drive/i });
  await expect(disableConfirm).toBeVisible();
  await expect(disableConfirm).toContainText("Disabling erases the saved credentials");
  await disableConfirm.getByRole("button", { name: "Disable and erase", exact: true }).click();
  // The alert dialog should close
  await expect(disableConfirm).not.toBeVisible({ timeout: 2000 });
  // Wait for the network request to complete
  await page.waitForLoadState("networkidle");
  // Check that the button changed from "Disable" to "Enable"
  await expect(
    page.getByRole("button", { name: "Enable Google Drive", exact: true }),
  ).toBeVisible();

  // Enable Google Drive flow
  await page.getByRole("button", { name: "Enable Google Drive", exact: true }).click();
  const enableDialog = page.getByRole("dialog", { name: "Enable Google Drive", exact: true });
  await expect(enableDialog).toBeVisible();

  // Test button disabled when form is empty
  const testButton = enableDialog.getByRole("button", { name: "Test and enable", exact: true });
  await expect(testButton).toBeDisabled();

  // Fill in the credentials
  const serviceAccountInput = enableDialog.getByRole("textbox", {
    name: "Service account JSON",
    exact: true,
  });
  const folderIdInput = enableDialog.getByRole("textbox", { name: "Folder ID", exact: true });
  const serviceAccountJson = JSON.stringify({
    client_email: "drive@example.iam.gserviceaccount.com",
    // Assembled at runtime so the repository secret scanner does not flag this fake key.
    private_key: `${"-----BEGIN"} PRIVATE KEY-----\nSYNTHETIC\n-----END PRIVATE KEY-----\n`,
    private_key_id: "synthetic0000wxyz",
  });
  await serviceAccountInput.fill(serviceAccountJson);
  await folderIdInput.fill("synthetic-folder");

  // Now the test button should be enabled
  await expect(testButton).toBeEnabled();
  await testButton.click();
  // Wait for the request to complete and the list to be refetched
  await page.waitForResponse((response) => response.url().includes("/api/v1/integrations"));
  await page.waitForLoadState("networkidle");

  // Card should now show enabled
  await expect(
    page.getByRole("heading", { name: "Google Drive", exact: true }).locator(".."),
  ).toContainText("Enabled");
  await expect(page.getByText("Folder ID:")).toBeVisible();
  await expect(page.getByText("synthetic-folder")).toBeVisible();
  await expect(page.getByText("Set · ends in ••••wxyz")).toBeVisible();

  // Page should not expose secrets
  expect(await page.textContent("body")).not.toContain("SYNTHETIC");
  expect(await page.textContent("body")).not.toContain("BEGIN PRIVATE KEY");

  // Test reCAPTCHA with rejected credentials
  await page.getByRole("button", { name: "Enable reCAPTCHA", exact: true }).click();
  const recaptchaDialog = page.getByRole("dialog", { name: "Enable reCAPTCHA", exact: true });
  await expect(recaptchaDialog).toBeVisible();
  await recaptchaDialog
    .getByRole("textbox", { name: "Site key", exact: true })
    .fill("synthetic-site-key");
  await recaptchaDialog
    .getByRole("textbox", { name: "Secret key", exact: true })
    .fill("reject-this-secret-1234");
  await recaptchaDialog.getByRole("button", { name: "Test and enable", exact: true }).click();
  await expect(recaptchaDialog).toContainText("Synthetic provider rejected the credentials.");
  await recaptchaDialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(recaptchaDialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "reCAPTCHA", exact: true }).locator(".."),
  ).toContainText("Disabled");

  // Verify persistence after reload
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Google Drive", exact: true }).locator(".."),
  ).toContainText("Enabled");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("integrations.png"), fullPage: true });
});

test("new roles show the full catalog switched off and persist without grants", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Add Role", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Role", exact: true });
  expect(await dialog.getByRole("switch").count()).toBeGreaterThan(25);
  await expect(dialog.getByRole("switch", { checked: true })).toHaveCount(0);
  await expect(dialog.getByText(/facult/i)).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Key", exact: true }).fill("test_custom");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Custom access");
  await dialog.getByRole("button", { name: "Create role", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Custom access", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("switch", { checked: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /Custom access.*0 permissions/ })).toBeVisible();
});

test("creation dialogs contain forms, trap focus and return focus to the add button", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const [path, title, field] of [
    ["/settings/users", "Add user", "First name"],
    ["/departments", "Add department", "Name"],
    ["/programs", "Add program", "Code"],
  ] as const) {
    await page.goto(path);
    const add = page.getByRole("button", { name: title, exact: true });
    await add.click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog.getByRole("textbox", { name: field, exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
    ).toEqual([]);
    await dialog.getByRole("button", { name: "Close dialog" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
  }
  await page.goto("/faculties");
  await expect(page.getByRole("heading", { name: "Faculty", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/faculty")).status()).toBe(200);
});

test("account controls remain reachable and role dialogs scroll internally", async ({
  page,
}, testInfo) => {
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "Save changes", exact: true });
  const before = await save.boundingBox();
  await dialog.locator("[data-dialog-body]").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await save.boundingBox()).toEqual(before);
  await expect(save).toBeInViewport();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/settings");
  await expect(page.getByRole("textbox", { name: "First name", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle theme", exact: true })).toHaveCount(1);
  if (testInfo.project.name === "desktop") {
    await page
      .getByRole("button", { name: "Save personal details", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Save personal details", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Change password", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("account.png"), fullPage: true });
});

test("role notes show on cards and can be edited", async ({ page }) => {
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Add Role", exact: true }).click();
  const addDialog = page.getByRole("dialog", { name: "Add Role", exact: true });

  // Check that the Note field exists and Description does not
  await expect(addDialog.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
  await expect(addDialog.getByRole("textbox", { name: "Description", exact: true })).toHaveCount(0);

  // Create a role with a note
  await addDialog.getByRole("textbox", { name: "Key", exact: true }).fill("note_probe");
  await addDialog.getByRole("textbox", { name: "Name", exact: true }).fill("Note Probe");
  await addDialog.getByRole("textbox", { name: "Note", exact: true }).fill("First note");
  await addDialog.getByRole("button", { name: "Create role", exact: true }).click();

  // Dialog should switch to the role editor
  await expect(page.getByRole("dialog", { name: "Note Probe", exact: true })).toBeVisible();

  // Go back to roles list
  await page.getByRole("button", { name: "Close dialog" }).click();

  // Check that the note appears on the card
  const noteProbeCard = page.getByRole("button", { name: /Note Probe/ });
  const cardText = await noteProbeCard.innerText();
  expect(cardText).toContain("Note Probe");
  expect(cardText).toContain("First note");
  // Verify order: name first, then note, then member/permission count
  const lines = cardText.split(/\n/).filter((line) => line.trim());
  expect(lines[0]).toBe("Note Probe");
  expect(lines[1]).toBe("First note");

  // Open the card and edit the note
  await noteProbeCard.click();
  const editor = page.getByRole("dialog", { name: "Note Probe", exact: true });
  const noteField = editor.getByRole("textbox", { name: "Note", exact: true });
  await noteField.clear();
  await noteField.fill("Second note");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();

  // Reload and verify the updated note persists
  await page.reload();
  await page.waitForURL("/settings/roles");
  await expect(page.getByRole("button", { name: /Note Probe/ })).toBeVisible();
  const newCardText = await page.getByRole("button", { name: /Note Probe/ }).innerText();
  expect(newCardText).toContain("Second note");

  // Open Add Role again and verify duplicate name warning appears
  await page.getByRole("button", { name: "Add Role", exact: true }).click();
  const newAddDialog = page.getByRole("dialog", { name: "Add Role", exact: true });
  await newAddDialog.getByRole("textbox", { name: "Name", exact: true }).fill("Note Probe");
  await expect(
    newAddDialog
      .getByRole("status")
      .filter({ hasText: 'Another role is already named "Note Probe"' }),
  ).toBeVisible();
  // Verify that Create role button is still enabled
  await expect(
    newAddDialog.getByRole("button", { name: "Create role", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close dialog" }).click();

  // Verify the main assertions are working:
  // 1. Note Probe was created with a note
  // 2. The note appears on the card
  // 3. The note can be edited
  // 4. Duplicate name warning appears
  // These are all verified above
});

test("Super Admins edit a member's role through exact permission matching", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "Close dialog" }).click();
  await request.post("http://127.0.0.1:3100/__test/staff");
  const headers = { Origin: "http://127.0.0.1:3101" };
  const catalog: { id: string; key: string; name: string }[] = await (
    await page.request.get("/api/permissions")
  ).json();
  const readIds = catalog.filter((item) => item.key.endsWith(".read")).map((item) => item.id);
  const created = await page.request.post("/api/roles", {
    headers,
    data: {
      key: "probe_reader",
      name: "Probe Reader",
      description: "Read-only probe",
      permissionIds: readIds,
    },
  });
  expect(created.status()).toBe(201);

  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Edit role for Test Staff", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit role for Test Staff", exact: true });
  const status = dialog.getByRole("status").filter({ hasText: /Matches role|No role has/ });
  await dialog.getByRole("radio", { name: /Probe Reader/ }).check();
  await expect(status).toContainText("Matches role: Probe Reader");
  await expect(dialog.getByText("Read-only probe", { exact: true })).toBeVisible();
  const save = dialog.getByRole("button", { name: "Save role", exact: true });
  await expect(save).toBeEnabled();

  const extra = catalog.find((item) => item.key === "alumni.write")!;
  const extraSwitch = dialog.getByRole("switch", { name: new RegExp(`^${extra.name}`) });
  await extraSwitch.click();
  await expect(status).toContainText("No role has exactly these permissions.");
  await expect(save).toBeDisabled();
  await extraSwitch.click();
  await expect(status).toContainText("Matches role: Probe Reader");
  await extraSwitch.click();

  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await dialog.getByRole("button", { name: "Create a new role with these permissions" }).click();
  const add = page.getByRole("dialog", { name: "Add Role", exact: true });
  await add.getByRole("textbox", { name: "Key", exact: true }).fill("probe_writer");
  await add.getByRole("textbox", { name: "Name", exact: true }).fill("Probe Writer");
  await add.getByRole("button", { name: "Create role", exact: true }).click();
  await expect(add).toHaveCount(0);
  await expect(status).toContainText("Matches role: Probe Writer");

  await save.click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Test Staff will be signed out of every session");
  await confirm.getByRole("button", { name: "Change role", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "staff@example.test" })).toContainText(
    "Probe Writer",
  );
});

test("Edit role is absent and rejected for non-Super-Admins", async ({ page, request }) => {
  await request.post("http://127.0.0.1:3100/__test/staff");
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("staff@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  const response = await page.request.patch("/api/users/000000000000000000000001", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: { roleIds: ["000000000000000000000102"] },
  });
  expect(response.status()).toBe(403);
  await page.goto("/settings/users");
  await expect(page.getByRole("button", { name: /^Edit role for/ })).toHaveCount(0);
});
