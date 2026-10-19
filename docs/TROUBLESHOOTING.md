# Local troubleshooting

Database authentication errors: managed setup accepts only unauthenticated loopback rs0. For an intentionally credentialed/custom database, use the manual/deployment guide and verify the least-privilege user privately. Never remove authentication or publish the URI. Incorrect seed state: doctor checks selected roles/permissions/indexes; setup verifies the bootstrap account without resetting or elevating it. Review private bootstrap settings and back up before an explicit update.

Browser CORS/cookie errors: use one web origin consistently; avoid mixing localhost and 127.0.0.1. CORS_ORIGIN must match the browser origin, APP_URL the API/OAuth origin, and the development proxy its own API. Restart after edits; never disable CSRF/browser security. Fresh-clone build failures: first confirm frozen install and setup/client generation, then `pnpm build`; report the first redacted error instead of copying dist/generated files from another machine.

Run `pnpm run doctor` first after installing dependencies. It is read-only and redacts configuration values.

| Symptom                                  | Next step                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong Node/pnpm                          | Install the versions in `.node-version` and `packageManager`, restart the terminal, check `node --version` and `pnpm --version`.               |
| Frozen lockfile failure                  | Ensure the correct branch and pnpm version. Report manifest/lock mismatch; do not regenerate the lockfile merely to bypass it.                 |
| Missing environment/client               | Run `pnpm setup:local`; do not copy private files or generated engines from another checkout.                                                  |
| EPERM during generation                  | Stop only this checkout's dev processes and retry. See [Windows guide](WINDOWS_SETUP.md).                                                      |
| Connection refused / ReplicaSetNoPrimary | Run `pnpm db:local`, inspect `.tools/mongodb-rs0/mongod.log`, verify local port 27018 and rs0 URL. Do not force reconfigure a foreign process. |
| Missing mongod                           | Install Community Server; use its standard Windows location or put it on PATH on other systems. Compass is a GUI.                              |
| Existing schema needs review             | Back up the development database, review changes, then opt in with `pnpm setup:local --update-existing`. Never bypass a data-loss warning.     |
| Server/DB URLs disagree                  | Privately make the intended URLs agree; setup preserves them and refuses to guess. No values should be pasted into public issues.              |
| Admin login note is stale                | Use the password you changed to. Setup does not reset it. Follow the reviewed operator recovery runbook if needed.                             |
| New signup cannot finish                 | SMS remains disconnected; local bootstrap admin is the supported offline path. Do not disable verification or MFA.                             |
| Google button unavailable                | Credentials and integration enablement are both needed. Provider configuration/delivery are optional and unverified locally.                   |
| Missing route types                      | Run `pnpm --filter web build` before standalone type checks in a new clone.                                                                    |
| Port occupied                            | Stop your own previous app or explicitly configure a separate coherent API/web origin pair. Never terminate unrelated processes.               |

When reporting a failure include OS/CPU, Node/pnpm/Mongo versions, command and redacted error. Exclude environment contents, login notes, session cookies, codes, key material, private datasets and complete database logs. No reset, delete or production deployment command is part of troubleshooting.
