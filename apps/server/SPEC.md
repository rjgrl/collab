---
id: server-runtime
type: module-design
status: draft
title: Server Runtime and Hosting Boundary
depends-on: [database-runtime]
tags: [deployment, security]
---

## Responsibility

Expose the authenticated REST API over the configured durable database and optionally serve the compiled frontend under that same HTTPS origin. Mutation success represents a server-confirmed operation, not a browser-local or file-backed profile save. Existing query invalidation refreshes the requesting UI; it is not database replication or a cross-client push transport.

## Database Selection and Isolation

Resolve configuration through `database-runtime`. Production requires authenticated, verified-TLS MongoDB explicitly selecting `alumni_tracking`; absent, wrong-name, conflicting or unreachable configuration fails closed. Do not silently append the database name or adopt a different database. Startup suppresses private driver diagnostics and never reseeds or automatically migrates existing data.

Hosted environments use Atlas. Local development and automated tests remain on isolated native `rs0` namespaces at `127.0.0.1:27018`. A snapshot import or approved profile refresh does not synchronize future local writes. The deployed website must address the deployed API to persist directly in Atlas; no local environment is switched as part of hosting preparation.

## HTTP and Origin Boundary

`PORT` is a positive integer through 65535, defaulting to 5000. `HOST` defaults to loopback; a public cloud bind must be explicit. Local workflow children explicitly retain port 3000, with Vite on 3001.

The hosted frontend and API share one exact HTTPS origin. CORS reflects only the configured origin and allows credentials; it does not add localhost to production, allow wildcard origins or weaken mutation Origin/Referer/Sec-Fetch-Site checks. Secure HttpOnly cookie policy, MFA, role/scope enforcement and exact proxy-IP trust remain authoritative. Unreviewed forwarded headers never establish client identity.

## Public Build and Private Files

`SERVE_WEB` opts into serving only the compiled `apps/web/dist` tree. Missing builds or symlinked assets stop startup. Static/deep-link handling never replaces API authentication/errors, retired RPC/API-reference paths, private-upload paths or missing asset responses with HTML.

Private upload and backup storage cannot overlap the public build; canonical existing parents detect symlink/junction aliases. Evidence remains private filesystem/provider data accessed through authorized API routes, not an alumni-profile storage fallback. The build exposes only public frontend environment values, never database credentials or encryption keys. CSP accommodates the existing CAPTCHA and photo-preview resources without enabling arbitrary script execution.

## Health and Release Safety

`/health/live` measures process liveness. `/health` measures process plus a connected writable MongoDB replica-set primary; it exposes booleans, not private diagnostics. Database and provider-readiness probes are bounded so outages fail health checks promptly.

`/health/ready` also enforces mandatory production contact-verification readiness. SMS delivery is not wired, so this remains an explicit production-release blocker; connectivity health cannot be substituted to hide it. Deployment instructions and provider settings must retain this gate.

## Deployment Ownership

The selected Render layout is one Node service, one origin and one persistent private volume. Configuration examples do not authorize provisioning, paid upgrades, public exposure, schema changes or a live cutover. Existing keys and records are preserved. Service-specific credentials, ingress/egress policy, provider delivery, target-runtime behavior, capacity and recovery require operator acceptance before release.
