# G. Forms

**Functionality ID:** INT-006  
**Source:** System Guide – INTEGRATION – 6. G. Forms; group labeled Modular

## 1. Overview

G. Forms is the sixth listed integration. Integrations are labeled Modular.

> **Assumption:** "G. Forms" means Google Forms. The guide does not expand the abbreviation.

## 2. Purpose

Integrate G. Forms into the system.

The guide does not state whether Forms are used to collect alumni data, evidence, or other input.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who creates or submits forms. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must integrate G. Forms. (`FR-INT-006`)
- Integrations must be modular. (`FR-INT-008`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

No form fields are listed. Alumni Profile fields are specified separately and are not stated to come from G. Forms.

## 8. Business Rules

- G. Forms is a required integration.
- The integration is part of the Modular integration set.

Direction of data (into the system, out of the system, or both) is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

> **Requirement Status:** Not specified in the provided system guide.

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful submit | Not specified |
| Failed submit | Not specified |
| Duplicate submit | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

Whether a form submission updates Alumni Profile or Tracking is not specified.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Confirmed: G. Forms is an integration and must be modular.

Not specified: form IDs, webhooks, or APIs.

## 16. UI Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid input | Not specified |
| Unauthorized user | Not specified |
| Provider error | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. reCAPTCHA is a separate integration. The guide does not place reCAPTCHA on G. Forms.

## 20. Edge Cases

- Submission that does not match an alumni record — not specified.
- Relationship to G. Sheets — not specified.

## 21. Acceptance Criteria

Given the system integrations  
When they are inspected  
Then G. Forms must be included  
And it must be treated as part of the Modular integration set

Given no form purpose in the guide  
When a collection workflow is designed  
Then that workflow remains unspecified

## 22. Test Scenarios

### Positive Tests

- G. Forms is integrated.
- The integration is modular.

### Negative Tests

- A specific form schema must not be treated as a confirmed requirement.

### Edge Cases

- Binding to Alumni Profile or G. Sheets is unspecified.

## 23. Dependencies

- Modular integration set (`FR-INT-008`)

## 24. Related Functionalities

- [G. Sheets](./google-sheets.md)
- [Alumni Profile](../alumni-profile/alumni-profile.md)
- [reCAPTCHA](./recaptcha.md)

## 25. Assumptions

> **Assumption:** "G. Forms" means Google Forms.

> **Assumption:** Forms may collect data that later appears in the system. The guide does not state this.

## 26. Open Questions

- What are G. Forms used for?
- Who creates and who submits them?
- Do submissions update Alumni Profile, Tracking, or Employment?
- How do G. Forms relate to G. Sheets?
- Is reCAPTCHA used on these forms?
