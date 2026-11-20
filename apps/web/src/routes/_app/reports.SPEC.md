---
id: reports-interface
type: submodule-design
title: Reports Interface and Export Scopes
status: draft
---

# Reports Interface and Export Scopes

## Responsibility

The Reports screen organizes existing report capabilities without implying that every output accepts the same filters. It presents labeled College, Department and Program controls in academic order, followed by Graduation Year and Tracking Status. This ordering does not introduce cascading selections.

Batch is deliberately absent from this screen and its alumni download requests. This is a Reports-only presentation decision: stored alumni Batch values, profile editing/history and the existing backend contract remain intact.

## Output Boundaries

- Alumni CSV and alumni PDF use College, Department, Program, Graduation Year and Tracking Status.
- Current Totals and Google Sheets use Department and Tracking Status only.
- The assignment PDF does not receive alumni filters; the server determines its authorized scope.

Alumni downloads are grouped separately from other exports, and visible helper text explains the different scopes. Empty fields are omitted from requests rather than converted to a year of zero or empty identifiers.

## Selection Stability and Access

Department options use a stable unfiltered Reports summary subscription, separate from filtered totals. The initial query shares the existing summary cache entry. Changing Tracking Status must not temporarily empty the options and clear the selected department. Using the same scoped Reports endpoint also avoids requiring academic-directory permissions merely to populate this filter.

The application shell retains its Reports access gate. Download actions require reports.export; Google Sheets additionally requires an administrator account. These are presentation gates, not substitutes for server authorization. No permission keys, backend scopes or provider behavior are changed by this screen.

Controls and export groups reflow without horizontal page overflow on phones. Loading/error feedback and a retry remain available for totals and department options.
