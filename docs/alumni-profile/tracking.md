# Tracking

**Functionality ID:** ALUM-005  
**Source:** System Guide – MODULES – Alumni Profile / Tracking; DASHBOARD – tracked count and % tracked

## 1. Overview

Tracking is a listed subsection of Alumni Profile. The dashboard also uses a "tracked" count and a tracked percentage.

## 2. Purpose

Provide the tracking part of the Alumni Profile. The dashboard presents tracked graduate counts.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who may view or update Tracking. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

- An Alumni Profile exists or is being created.

> **Assumption:** Tracking is not a standalone module.

## 5. Functional Requirements

- The Alumni Profile must include Tracking. (`FR-ALUM-008`)
- The dashboard must show a tracked count of graduates. (`FR-DASH-003`)
- The dashboard must show a tracked percentage. (`FR-DASH-004`)

The guide does not define Tracking fields or the rule that makes a graduate "tracked".

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed items only:

1. Alumni Profile includes Tracking.
2. The dashboard shows tracked count and % tracked.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Not specified | — | — | — | The guide names the section only |

## 8. Business Rules

- Tracking is part of Alumni Profile.
- The dashboard presents tracked graduates and a tracked percentage.

> **Requirement Conflict:** The dashboard example shows `10000` tracked of `14750` graduates and also `5% tracked`. Those figures are inconsistent if percent tracked is `tracked / graduates`.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |
| Mark tracked / untracked | Not specified |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

The words "tracked" and "5% tracked" appear on the dashboard. Named states and transitions are not specified.

```text
(unspecified) → tracked
```

> **Requirement Status:** Transition conditions are not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Entity / Section | Specified Fields |
|------------------|------------------|
| Tracking | Not specified |

Dashboard example values: graduates `14750`, tracked `10000`, `5% tracked`, grouping `IT`.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

G. Drive (uploading of evidence) is listed. The guide does not state that evidence changes Tracking.

## 16. UI Requirements

The guide lists Tracking as a profile section and shows dashboard tracked figures. Profile UI is not described.

> **Requirement Status:** Not specified in the provided system guide.

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

Access is subject to RBAC. No additional rules are specified.

## 20. Edge Cases

- Alumni with incomplete Tracking — not specified.
- Whether evidence is required to become tracked — not specified.
- Percent formula when graduates is zero — not specified.

## 21. Acceptance Criteria

Given an Alumni Profile  
When its structure is inspected  
Then it must include a Tracking section

Given the dashboard  
When graduate statistics are shown  
Then a tracked count and a tracked percentage must be presented

Given the example `14750`, `10000`, and `5%`  
When the percent formula is implemented  
Then the conflict must be resolved before the formula is treated as confirmed

## 22. Test Scenarios

### Positive Tests

- Alumni Profile includes Tracking.
- Dashboard shows tracked count.
- Dashboard shows % tracked.

### Negative Tests

- A tracking definition that is not in the guide must not be treated as a confirmed requirement.

### Edge Cases

- Formula conflict (`10000/14750` vs `5%`).
- Zero graduates.

## 23. Dependencies

- [Alumni Profile](./alumni-profile.md)
- [Graduate Tracking Statistics](../dashboard/graduate-tracking-statistics.md)

## 24. Related Functionalities

- [G. Drive (uploading of evidence)](../integrations/google-drive-evidence.md)
- [Employment](./employment.md)

## 25. Assumptions

> **Assumption:** Profile Tracking is related to the dashboard tracked count. The guide does not define the relationship.

> **Assumption:** Evidence upload might support Tracking. The guide does not bind them.

## 26. Open Questions

- What fields are in Tracking?
- What makes a graduate tracked?
- How is % tracked calculated?
- Who may update Tracking?
- Does evidence upload change Tracking?
