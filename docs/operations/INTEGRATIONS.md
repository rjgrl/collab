# Integration Credentials Management

This guide documents how integration credentials are stored, encrypted, and rotated in the Alumni Tracking System. For provider enablement, least-privilege scopes, verification calls, quotas and the manual checklist, see [Secure API Setup](API_SETUP.md).

## Overview

Integration credentials are encrypted at rest in the database using AES-256-GCM with an environment-only encryption key. This prevents credential exposure if the database is compromised or restored to a different environment.

## Storage

Credentials are stored in `IntegrationSetting` documents with the following fields:

- **credentials**: Record of encrypted field values using AES-256-GCM
- **credentialHints**: Last 4 characters of secret fields (for display only; not usable)
- **keyFingerprint**: First 8 hex chars of SHA-256(key) to detect key mismatches
- **credentialsUpdatedAt**: Timestamp of the most recent credential change
- **credentialsUpdatedBy**: User ID of who last changed the credentials
- **enabled**: Whether this integration is active

## Encryption Key

The encryption key is set via the `INTEGRATION_ENCRYPTION_KEY` environment variable:

```bash
# Generate a new key
openssl rand -hex 32

# Example (NEVER use this in production)
INTEGRATION_ENCRYPTION_KEY=<YOUR_PRIVATE_64_HEX_CHARACTER_KEY>
```

### Key Requirements

- **Format**: Exactly 64 hexadecimal characters (256 bits)
- **Uniqueness**: Must differ from `MFA_ENCRYPTION_KEY`, `SESSION_SECRET`, and `BACKUP_ENCRYPTION_KEY`
- **Rotation**: Requires coordinated re-encryption and runtime-key replacement. Changing the environment value alone makes existing ciphertext unreadable.
- **Backup**: Excluded from in-app/database backup bundles. Preserve a separately access-controlled recovery copy outside Git and outside those bundles; ciphertext cannot be recovered without its original key.
- **Production**: Required in production; application will not start without it

## Development Workflow

### Initial Setup

When setting up a development environment, `pnpm setup:local` generates a random `INTEGRATION_ENCRYPTION_KEY`:

```bash
pnpm setup:local
```

### Seeding Credentials from Environment Variables

The `pnpm db:seed` command copies integration credentials from environment variables into the encrypted database exactly once per integration:

```bash
# Set credentials in .env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SMTP_URL=https://...
EMAIL_GATEWAY_API_KEY=...

# Seed them into the database
pnpm db:seed
# Output: Seeded integration credentials: google_auth, email
```

**Important**: Environment variables are read once. After seeding:

- Credentials live in the encrypted database
- Environment variables are ignored (in production) or used as fallback (in development)
- To update, change them in the Settings › Integrations UI

### Configuration Fallback

**Development/Test**: If a credential is not in the database, the environment variable is used.
**Production**: Environment credentials are always ignored; only database credentials are used.

## Key Rotation

When the encryption key must be rotated (e.g., after a compromise):

### Rotation Procedure

1. **Generate a new key**:

   ```bash
   openssl rand -hex 32
   ```

2. **Set environment variables** (in your deployment script or manually):

   ```bash
   # Illustrative names only: supply real values through private secret injection,
   # not literal shell commands/history or CI logs.
   export INTEGRATION_ENCRYPTION_KEY_OLD="<YOUR_CURRENT_PRIVATE_KEY>"
   export INTEGRATION_ENCRYPTION_KEY_NEW="<YOUR_NEW_DISTINCT_PRIVATE_KEY>"
   ```

3. **Check first, then run the rotation** (`--dry-run` opens every value with the old key and writes nothing):

   ```bash
   pnpm db:rotate-integration-key -- --dry-run
   pnpm db:rotate-integration-key
   # Output:
   # Rotated credentials for: google_auth, email, google_drive
   # Total credentials rotated: 7
   ```

4. **Update the production deployment** to use the new `INTEGRATION_ENCRYPTION_KEY`.

5. **Verify** that the application starts and integrations still work.

### What Happens

- All stored credentials are re-encrypted with the new key
- The key fingerprint is updated for mismatch detection
- The process is atomic: if any credential fails, the entire operation aborts
- Credentials remain in the database; only the encryption key changes

## Disaster Recovery

### Scenario: Database restored with a different key

If the database is restored to an environment with a different `INTEGRATION_ENCRYPTION_KEY`:

1. **Symptom**: Integration settings appear in the UI but show "unable to read credentials"
2. **Cause**: The key fingerprint no longer matches the encryption key
3. **Recovery**:
   - Obtain the original `INTEGRATION_ENCRYPTION_KEY` used when credentials were stored
   - Restore that key to the environment
   - Restart the application
   - If the original key is lost, credentials must be re-entered in the UI

### Scenario: Credentials need to be re-entered

If credentials are lost or unreadable:

1. Go to **Settings › Integrations**
2. Click the integration that needs new credentials
3. Enter the new credentials and save
4. Credentials are encrypted and stored with the current `INTEGRATION_ENCRYPTION_KEY`

## API Details

### Reading Stored Credentials

The `resolveIntegrationEnv` function reads all IntegrationSetting rows, validates the key fingerprint, and decrypts the credentials into a unified environment object passed to every request.

**Caching**: Results are cached in-process for 5 seconds to avoid repeated database reads.

**Production Mode**: If production mode is enabled, environment credential variables are stripped before reading the database, forcing exclusive use of stored credentials.

### Credential AAD (Additional Authenticated Data)

Each credential is sealed with an AAD derived from the integration key and field name:

```
AAD = "integration:{key}:{fieldName}"
```

This binds each ciphertext to one integration and field, preventing reuse or mixing.

## Security Considerations

1. **Key Storage**: The encryption key is environment-only; never commit it to version control or store in the database.
2. **Logs**: The application never logs plaintext credentials or key material.
3. **Backups**: Database backups contain ciphertext only; the key is required to recover credentials.
4. **Network**: The key must not be transmitted; it is only used server-side for encryption/decryption.
5. **Testing**: The integration test fixture uses a deterministic key ("34" × 32) for reproducibility; never use this in production.

## Related Documentation

- [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) - General backup and recovery procedures
- [ACCOUNT_SECURITY.md](./ACCOUNT_SECURITY.md) - User authentication and authorization

## Resend (current Email provider)

Email now uses Resend only. Settings → Integrations → Email asks for **Resend API Key** and
**Verified Sender Email**, not an HTTPS gateway URL. Create a sending API key in Resend and verify
the sender domain's DNS records there first. Enable/update sends a test email to the signed-in
administrator; a rejected request saves nothing. Verify actual arrival (and spam folder) separately:
API acceptance is not a delivery guarantee. Resend's trial sender cannot deliver freely to arbitrary
recipients; use your verified domain for presentation accounts.

The encrypted credential field names `apiKey` and `fromAddress` stay stable. An old `gatewayUrl`
is never used to send mail. Existing deployments must re-enter a **Resend** key and verified sender
and successfully test them, rather than reusing another gateway's API key. No key should be pasted
into chat, committed, or copied into a database backup unencrypted. Verification codes, email-change
codes and password-reset links all use the same Resend sender.

Development-only environment fallback: `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Production uses
the encrypted database configuration, not provider environment credentials. Internal `smtpUrl` /
`smtpFrom` names remain compatibility/readiness fields; no SMTP connection or arbitrary gateway
request is made.
