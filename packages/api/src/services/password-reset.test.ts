import assert from "node:assert/strict";
import { it } from "node:test";
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { requestPasswordReset, resetPassword } from "./password-reset";
import { assertPasswordSafe } from "./password-security";
import { newPasswordSchema } from "../password-policy";
import { digest } from "./mfa";
import { modelFixture } from "./model-test-fixture";

async function fixture() {
  const user = {
    id: "user",
    email: "test@example.test",
    status: "active",
    emailVerified: true,
    passwordHash: await hashPassword("Previous private passphrase 12"),
  };
  const f = modelFixture({ User: [user], IntegrationSetting: [{ key: "email", enabled: true }] });
  const context = {
    db: f.db,
    user: null,
    sessionToken: null,
    ipAddress: null,
    userAgent: null,
    integrationEnv: { webOrigin: "https://app.example.test", smtpUrl: "https://mail.example.test" },
  } as Context;
  return {
    context,
    user,
    get row() {
      return f.tables.PasswordReset?.[0] ?? null;
    },
    get revoked() {
      return f.operations.filter((op) => op.model === "Session" && op.method === "deleteMany")
        .length;
    },
  };
}
it("enforces long passphrases and screens common passwords without imposing composition", async () => {
  assert.equal(newPasswordSchema.safeParse("short").success, false);
  await assertPasswordSafe("a quiet river carries seven blue boats");
  await assertPasswordSafe("界".repeat(64));
  await assert.rejects(() => assertPasswordSafe("passwordpassword"), /commonly used|compromised/);
});
it("HIBP opt-in sends only a padded five-character hash prefix and fails closed", async () => {
  const old = process.env.PASSWORD_BREACH_CHECK;
  const native = globalThis.fetch;
  const password = "Synthetic unique password 8245";
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    process.env.PASSWORD_BREACH_CHECK = "hibp";
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
      assert.equal(new Headers(init?.headers).get("Add-Padding"), "true");
      return new Response(`${hash.slice(5)}:9`);
    };
    await assert.rejects(() => assertPasswordSafe(password), /breach/);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(() => assertPasswordSafe(password), /temporarily unavailable/);
  } finally {
    globalThis.fetch = native;
    if (old === undefined) delete process.env.PASSWORD_BREACH_CHECK;
    else process.env.PASSWORD_BREACH_CHECK = old;
  }
});
it("sends single-use fragment reset links, stores a digest and revokes all sessions", async () => {
  const f = await fixture();
  const native = globalThis.fetch;
  let link = "";
  try {
    globalThis.fetch = async (_input, init) => {
      link = JSON.parse(String(init?.body)).text.match(/https:\/\/[^\s]+/)[0];
      return Response.json({ ok: true });
    };
    const response = await requestPasswordReset(f.context, f.user.email);
    assert.equal("token" in response, false);
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
    assert.equal(f.row?.tokenHash, digest(token));
    assert.ok(!JSON.stringify(f.row).includes(token));
    await resetPassword(f.context, token, "A new private passphrase 8484");
    assert.equal(await verifyPassword("A new private passphrase 8484", f.user.passwordHash), true);
    assert.equal(f.revoked, 1);
    await assert.rejects(
      () => resetPassword(f.context, token, "Another private passphrase 5353"),
      /invalid, expired or already used/,
    );
  } finally {
    globalThis.fetch = native;
  }
});
it("does not disclose missing/unverified accounts or send when delivery is disabled", async () => {
  const f = await fixture();
  f.context.integrationEnv.smtpUrl = undefined;
  const a = await requestPasswordReset(f.context, f.user.email);
  f.user.emailVerified = false;
  const b = await requestPasswordReset(f.context, "missing@example.test");
  assert.deepEqual(a, b);
  assert.equal(f.row, null);
});
it("rejects expired reset links and links invalidated by another password change", async () => {
  const f = await fixture();
  const native = globalThis.fetch;
  let token = "";
  try {
    globalThis.fetch = async (_input, init) => {
      token = new URLSearchParams(
        new URL(JSON.parse(String(init?.body)).text.match(/https:\/\/[^\s]+/)[0]).hash.slice(1),
      ).get("token")!;
      return Response.json({ ok: true });
    };
    await requestPasswordReset(f.context, f.user.email);
    f.row!.expiresAt = new Date(0);
    await assert.rejects(
      () => resetPassword(f.context, token, "A new private passphrase 9999"),
      /invalid/,
    );
    f.row!.expiresAt = new Date(Date.now() + 60_000);
    f.user.passwordHash = await hashPassword("Changed elsewhere passphrase 6767");
    await assert.rejects(
      () => resetPassword(f.context, token, "A new private passphrase 9999"),
      /invalid/,
    );
  } finally {
    globalThis.fetch = native;
  }
});
