import assert from "node:assert/strict";
import { it, describe } from "node:test";
import { isPrivateAddress, testIntegrationConnection } from "./connection-test";

// Response bodies below follow each provider's documented format. Keep them that way: a mock
// using a made-up field name ("error_codes") once let the reCAPTCHA check accept any secret.
const SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const reply = (status: number, body: unknown) =>
  (async () => Response.json(body, { status })) as unknown as typeof fetch;
const options = (fetcher: typeof fetch) => ({
  env: { appUrl: "https://example.com" },
  adminEmail: "admin@example.com",
  fetcher,
});
const rejectsWith = (work: Promise<unknown>, text: string) =>
  assert.rejects(work, (error: { code?: string; message: string }) => {
    assert.equal(error.code, "BAD_REQUEST");
    assert.match(error.message, new RegExp(text));
    return true;
  });

describe("connection-test", () => {
  it("reCAPTCHA accepts a secret Google recognises (invalid-input-response for the dummy token)", async () => {
    await testIntegrationConnection(
      "recaptcha",
      { siteKey: SITE_KEY, secretKey: "valid" },
      options(reply(200, { success: false, "error-codes": ["invalid-input-response"] })),
    );
  });

  it("reCAPTCHA rejects an unknown secret, a missing error list and a malformed site key", async () => {
    await rejectsWith(
      testIntegrationConnection(
        "recaptcha",
        { siteKey: SITE_KEY, secretKey: "wrong" },
        options(
          reply(200, {
            success: false,
            "error-codes": ["invalid-input-response", "invalid-input-secret"],
          }),
        ),
      ),
      "Google rejected",
    );
    await rejectsWith(
      testIntegrationConnection(
        "recaptcha",
        { siteKey: SITE_KEY, secretKey: "x" },
        options(reply(200, { success: false })),
      ),
      "Google rejected",
    );
    await rejectsWith(
      testIntegrationConnection(
        "recaptcha",
        { siteKey: "not-a-site-key", secretKey: "x" },
        options(reply(200, {})),
      ),
      "site key",
    );
  });

  it("Google sign-in accepts only invalid_grant for a dummy code", async () => {
    await testIntegrationConnection(
      "google_auth",
      { clientId: "id", clientSecret: "secret" },
      options(reply(400, { error: "invalid_grant", error_description: "Malformed auth code." })),
    );
    for (const error of ["invalid_client", "unauthorized_client", "invalid_request"])
      await rejectsWith(
        testIntegrationConnection(
          "google_auth",
          { clientId: "id", clientSecret: "secret" },
          options(reply(401, { error })),
        ),
        "rejected the client ID or secret",
      );
  });

  it("ImgBB keys are checked with a real upload that expires", async () => {
    let requested = "";
    const ok = (async (url: string | URL) => {
      requested = String(url);
      return Response.json({ success: true, status: 200, data: { id: "x" } });
    }) as typeof fetch;
    await testIntegrationConnection(
      "image_host",
      { provider: "imgbb", apiKey: "key-1" },
      options(ok),
    );
    assert.match(requested, /expiration=60/);
    await rejectsWith(
      testIntegrationConnection(
        "image_host",
        { provider: "imgbb", apiKey: "bad" },
        options(
          reply(400, {
            status_code: 400,
            error: { message: "Invalid API v1 key.", code: 100 },
            status_txt: "Bad Request",
          }),
        ),
      ),
      "ImgBB rejected",
    );
  });

  it("email gateway failures are rejected without echoing the key or URL", async () => {
    await assert.rejects(
      () =>
        testIntegrationConnection(
          "email",
          {
            gatewayUrl: "https://gateway.example.com",
            fromAddress: "test@example.com",
            apiKey: "secret-api-key-12345",
          },
          options(reply(500, {})),
        ),
      (error: { code?: string; message: string }) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert.ok(!error.message.includes("secret-api-key"));
        assert.ok(!error.message.includes("gateway.example.com"));
        return true;
      },
    );
  });

  it("production rejects email gateways on internal addresses", async (t) => {
    const previous = process.env.NODE_ENV;
    t.after(() => {
      process.env.NODE_ENV = previous;
    });
    process.env.NODE_ENV = "production";
    for (const gatewayUrl of [
      "https://127.0.0.1/send",
      "https://10.1.2.3/send",
      "https://[::1]/send",
      "https://169.254.169.254/latest",
    ])
      await rejectsWith(
        testIntegrationConnection(
          "email",
          { gatewayUrl, fromAddress: "a@example.com", apiKey: "k" },
          options(reply(200, {})),
        ),
        "public HTTPS address",
      );
    for (const address of [
      "8.8.8.8",
      "2001:4860:4860::8888",
      "::ffff:8.8.8.8",
      "64:ff9b::808:808",
      "2002:808:808::1",
      "2606:4700:4700::1111",
    ])
      assert.equal(isPrivateAddress(address), false, address);
    for (const address of [
      "192.168.1.1",
      "172.20.0.1",
      "100.64.0.1",
      "169.254.169.254",
      "198.18.0.1",
      "192.0.0.1",
      "fd00::1",
      "fe80::1",
      "::",
      "::1",
      "::ffff:127.0.0.1",
      // The audit's bypasses: IPv4 written in IPv6 hex form, as `new URL()` normalises it.
      "::ffff:a9fe:a9fe",
      "::ffff:7f00:1",
      "::7f00:1",
      "0:0:0:0:0:ffff:a9fe:a9fe",
      "64:ff9b::a9fe:a9fe",
      "2002:a9fe:a9fe::1",
      "2001:db8::1",
      "not-an-address",
    ])
      assert.equal(isPrivateAddress(address), true, address);
  });

  it("network failures return a generic message", async () => {
    const failing = (async () => {
      throw new Error("TIMEOUT");
    }) as typeof fetch;
    await rejectsWith(
      testIntegrationConnection(
        "recaptcha",
        { siteKey: SITE_KEY, secretKey: "x" },
        options(failing),
      ),
      "Could not reach",
    );
  });
});
