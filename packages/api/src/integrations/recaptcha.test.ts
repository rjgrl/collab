import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyRecaptcha } from "./recaptcha";

// Bodies follow Google's projects.assessments.create response format.
const env = {
  recaptchaSiteKey: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
  recaptchaProjectId: "alumni-tracking-1",
  recaptchaApiKey: "AIzaSyTestKey",
};
const assessment = (tokenProperties: Record<string, unknown>) => ({
  name: "projects/123456789/assessments/abc",
  riskAnalysis: { score: 0.9, reasons: [] },
  tokenProperties: {
    hostname: "alumni.example.com",
    invalidReason: "INVALID_REASON_UNSPECIFIED",
    ...tokenProperties,
  },
});
const reply = (status: number, body: unknown) =>
  (async () => Response.json(body, { status })) as unknown as typeof fetch;

describe("verifyRecaptcha", () => {
  it("passes a valid token whose action matches and sends the expected action", async () => {
    let sent: { event?: Record<string, string> } = {};
    const fetcher = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return Response.json(assessment({ valid: true, action: "LOGIN" }));
    }) as unknown as typeof fetch;
    assert.equal(await verifyRecaptcha(env, { token: "t", action: "LOGIN" }, fetcher), "passed");
    assert.deepEqual(sent.event, {
      token: "t",
      siteKey: env.recaptchaSiteKey,
      expectedAction: "LOGIN",
    });
  });

  it("rejects an invalid token, a token minted for another action, and a missing token", async () => {
    assert.equal(
      await verifyRecaptcha(
        env,
        { token: "t", action: "LOGIN" },
        reply(200, assessment({ valid: false, invalidReason: "EXPIRED", action: "" })),
      ),
      "rejected",
    );
    assert.equal(
      await verifyRecaptcha(
        env,
        { token: "t", action: "LOGIN" },
        reply(200, assessment({ valid: true, action: "SIGNUP" })),
      ),
      "rejected",
    );
    assert.equal(
      await verifyRecaptcha(
        env,
        { action: "LOGIN" },
        reply(200, assessment({ valid: true, action: "LOGIN" })),
      ),
      "rejected",
    );
  });

  it("reports Google errors and network failures as unavailable (fail closed)", async () => {
    assert.equal(
      await verifyRecaptcha(
        env,
        { token: "t", action: "SIGNUP" },
        reply(403, { error: { code: 403, status: "PERMISSION_DENIED", message: "denied" } }),
      ),
      "unavailable",
    );
    const failing = (async () => {
      throw new Error("TIMEOUT");
    }) as unknown as typeof fetch;
    assert.equal(
      await verifyRecaptcha(env, { token: "t", action: "SIGNUP" }, failing),
      "unavailable",
    );
  });

  it("without credentials allows only the development fallback outside production", async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";
      assert.equal(await verifyRecaptcha({}, { fallback: true, action: "LOGIN" }), "passed");
      assert.equal(await verifyRecaptcha({}, { action: "LOGIN" }), "rejected");
      process.env.NODE_ENV = "production";
      assert.equal(await verifyRecaptcha({}, { fallback: true, action: "LOGIN" }), "rejected");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
