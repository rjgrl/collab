# Known issues and gotchas

Format: symptom, cause, workaround. Remove an entry when it is fixed.

- `docs/` is an allowlist in `.gitignore`. A new doc stays untracked until it gets a `!/docs/<file>` entry.
- Only `.claude/agents/` and `.claude/skills/` are tracked. New shared Claude config elsewhere under `.claude/` needs its own `!` entry in `.gitignore`.
- The GateGuard hook blocks the first Bash call of each session until the request and the command's purpose are stated. Workers will hit it too: state both, then retry.
- Local MongoDB runs on port 27018 as a replica set, not on 27017. Transactions need the replica set.
