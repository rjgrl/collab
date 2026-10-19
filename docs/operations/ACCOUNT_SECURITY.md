# Account security: local operation and release review

Updated 2026-10-19. Local implementation and synthetic tests only; no deployment or live messages were sent.

## Update a development machine

Stop the dev server before regenerating Prisma on Windows, then run:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

Setup preserves existing accounts/data and fills missing private `SESSION_SECRET` and `MFA_ENCRYPTION_KEY` values with independent random values. It applies additive collections/indexes for `MfaCredential`, `AuthThrottle`, `PasswordReset` and Session proof/activity fields. Do not run data-loss/reset flags. An existing nonempty invalid key is preserved for operator correction. Back up valuable data before schema changes.

The native engine was locked during this audit. Generation was verified in an isolated folder, copying client sources while retaining the same-version engine; schema application and real transactions were tested in randomly named disposable databases. The working application database was not modified. Normal setup after stopping dev is the supported team workflow.

## Authenticator enrollment and recovery

Super Admin and accounts with user, role, permission or integration administration require MFA before any permission-protected API or private file access. Other accounts can enroll voluntarily through Settings → Account → Manage authenticator. Google does not waive the local second factor.

After primary sign-in, `/security` guides unenrolled administrators through current-password reauthentication and a manual authenticator setup key or `otpauth://` app link. Codes use standard six-digit TOTP, 30-second periods and a bounded ±30-second clock tolerance. Pending setup lasts ten minutes and is bound to its initiating session. Confirmation enables MFA and displays ten random 128-bit recovery codes once; store them privately outside the browser. The server stores only SHA-256 recovery digests and an AES-256-GCM encrypted authenticator secret bound to the account ID.

Subsequent sign-ins require a current authenticator or unused recovery code. Verification requires a primary session less than ten minutes old; otherwise sign out and sign in again. Used TOTP steps and recovery codes cannot be reused. Enrollment/challenge requests have shared per-account budgets. Replacing an authenticator requires the current password and a second factor verified within five minutes; replacement invalidates prior recovery codes and other sessions. Enrollment and successful challenge rotate the current session token. A password reset keeps MFA enabled.

If a local Super Admin loses both authenticator and recovery codes, a trusted operator with local OS access and the current account password can run:

```sh
pnpm exec tsx scripts/local-mfa-recovery.ts
```

This command refuses production, non-managed/remote databases and noninteractive terminals. It hides password input, requires the exact confirmation phrase, rechecks active Super Admin status/password within the recovery transaction, removes only that account's authenticator, revokes its sessions, and writes an audit event. Sign in and enroll again immediately. The core transaction is tested with synthetic users and real rollback; physical interactive terminal masking/recovery still needs an operator rehearsal. This is not an HTTP recovery endpoint or a production break-glass plan. Production recovery requires an approved identity-verification/operator procedure.

Keep `MFA_ENCRYPTION_KEY` (64 hex characters / 32 random bytes) in a private secret store and include it in separately protected recovery backups. Do not replace it casually: existing encrypted authenticator secrets would become unreadable. Key rotation/re-encryption and lost-key recovery need an approved runbook. Production startup rejects missing/invalid MFA keys and verification secrets shorter than 32 characters.

## Password policy and reset

Application enrollment/change/reset accepts 15–128 Unicode characters, including spaces, with no composition rules. New versioned hashes normalize Unicode to NFC and use Node scrypt with N=131072, r=8, p=1, independent 128-bit salts and a 64-byte derived key. Two active derivations and a bounded waiting queue limit per-process memory pressure. Legacy salted scrypt hashes remain valid and upgrade by compare-and-set after successful password login; no bulk rewrite or forced reset occurs. Local bootstrap generates a random password; historical bootstrap configuration is preserved.

The server screens new passwords against the MIT `@zxcvbn-ts/language-common` password dictionary. `PASSWORD_BREACH_CHECK=hibp` additionally opts into HTTPS k-anonymity screening: only five SHA-1 prefix characters are sent, padding is requested, and outages fail enrollment closed. SHA-1 is used for this lookup protocol only, never password storage. Offline screening is not an exhaustive compromised-password database. Tests force local mode except the explicit mocked HIBP test; no live breach queries were performed.

Forgot password returns a uniform response. Only active password accounts with a verified email and configured/enabled HTTPS mail gateway are eligible. Links contain a random 256-bit token in the URL fragment, expire in fifteen minutes, and are consumed atomically against the current password version. Only a token digest is stored. The browser removes the fragment from its address/history after reading it; refreshing requires reopening the original link. Reset revokes every session and keeps MFA. Changing a password rotates the current session, revokes others and preserves the existing second-factor assurance rather than granting it.

Legacy accounts lacking verified email are not silently trusted for reset. They can confirm their existing email from Account settings using the compact email-code dialog, without adding phone restrictions or losing existing access. Password recovery becomes eligible after successful confirmation. Delivery is synchronous: body/status enumeration defenses are tested, but mail-dependent response timing and durable retry/outbox behavior remain open. Existing signup still explicitly reports duplicate emails, preserving the requested product behavior; enumeration tradeoffs require review.

## Sessions and abuse controls

New opaque session tokens are stored as SHA-256 digests. Valid legacy raw tokens migrate on use without changing the browser credential. Stored digests are rejected as bearer credentials. Default limits are seven days absolute and thirty minutes idle (`SESSION_IDLE_MINUTES`, 1–1440); activity writes are coalesced to roughly once a minute. Login creates a new token, MFA and password changes rotate it, reset/logout revoke sessions, and role-assignment/password/status changes revoke affected sessions. Permissions still reload per request. Initial Google password creation consumes its recent Google proof, rotates its session and revokes other sessions.

Production uses a Secure, HttpOnly, host-only `__Host-ats_session` cookie with Path `/` and SameSite=Lax. Legacy cookie reads remain during the bounded session transition; development keeps its HTTP localhost cookie. Cookie mutations require trusted Origin/Referer. Explicit bearer clients receive rotated credentials in MFA/password-change results; browser calls receive only HttpOnly cookie updates.

`AuthThrottle` MongoDB counters are atomic and shared across processes. Password login defaults to five failed/in-flight attempts per normalized account per fifteen-minute fixed window, including unknown accounts. Successful logins refund their reservation; failure limits expire rather than permanently locking an account. MFA and reset have separate account/token budgets. IP limits default to thirty requests per fifteen minutes across all auth aliases. Production defaults to MongoDB IP counters; development defaults to memory. `AUTH_IP_STORE`, `AUTH_IP_LIMIT` (1–1000), `AUTH_IP_WINDOW_SECONDS` (1–86400), and `AUTH_ACCOUNT_LIMIT` (1–100) are validated. Fixed windows allow boundary bursts. Behind a proxy the socket peer may group users; do not trust arbitrary forwarded headers. Configure a trusted edge before opening access.

Expired throttle/reset/session records need an approved cleanup/TTL policy. Expiration is enforced in code even before physical cleanup; indexes on throttle/reset expiry support maintenance. This release does not silently delete existing audit or user records. Confirm TTL/index behavior after Prisma schema pushes.

## Performance and operations

Alumni/member list responses remain arrays and now accept `page` (default 1) and `pageSize` (default 20, max 100), with stable ID tie-breaks. Both UIs offer previous/next and reset the page when filters change. Without a total-count contract, a full last page can offer one empty next page; Previous remains available. API consumers must page through results rather than assume one response contains all records. CSV and Sheets exports reject over 10,000 rows explicitly; CSV supports department/tracking filters. Dashboard department statistics use one grouped query instead of two counts per department. Deep offset cost and real capacity remain unverified.

Every response has a server-generated request ID. Production or `HTTP_LOGGING=true` logs only request ID, method, status and duration; no URL/query, payload, cookies, email, OTP or authorization header is logged by that middleware. Readiness requires MongoDB to report a writable primary. Shutdown drains HTTP requests before disconnecting Prisma, with a ten-second forced-close deadline.

The pinned, read-only GitHub Actions quality workflow covers synthetic tests/build/browser/advisory gates. It has not run remotely and does not certify Linux, DB durability or real providers. Forms replay/idempotency, backup/restore rehearsal, monitoring alerts, CSP/TLS/host controls, privacy decisions and production recovery remain release gates.

## Reproduce security checks

```sh
pnpm test
pnpm test:browser
pnpm test:security-db
pnpm check-types
pnpm lint
pnpm check:secrets
pnpm audit
pnpm build
pnpm check:production-build
```

`test:security-db` creates a new random `collab_security_*` database on managed loopback rs0, applies the schema without reset or client generation, and rolls back synthetic account/MFA/reset records. It checks shared counters across independent clients. Small test databases/indexes and throttle test buckets remain as controlled artifacts; it never drops a database or touches the application database. Review any eventual cleanup explicitly. It is not a backup/restore or failover test.
