import assert from "node:assert/strict";
import { it, describe } from "node:test";
import type { Context } from "../context";
import { modelFixture } from "../test-utils/model-test-fixture";
import { ApiError } from "../http-error";
import { invalidateIntegrationEnvCache } from "../integrations/credential-store";
import { integrationsService } from "../../../../apps/server/src/modules/integrations/service";
import { authService } from "../../../../apps/server/src/modules/auth/service";
import { auditService } from "../../../../apps/server/src/modules/audit/service";

const adminContext = (fixture: ReturnType<typeof modelFixture>): Context => ({
  db: fixture.db,
  user: {
    id: "user-admin-001",
    name: "Admin User",
    email: "admin@example.test",
    image: null,
    status: "active",
    roles: ["super_admin"],
    permissions: ["integrations.read", "integrations.write"],
    mfaVerified: true,
  },
  sessionToken: null,
  ipAddress: null,
  userAgent: null,
  integrationEnv: {
    integrationEncryptionKey: "34".repeat(32),
    appUrl: "https://example.com",
    connectionTester: undefined,
  },
});

describe("integration credentials", () => {
  it("rejects enabling with a required field missing without writing to DB", async () => {
    const f = modelFixture();
    const context = adminContext(f);

    await assert.rejects(
      () =>
        integrationsService.enable(context, {
          key: "recaptcha",
          credentials: {
            siteKey: "test-site-key",
            // secretKey missing
          },
        }),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert(error.message.includes("Secret key is required"));
        return true;
      },
    );

    assert.equal(
      f.tables.IntegrationSetting?.length || 0,
      0,
      "Nothing written to IntegrationSetting",
    );
  });

  it("rejects invalid formats", async () => {
    const f = modelFixture();
    const context = adminContext(f);

    // Test email gatewayUrl must be https
    await assert.rejects(
      () =>
        integrationsService.enable(context, {
          key: "email",
          credentials: {
            gatewayUrl: "http://example.com",
            fromAddress: "test@example.com",
            apiKey: "test-key",
          },
        }),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert(error.message.includes("https"));
        return true;
      },
    );

    // Test service account JSON without private_key
    await assert.rejects(
      () =>
        integrationsService.enable(context, {
          key: "google_drive",
          credentials: {
            serviceAccountJson: '{"client_email":"test@example.com"}',
            folderId: "folder-1",
          },
        }),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert(error.message.includes("private_key"));
        return true;
      },
    );

    assert.equal(f.tables.IntegrationSetting?.length || 0, 0);
  });

  it("rejects with connectionTester failure and stores nothing", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.integrationEnv.connectionTester = async () => {
      throw new ApiError("BAD_REQUEST", {
        message: "Connection test failed",
      });
    };

    await assert.rejects(
      () =>
        integrationsService.enable(context, {
          key: "recaptcha",
          credentials: {
            siteKey: "test-site-key",
            secretKey: "test-secret-key",
          },
        }),
      (error: any) => {
        assert.equal(error.code, "BAD_REQUEST");
        assert.equal(error.message, "Connection test failed");
        return true;
      },
    );

    assert.equal(f.tables.IntegrationSetting?.length || 0, 0);
  });

  it("disables integration, erases credentials/hints/fingerprint in transaction", async () => {
    const f = modelFixture({
      IntegrationSetting: [
        {
          _id: "setting-1",
          id: "setting-1",
          key: "recaptcha",
          enabled: true,
          notes: "",
          credentials: { siteKey: "sealed", secretKey: "sealed" },
          credentialHints: { siteKey: null, secretKey: "12345" },
          keyFingerprint: "abc123",
          credentialsUpdatedAt: new Date(),
        },
      ],
    });
    const context = adminContext(f);

    const result = await integrationsService.disable(context, { key: "recaptcha" });

    assert.equal(result.status.enabled, false);
    assert(
      f.operations.some((op) => op.method === "transaction"),
      "Uses transaction",
    );

    const row = f.tables.IntegrationSetting![0];
    assert.equal(row?.enabled, false);
    assert(!row?.credentials, "Credentials unset");
    assert(!row?.credentialHints, "Hints unset");
    assert(!row?.keyFingerprint, "Fingerprint unset");

    const auditEntry = f.tables.AuditLog?.find((log: any) => log.action === "integrations.disable");
    assert(auditEntry, "Audit entry created");
    assert((auditEntry as any).summary.includes("reCAPTCHA"), "Summary includes integration name");
    assert(
      (auditEntry as any).summary.includes("credentials erased"),
      "Summary indicates erasing credentials",
    );
  });

  it("google_forms enable returns 64-hex webhookSecret exactly once on enable", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.integrationEnv.connectionTester = async () => {}; // Mock tester

    const enableResult = await integrationsService.enable(context, {
      key: "google_forms",
      credentials: {},
    });

    assert(enableResult.webhookSecret, "Webhook secret returned on enable");
    assert.equal(enableResult.webhookSecret.length, 64, "Secret is 64 hex chars");
    assert(/^[a-f0-9]{64}$/.test(enableResult.webhookSecret));

    const listResult = await integrationsService.list(context);
    const formsStatus = listResult.find((s) => s.key === "google_forms");
    assert(
      !JSON.stringify(formsStatus).includes(enableResult.webhookSecret),
      "Webhook secret not in list response",
    );

    const row = f.tables.IntegrationSetting?.find((r: any) => r.key === "google_forms");
    assert(
      !JSON.stringify(row).includes(enableResult.webhookSecret),
      "Secret not stored in plaintext",
    );
  });

  it("no endpoint response contains stored secrets", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.integrationEnv.connectionTester = async () => {};

    const testValues = {
      recaptchaSecret: "secret-recaptcha-key-abc123",
      googleClientSecret: "secret-client-secret-xyz789",
      emailApiKey: "secret-email-key-def456",
    };

    // Enable with known secrets
    await integrationsService.enable(context, {
      key: "recaptcha",
      credentials: {
        siteKey: "site-key",
        secretKey: testValues.recaptchaSecret,
      },
    });

    await integrationsService.enable(context, {
      key: "google_auth",
      credentials: {
        clientId: "client-id",
        clientSecret: testValues.googleClientSecret,
      },
    });

    await integrationsService.enable(context, {
      key: "email",
      credentials: {
        gatewayUrl: "https://example.com/mail",
        fromAddress: "test@example.com",
        apiKey: testValues.emailApiKey,
      },
    });

    // Collect all responses
    const listResult = JSON.stringify(await integrationsService.list(context));

    // Verify no secrets in responses
    assert(
      !listResult.includes(testValues.recaptchaSecret),
      "List does not contain recaptcha secret",
    );
    assert(
      !listResult.includes(testValues.googleClientSecret),
      "List does not contain google secret",
    );
    assert(!listResult.includes(testValues.emailApiKey), "List does not contain email key");
  });

  it("no document contains INTEGRATION_ENCRYPTION_KEY", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    const encryptionKey = "34".repeat(32);
    context.integrationEnv.connectionTester = async () => {};

    const keyHex = encryptionKey.toLowerCase();
    const keyUpper = encryptionKey.toUpperCase();
    const keyBase64 = Buffer.from(encryptionKey, "hex").toString("base64");

    await integrationsService.enable(context, {
      key: "recaptcha",
      credentials: {
        siteKey: "site-key",
        secretKey: "secret-key",
      },
    });

    const tablesJson = JSON.stringify(f.tables);
    assert(!tablesJson.includes(keyHex), "DB does not contain key in lowercase");
    assert(!tablesJson.includes(keyUpper), "DB does not contain key in uppercase");
    assert(!tablesJson.includes(keyBase64), "DB does not contain key in base64");
  });

  it("rejects non-administrator", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.user!.roles = ["faculty"];
    // Still has integrations.write permission, but not super_admin role

    await assert.rejects(
      () =>
        integrationsService.enable(context, {
          key: "recaptcha",
          credentials: {
            siteKey: "test",
            secretKey: "test",
          },
        }),
      (error: any) => {
        assert.equal(error.code, "FORBIDDEN");
        return true;
      },
    );

    assert.equal(f.tables.IntegrationSetting?.length || 0, 0);
  });

  it("rejects MFA-unenforced admin without MFA verification", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.user!.mfaVerified = false;
    context.user!.mfaEnrolled = true;

    await assert.rejects(
      () =>
        integrationsService.enable(context, {
          key: "recaptcha",
          credentials: {
            siteKey: "test",
            secretKey: "test",
          },
        }),
      (error: any) => {
        assert.equal(error.code, "FORBIDDEN");
        return true;
      },
    );

    assert.equal(f.tables.IntegrationSetting?.length || 0, 0);
  });

  it("rejects without INTEGRATION_ENCRYPTION_KEY", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.integrationEnv.integrationEncryptionKey = undefined;

    await assert.rejects(
      () =>
        integrationsService.enable(context, {
          key: "recaptcha",
          credentials: {
            siteKey: "test",
            secretKey: "test",
          },
        }),
      (error: any) => {
        assert.equal(error.code, "SERVICE_UNAVAILABLE");
        assert(error.message.includes("INTEGRATION_ENCRYPTION_KEY"));
        return true;
      },
    );

    assert.equal(f.tables.IntegrationSetting?.length || 0, 0);
  });

  it("stores only ciphertext and returns no secret when enabling", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.integrationEnv.connectionTester = async () => {};
    const secret = "recaptcha-secret-value-0042";
    const enabled = await integrationsService.enable(context, {
      key: "recaptcha",
      credentials: { siteKey: "public-site-key-1", secretKey: secret },
    });
    assert.ok(!JSON.stringify(enabled).includes(secret));
    const row = f.tables.IntegrationSetting!.find((item: any) => item.key === "recaptcha")!;
    assert.equal(row.enabled, true);
    assert.ok(!JSON.stringify(row).includes(secret));
    const listed = (await integrationsService.list(context)).find(
      (item) => item.key === "recaptcha",
    )!;
    assert.deepEqual(
      listed.fields.map((field) => [field.name, field.set, field.hint, field.value]),
      [
        ["siteKey", true, null, "public-site-key-1"],
        ["secretKey", true, "0042", null],
      ],
    );
    assert.equal(listed.credentialStatus, "ok");
    assert.equal(listed.credentialsUpdatedBy, null, "unknown editor ids are not echoed");
  });

  it("keeps a stored secret when an update leaves it blank", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    const tested: Record<string, string>[] = [];
    context.integrationEnv.connectionTester = async (_key, values) => {
      tested.push(values);
    };
    await integrationsService.enable(context, {
      key: "recaptcha",
      credentials: { siteKey: "site-key-before", secretKey: "secret-key-unchanged-77" },
    });
    const updated = await integrationsService.updateCredentials(context, {
      key: "recaptcha",
      credentials: { siteKey: "site-key-after", secretKey: "" },
    });
    assert.deepEqual(tested.at(-1), {
      siteKey: "site-key-after",
      secretKey: "secret-key-unchanged-77",
    });
    assert.ok(!JSON.stringify(updated).includes("secret-key-unchanged-77"));
    const audit = f.tables.AuditLog!.find(
      (log: any) => log.action === "integrations.update",
    ) as any;
    assert.equal(audit.summary, "Updated reCAPTCHA keys");
  });

  it("keeps secrets out of every response, including auth config and the audit log", async () => {
    const f = modelFixture();
    const context = adminContext(f);
    context.user!.permissions = ["integrations.read", "integrations.write", "audit.read"];
    context.integrationEnv.connectionTester = async () => {};
    const secrets = [
      "recaptcha-secret-aaaa-1111",
      "client-secret-bbbb-2222",
      "gateway-key-cccc-3333",
    ];
    const responses: unknown[] = [
      await integrationsService.enable(context, {
        key: "recaptcha",
        credentials: { siteKey: "site-key-public", secretKey: secrets[0]! },
      }),
      await integrationsService.enable(context, {
        key: "google_auth",
        credentials: { clientId: "client-id-public", clientSecret: secrets[1]! },
      }),
      await integrationsService.enable(context, {
        key: "email",
        credentials: {
          gatewayUrl: "https://mail.example.test/send",
          fromAddress: "alumni@example.test",
          apiKey: secrets[2]!,
        },
      }),
      await integrationsService.updateCredentials(context, {
        key: "email",
        credentials: { fromAddress: "office@example.test", apiKey: "" },
      }),
    ];
    invalidateIntegrationEnvCache();
    const { resolveIntegrationEnv } = await import("../integrations/credential-store");
    const resolved = {
      ...context,
      integrationEnv: await resolveIntegrationEnv(f.db, context.integrationEnv, {
        production: true,
      }),
    };
    responses.push(await integrationsService.list(resolved));
    responses.push(await authService.config(resolved, undefined as never));
    responses.push(await auditService.list(resolved, { page: 1, pageSize: 50 }));
    const body = JSON.stringify(responses);
    for (const secret of secrets)
      assert.ok(!body.includes(secret), "a secret leaked into a response");
    assert.ok(body.includes("site-key-public"), "public site key stays visible");
  });
});
