import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { generate } from "otplib";
import { z } from "zod";
import { createDatabase } from "../packages/db/src/index";
import { rolesSchemas, permissionsSchemas } from "../packages/contracts/src/roles";
import { isManagedLocalDatabase } from "./local-env.mjs";

if (process.env.NODE_ENV === "production") throw new Error("Synthetic local accounts only.");
const directory = path.resolve(".tools/test-accounts");
const filename = (await readFile(path.join(directory, "latest.txt"), "utf8")).trim();
assert.match(filename, /^[a-f0-9]{16}\.json$/);
const profile = z
  .object({
    databaseUrl: z
      .string()
      .refine(
        (value) =>
          isManagedLocalDatabase(value) &&
          /^\/collab_test_accounts_[a-f0-9]{16}$/.test(new URL(value).pathname),
      ),
    accounts: z
      .array(
        z.object({
          role: z.enum(["Administrator", "Staff", "Alumni"]),
          email: z.email(),
          password: z.string().min(24),
        }),
      )
      .length(3),
  })
  .parse(JSON.parse(await readFile(path.join(directory, filename), "utf8")));
const db = createDatabase({ DATABASE_URL: profile.databaseUrl });
const browser = await chromium.launch();
const output = path.resolve(".tools/role-browser", filename.replace(".json", ""));
await mkdir(output, { recursive: true });
try {
  const pages = new Map<string, Awaited<ReturnType<typeof browser.newPage>>>();
  for (const account of profile.accounts) {
    const page = await browser.newPage({
      baseURL: "http://localhost:3003",
      extraHTTPHeaders: { Origin: "http://localhost:3003" },
      viewport: { width: 1440, height: 1000 },
    });
    pages.set(account.role, page);
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(account.email);
    await page.locator("#password").fill(account.password);
    const captcha = page.getByRole("checkbox", { name: /not a robot/ });
    if (await captcha.count()) await captcha.check();
    const loginResult = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const login = await loginResult;
    assert.equal(
      login.status(),
      200,
      `Normal login failed (${login.status()}): ${await login.text()}`,
    );
    const assurance = z
      .object({ mfaRequired: z.boolean().optional() })
      .parse(await (await page.request.get("/api/auth/me")).json());
    if (account.role === "Administrator" && assurance.mfaRequired) {
      await page.waitForURL("**/security");
      assert.equal((await page.request.get("/api/users")).status(), 403);
      await page
        .getByRole("button", { name: /^(Set up authenticator|Verify authenticator)$/ })
        .waitFor();
      const secretFile = path.join(output, "private-mfa.json");
      let secret: string;
      if (await page.getByRole("button", { name: "Set up authenticator", exact: true }).count()) {
        await page.locator("#mfa-password").fill(account.password);
        await page.getByRole("button", { name: "Set up authenticator", exact: true }).click();
        secret = (await page.getByLabel("Authenticator setup key").innerText()).trim();
        await writeFile(secretFile, JSON.stringify({ secret }), { mode: 0o600, flag: "wx" });
        await page.locator("#mfa-code").fill(await generate({ secret }));
        await page.getByRole("button", { name: "Confirm authenticator", exact: true }).click();
        await page.getByRole("checkbox", { name: "I saved my recovery codes privately" }).waitFor();
        await writeFile(
          path.join(output, "private-recovery.txt"),
          (await page.locator(".font-mono li").allTextContents()).join("\n"),
          { mode: 0o600, flag: "wx" },
        );
        await page.getByRole("checkbox", { name: "I saved my recovery codes privately" }).check();
        await page.getByRole("button", { name: "Continue to application", exact: true }).click();
      } else {
        secret = z
          .object({ secret: z.string() })
          .parse(JSON.parse(await readFile(secretFile, "utf8"))).secret;
        // A repeated rehearsal must use a fresh TOTP time step, not replay the enrollment code.
        await new Promise((resolve) => setTimeout(resolve, 30000 - (Date.now() % 30000) + 1000));
        await page.locator("#mfa-code").fill(await generate({ secret }));
        await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
      }
    }
    await page.waitForURL(account.role === "Alumni" ? "**/my-profile" : "**/dashboard");
    await page
      .getByRole("heading", {
        name: account.role === "Alumni" ? "My Profile" : "Dashboard",
        exact: true,
      })
      .waitFor();
    const identity = z
      .object({ id: z.string(), email: z.string() })
      .parse(await (await page.request.get("/api/auth/me")).json());
    assert.equal(identity.email, account.email);
    assert.equal(
      String((await db.User.findOne({ email: account.email }).lean().orFail())._id),
      identity.id,
      "The normal API must use the guarded synthetic database.",
    );
    assert.equal(await page.getByTestId("account-role").innerText(), account.role);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(output, `${account.role.toLowerCase()}.png`),
      fullPage: true,
    });
    console.log(`${account.role}: normal UI login and persisted identity verified.`);
  }
  const admin = pages.get("Administrator")!;
  const staff = pages.get("Staff")!;
  assert.equal(
    (
      await staff.request.patch("/api/integrations/recaptcha", { data: { enabled: false } })
    ).status(),
    403,
  );
  const roles = rolesSchemas.list.output.parse(
    await (await admin.request.get("/api/roles")).json(),
  );
  const role = roles.find((row) => row.key === "staff")!;
  const permissions = permissionsSchemas.list.output.parse(
    await (await admin.request.get("/api/permissions")).json(),
  );
  const delegated = permissions.find((row) => row.key === "integrations.write")!;
  const originalIds = role.rolePermissions.map((row) => row.permissionId);
  const granted = await admin.request.patch(`/api/roles/${role.id}`, {
    data: {
      expectedUpdatedAt: role.updatedAt.toISOString(),
      permissionIds: [...originalIds, delegated.id],
    },
  });
  assert.equal(granted.status(), 200);
  const staffAccount = profile.accounts.find((account) => account.role === "Staff")!;
  const loginStaff = async () => {
    const response = await staff.request.post("/api/auth/login", {
      data: { email: staffAccount.email, password: staffAccount.password, recaptchaFallback: true },
    });
    assert.equal(response.status(), 200);
  };
  try {
    assert.equal(
      (await staff.request.get("/api/dashboard")).status(),
      401,
      "Permission changes revoke the old session.",
    );
    await loginStaff();
    assert.equal(
      (
        await staff.request.patch("/api/integrations/recaptcha", { data: { enabled: false } })
      ).status(),
      403,
    );
  } finally {
    const current = rolesSchemas.update.output.parse(await granted.json());
    assert.equal(
      (
        await admin.request.patch(`/api/roles/${role.id}`, {
          data: { expectedUpdatedAt: current.updatedAt.toISOString(), permissionIds: originalIds },
        })
      ).status(),
      200,
    );
  }
  assert.equal((await staff.request.get("/api/dashboard")).status(), 401);
  await loginStaff();
  assert.equal(
    (
      await staff.request.patch("/api/integrations/recaptcha", { data: { enabled: false } })
    ).status(),
    403,
  );
  // Exercise historical Done management rows through the normal API and real database.
  const suffix = randomBytes(5).toString("hex");
  const entity = z.object({ id: z.string() });
  const departmentResponse = await admin.request.post("/api/departments", {
    data: { code: `CHECK_${suffix}`, name: "Synthetic acceptance college" },
  });
  assert.equal(departmentResponse.status(), 201);
  const department = entity.parse(await departmentResponse.json());
  const programInput = {
    code: `CHECK_${suffix}`,
    name: "Synthetic acceptance degree",
    departmentId: department.id,
  };
  const programResponse = await admin.request.post("/api/programs", { data: programInput });
  assert.equal(programResponse.status(), 201);
  const program = entity.parse(await programResponse.json());
  assert.equal((await admin.request.post("/api/programs", { data: programInput })).status(), 409);
  assert.equal(
    (
      await admin.request.post("/api/programs", {
        data: { ...programInput, departmentId: "111111111111111111111111" },
      })
    ).status(),
    400,
  );
  assert.equal(
    (
      await admin.request.patch(`/api/programs/${program.id}`, {
        data: {
          ...programInput,
          name: "Updated synthetic degree",
          description: "Normal API acceptance",
        },
      })
    ).status(),
    200,
  );
  const legacyResponse = await admin.request.post("/api/alumni", {
    data: {
      studentNumber: `CLAIM-${suffix}`,
      firstName: "Imported",
      lastName: "Graduate",
      gender: "Female",
      programId: program.id,
    },
  });
  assert.equal(legacyResponse.status(), 201);
  const legacy = entity.parse(await legacyResponse.json());
  const alumniRole = roles.find((row) => row.key === "viewer")!;
  const createdResponse = await admin.request.post("/api/users", {
    data: {
      firstName: "Reviewed",
      lastName: "Graduate",
      suffix: "de la Casa",
      email: `claim-${suffix}@collab.test`,
      password: randomBytes(24).toString("base64url"),
      roleIds: [alumniRole.id],
    },
  });
  assert.equal(createdResponse.status(), 201);
  const created = entity.parse(await createdResponse.json());
  assert.equal(
    (
      await admin.request.patch(`/api/users/${created.id}`, {
        data: { firstName: "Confirmed", lastName: "Graduate", suffix: "de la Casa" },
      })
    ).status(),
    200,
  );
  assert.equal(
    (
      await admin.request.post(`/api/users/${created.id}/alumni-link`, {
        data: { alumniId: legacy.id },
      })
    ).status(),
    200,
  );
  const persisted = await db.User.findById(created.id).lean().orFail();
  assert.equal(String(persisted.alumniId), legacy.id);
  assert.equal(persisted.verificationRequired, true);
  assert.equal((await db.Alumni.findById(legacy.id).lean().orFail()).firstName, "Confirmed");
  const decision = await staff.request.post(`/api/alumni/${legacy.id}/tracking-events`, {
    data: { isTracked: true, source: "staff", notes: "Synthetic reviewed contact" },
  });
  assert.equal(decision.status(), 201);
  const event = await db.TrackingEvent.findOne({ alumniId: legacy.id }).lean().orFail();
  assert.equal(
    String(event.createdById),
    String((await db.User.findOne({ email: staffAccount.email }).lean().orFail())._id),
  );
  assert.ok(event.recordedAt);
  assert.equal(event.source, "staff");
  assert.equal((await staff.request.delete(`/api/alumni/${legacy.id}`)).status(), 200);
  assert.equal((await admin.request.get(`/api/alumni/${legacy.id}`)).status(), 404);
  assert.ok(await db.User.exists({ _id: created.id }));
  const customRole = await admin.request.post("/api/roles", {
    data: { key: `check_${suffix}`, name: "Synthetic read-only role", permissionIds: [] },
  });
  assert.equal(customRole.status(), 201);
  const custom = rolesSchemas.create.output.parse(await customRole.json());
  assert.equal(
    (
      await admin.request.patch(`/api/roles/${custom.id}`, {
        data: {
          expectedUpdatedAt: custom.updatedAt.toISOString(),
          description: "Verified normal update",
          permissionIds: [],
        },
      })
    ).status(),
    200,
  );
  assert.equal((await admin.request.delete(`/api/roles/${custom.id}`)).status(), 200);
  const auditResponse = await admin.request.get("/api/audit");
  assert.equal(auditResponse.status(), 200);
  const audits = z
    .array(
      z.object({
        action: z.string(),
        summary: z.string(),
        actor: z.object({ id: z.string() }).nullable(),
      }),
    )
    .parse(await auditResponse.json());
  assert.ok(audits.some((row) => row.action === "roles.delete" && row.actor));
  console.log(
    "Normal REST academic/account/role CRUD, reviewed legacy link, tracking actor/time/source, archive/account retention and audit verified.",
  );
  const staffId = String(
    (await db.User.findOne({ email: staffAccount.email }).lean().orFail())._id,
  );
  assert.equal(
    (
      await admin.request.patch(`/api/users/${staffId}/status`, { data: { status: "disabled" } })
    ).status(),
    200,
  );
  try {
    assert.equal((await staff.request.get("/api/dashboard")).status(), 401);
    assert.equal(
      (
        await staff.request.post("/api/auth/login", {
          data: { email: staffAccount.email, password: staffAccount.password },
        })
      ).status(),
      403,
    );
  } finally {
    assert.equal(
      (
        await admin.request.patch(`/api/users/${staffId}/status`, { data: { status: "active" } })
      ).status(),
      200,
    );
  }
  console.log(
    "Admin-only integrations and immediate role/session revocation verified through normal authenticated REST requests.",
  );
} finally {
  await browser.close();
  await db.disconnect();
}
