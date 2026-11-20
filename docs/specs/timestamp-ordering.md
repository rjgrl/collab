---
id: alumni-timestamp-ordering
type: architecture-design
status: draft
title: Scoped alumni timestamp-ordering concurrency
references: [managed-alumni-profile-editing, account-access]
tags: [concurrency, alumni]
---

## Drivers

The instructor assigned Group 5 the Timestamp concurrency-control technique. The owner chose
real timestamp ordering for the core alumni workflow, not merely displaying dates or comparing
updatedAt. Heads normally assign/reassign; the one assigned Faculty normally edits/tracks.
Rare Super Admin intervention and alternate writers cannot bypass protected-data rules.

## Decisions

One ordering resource represents an alumnus's student details, assignment, tracking state and
employment, including coupled summaries and indirect name synchronization. Different alumni
remain independent. Ordinary browsing/reporting is outside this ordered transaction set and
does not advance read timestamps. Independent contacts and photo/evidence metadata remain
outside unless an operation also changes protected fields. Imports retain atomic per-row
results; a multi-alumnus head assignment remains all-or-nothing.

Use MongoDB-issued monotonic logical timestamps from TimestampClock, not client clocks.
Allocation explicitly opts out of a surrounding MongoDB session so an abort cannot roll back
or reuse the assigned timestamp. Allocation also obtains the server date for edit expiry.
Each AlumniTimestamp resource stores R_TS, W_TS and the clock epoch. For transaction T:

- Read: reject T < W_TS; otherwise set R_TS = max(R_TS, T).
- Write: reject T < R_TS or T < W_TS; otherwise set W_TS = T with business data/audit atomically.
- Never silently skip obsolete writes (no Thomas-write-rule behavior). Equal timestamps still
  require a valid one-shot context. A newer participating read alone can reject an older write.

Interactive contexts last 30 minutes without holding a database transaction while the person
edits. TimestampEdit stores only a hashed opaque token, hashed actor/session binding, resource
keys and timing/consumption metadata, not a copy of personal data. Consumption and mutations
commit together. Expiry is enforced using database server time even before TTL cleanup;
only ephemeral edit contexts have TTL, never alumni, audit or persistent ordering state.
Resource keys are durable ordering identities/tombstones, not foreign-key ownership links.
Clock/resource epoch mismatch fails closed rather than resetting ordering state silently.

## Invariants

An authorized fresh read precedes edit context issuance. Current scope/assignment must be
checked again before consuming an edit or writing. An actor cannot choose transaction timestamps,
replay a consumed context, use another actor/session's context or add uncovered resources.
Driver retries of an interactive edit retain its issued timestamp; they cannot turn a stale
human edit into a newer write. Data, audit, ordering state and consumption roll back together.

Conflict/expiry preserves the draft and applies none of that save. Reload Latest is explicit
and confirms before replacing unsaved entries. Server-only writers follow the same ordering
rules. Application integration is pending while this draft's persistence/rule layer is built.

## Out of scope

No system-wide ordering/serializability claim; existing RBAC, transactions and role optimistic
checks remain independent. Direct database tools, bootstrap/migration and restore are controlled
operational procedures, not concurrent app writers. Roll out with old writers stopped; never
reset only the clock or selectively restore ordering metadata. Backups retain clock/resource
state together; restore's existing session invalidation also invalidates session-bound contexts.
Authentication, unrelated settings, backup machinery and normal viewing are not rewritten.
