# reCAPTCHA

**Functionality ID:** INT-001  
**Source:** System Guide – INTEGRATION – 1. reCAPTCHA; group labeled Modular

## 1. Overview

reCAPTCHA is the first listed integration. Integrations are labeled Modular.

## 2. Purpose

Integrate reCAPTCHA into the system.

The guide does not state which screens use it or what risk it is meant to block.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who encounters reCAPTCHA. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must integrate reCAPTCHA. (`FR-INT-001`)
- Integrations must be modular. (`FR-INT-008`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

## 8. Business Rules

- reCAPTCHA is a required integration.
- The integration is part of the Modular integration set.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

Pass/fail handling is not specified.

## 10. Permissions and Authorization

> **Requirement Status:** Not specified in the provided system guide.

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Challenge passed | Not specified |
| Challenge failed | Not specified |
| Service unavailable | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Confirmed: an integration with reCAPTCHA exists and must be modular.

Not specified: reCAPTCHA version, keys, endpoints, or request/response bodies.

## 16. UI Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Failed challenge | Not specified |
| Integration outage | Not specified |
| Unauthorized user | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

reCAPTCHA is a listed security-related integration. Placement and policy are not specified.

## 20. Edge Cases

- Users who cannot complete the challenge — not specified.
- Offline / blocked third-party script — not specified.

## 21. Acceptance Criteria

Given the system integrations  
When they are inspected  
Then reCAPTCHA must be included  
And it must be treated as part of the Modular integration set

Given no screen mapping in the guide  
When testers look for a specific page  
Then that page remains unspecified

## 22. Test Scenarios

### Positive Tests

- reCAPTCHA is integrated.
- The integration is modular with the other listed integrations.

### Negative Tests

- Behavior on failure is unspecified and must not be assumed.

### Edge Cases

- Provider outage is unspecified.

## 23. Dependencies

- Modular integration set (`FR-INT-008`)

## 24. Related Functionalities

- [G. Auth](./google-auth.md)
- [Non-Functional Requirements](../non-functional-requirements.md)

## 25. Assumptions

> **Assumption:** "reCAPTCHA" refers to Google reCAPTCHA. Version is not specified.

> **Assumption:** It may appear on public or unauthenticated forms. Placement is not specified.

## 26. Open Questions

- Where is reCAPTCHA shown?
- Which version?
- What happens on failure?
- What does Modular require for this integration?
