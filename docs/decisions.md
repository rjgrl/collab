# Decisions

Append-only. Format: date, decision, why, alternatives rejected.

## 2026-11-09: Orchestrator plus Haiku workers
- Decision: the main session plans and verifies. `builder` and `reviewer` subagents on Haiku do bulk work.
- Why: cheaper bulk work, and the orchestrator keeps context for planning and checking.
- Guard: the orchestrator reruns every "Done when" check. Security-sensitive diffs get a line-by-line read.

## 2026-11-09: Share Claude config with the team
- Decision: commit `CLAUDE.md`, `.claude/agents/` and `.claude/skills/`. The rest of `.claude/` stays ignored.
- Why: every collaborator gets the same workflow, agents and skills.
- Rejected: unignoring all of `.claude/`, which would leak local settings and session state.
