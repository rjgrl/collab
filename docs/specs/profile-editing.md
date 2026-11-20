---
id: managed-alumni-profile-editing
type: module-design
status: draft
title: Managed alumni student-details editing
---

## Responsibility

The managed alumni Student Details dialog owns its editable draft. It snapshots the current
record when opened; query refreshes update the read-only profile but must never replace an
open draft. Continuous record-to-form synchronization caused a pending post-save refresh to
replace a user's next edits, submitting unchanged values and producing a misleading no-op audit.

The edit action is unavailable while the previous save or profile fetch is pending, so a new
edit begins from refreshed data. Background refreshes after opening still cannot overwrite
unsaved fields. Desktop/mobile regressions retain the exact audit transitions and explicitly
refresh the query after an isolated synthetic record update while the dialog remains open.

## Boundary

This changes client draft ownership, not server authorization, audit semantics or account data
ownership. Opening the editor begins a timestamp-ordered edit whose snapshot seeds the draft;
concurrency rules and conflict handling live in [alumni-timestamp-ordering](timestamp-ordering.md).
There is no automatic merge of concurrent edits.
