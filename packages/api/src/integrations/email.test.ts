import assert from "node:assert/strict";
import { it } from "node:test";
import { sendEmail } from "./email";

async function capture(env: Parameters<typeof sendEmail>[0]) {
  const native = globalThis.fetch;
  let seen: { headers: Headers; body: string } | undefined;
  globalThis.fetch = async (_input, init) => {
    seen = { headers: new Headers(init?.headers), body: String(init?.body) };
    return Response.json({ ok: true });
  };
  try {
    await sendEmail(env, { to: "admin@example.test", subject: "Test", text: "Hello" });
  } finally {
    globalThis.fetch = native;
  }
  return seen!;
}

it("authenticates to the email gateway with a bearer token kept out of the body", async () => {
  const sent = await capture({
    smtpUrl: "https://mail.example.test/send",
    smtpFrom: "alumni@example.test",
    emailApiKey: "gateway-token-abcdef123456",
  });
  assert.equal(sent.headers.get("authorization"), "Bearer gateway-token-abcdef123456");
  assert.ok(!sent.body.includes("gateway-token-abcdef123456"));
});

it("sends no Authorization header when no gateway key is configured", async () => {
  const sent = await capture({ smtpUrl: "https://mail.example.test/send" });
  assert.equal(sent.headers.get("authorization"), null);
});

it("never follows redirects and refuses internal gateways before every production send", async () => {
  const original = globalThis.fetch;
  const originalEnv = process.env.NODE_ENV;
  const calls: RequestInit[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  try {
    await sendEmail(
      { smtpUrl: "https://8.8.8.8/send", emailApiKey: "key" },
      { to: "user@example.com", subject: "Code", text: "123456" },
    );
    assert.equal(calls[0]?.redirect, "error");

    process.env.NODE_ENV = "production";
    for (const smtpUrl of ["https://[::ffff:a9fe:a9fe]/send", "https://127.0.0.1/send"])
      await assert.rejects(
        sendEmail({ smtpUrl }, { to: "user@example.com", subject: "Code", text: "123456" }),
        /public HTTPS address/,
        smtpUrl,
      );
    assert.equal(calls.length, 1, "nothing was sent to an internal address");
  } finally {
    globalThis.fetch = original;
    process.env.NODE_ENV = originalEnv;
  }
});
