import assert from "node:assert/strict";
import { it } from "node:test";
import { sendEmail, RESEND_EMAIL_URL } from "./email";

it("sends only to Resend with bearer authentication and a verified sender", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ id: "message-id" });
  };
  try {
    await sendEmail(
      {
        smtpUrl: "https://127.0.0.1/ignored",
        smtpFrom: "sender@example.test",
        emailApiKey: "re_test-key",
      },
      { to: "recipient@example.test", subject: "Test", text: "Hello" },
    );
    assert.equal(calls[0]?.url, RESEND_EMAIL_URL);
    assert.equal(calls[0]?.init?.redirect, "error");
    assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer re_test-key");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      from: "sender@example.test",
      to: ["recipient@example.test"],
      subject: "Test",
      text: "Hello",
    });
    await assert.rejects(
      sendEmail({}, { to: "a@example.test", subject: "Test", text: "Hi" }),
      /not configured/,
    );
    assert.equal(calls.length, 1);
    globalThis.fetch = async () => new Response("secret provider details", { status: 403 });
    await assert.rejects(
      sendEmail(
        { smtpFrom: "a@example.test", emailApiKey: "re_test-key" },
        { to: "b@example.test", subject: "Test", text: "Hi" },
      ),
      (error: Error) => error.message.includes("403") && !error.message.includes("secret"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
