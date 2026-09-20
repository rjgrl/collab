# Email

**Functionality ID:** INT-004  
**Source:** System Guide – INTEGRATION – 4. Email; group labeled Modular

## 1. Overview

Email is the fourth listed integration. Integrations are labeled Modular.

## 2. Purpose

Integrate Email into the system.

The guide does not state what is sent, to whom, or on which events.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | Recipients and senders are not specified. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must integrate Email. (`FR-INT-004`)
- Integrations must be modular. (`FR-INT-008`)

Alumni Contact Info includes Personal Email. The guide does not state that Email uses that field.

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Not specified | — | — | — | No email message fields are listed |

## 8. Business Rules

- Email is a required integration.
- The integration is part of the Modular integration set.

No notification catalog is specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

> **Requirement Status:** Not specified in the provided system guide.

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful send | Not specified |
| Failed send | Not specified |
| Invalid address | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

Email is listed as an integration. No in-app, SMS, or email notification events are defined.

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

Contact Info includes Personal Email. That is a profile field, not an Email-integration contract.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Confirmed: Email is an integration and must be modular.

Not specified: provider, SMTP, templates, or APIs.

## 16. UI Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid address | Not specified |
| Provider failure | Not specified |
| Unauthorized user | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. Content, opt-out, and personal-data rules for email are not specified.

## 20. Edge Cases

- Missing Personal Email — not specified.
- Bounce / unsubscribe — not specified.

## 21. Acceptance Criteria

Given the system integrations  
When they are inspected  
Then Email must be included  
And it must be treated as part of the Modular integration set

Given no event list in the guide  
When notifications are designed  
Then those events remain unspecified

## 22. Test Scenarios

### Positive Tests

- Email is integrated.
- The integration is modular.

### Negative Tests

- Specific templates or events must not be treated as confirmed requirements.

### Edge Cases

- Missing recipient address is unspecified.

## 23. Dependencies

- Modular integration set (`FR-INT-008`)
- [Contact Info](../alumni-profile/contact-info.md) (field exists; binding not specified)

## 24. Related Functionalities

- [G. Auth](./google-auth.md)
- [G. Forms](./google-forms.md)

## 25. Assumptions

> **Assumption:** Email may send messages to Personal Email. The guide does not state this.

## 26. Open Questions

- What messages are sent?
- Which events trigger Email?
- Who are the recipients?
- Is Personal Email the destination?
- What provider is used?
