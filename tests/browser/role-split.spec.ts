import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enrollAdministrator } from "./security-helper";

const FIXTURE = "http://127.0.0.1:3100/__test";
const API = "/api/v1";
const ORIGIN = { Origin: "http://127.0.0.1:3101" };
const SUPER_ADMIN_ROLE = "000000000000000000000101";
const SECOND = { email: "second.admin@example.test", password: "BrowserTest123!" };

async function signIn(page: Page, email: string, password = "BrowserTest123!") {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
}

test("Super Admin is full access and members can be moved to a limited Super Admin role", async ({
  page,
  request,
}) => {
  test.skip(test.info().project.name !== "desktop", "Role administration flow; one run is enough");
  test.setTimeout(180_000);
  await request.post(`${FIXTURE}/reset`);
  await signIn(page, "admin@example.test");
  await enrollAdministrator(page);
  const created = await page.request.post(`${API}/users`, {
    headers: ORIGIN,
    data: {
      firstName: "Second",
      lastName: "Admin",
      email: SECOND.email,
      password: SECOND.password,
      roleIds: [SUPER_ADMIN_ROLE],
    },
  });
  expect(created.status()).toBe(201);
  const secondId = (await created.json()).id as string;
  await request.post(`${FIXTURE}/complete-account`, { data: { email: SECOND.email } });

  // The original Super Admin role shows every permission on and cannot be changed itself.
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /^Test Admin Synthetic administrator/ }).click();
  const dialog = page.getByRole("dialog", { name: "Test Admin", exact: true });
  await expect(dialog.getByText(/Super Admin always has full access/)).toBeVisible();
  await expect(dialog.getByRole("switch").first()).toBeVisible();
  await expect(dialog.getByRole("switch", { checked: false })).toHaveCount(0);
  await expect(dialog.getByText("Super Admin only", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: /All Members/ })).toBeDisabled();
  await expect(dialog.getByText("Second Admin", { exact: true })).toBeVisible();
  await expect(dialog.getByText("(you)")).toBeVisible();

  // Limit only the second admin: they move to a new role without the integrations permissions.
  await dialog.getByRole("radio", { name: /Only Selected Members/ }).check();
  await expect(dialog.getByRole("checkbox", { name: "Select Test Administrator" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Select Second Admin" }).check();
  await dialog.getByRole("switch", { name: /^Enable all integrations permissions/i }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Save for Selected Members", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Test Admin – Second Admin/ })).toBeVisible();

  const roles = (await (await page.request.get(`${API}/roles`)).json()) as {
    id: string;
    key: string;
    baseRole: string | null;
    members: { id: string }[];
    rolePermissions: { permission: { key: string } }[];
  }[];
  const full = roles.find((role) => role.key === "super_admin")!;
  const limited = roles.find((role) => role.members.some((member) => member.id === secondId))!;
  expect(limited.baseRole).toBe("super_admin");
  expect(full.members.map((member) => member.id)).not.toContain(secondId);
  const limitedKeys = limited.rolePermissions.map(({ permission }) => permission.key);
  expect(limitedKeys).not.toContain("integrations.write");
  expect(limitedKeys).toContain("users.write");

  // A full Super Admin cannot split themself off or empty the full role.
  const fullVersion = new Date(
    (await (await page.request.get(`${API}/roles`)).json()).find(
      (role: { key: string }) => role.key === "super_admin",
    ).updatedAt,
  ).toISOString();
  const self = await page.request.post(`${API}/roles/${full.id}/split`, {
    headers: ORIGIN,
    data: {
      expectedUpdatedAt: fullVersion,
      userIds: ["000000000000000000000001"],
      name: "Self",
      permissionIds: [],
    },
  });
  expect(self.status()).toBe(400);

  // The limited admin is still an administrator but cannot manage Super Admin access.
  await page.context().clearCookies();
  await signIn(page, SECOND.email, SECOND.password);
  await enrollAdministrator(page);
  const me = await (await page.request.get(`${API}/auth/me`)).json();
  expect(me.permissions).not.toContain("integrations.write");
  expect(me.permissions).toContain("users.write");
  expect((await page.request.get(`${API}/integrations`)).status()).toBe(403);
  const escalate = await page.request.patch(`${API}/roles/${limited.id}`, {
    headers: ORIGIN,
    data: {
      expectedUpdatedAt: new Date(
        (await (await page.request.get(`${API}/roles`)).json()).find(
          (role: { id: string }) => role.id === limited.id,
        ).updatedAt,
      ).toISOString(),
      description: "self-edit",
    },
  });
  expect(escalate.status()).toBe(403);
});

test("Faculty changes can apply to selected members only", async ({ page, request }) => {
  test.skip(test.info().project.name !== "desktop", "Role administration flow; one run is enough");
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await signIn(page, "admin@example.test");
  await enrollAdministrator(page);
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /Test Staff/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Test Staff", { exact: true }).first()).toBeVisible();
  // A single-member role has nobody to split off: the role is edited as a whole.
  await expect(dialog.getByRole("radio", { name: /Only Selected Members/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save Changes", exact: true })).toBeVisible();
});
