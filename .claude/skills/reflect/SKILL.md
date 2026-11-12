---
name: reflect
description: End-of-session reflection. Lists what went wrong or took too long this session, proposes the smallest edit to a skill, agent or CLAUDE.md that would have prevented each one, and waits for user approval before applying anything.
---

# Reflect

Run at the end of a session.

1. List each problem from this session: a failed or rejected worker output, a retried
   command, a wrong assumption, a step that took much longer than it should have.
   For each, cite the evidence: the command and its output, the brief, or the user's words.
2. For each problem, propose the smallest edit that would have prevented it.
   Name the target file (`CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`)
   and show the exact text to add or change.
3. Skip problems with no clear preventive edit. Do not propose speculative rules.
4. Present the list and stop. Apply nothing until the user approves.
   Apply only the approved edits.
5. Record approved edits in `docs/decisions.md`, and any new gotchas in `docs/known-issues.md`.

Output:

    Problem: <what happened>
    Evidence: <command/output/quote>
    Edit: <file> — <exact change>
