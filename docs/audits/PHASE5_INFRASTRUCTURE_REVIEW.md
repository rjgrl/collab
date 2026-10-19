# Phase 5 infrastructure and operations review

2026-10-19. **Local simulation PASS; real infrastructure NOT TESTED.** Templates: `config/staging/server.env.example`, `nginx.conf.example`. Neither was deployed. Nginx/Docker/OpenSSL executables were unavailable on PATH; no real certificate, edge syntax, firewall, database principal or public host was provisioned.

Production startup now rejects URL paths/credentials/query ambiguity rather than just requiring a prefix, missing/invalid existing security keys, relative upload storage, memory IP budgets, unauthenticated/plaintext or certificate-bypass MongoDB settings and invalid numeric security limits. URI credentials must be correctly encoded; validation does not prove credentials, CA trust, permissions, replica transactions or connectivity. Optional unconfigured providers are not activated by this work; incomplete required delivery remains a blocker. Keep unavailable CAPTCHA/registration/delivery settings under explicit operator review rather than bypassing verification.

The server defaults to loopback (`HOST` may explicitly change this), with HTTP/1 header/request/keepalive timeouts of 10/30/5 seconds. The current global upload/body limit remains. Behind TLS termination, production mode creates Secure/HttpOnly/Lax host-prefixed cookies independent of forwarded scheme. CORS/CSRF compare the configured exact HTTPS browser origin. Tests use ordinary loopback HTTP with synthetic HTTPS origins and manually inspected cookie headers; real browser TLS termination and cookie migration remain pending.

## Proxy trust contract

`TRUSTED_PROXY_IPS` is blank by default. It accepts explicit IPs only, not wildcards/CIDRs/DNS names. A peer outside the list cannot override its address. A trusted edge must **overwrite** X-Forwarded-For with exactly one validated client address, as in the proposed Nginx template; appending a caller-supplied chain is incompatible and falls into the unknown budget. IPv4-mapped loopback is normalized. The resolver is shared by IP limits and session/audit metadata.

Socket tests establish synthetic budget separation and spoof rejection, not trustworthiness of an actual proxy. Restrict the backend port to the edge; any actor able to connect as an allowlisted peer can otherwise forge that header. Multiple trusted hops require an explicitly reviewed design. See [Nginx proxy header documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html); template syntax and TLS configuration require `nginx -t` and authorized staging tests.

The proposed edge deliberately closes the alternate OpenAPI transport/docs pending API-client exposure approval; this does not change application procedures and may need adjustment for authorized API consumers. Web static paths remain served through the built SPA. Certificate renewal, HSTS/static security headers/CSP validation, HTTP redirect policy, private readiness access, OS/service limits, encrypted storage, least-privilege MongoDB roles and shared durable file storage remain operator gates. Do not treat this template as a deployed hardening result.

## Observability and continuity

Request logs retain only generated correlation ID, method, status, duration and new low-cardinality outcome category. Marker regression checks prove query/body/header secrets do not enter these completion records. No new public metrics/debug endpoint was added. Existing MFA/reset/recovery/admin audit events remain; full export/download auditing and privacy retention need owner decisions.

Monitor privately: 5xx/dependency/readiness failures, 401/403/429 trends, latency/RSS/CPU/pool usage, expired security-record growth, Forms conflicts/retries, backup freshness/failures and restore integrity. Define alert thresholds from staging baselines, recipient/on-call ownership, escalation and redaction/access retention. No monitoring provider or real alert delivery was configured.

On incident: isolate ingress/Forms, preserve authorized logs and receipts, inspect readiness and categorized failures, follow [account recovery](../operations/ACCOUNT_SECURITY.md) and [disaster recovery](../operations/DISASTER_RECOVERY.md), restore only into a clean authorized environment, validate keys/files/receipt state and reconcile post-backup sender events before reopening. Current restore validates same-host integrity, not off-host loss or service launch. Shutdown helper tests pass; physical OS/process-manager signal and long-lived connection rehearsal remain open.

CI now type-checks browser tests and verifies built engine completeness/hashes. An isolated offline source export completed frozen install (`--ignore-scripts` followed by explicit env/client generation), build and type checking without private env files or database setup. This verifies the captured Windows source/dependency cache; it is not an online fresh-store, cross-OS or remote Actions run. No real-DB/recovery CI job exists yet.

Bit-for-bit identity across builds was not asserted; artifact checks verify the stated development-runtime exclusion and native-engine integrity only.
