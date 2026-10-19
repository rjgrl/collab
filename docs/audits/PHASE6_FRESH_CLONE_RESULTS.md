# Committed clone acceptance

Command: `pnpm test:clone-local`. The opt-in runner clones the committed local testing branch into a new ignored directory, installs with frozen lockfile and normal postinstall, generates independent private configuration and random development database, initializes synthetic demo data and runs doctor/build/type/Node/artifact checks and real-app browser acceptance. No private environment or generated client is copied. Local prerequisites/package cache are reused; this is not a fresh OS or remote clone.

The browser uses alternate loopback ports 3200/3201, built API and actual Vite app. It tests admin login, pre-MFA backend denial, TOTP enrollment and core navigation. Document/index snapshots and private file hashes are compared around repeated DB setup steps. That repeat excludes client generation because this acceptance process loads the Windows engine; complete setup rerun must be checked after the process exits.

Results will be appended after the source baseline is committed. Private clone/logs and synthetic databases remain retained; no database is dropped. Source-export evidence is not counted as committed-clone evidence. Physical laptop, Linux/macOS and remote CI remain pending.
