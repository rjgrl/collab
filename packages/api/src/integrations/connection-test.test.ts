import assert from "node:assert/strict";
import { it, describe } from "node:test";
import { testIntegrationConnection } from "./connection-test";

describe("connection-test", () => {
  it("recaptcha with invalid-input-secret error is rejected", async () => {
    const fetcher = async (_url: string, _options: any) => ({
      ok: true,
      json: async () => ({
        error_codes: ["invalid-input-secret"],
      }),
    });

    await assert.rejects(
      () =>
        testIntegrationConnection(
          "recaptcha",
          { secretKey: "invalid" },
          {
            env: {},
            adminEmail: "test@example.com",
            fetcher: fetcher as any,
          },
        ),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert(error.message.includes("Google rejected"));
        return true;
      },
    );
  });

  it("google_auth with invalid_grant means credentials are valid", async () => {
    const fetcher = async (_url: string, _options: any) => ({
      ok: true,
      json: async () => ({
        error: "invalid_grant",
      }),
    });

    // Should not throw
    await testIntegrationConnection(
      "google_auth",
      {
        clientId: "test-id",
        clientSecret: "test-secret",
      },
      {
        env: { appUrl: "https://example.com" },
        adminEmail: "test@example.com",
        fetcher: fetcher as any,
      },
    );
  });

  it("google_auth with invalid_client is rejected", async () => {
    const fetcher = async (_url: string, _options: any) => ({
      ok: true,
      json: async () => ({
        error: "invalid_client",
      }),
    });

    await assert.rejects(
      () =>
        testIntegrationConnection(
          "google_auth",
          {
            clientId: "test-id",
            clientSecret: "invalid-secret",
          },
          {
            env: { appUrl: "https://example.com" },
            adminEmail: "test@example.com",
            fetcher: fetcher as any,
          },
        ),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert(error.message.includes("rejected the client ID or secret"));
        return true;
      },
    );
  });

  it("email gateway 500 is rejected with safe message", async () => {
    const fetcher = async (_url: string, _options: any) => ({
      ok: false,
      status: 500,
    });

    await assert.rejects(
      () =>
        testIntegrationConnection(
          "email",
          {
            gatewayUrl: "https://gateway.example.com",
            fromAddress: "test@example.com",
            apiKey: "secret-api-key-12345",
          },
          {
            env: {},
            adminEmail: "admin@example.com",
            fetcher: fetcher as any,
          },
        ),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        // Ensure the error message doesn't contain the API key or gateway URL
        assert(!error.message.includes("secret-api-key"), "Error message does not contain API key");
        assert(
          !error.message.includes("gateway.example.com"),
          "Error message does not contain gateway URL",
        );
        return true;
      },
    );
  });

  it("network timeout returns generic message", async () => {
    const fetcher = async (_url: string, _options: any) => {
      throw new Error("TIMEOUT");
    };

    await assert.rejects(
      () =>
        testIntegrationConnection(
          "recaptcha",
          { secretKey: "test" },
          {
            env: {},
            adminEmail: "test@example.com",
            fetcher: fetcher as any,
          },
        ),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert(error.message.includes("Could not reach"));
        return true;
      },
    );
  });
});
