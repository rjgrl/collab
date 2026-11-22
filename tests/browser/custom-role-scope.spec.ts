import { test, expect } from "@playwright/test";
import { enrollAdministrator } from "./security-helper";

const API = "http://127.0.0.1:3101/api/v1";
const ORIGIN = { Origin: "http://127.0.0.1:3101" };
const FIXTURE = "http://127.0.0.1:3100/__test";

test("custom roles honor explicit grants and MFA without acquiring Super Admin scope", async ({
  page,
  request,
  browser,
}) => {
  test.skip(test.info().project.name !== "desktop", "API check; one run is enough");
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await page.goto("/login");
  await page.locator("#email").fill("admin@example.test");
  await page.locator("#password").fill("BrowserTest123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await enrollAdministrator(page);
  const perms: { id: string; key: string }[] = await (
    await page.request.get(`${API}/permissions`)
  ).json();
  const ids = (keys: string[]) => perms.filter((p) => keys.includes(p.key)).map((p) => p.id);

  // Every catalog permission is explicitly delegatable by a Super Admin.
  for (const key of ["users.write", "roles.write", "audit.read", "departments.delete"]) {
    const granted = await page.request.post(`${API}/roles`, {
      headers: ORIGIN,
      data: { key: `grant_${key.replace(".", "_")}`, name: key, permissionIds: ids([key]) },
    });
    expect(granted.status(), key).toBe(201);
    const created = await granted.json();
    expect(
      created.rolePermissions.map((link: { permission: { key: string } }) => link.permission.key),
    ).toEqual([key]);
  }

  // A scoped custom role can still be created and given to a member.
  const role = await (
    await page.request.post(`${API}/roles`, {
      headers: ORIGIN,
      data: {
        key: "records_officer",
        name: "Records officer",
        permissionIds: ids(["alumni.read", "dashboard.read", "reports.read"]),
      },
    })
  ).json();
  expect(role.key).toBe("records_officer");
  const staff = await (
    await request.post(`${FIXTURE}/staff`, { data: { unenrolled: true } })
  ).json();
  expect(
    (
      await page.request.patch(`${API}/users/${staff.id}`, {
        headers: ORIGIN,
        data: { roleIds: [role.id] },
      })
    ).status(),
  ).toBe(200);

  // Stored grants are effective, but sensitive grants require an authenticator.
  await request.post(`${FIXTURE}/grant-role-permissions`, {
    data: { roleId: role.id, keys: ["users.read", "audit.read", "departments.write"] },
  });
  const member = await browser.newContext({ baseURL: "http://127.0.0.1:3101" });
  try {
    const memberPage = await member.newPage();
    await memberPage.goto("/login");
    await memberPage.locator("#email").fill("staff@example.test");
    await memberPage.locator("#password").fill("BrowserTest123!");
    await memberPage.getByRole("button", { name: "Sign In", exact: true }).click();
    await memberPage.waitForURL("**/security");
    expect((await member.request.get(`${API}/users`)).status()).toBe(403);
    await enrollAdministrator(memberPage);
    const me = await (await member.request.get(`${API}/auth/me`)).json();
    expect([...me.permissions].sort()).toEqual([
      "alumni.read",
      "audit.read",
      "dashboard.read",
      "departments.write",
      "reports.read",
      "users.read",
    ]);
    expect(me.roles).not.toContain("super_admin");
    expect((await member.request.get(`${API}/users`)).status()).toBe(200);
    expect((await member.request.get(`${API}/roles`)).status()).toBe(403);
    const outsideScope = await member.request.post(`${API}/colleges`, {
      headers: ORIGIN,
      data: { name: "Unauthorised college" },
    });
    expect(outsideScope.status()).toBe(403);
    expect(JSON.stringify(await outsideScope.json())).toMatch(/outside your scope/);
    expect((await member.request.get(`${API}/dashboard`)).status()).toBe(200);
  } finally {
    await member.close();
  }
});
