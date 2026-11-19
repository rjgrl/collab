import { test, expect, request as newRequest } from "@playwright/test";
import { enrollAdministrator } from "./security-helper";

const API = "http://127.0.0.1:3101/api/v1";
const ORIGIN = { Origin: "http://127.0.0.1:3101" };
const FIXTURE = "http://127.0.0.1:3100/__test";

test("custom roles never get university-wide permissions", async ({ page, request }) => {
  test.skip(test.info().project.name !== "desktop", "API check; one run is enough");
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

  // Even a Super Admin cannot put a university-wide permission on a role.
  for (const key of ["users.write", "roles.write", "audit.read", "departments.delete"]) {
    const refused = await page.request.post(`${API}/roles`, {
      headers: ORIGIN,
      data: { key: "sneaky_role", name: "Sneaky", permissionIds: ids([key]) },
    });
    expect(refused.status(), key).toBe(400);
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
  const staff = await (await request.post(`${FIXTURE}/staff`)).json();
  expect(
    (
      await page.request.patch(`${API}/users/${staff.id}`, {
        headers: ORIGIN,
        data: { roleIds: [role.id] },
      })
    ).status(),
  ).toBe(200);

  // An older role that already stores university-wide grants gives the member none of them.
  await request.post(`${FIXTURE}/grant-role-permissions`, {
    data: { roleId: role.id, keys: ["users.read", "audit.read", "departments.write"] },
  });
  const member = await newRequest.newContext({ baseURL: "http://127.0.0.1:3101" });
  await member.post(`${API}/auth/login`, {
    headers: ORIGIN,
    data: { email: "staff@example.test", password: "BrowserTest123!", recaptchaFallback: true },
  });
  const me = await (await member.get(`${API}/auth/me`)).json();
  expect([...me.permissions].sort()).toEqual(["alumni.read", "dashboard.read", "reports.read"]);
  expect((await member.get(`${API}/users`)).status()).toBe(403);
  expect(
    (
      await member.post(`${API}/colleges`, {
        headers: ORIGIN,
        data: { name: "Unauthorised college" },
      })
    ).status(),
  ).toBe(403);
  expect((await member.get(`${API}/dashboard`)).status()).toBe(200);
});
