# G. Sheets

**Functionality ID:** INT-007  
**Source:** System Guide – INTEGRATION – 7. G. Sheets; group labeled Modular

## 1. Overview

G. Sheets is the seventh listed integration. Integrations are labeled Modular.

> **Assumption:** "G. Sheets" means Google Sheets. The guide does not expand the abbreviation.

## 2. Purpose

Integrate G. Sheets into the system.

The guide does not state whether Sheets are used for import, export, reporting, or storage.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who reads or writes Sheets. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must integrate G. Sheets. (`FR-INT-007`)
- Integrations must be modular. (`FR-INT-008`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

No spreadsheet columns are listed.

## 8. Business Rules

- G. Sheets is a required integration.
- The integration is part of the Modular integration set.

Direction of data is not specified. Relationship to G. Forms is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

> **Requirement Status:** Not specified in the provided system guide.

Export permission is not specified.

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful sync / export / import | Not specified |
| Failed operation | Not specified |
| Conflicting rows | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

> **Requirement Status:** Not specified in the provided system guide.

Dashboard counts are specified separately and are not stated to live in Sheets.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Confirmed: G. Sheets is an integration and must be modular.

Not specified: spreadsheet IDs, ranges, or APIs.

## 16. UI Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid data | Not specified |
| Unauthorized user | Not specified |
| Provider error | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. Sharing and personal-data rules for Sheets are not specified. Contact Info includes Personal Email and Mobile #.

## 20. Edge Cases

- Sheet schema drift — not specified.
- Partial import — not specified.
- Relationship to dashboard statistics — not specified.

## 21. Acceptance Criteria

Given the system integrations  
When they are inspected  
Then G. Sheets must be included  
And it must be treated as part of the Modular integration set

Given no import/export rules in the guide  
When spreadsheet workflows are designed  
Then those workflows remain unspecified

## 22. Test Scenarios

### Positive Tests

- G. Sheets is integrated.
- The integration is modular.

### Negative Tests

- A specific sheet layout must not be treated as a confirmed requirement.

### Edge Cases

- Binding to G. Forms or the dashboard is unspecified.

## 23. Dependencies

- Modular integration set (`FR-INT-008`)

## 24. Related Functionalities

- [G. Forms](./google-forms.md)
- [Graduate Tracking Statistics](../dashboard/graduate-tracking-statistics.md)
- [Alumni Profile](../alumni-profile/alumni-profile.md)

## 25. Assumptions

> **Assumption:** "G. Sheets" means Google Sheets.

> **Assumption:** Sheets may be used with G. Forms or for reporting. The guide does not state this.

## 26. Open Questions

- Is G. Sheets used for import, export, reporting, or storage?
- Who may access the sheets?
- How does it relate to G. Forms?
- Does the dashboard read from or write to Sheets?
- What columns are required?
