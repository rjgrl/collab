# Employment

**Functionality ID:** ALUM-004  
**Source:** System Guide – MODULES – Alumni Profile / Employment

## 1. Overview

Employment is a listed subsection of Alumni Profile.

## 2. Purpose

Hold employment information on the Alumni Profile.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who may view or edit Employment. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

- An Alumni Profile exists or is being created.

> **Assumption:** Employment is not a standalone module.

## 5. Functional Requirements

- The Alumni Profile must include Employment. (`FR-ALUM-007`)

No Employment fields are listed. The guide does not mention job title, employer, industry, or dates.

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Not specified | — | — | — | The guide names the section only |

## 8. Business Rules

- Employment is part of Alumni Profile.

No employment history, current-job-only, or evidence rules are specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Entity / Section | Specified Fields |
|------------------|------------------|
| Employment | Not specified |

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

G. Drive is listed for uploading of evidence. The guide does not state that evidence belongs to Employment.

## 16. UI Requirements

The guide lists Employment as a profile section. Layout is not described.

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

- Unemployed or multiple jobs — not specified.
- Evidence of employment — not specified.

## 21. Acceptance Criteria

Given an Alumni Profile  
When its structure is inspected  
Then it must include an Employment section

Given no field list in the guide  
When employment fields are implemented  
Then those fields must be confirmed first and not treated as source requirements

## 22. Test Scenarios

### Positive Tests

- Alumni Profile includes Employment.

### Negative Tests

- Invented employment fields must not be treated as confirmed requirements.

### Edge Cases

- Empty section and multiple employers are unspecified.

## 23. Dependencies

- [Alumni Profile](./alumni-profile.md)

## 24. Related Functionalities

- [Tracking](./tracking.md)
- [G. Drive (uploading of evidence)](../integrations/google-drive-evidence.md)

## 25. Assumptions

> **Assumption:** Employment stores work-related data for the alumnus. Fields are not specified.

> **Assumption:** Evidence upload might support Employment. The guide does not bind them.

## 26. Open Questions

- What fields are in Employment?
- Is history supported or only current employment?
- Is evidence required?
- Who may edit Employment?
