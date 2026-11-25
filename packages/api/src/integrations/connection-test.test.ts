import { gmailSmtp, type GmailMessage } from "./email";
import assert from "node:assert/strict";
import { it, describe } from "node:test";
import { isPrivateAddress, testIntegrationConnection } from "./connection-test";

// Response bodies below follow each provider's documented format. Keep them that way: a mock
// using a made-up field name ("error_codes") once let the reCAPTCHA check accept any secret.
const SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const RECAPTCHA = { siteKey: SITE_KEY, projectId: "alumni-tracking-1", apiKey: "AIzaSyTestKey" };
// projects.assessments.create for an unusable token: HTTP 200, tokenProperties.valid false.
const ASSESSMENT_MALFORMED = {
  name: "projects/123456789/assessments/abc",
  event: { token: "connection-test", siteKey: SITE_KEY, expectedAction: "" },
  riskAnalysis: { score: 0, reasons: [] },
  tokenProperties: { valid: false, invalidReason: "MALFORMED", hostname: "", action: "" },
};
// Google API error envelope (google.rpc.Status with ErrorInfo).
const GOOGLE_ERROR = (code: number, status: string, reason: string) => ({
  error: {
    code,
    message: "Request rejected.",
    status,
    details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }],
  },
});
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
  it("reCAPTCHA accepts a project and API key Google recognises (MALFORMED dummy token)", async () => {
    let url = "";
    let headers: Headers | undefined;
    const fetcher = (async (input: string, init?: RequestInit) => {
      url = input;
      headers = new Headers(init?.headers);
      return Response.json(ASSESSMENT_MALFORMED);
    }) as unknown as typeof fetch;
    await testIntegrationConnection("recaptcha", RECAPTCHA, options(fetcher));
    assert.equal(
      url,
      "https://recaptchaenterprise.googleapis.com/v1/projects/alumni-tracking-1/assessments",
    );
    // The API key travels in a header so it never appears in a URL or request log.
    assert.equal(headers?.get("x-goog-api-key"), RECAPTCHA.apiKey);
    assert(!url.includes(RECAPTCHA.apiKey));
  });

  it("reCAPTCHA rejects a bad API key, a disabled API, a missing verdict and malformed values", async () => {
    for (const [status, body] of [
      [400, GOOGLE_ERROR(400, "INVALID_ARGUMENT", "API_KEY_INVALID")],
      [403, GOOGLE_ERROR(403, "PERMISSION_DENIED", "SERVICE_DISABLED")],
      [200, {}],
    ] as const)
      await rejectsWith(
        testIntegrationConnection("recaptcha", RECAPTCHA, options(reply(status, body))),
        "Google rejected",
      );
    await rejectsWith(
      testIntegrationConnection(
        "recaptcha",
        { ...RECAPTCHA, siteKey: "not-a-site-key" },
        options(reply(200, ASSESSMENT_MALFORMED)),
      ),
      "site key",
    );
    await rejectsWith(
      testIntegrationConnection(
        "recaptcha",
        { ...RECAPTCHA, projectId: "Not A Project" },
        options(reply(200, ASSESSMENT_MALFORMED)),
      ),
      "project ID",
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

  it("Gmail authentication failures reject saving without exposing credentials", async (t) => {
    t.mock.method(gmailSmtp, "create", () => ({
      sendMail: async () => {
        throw new Error("secret app password diagnostics");
      },
      close: () => {},
    }));
    await rejectsWith(
      testIntegrationConnection(
        "email",
        {
          fromAddress: "sender@gmail.com",
          gmailAppPassword: "abcdefghijklmnop",
        },
        options(reply(200, {})),
      ),
      "Gmail did not accept",
    );
  });

  it("tests Gmail at the sender mailbox even when the admin uses an undeliverable seeded email", async (t) => {
    let target = "";
    t.mock.method(gmailSmtp, "create", (config: Parameters<typeof gmailSmtp.create>[0]) => {
      assert.equal(config.host, "smtp.gmail.com");
      return {
        sendMail: async (message: GmailMessage) => {
          target = message.to[0]!;
          assert.equal(message.from, "sender@gmail.com");
          return { accepted: message.to, rejected: [] };
        },
        close: () => {},
      };
    });
    await testIntegrationConnection(
      "email",
      {
        gatewayUrl: "https://127.0.0.1/never-used",
        fromAddress: "sender@gmail.com",
        gmailAppPassword: "abcdefghijklmnop",
      },
      { env: {}, adminEmail: "admin@collab.test" },
    );
    assert.equal(target, "sender@gmail.com");
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
      testIntegrationConnection("recaptcha", RECAPTCHA, options(failing)),
      "Could not reach",
    );
  });
});
