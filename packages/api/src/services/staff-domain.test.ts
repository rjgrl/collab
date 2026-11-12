import assert from "node:assert/strict";
import { it } from "node:test";
import { hashPassword } from "@Alumni-Tracking-Ss/db";
import { modelFixture } from "../test-utils/model-test-fixture";
import { authenticateWithPassword, loadAuthUser, upsertGoogleUser } from "./session";
import {
  StaffDomainError,
  assertStaffGoogleIdentity,
  emailDomainAllowed,
  isStaffAccount,
  staffEmailDomains,
  staffEmailRejected,
} from "./staff-domain";

const domains = ["buksu.edu.ph", "student.buksu.edu.ph"];
const settings = { NODE_ENV: "test", STAFF_EMAIL_DOMAINS: " BukSU.edu.ph, student.buksu.edu.ph " };

it("matches institutional domains exactly and rejects spoofed and lookalike domains", () => {
  for (const email of ["faculty@buksu.edu.ph", " Faculty@BUKSU.EDU.PH ", "s@student.buksu.edu.ph"])
    assert.equal(emailDomainAllowed(email, domains), true, email);
  for (const email of [
    "x@buksu.edu.ph.evil.com",
    "x@xbuksu.edu.ph",
    "x@evil-buksu.edu.ph",
    "x@sub.buksu.edu.ph",
    "x@buksu.edu.ph.",
    "x@buksu.edu",
    "x@bυksu.edu.ph", // Greek upsilon homoglyph
    "buksu.edu.ph@evil.com",
    "a@b@buksu.edu.ph",
    "@buksu.edu.ph",
    "buksu.edu.ph",
    "",
  ])
    assert.equal(emailDomainAllowed(email, domains), false, email);
});

it("reads domains from env, refuses a missing list in production, and rejects malformed lists", () => {
  assert.deepEqual(staffEmailDomains(settings), domains);
  assert.equal(staffEmailDomains({ NODE_ENV: "development" }), null);
  assert.throws(() => staffEmailDomains({ NODE_ENV: "production" }), /STAFF_EMAIL_DOMAINS/);
  for (const bad of ["*.buksu.edu.ph", "buksu.edu.ph/x", "@buksu.edu.ph", " , "])
    assert.throws(() => staffEmailDomains({ NODE_ENV: "test", STAFF_EMAIL_DOMAINS: bad }), bad);
});

it("restricts every account, Alumni included, to institutional email", () => {
  assert.equal(isStaffAccount(["viewer"]), false);
  assert.equal(isStaffAccount(["alumni"]), false);
  assert.equal(isStaffAccount([]), false);
  for (const roles of [["super_admin"], ["faculty"], ["viewer", "custom"]])
    assert.equal(isStaffAccount(roles), true, roles.join());
  for (const roles of [["viewer"], ["alumni"], ["faculty"], []])
    assert.equal(staffEmailRejected("someone@gmail.com", roles, settings), true, roles.join());
  assert.equal(staffEmailRejected("grad@student.buksu.edu.ph", ["viewer"], settings), false);
  assert.equal(
    staffEmailRejected("head@gmail.com", ["faculty"], { NODE_ENV: "development" }),
    false,
    "unrestricted when no domains are configured outside production",
  );
});

it("requires the verified hd claim to be allowlisted for every Google identity", () => {
  assert.doesNotThrow(() =>
    assertStaffGoogleIdentity("head@buksu.edu.ph", "buksu.edu.ph", ["faculty"], settings),
  );
  assert.doesNotThrow(() =>
    assertStaffGoogleIdentity("s@student.buksu.edu.ph", "buksu.edu.ph", ["viewer"], settings),
  );
  for (const roles of [["faculty"], ["viewer"], []])
    for (const hd of [null, undefined, "", "gmail.com", "buksu.edu.ph.evil.com"])
      assert.throws(
        () => assertStaffGoogleIdentity("head@buksu.edu.ph", hd, roles, settings),
        StaffDomainError,
        `${roles.join()} ${String(hd)}`,
      );
  assert.throws(
    () => assertStaffGoogleIdentity("head@evil.test", "buksu.edu.ph", ["faculty"], settings),
    StaffDomainError,
  );
  assert.throws(
    () => assertStaffGoogleIdentity("grad@gmail.com", null, ["viewer"], settings),
    StaffDomainError,
  );
});

async function withDomains<T>(work: () => Promise<T>) {
  const previous = process.env.STAFF_EMAIL_DOMAINS;
  process.env.STAFF_EMAIL_DOMAINS = "buksu.edu.ph";
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env.STAFF_EMAIL_DOMAINS;
    else process.env.STAFF_EMAIL_DOMAINS = previous;
  }
}

function accounts(password: string) {
  return modelFixture({
    Role: [
      { id: "rs", key: "faculty", name: "Faculty", isSystem: true },
      { id: "rv", key: "viewer", name: "Alumni", isSystem: true },
    ],
    User: [
      {
        id: "staffOk",
        email: "head@buksu.edu.ph",
        status: "active",
        passwordHash: password,
        emailVerified: true,
      },
      {
        id: "staffBad",
        email: "head@buksu.edu.ph.evil.com",
        status: "active",
        passwordHash: password,
        emailVerified: true,
      },
      {
        id: "alumni",
        email: "grad@gmail.com",
        status: "active",
        passwordHash: password,
        emailVerified: true,
      },
    ],
    UserRole: [
      { userId: "staffOk", roleId: "rs" },
      { userId: "staffBad", roleId: "rs" },
      { userId: "alumni", roleId: "rv" },
    ],
  });
}

it("enforces the allowlist on password login, existing sessions and Google sign-in", async () => {
  const password = "A private domain testing passphrase 4242";
  const f = accounts(await hashPassword(password));
  await withDomains(async () => {
    await authenticateWithPassword(f.db, { email: "head@buksu.edu.ph", password });
    for (const email of ["head@buksu.edu.ph.evil.com", "grad@gmail.com"])
      await assert.rejects(
        () => authenticateWithPassword(f.db, { email, password }),
        StaffDomainError,
        email,
      );
    await assert.rejects(
      () =>
        authenticateWithPassword(f.db, { email: "head@buksu.edu.ph.evil.com", password: "wrong" }),
      /Invalid email or password/,
      "domain is checked only after the password, so it does not reveal accounts",
    );
    assert.equal(await loadAuthUser(f.db, "staffBad"), null);
    assert.equal(await loadAuthUser(f.db, "alumni"), null, "personal-email Alumni lose access");
    assert.ok(await loadAuthUser(f.db, "staffOk"));
    await assert.rejects(
      () =>
        upsertGoogleUser(f.db, { email: "head@buksu.edu.ph", name: "Head", hostedDomain: null }),
      StaffDomainError,
    );
    await upsertGoogleUser(f.db, {
      email: "head@buksu.edu.ph",
      name: "Head",
      hostedDomain: "buksu.edu.ph",
    });
    await assert.rejects(
      () => upsertGoogleUser(f.db, { email: "grad@gmail.com", name: "Grad", hostedDomain: null }),
      StaffDomainError,
    );
    const before = f.tables.User!.length;
    await assert.rejects(
      () => upsertGoogleUser(f.db, { email: "new@gmail.com", name: "New", hostedDomain: null }),
      StaffDomainError,
      "new Google accounts outside BukSU are refused before creation",
    );
    assert.equal(f.tables.User!.length, before);
  });
});
