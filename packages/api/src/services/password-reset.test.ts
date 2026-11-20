import { captureEmail } from "../test-utils/email-capture";
import assert from "node:assert/strict";
import { it } from "node:test";
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "@Alumni-Tracking-Ss/db";
import type { Context } from "../context";
import { requestPasswordReset, resetPassword } from "./password-reset";
import { assertPasswordSafe } from "./password-security";
import { newPasswordSchema } from "@Alumni-Tracking-Ss/contracts/password-policy";
import { digest } from "./mfa";
import { modelFixture } from "../test-utils/model-test-fixture";

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
    integrationEnv: {
      webOrigin: "https://app.example.test",
      gmailAppPassword: "api-test-key",
      smtpFrom: "sender@example.test",
      smtpUrl: "smtps://smtp.gmail.com:465",
    },
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
it("enforces length and character-type rules and screens common passwords", async () => {
  assert.equal(newPasswordSchema.safeParse("short").success, false);
  await assertPasswordSafe("A quiet river carries 7 blue boats");
  await assert.rejects(
    () => assertPasswordSafe("a quiet river carries seven blue boats"),
    /uppercase letter, a number/,
  );
  await assert.rejects(() => assertPasswordSafe("界".repeat(64)), /uppercase letter/);
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
  let link = "";
  const restore = captureEmail((message) => {
    link = message.text.match(/https:\/\/[^\s]+/)![0];
  });
  try {
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
    restore();
  }
});
it("does not disclose missing/unverified accounts or send when delivery is disabled", async () => {
  const f = await fixture();
  f.context.integrationEnv.gmailAppPassword = undefined;
  const a = await requestPasswordReset(f.context, f.user.email);
  f.user.emailVerified = false;
  const b = await requestPasswordReset(f.context, "missing@example.test");
  assert.deepEqual(a, b);
  assert.equal(f.row, null);
});
it("rejects expired reset links and links invalidated by another password change", async () => {
  const f = await fixture();
  let token = "";
  const restore = captureEmail((message) => {
    token = new URLSearchParams(
      new URL(message.text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1),
    ).get("token")!;
  });
  try {
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
    restore();
  }
});
