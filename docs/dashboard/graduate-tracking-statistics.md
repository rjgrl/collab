# Graduate Tracking Statistics

**Functionality ID:** DASH-001  
**Source:** System Guide – DASHBOARD – "# of graduates" and example "IT: 14750 tracked: 10000 / 5% tracked"

## 1. Overview

The dashboard presents the number of graduates, a tracked count, and a tracked percentage. The guide shows an example for **IT**.

## 2. Purpose

Show graduate volume and how many graduates are tracked.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who may view the dashboard. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

> **Assumption:** Graduate and tracked counts are derived from alumni records attached to programs/departments. The formula is not specified.

## 5. Functional Requirements

- The dashboard must show the number of graduates. (`FR-DASH-001`)
- The dashboard must be able to present graduate counts for a grouping such as IT. (`FR-DASH-002`)
- The dashboard must show a tracked count of graduates. (`FR-DASH-003`)
- The dashboard must show a tracked percentage. (`FR-DASH-004`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed presentation only:

1. The dashboard shows `# of graduates`.
2. A grouping such as IT can show a graduate count, a tracked count, and a tracked percentage.

Example as written:

```text
IT: 14750
tracked: 10000
5% tracked
```

## 7. Inputs

The guide does not specify filters or parameters.

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Grouping (example: IT) | Not specified | Not specified | Not specified | Shown in the example; type of grouping is not specified |

## 8. Business Rules

- The dashboard shows number of graduates.
- The example includes a tracked count and a tracked percentage.

> **Requirement Conflict:** `10000 / 14750 ≈ 67.80%`, not `5%`. If `% tracked = tracked / graduates`, the example is inconsistent.

Whether IT is a department, a program, or another grouping is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Filter | Not specified |
| Export | Not specified |

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful display | Show # of graduates, tracked count, and % tracked as implied by the example |
| No graduates | Not specified |
| Unauthorized access | Not specified |
| Data error | Not specified |

## 12. Status / State Changes

The dashboard reads counts. It does not specify state transitions.

Related unspecified states: tracked vs not tracked. See [Tracking](../alumni-profile/tracking.md).

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Label | Example | Meaning in Guide |
|-------|---------|------------------|
| Grouping | IT | Not specified |
| # of graduates | 14750 | Count of graduates |
| tracked | 10000 | Tracked count |
| % tracked | 5% | Tracked percentage |

Source entities for these numbers are not specified.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

G. Sheets is a listed integration. The guide does not say the dashboard exports to or reads from Sheets.

## 16. UI Requirements

Confirmed: a dashboard that can show `# of graduates` and the IT example figures.

Not specified: charts, tables, filters, date range, multiple departments at once, or layout.

> **Requirement Status:** Layout details are not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid input | Not specified |
| Unauthorized user | Not specified |
| Missing data | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. Dashboard-specific permissions are not specified.

## 20. Edge Cases

- Zero graduates.
- Tracked count greater than graduate count.
- Percent that does not match `tracked / graduates`.
- Meaning of IT if both a department and a program could be named IT.

## 21. Acceptance Criteria

Given the dashboard  
When graduate statistics are displayed  
Then the number of graduates is shown  
And a tracked count is shown  
And a tracked percentage is shown

Given a grouping such as IT  
When the example presentation is supported  
Then the dashboard can show that grouping's figures

Given `14750`, `10000`, and `5%`  
When the percent is calculated  
Then implementation must not silently pick a formula  
And the conflict must be resolved first

## 22. Test Scenarios

### Positive Tests

- Dashboard shows # of graduates.
- Dashboard can show a grouping example such as IT.
- Dashboard shows tracked count.
- Dashboard shows % tracked.

### Negative Tests

- Unauthorized access behavior is unspecified.
- Extra widgets must not be treated as confirmed requirements.

### Edge Cases

- Formula conflict (`10000/14750` vs `5%`).
- Empty / zero counts.

## 23. Dependencies

- [Tracking](../alumni-profile/tracking.md)
- [Attach Alumni to Program](../academic-structure/attach-alumni-to-program.md)
- [Manage Programs](../academic-structure/manage-programs.md)
- [Manage Departments](../academic-structure/manage-departments.md)

## 24. Related Functionalities

- [Alumni Profile](../alumni-profile/alumni-profile.md)
- [G. Sheets](../integrations/google-sheets.md)

## 25. Assumptions

> **Assumption:** "IT" is a grouping of graduates, possibly a department or program. The guide does not say which.

> **Assumption:** Tracked counts come from Alumni Profile Tracking. The guide does not define this.

## 26. Open Questions

- Who can view the dashboard?
- Is IT a department, a program, or something else?
- What is the `% tracked` formula?
- Which of `14750`, `10000`, and `5%` are illustrative vs literal?
- Are other dashboard metrics required?
