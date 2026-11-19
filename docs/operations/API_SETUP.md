# Secure API Setup

This is a setup guide, not evidence of live activation. No provider account, billing, live credential, integration toggle, or database record was changed to produce it. Use separate development, staging and production identities, keys and resources. Never send credentials through chat.

The selected deployment is Render. Root secrets use Render environment injection; production provider credentials use the application's encrypted Settings › Integrations store. No AWS/Google Secrets Manager SDK is currently wired. The database credential store is application-managed, not a substitute for a managed KMS or an independently audited vault.

## Summary

Rotation intervals below are recommended operating policy, not provider-enforced expiration. Rotate immediately after suspected exposure, staff departure or unexpected use, even when the scheduled interval has not elapsed.

| API                                    | Enabled via                                                                | Auth type                                                                | Env var                                                                | Scopes                                                                    | Rotation                                                              |
| -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| MongoDB Atlas                          | Atlas database user + Network Access                                       | Database username/password over TLS; not an Atlas administration API key | `MONGO_URI`                                                            | `readWrite` on `alumni_tracking` for core CRUD                            | 90 days / incident                                                    |
| reCAPTCHA v2 Checkbox                  | reCAPTCHA registration console                                             | Public site key + backend secret                                         | `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`                           | Exact authorized hostnames                                                | 90 days / incident                                                    |
| Google Sign-In                         | Google Auth Platform                                                       | **OAuth 2.0 authorization code / OIDC**, not a static API key            | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                             | `openid email profile`                                                    | Client secret: 90 days / incident                                     |
| Google Drive                           | Cloud API Library + Workspace Shared Drive                                 | **Service-account JWT → OAuth access token**                             | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID`                | Runtime `drive.file`, `drive.readonly`; connection check requests `drive` | JSON key: at most 90 days; access tokens short-lived                  |
| Google Sheets                          | Cloud API Library + share target spreadsheet                               | **Separate service-account JWT → OAuth access token**                    | `GOOGLE_SHEETS_SPREADSHEET_ID`; JSON entered in its own Settings field | `spreadsheets.readonly` / `spreadsheets`                                  | Separate JSON key: at most 90 days                                    |
| Email HTTPS gateway                    | Provider domain verification + sending key; Resend is a compatible example | Bearer sending key                                                       | `SMTP_URL`, `SMTP_FROM`, `EMAIL_GATEWAY_API_KEY`                       | Sending only, restricted to one verified domain                           | 90 days / incident                                                    |
| ImgBB image host (optional)            | ImgBB API account                                                          | Upload API key                                                           | `IMGBB_API_KEY`, `IMAGE_HOST_PROVIDER`                                 | No documented fine-grained scopes; dedicated account                      | 90 days if regeneration supported; otherwise incident/support process |
| Google Forms delivery                  | Form-bound Apps Script + installable trigger + app integration             | Google-authorized script + shared webhook secret                         | `GOOGLE_FORMS_WEBHOOK_SECRET` (legacy mapping)                         | Current form + external requests; trigger-management scope only if needed | Webhook secret: 90 days / incident                                    |
| Pwned Passwords (optional)             | Set opt-in mode; no console enablement                                     | None for password range endpoint                                         | `PASSWORD_BREACH_CHECK`                                                | Five-character SHA-1 prefix only                                          | No credential to rotate                                               |
| SMS verification (**not implemented**) | Provider selection and adapter required; Twilio Verify is an example       | Proposed restricted API key + Verify Service                             | No SMS env variables are consumed today                                | Verification send/check only                                              | Proposed key: 90 days / incident                                      |
| Render secret delivery                 | Service → Environment                                                      | Dashboard RBAC; no API token needed for manual setup                     | Root keys listed below                                                 | One service/environment; no shared production/dev group                   | Root-key rotation requires coordinated application procedure          |

Provider env names in this table are **legacy development/bootstrap mappings**, except runtime/root settings such as `MONGO_URI`. In production, setting `GOOGLE_CLIENT_SECRET`, `IMGBB_API_KEY`, etc. in Render alone does **not** configure those integrations. Provider values must be saved through the authorized application UI.

## Secret storage and configuration code

### Render and source control

1. Create environment-specific Render services/resources. Restrict dashboard access and require MFA. Do not share production secrets with preview/development services.
2. Set `MONGO_URI`, `SESSION_SECRET`, `MFA_ENCRYPTION_KEY` and `INTEGRATION_ENCRYPTION_KEY` in that service's Environment editor. Copied ciphertext initially requires its original key values; do not replace them blindly. This restore prerequisite is not permission to share development/production keys indefinitely. Before a release claiming strict environment isolation, approve coordinated re-encryption/reprovisioning and session/MFA handling so each environment has independent keys. Preserve the original recovery material until that migration is verified. Optional backups require their own distinct `BACKUP_ENCRYPTION_KEY`.
3. Choose **Save only** while preparing a blocked release. **Save and deploy** redeploys the existing build; **Save, rebuild, and deploy** also rebuilds it. Neither is authorized by this guide.
4. Save provider credentials through **Settings › Integrations** as a Super Admin. The application tests eligible connections, encrypts values with AES-256-GCM, and uses a five-second per-process credential cache. Do not dump decrypted configuration for troubleshooting.
5. A disabled integration and provider-side revocation are different actions. Disabling in the app erases its stored credentials but does not revoke the provider key. Do both when retiring access.

Keep these patterns in `.gitignore` (already present in this repository):

```gitignore
.env
.env.*
!.env.example
!.env.*.example
!.env.schema
```

The placeholder catalog is [`config/apis/.env.example`](../../config/apis/.env.example). It is not a runnable production configuration. For complete runtime/security settings use the [production runtime example](../../apps/server/.env.production.example) and [Render runbook](RENDER_DEPLOYMENT.md). Never copy provider secrets into frontend `VITE_*` variables, public assets, shell command arguments, screenshots, logs, or Git.

### Actual loader used by the API

Render supplies root secrets as process environment variables. The API's validated environment module reads them; production resolves provider values exclusively from encrypted database records. This server-only example uses existing code, with no new secrets SDK:

```ts
// Example maintenance module located in apps/server; not browser code.
import { db } from "./src/services.ts";
import { readIntegrationEnv } from "./src/context.ts";
import { resolveIntegrationEnv } from "@Alumni-Tracking-Ss/api/integrations/credential-store";
import { isIntegrationEnabled } from "@Alumni-Tracking-Ss/api/integrations/registry";
import type { IntegrationKey } from "@Alumni-Tracking-Ss/contracts/integration-credentials";
import type { IntegrationEnv } from "@Alumni-Tracking-Ss/api/context";

function required(value: string | undefined): string {
  if (!value || /<[^>]+>/.test(value)) throw new Error("Required configuration is missing.");
  return value;
}

async function withProvider(key: IntegrationKey, check: (env: IntegrationEnv) => Promise<void>) {
  try {
    await db.ready();
    if (!(await isIntegrationEnabled(db, key))) throw new Error("Integration is disabled.");
    const env = await resolveIntegrationEnv(db, readIntegrationEnv(), { production: true });
    await check(env); // Never log env, request headers, or provider response bodies.
  } finally {
    await db.disconnect();
  }
}
```

Per-API snippets below use this loader in a separate operator-run module/job. They are documentation examples, not installed scripts. Catch errors at the job boundary and report only a generic failure; inspect details privately in the provider dashboard. **None of these live tests was run for this guide.** Run write/send tests only in approved isolated staging with synthetic data and a controlled recipient. Connection checks do not establish production readiness, delivery, or correct write permissions.

## 1. MongoDB Atlas

**Enable and least privilege:** Atlas → Database Access → create an environment-specific database user. Grant core API access only to `readWrite` on `alumni_tracking`, not `atlasAdmin`, `root`, or all databases. Use separate, reviewed operator credentials for administrative restore/migration tasks if their privileges exceed runtime needs. This app uses the MongoDB driver, not the Atlas Administration API; no Atlas project API key is needed for CRUD.

Atlas → Network Access → allow only the approved Render outbound IPs/CIDRs for the actual service/region. Never use `0.0.0.0/0`. Keep TLS verification enabled. Store the URI privately as `MONGO_URI`, explicitly selecting `/alumni_tracking`; URL-encode credentials. Leave `DATABASE_URL` unset, or use an identical value if compatibility requires it. Never switch local tests to Atlas.

**Configuration and read-only test:** Render injects the secret, and the existing resolver loads it without echoing it:

```ts
import { createDatabase, resolveDatabaseUrl } from "@Alumni-Tracking-Ss/db";
const database = createDatabase({ DATABASE_URL: resolveDatabaseUrl(process.env) });
try {
  await database.ready();
  await database.connection.db!.command({ ping: 1 });
  console.log("Database ping passed");
} finally {
  await database.disconnect();
}
```

Run only with a separately approved target/environment. Ping proves connectivity, not CRUD permissions, schema readiness or backup recovery. Later verify one approved synthetic write/read/update/delete through the protected API, not by overwriting existing profiles.

**Quotas/billing:** Cluster tier, storage, backups, connections and data transfer have separate limits/costs. Review the selected Atlas plan and current usage; no universal request-per-second allowance applies. Budget alerts are not spending caps.

**Rotation/revocation:** Every 90 days, provision a replacement least-privilege database user, privately update the Render URI, redeploy only with approval, verify connectivity/core CRUD, then delete the old user. Changing the existing user's password can interrupt pooled connections; plan the transition. Immediately revoke compromised access. See [Atlas operations](MONGODB_ATLAS.md).

## 2. reCAPTCHA v2 Checkbox

**Enable:** Register a **v2 “I'm not a robot” checkbox** site at the [registration console](https://www.google.com/recaptcha/admin/create). Use different site/secret pairs for each environment. Allow only the production hostname for production and the intended local/staging hostnames on separate keys. Keep domain validation enabled; do not add unrelated domains or treat the public site key as a secret.

The application uses `/recaptcha/api/siteverify`, not the Enterprise `CreateAssessment` API. An Enterprise-only key or API key is not a drop-in replacement. If the console no longer offers a compatible setup, stop and review an adapter change rather than substituting credentials.

**Storage/config/test:** UI fields `siteKey` / `secretKey`; legacy names `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY`.

```ts
import { testIntegrationConnection } from "@Alumni-Tracking-Ss/api/integrations/connection-test";
await withProvider("recaptcha", async (env) => {
  await testIntegrationConnection(
    "recaptcha",
    {
      siteKey: required(env.recaptchaSiteKey),
      secretKey: required(env.recaptchaSecretKey),
    },
    { env, adminEmail: required(process.env.API_TEST_RECIPIENT) },
  );
  console.log("CAPTCHA credential probe passed");
});
```

This intentionally submits a dummy token: a valid secret should produce `invalid-input-response`, not `invalid-input-secret`. It does not prove the hostname/site-key pair works. Complete one real browser challenge in staging; tokens are short-lived and single-use.

**Quotas/billing:** Review the key's actual product tier. The current Cloud billing page describes a 10,000-assessment monthly organization allowance and paid tiers; do not assume this is an unlimited legacy allowance or that Enterprise credentials are compatible. Over-quota errors can prevent registration/login. Obtain billing approval before upgrading.

**Rotation/revocation:** At 90 days or an incident, replace/rotate the pair using the console's supported flow, update both UI fields, reload clients and test a real challenge before retiring the old pair. Delete compromised registrations/keys. Never enable a production checkbox fallback.

## 3. Google Sign-In: OAuth required

**Enable:** In a separate Google Cloud project for the environment, configure **Google Auth Platform → Branding, Audience, Data Access, Clients**. Choose Internal only if the institution's Workspace organization permits it; otherwise use External and comply with consent/verification requirements. Create a **Web application OAuth client**.

Set the exact JavaScript origin to the deployed HTTPS origin, and the authorized redirect URI to:

```text
<YOUR_HTTPS_ORIGIN>/api/auth/google/callback
```

The callback is intentionally **unversioned**; do not change it to `/api/v1/auth/google/callback`. Register development callback URIs only on the development client. Request only `openid email profile`; do not enable Gmail, Drive, contacts or admin scopes for login. A Google API key or service account cannot replace this user-consent flow. Keep application institutional-domain and MFA policies enabled.

**Storage/config/test:** UI `clientId` / `clientSecret`; legacy `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

```ts
await withProvider("google_auth", async (env) => {
  await testIntegrationConnection(
    "google_auth",
    {
      clientId: required(env.googleClientId),
      clientSecret: required(env.googleClientSecret),
    },
    { env, adminEmail: required(process.env.API_TEST_RECIPIENT) },
  );
  console.log("OAuth client probe passed");
});
```

Use the `testIntegrationConnection` import from section 2. The dummy-code probe expects `invalid_grant` and does not prove consent, redirects, verified claims or domain restrictions. Complete a real staging sign-in in a browser; never paste authorization codes, tokens or cookies into chat.

**Quotas/billing:** Basic OIDC sign-in does not require buying unrelated Workspace APIs. OAuth verification, consent status, organization policy and project-specific limits still apply; inspect the console. Other Google services have independent billing.

**Rotation/revocation:** Review every 90 days. Rotate/reset the client secret using the console's available overlap flow, update encrypted credentials and verify sign-in before disabling the old secret. If replacing the client ID, account for consent/grant changes. Disable/delete compromised clients and revoke Google grants as appropriate. Provider revocation does not automatically terminate already-issued application sessions; handle those under the account-security incident procedure.

## 4. Google Drive: service-account OAuth required

**Enable:** Cloud Console → APIs & Services → Library → enable **Google Drive API**, or have an authorized project operator run:

```sh
gcloud services enable drive.googleapis.com --project="<YOUR_ENVIRONMENT_PROJECT_ID>"
```

Create a dedicated Drive service account for this environment. Do **not** grant project Owner/Editor or domain-wide delegation. An operator needs permission to enable services/create that service account; the runtime identity does not need those administration roles. Organization policy may forbid downloaded JSON keys. The current adapter requires JSON key material; if keys are forbidden, use an approved future keyless adapter rather than weakening policy.

Create a dedicated **Workspace Shared Drive/folder**, not a personal My Drive folder: service accounts cannot own files or supply a personal storage quota. Grant only the folder/drive access needed to upload and read private evidence. Start with Contributor/writer for those operations and validate against the institution's Shared Drive policy; grant no Manager role unless an additional reviewed operation truly requires it. Keep link sharing restricted. OAuth scopes do not replace Drive ACLs.

The connection test requests `https://www.googleapis.com/auth/drive`; runtime uploads request `drive.file`, and downloads request `drive.readonly`. Thus the current implementation does **not** use `drive.file` exclusively. Contain access with a dedicated identity and restricted resource ACL, not an inaccurate scope claim.

**Storage/config/read test:** UI `serviceAccountJson` / `folderId`; legacy `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_DRIVE_FOLDER_ID`. Download JSON only into restricted private storage and transfer it directly to the authorized UI; never commit it.

```ts
import { googleAccessToken } from "@Alumni-Tracking-Ss/api/integrations/files";
await withProvider("google_drive", async (env) => {
  const token = await googleAccessToken(required(env.googleServiceAccountJson), [
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(required(env.googleDriveFolderId))}`,
  );
  url.searchParams.set("fields", "mimeType");
  url.searchParams.set("supportsAllDrives", "true");
  const result = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!result.ok) throw new Error("Drive read probe failed");
  console.log("Drive read probe passed");
});
```

Then upload/download one synthetic evidence file through the authorized staging API. A folder read does not prove upload permission. Evidence must never use public ImgBB hosting.

**Quotas/billing:** Current Drive documentation distinguishes grandfathered projects from projects receiving new quotas from May 1, 2026. For new-quota projects it lists 1,000,000 quota units/min/project and 325,000/min/user/project, with method-dependent unit costs. Do not apply old request-count limits to every project. Workspace storage, daily upload limits and egress/billing thresholds are separate. The provider currently documents a 750 GB/user/day upload/copy limit and a 5 TB upload-file ceiling; this app's evidence-file ceiling is only 10 MiB. Inspect the actual project and [current limits](https://developers.google.com/workspace/drive/api/guides/limits); pricing transitions are announced for 2026. Respect 403/429 and bounded backoff.

**Rotation/revocation:** Rotate JSON keys at most every 90 days: create replacement under the same restricted identity, update the encrypted field, verify, then disable/delete the old key in IAM. Remove unused resource ACLs. Token refresh is not key rotation. Short-lived bearer tokens can remain valid after key revocation; use incident containment appropriate to the affected identity/resources.

**Isolation limitation:** Sheets must not reuse this identity under the selected separate-service policy. The current image-host Drive option and optional off-host backup copy also reuse this Drive integration's identity/folder. They do not provide separately configurable service credentials. Do not activate those optional paths when separate photo/backup identities are mandatory; a future adapter change or separately operated backup path is required.

## 5. Google Sheets: separate service-account OAuth required

**Enable:**

```sh
gcloud services enable sheets.googleapis.com --project="<YOUR_ENVIRONMENT_PROJECT_ID>"
```

Create a **different service account/key** from Drive and Sign-In. No project Editor/Owner role or domain-wide delegation is needed. Share only the target spreadsheet with its email: Viewer for import-only, Editor when exports must append rows. Select **Use its own service account** in the Sheets UI, not **Reuse Google Drive**. The API cannot restrict OAuth scope to a tab; resource sharing is the primary resource boundary.

**Storage/config/test:** UI `account=own`, `serviceAccountJson`, `spreadsheetId`. Legacy ID: `GOOGLE_SHEETS_SPREADSHEET_ID`. There is **no separately consumed `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` environment setting** today. Enter the dedicated JSON through the UI; the legacy shared `GOOGLE_SERVICE_ACCOUNT_JSON` is not a separate Sheets identity.

```ts
await withProvider("google_sheets", async (env) => {
  const json = required(env.googleSheetsServiceAccountJson); // No Drive fallback in this check.
  const token = await googleAccessToken(json, [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ]);
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(required(env.googleSheetsSpreadsheetId))}`,
  );
  url.searchParams.set("fields", "spreadsheetId");
  const result = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!result.ok) throw new Error("Sheets read probe failed");
  console.log("Sheets read probe passed");
});
```

Use `googleAccessToken` from section 4. Reading uses `spreadsheets.readonly`; app exports use `spreadsheets`. Validate an approved append separately on a dedicated synthetic staging sheet, then remove only that test row. Never validate against real alumni rows by bulk import/export.

**Quotas/billing:** Published defaults: reads **300/min/project, 60/min/user/project**; writes the same, separately. A service account counts as one user. Standard usage is currently documented at no additional cost, with quota-overage charging changes planned in 2026; verify the project's current billing before activation. Handle 429 with bounded exponential backoff. The app's current import reads `A1:Z1000`; a provider quota increase does not expand this application range.

**Rotation/revocation:** At most every 90 days, replace this account's JSON key, update the **own** credential field, verify, disable/delete the old IAM key. Remove spreadsheet sharing when retired. Do not rotate Drive just because Sheets credentials change.

## 6. Email HTTPS gateway (Resend-compatible example)

No email vendor has been activated by this guide. The current app requires a public **HTTPS JSON** endpoint accepting `{ from, to, subject, text }` with `Authorization: Bearer`. `SMTP_URL` is a legacy name: direct `smtp://` or `smtps://` is **not implemented**. SendGrid/Mailgun/Postmark credentials are not automatically compatible with this wire contract.

**Enable/least privilege:** A compatible example is [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email). In its dashboard, verify a separate sending domain/subdomain for each environment using the required DNS records. Create a **sending-access** key restricted to that domain, not a full-access administration key. Configure the approved sender address and public HTTPS gateway. Use SPF/DKIM and the institution's DMARC policy; test controlled delivery, not just HTTP acceptance. If an institution already has a compatible gateway, use its equivalent send-only authorization instead.

**Storage/config/send test:** UI `gatewayUrl`, `fromAddress`, `apiKey`; legacy `SMTP_URL`, `SMTP_FROM`, `EMAIL_GATEWAY_API_KEY`.

```ts
import { sendEmail } from "@Alumni-Tracking-Ss/api/integrations/email";
await withProvider("email", async (env) => {
  required(env.smtpUrl);
  required(env.smtpFrom);
  required(env.emailApiKey);
  await sendEmail(env, {
    to: required(process.env.API_TEST_RECIPIENT),
    subject: "Controlled integration test",
    text: "Synthetic staging test; no student data.",
  });
  console.log("Gateway accepted message; confirm receipt privately");
});
```

This sends a message and may incur a charge. No bulk test or alumni notification is authorized. Resend requires a User-Agent; verify the actual runtime request/provider logs satisfy that requirement (Node fetch normally supplies one). Do not follow credential-bearing redirects. Existing code checks public DNS before sends, but a DNS-rebinding race remains documented in [known issues](../known-issues.md); a pinned/allowlisted provider connection is separate hardening work.

**Quotas/billing:** Resend currently documents a default **10 requests/sec per team**, shared by keys; inspect the actual team usage page and plan's daily/monthly sending cap. Multiple keys do not multiply the team rate. A successful API response does not imply inbox delivery. Domain registration, email plan and overage costs require approval.

**Rotation/revocation:** Every 90 days, issue a new domain-restricted send-only key, update encrypted credentials, send one controlled test, then delete the old key in the provider dashboard. In an incident revoke first if continued access is unsafe. App disable alone does not revoke the provider key.

## 7. ImgBB (optional, public images only)

**Enable/least privilege:** Register a dedicated environment/service account at [ImgBB API](https://api.imgbb.com/) and obtain its upload key. The public API documentation does not establish fine-grained scopes, IP/referrer restrictions or a guaranteed rate quota; verify account controls with the provider. Do not claim restrictions that the provider does not offer.

ImgBB uploads produce public image URLs. Authentication on this application's photo route cannot make the underlying URL private. Do not upload evidence or personal photos without the institution's explicit publication approval. Prefer existing private disk storage when that approval is absent. Do not enable both alternative image stores merely to tick an “all APIs” box.

**Storage/config/write test:** UI image host `provider=imgbb` / `apiKey`; legacy `IMAGE_HOST_PROVIDER`, `IMGBB_API_KEY`. Use only a disposable synthetic image:

```ts
await withProvider("image_host", async (env) => {
  if (env.imageHostProvider !== "imgbb") throw new Error("ImgBB is not selected");
  const result = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({
      key: required(env.imgbbApiKey),
      image: required(process.env.SYNTHETIC_IMAGE_BASE64),
      expiration: "60",
    }),
  });
  const payload = await result.json();
  if (!result.ok || payload.success !== true) throw new Error("Image probe failed");
  console.log("Synthetic image uploaded with 60-second expiry");
});
```

The key is in the POST body, never a CLI argument or printed URL. The current application connection tester uses a key-bearing ImgBB query URL; ensure proxy/APM URL logging is redacted, or prefer the body-only manual probe above. Do not log the returned image/delete URLs.

**Quotas/billing:** Provider docs list a **32 MB** upload ceiling and optional expiration **60–15,552,000 seconds**. Application limits can be smaller. The site calls this free image hosting, but public docs do not establish a numerical request allowance/SLA; verify terms, account limits and retention before relying on it. Unknown quota does not mean unlimited.

**Rotation/revocation:** Review every 90 days. Use the dashboard's supported regenerate/revoke flow, or obtain provider support if no such control exists; do not invent an undocumented revocation API. Replace the stored key and confirm a disposable upload. Revoking a key does not delete already-public images: use retained deletion links/provider support and the approved retention process separately.

## 8. Google Forms delivery / Apps Script

**Enable:** This integration is an inbound webhook, **not the Google Forms REST API**. There is no need to enable `forms.googleapis.com` just for the implemented path. In an approved staging environment, validate the index/receipt prerequisites in [Forms delivery](FORMS_WEBHOOK.md). Do not run a migration against populated Atlas as a setup shortcut.

A Super Admin enables **Google Forms** in Settings; the server generates a webhook secret and shows it once. Store it privately in the form-bound Apps Script's **Project Settings → Script Properties**, under `GOOGLE_FORMS_WEBHOOK_SECRET`. Store the HTTPS webhook URL separately. Restrict script editor access: Script Properties are accessible to script editors and are not an independent managed vault.

Use a dedicated institution-controlled sender identity per environment/form workflow. Create an installable **From form → On form submit** trigger. Authorize only the current form (`forms.currentonly`) and `script.external_request`; add trigger-management `script.scriptapp` only when creating/deleting triggers programmatically. Inspect the actual consent scopes and avoid unrelated Gmail/Drive/admin access.

**Configuration code (Apps Script):**

```js
function webhookConfig() {
  const store = PropertiesService.getScriptProperties();
  const secret = store.getProperty("GOOGLE_FORMS_WEBHOOK_SECRET");
  const url = store.getProperty("ALUMNI_WEBHOOK_URL");
  if (!secret || !url || !url.startsWith("https://")) throw new Error("Missing webhook setup");
  return { secret, url }; // Never Logger.log this object.
}
```

Legacy environment mapping: `GOOGLE_FORMS_WEBHOOK_SECRET`. Production instead reads the generated encrypted integration credential through `resolveIntegrationEnv`.

**Minimal test call:** After separately approving a synthetic staging fixture, run this operator snippet using the common server-side loader:

```ts
import { randomUUID } from "node:crypto";
await withProvider("google_forms", async (env) => {
  const body = JSON.stringify(JSON.parse(required(process.env.FORM_SMOKE_PAYLOAD_JSON)));
  const eventId = `smoke:${randomUUID()}`;
  const url = `${required(env.appUrl)}/api/v1/integrations/google-forms/webhook`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": required(env.googleFormsWebhookSecret),
        "Idempotency-Key": eventId,
      },
      body,
    });
    if (!result.ok) throw new Error("Staging webhook probe failed");
  }
  console.log("Two deliveries accepted; verify one import job and replay result privately");
});
```

This test **writes data**. Supply a schema-valid synthetic payload mapped to existing staging program/department records; never use real student data. Verify both deliveries return the same import job and only one effect. The full sender still needs durable retries, alerting and dead-letter handling: a sample trigger alone is not production acceptance. Retry the **same** event ID and body, honor `Retry-After`, and treat 401/403/409 as investigation conditions. A legitimate edit needs a new versioned event ID.

**Quotas/billing:** Apps Script currently lists URL Fetch at **20,000/day consumer / 100,000/day Workspace**, trigger runtime **90 min/day / 6 hr/day**, and **6 min/execution**. Quotas are per user and may change; Workspace licensing/trial limitations apply. Retries consume quota. This workflow does not require buying Forms REST API access.

**Rotation/revocation:** Every 90 days or incident, pause the sender, update Forms credentials in the app to generate a new secret, privately update Script Properties, then verify and resume. The current server uses one active secret; no dual-secret grace is implemented. Preserve receipt IDs/history so queued deliveries remain idempotent. Disable the app integration, remove the trigger and revoke sender grants when retiring it.

## 9. Pwned Passwords (optional, no key)

**Enable/config:** No account, API key, OAuth consent or billing activation is needed for the public password **range** endpoint. Set `PASSWORD_BREACH_CHECK=hibp` privately in the runtime environment only after approving outbound availability/privacy policy; `local` retains dictionary-only screening. No `HIBP_API_KEY` is consumed by this app. Paid email-address breach-search APIs are unrelated and not implemented.

```ts
// process.env is populated by Render; the implementation reads this exact setting.
const enabled = process.env.PASSWORD_BREACH_CHECK === "hibp";
// A public fixed prefix tests availability without using anyone's password/hash.
const result = await fetch("https://api.pwnedpasswords.com/range/21BD1", {
  headers: { "Add-Padding": "true" },
  signal: AbortSignal.timeout(5000),
});
if (!result.ok) throw new Error("Password range probe failed");
console.log({ enabled, reachable: true });
```

Only five SHA-1 prefix characters are sent by the application; never send plaintext, a complete password hash or per-keystroke requests. Match suffixes locally. This app fails password operations explicitly when opted-in network screening is unavailable; it does not silently bypass screening.

**Quotas/billing/rotation:** Official documentation currently states no rate limit and no subscription requirement for Pwned Passwords range queries. Still use timeouts and avoid abusive traffic. No key rotation/revocation applies. Changing the optional screening mode is an authorized operational policy change, not an automatic outage workaround.

## 10. SMS verification: implementation blocker

There is no registered SMS integration, consumed SMS credential env var, or concrete `smsProvider` adapter at startup. Adding keys cannot enable SMS. Production `/health/ready` remains unhealthy until mandatory phone/email verification prerequisites are genuinely met. Do not change readiness to `/health/live` or disable verification to disguise this blocker.

**Provider setup example, not selected or implemented:** Twilio Verify can fit the existing `sendCode(phone)` / `checkCode(sid, phone, code)` interface. In a separate environment-specific account/subaccount, create a Verify Service, approve geographic permissions, enable fraud controls and review destination-specific registration/consent requirements. Create a **Restricted API key** limited to the supported verification send/check resources. Verify the actual permission matrix supports the endpoints; do not silently fall back to Main/Standard account-wide credentials. If restrictions cannot be enforced, stop for review.

**Proposed names only:** `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_VERIFY_SERVICE_SID`. These are documentation names, **not current app settings**. Do not populate them expecting today's server to send messages.

**Future-adapter configuration/test illustration:** This reads proposed values from service-specific Render secret injection. It is not wired into the application:

```ts
const keySid = required(process.env.TWILIO_API_KEY_SID);
const keySecret = required(process.env.TWILIO_API_KEY_SECRET);
const service = encodeURIComponent(required(process.env.TWILIO_VERIFY_SERVICE_SID));
const credentials = Buffer.from(`${keySid}:${keySecret}`).toString("base64");
const result = await fetch(`https://verify.twilio.com/v2/Services/${service}/Verifications`, {
  method: "POST",
  redirect: "error",
  signal: AbortSignal.timeout(15000),
  headers: {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({ To: required(process.env.SMS_TEST_TO), Channel: "sms" }),
});
if (!result.ok) throw new Error("Approved SMS send test failed");
console.log("Verification requested; inspect delivery privately");
```

A matching check POSTs `To` and `Code` to `/v2/Services/{ServiceSid}/VerificationCheck` with the same authentication. Accept only `status=approved`, not an HTTP 200 alone. Keep the OTP out of chat/logs and bind the result to the pending server-side phone challenge. Use only a controlled, consented test phone after billing approval. Provider test credentials do not prove real Verify SMS delivery.

**Quotas/billing:** Verify charges and SMS/destination/carrier charges may apply, including trial restrictions, geographic rules, concurrency and service-specific limits. Inspect the selected account and current pricing; this guide promises no free test or fixed global rate. Configure budget alerts, geographic restrictions, fraud controls and resend budgets; app throttles alone are not provider spending caps.

**Rotation/revocation:** Proposed policy: 90 days, with staged replacement of the restricted key and subsequent deletion of the old key. Immediately revoke compromised keys and halt sends; disable the Verify Service/account access as appropriate. Keep separate keys/services across environments. Adapter implementation, tests and a release/security review remain separate work.

## Manual dashboard checklist

- [ ] Approve which optional providers are actually needed; do not publish personal photos or enable billing just to enable every entry.
- [ ] Confirm environment-specific projects, accounts, service accounts, resources, owners and MFA-protected administrator access.
- [ ] Approve costs, quotas, alerts, retention, data residency and institutional privacy/consent requirements. Alerts alone do not cap spend.
- [ ] Configure Atlas database-scoped access and the actual service's egress allowlist; verify TLS and explicit database name. Keep local tests native.
- [ ] Prepare Render root secrets privately; preserve original keys until migrated ciphertext can be safely read. Complete a separately reviewed re-encryption/reprovisioning plan for independent environment keys before claiming strict production/dev isolation. Avoid unintended redeployment while release is blocked.
- [ ] Register the compatible CAPTCHA hostname/key pair and OAuth exact unversioned callback. Complete consent/publishing/organization reviews.
- [ ] Enable Drive/Sheets APIs; create separate identities; privately save JSON; share only the intended resources. Select Sheets **own** account.
- [ ] Validate whether Drive photo/backup credential reuse violates the required service separation. Keep unsupported optional paths unused rather than claiming isolation.
- [ ] Verify the email domain/DNS and create a domain-restricted sending-only key; select a gateway matching the implemented JSON/Bearer contract.
- [ ] Keep ImgBB unused unless public image hosting is explicitly approved and account restrictions/rotation have been verified.
- [ ] Set provider credentials through the Super Admin UI, not production provider env variables alone. Never seed/migrate populated Atlas merely to import credentials.
- [ ] Configure the Forms sender's private properties, scopes, trigger, stable event IDs, retries and replay-retention policy before enabling real imports.
- [ ] Run separately approved minimal staging tests; verify delivery/write access and expected failures, not just HTTP success. Do not log bodies, tokens or URLs carrying keys.
- [ ] Select and implement the SMS adapter in separate work. Verify real OTP send/check and keep strict readiness unchanged until it passes.
- [ ] Assign rotation/revocation ownership and dates. Coordinate encryption-key re-encryption and recovery via [credential operations](INTEGRATIONS.md); do not replace an encryption key independently of its data.
- [ ] Revoke old provider credentials after replacement verification; review existing application sessions and already-public files separately after an incident.
- [ ] Obtain explicit authorization for any live service configuration, paid resources or cutover. No such activation was performed here.

## Sources and code references

Provider documentation checked 2026-11-15; quotas/prices and console labels can change. The account's actual limits and current official terms govern.

- [Render environment variables and secrets](https://render.com/docs/configure-environment-variables)
- [MongoDB Atlas database access](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/) and [IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [reCAPTCHA setup](https://developers.google.com/recaptcha/intro), [verification](https://developers.google.com/recaptcha/docs/verify), [Cloud billing](https://cloud.google.com/recaptcha/docs/billing-information)
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Service-account key security](https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys)
- [Drive quotas](https://developers.google.com/workspace/drive/api/guides/limits), [Shared Drives](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
- [Sheets quotas](https://developers.google.com/workspace/sheets/api/limits)
- [Resend sending keys](https://resend.com/docs/api-reference/api-keys/create-api-key), [send endpoint](https://resend.com/docs/api-reference/emails/send-email), [rate limits](https://resend.com/docs/api-reference/introduction)
- [ImgBB upload API](https://api.imgbb.com/)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Pwned Passwords range API](https://haveibeenpwned.com/API/v3#PwnedPasswords)
- [Twilio Verify](https://www.twilio.com/docs/verify/api), [API key types](https://www.twilio.com/docs/iam/api-keys), [pricing by destination](https://www.twilio.com/en-us/verify/pricing)

Implementation boundaries were verified in `packages/contracts/src/integration-credentials.ts`, `packages/api/src/integrations/{registry,credential-store,connection-test,files,sheets,email,sms}.ts`, `packages/api/src/services/password-security.ts`, and `apps/server/src/modules/auth/google.controller.ts`. None of these runtime modules was changed for this guide.
