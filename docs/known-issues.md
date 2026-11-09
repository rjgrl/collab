# Known issues and gotchas

Format: symptom, cause, workaround. Remove an entry when it is fixed.

- `docs/` is an allowlist in `.gitignore`. A new doc stays untracked until it gets a `!/docs/<file>` entry.
- Only `.claude/agents/` and `.claude/skills/` are tracked. New shared Claude config elsewhere under `.claude/` needs its own `!` entry in `.gitignore`.
- The GateGuard hook blocks the first Bash call of each session until the request and the command's purpose are stated. Workers will hit it too: state both, then retry.
- Local MongoDB runs on port 27018 as a replica set, not on 27017. Transactions need the replica set.
- Every browser test fails with `browserType.launch: Executable doesn't exist` on a fresh machine. Cause: Playwright's Chromium is not installed. Workaround: `pnpm exec playwright install chromium` once per machine.
- Browser tests and `*-local.ts` checks fail with `ECONNREFUSED 127.0.0.1:27018` after a reboot. Cause: the local replica set is not running. Workaround: `pnpm db:local` (it starts a detached `mongod`).
- `pnpm exec vp fmt <directory>` can hang on Windows. Workaround: pass individual files.
- Scripts that write files in text mode on Windows (for example Python's `open(p, "w")`) produce CRLF and `pnpm check` reports formatting errors. Workaround: write with LF (`newline=""` in Python); `.gitattributes` normalizes on commit, but the check runs on the working tree.
