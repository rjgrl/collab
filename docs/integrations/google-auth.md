# G. Auth

**Functionality ID:** INT-002  
**Source:** System Guide – INTEGRATION – 2. G. Auth; group labeled Modular

## 1. Overview

G. Auth is the second listed integration. Integrations are labeled Modular.

> **Assumption:** "G. Auth" means Google Authentication. The guide does not expand the abbreviation.

## 2. Purpose

Integrate G. Auth into the system.

The guide does not state whether G. Auth is used for sign-in, identity linking, or another purpose.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who uses G. Auth. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must integrate G. Auth. (`FR-INT-002`)
- Integrations must be modular. (`FR-INT-008`)

The system must also include a Users module (`FR-RBAC-002`). The guide does not bind G. Auth to Users.

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Login, account linking, and logout are not described.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

## 8. Business Rules

- G. Auth is a required integration.
- The integration is part of the Modular integration set.

Whether G. Auth is the only authentication method is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

RBAC is specified separately. How G. Auth identity maps to Users, Roles, and Permissions is not specified.

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful authentication | Not specified |
| Failed authentication | Not specified |
| Account not found | Not specified |
| Provider outage | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

> **Requirement Status:** Not specified in the provided system guide.

No token, subject, or email fields are listed.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Confirmed: an integration named G. Auth exists and must be modular.

Not specified: OAuth endpoints, scopes, client IDs, or responses.

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

G. Auth is a listed authentication-related integration. Session rules, token storage, and account-linking rules are not specified.

RBAC remains the stated access-control model.

## 20. Edge Cases

- User exists in Users but not in Google — not specified.
- Email matches Alumni Profile Personal Email — not specified.

## 21. Acceptance Criteria

Given the system integrations  
When they are inspected  
Then G. Auth must be included  
And it must be treated as part of the Modular integration set

Given no login flow in the guide  
When authentication screens are designed  
Then those screens remain unspecified until confirmed

## 22. Test Scenarios

### Positive Tests

- G. Auth is integrated.
- The integration is modular with the other listed integrations.

### Negative Tests

- A complete login product must not be treated as fully specified.

### Edge Cases

- Mapping G. Auth identity to Users/Roles is unspecified.

## 23. Dependencies

- [Manage Users](../rbac/manage-users.md)
- [RBAC Overview](../rbac/rbac-overview.md)
- Modular integration set (`FR-INT-008`)

## 24. Related Functionalities

- [reCAPTCHA](./recaptcha.md)
- [Email](./email.md)

## 25. Assumptions

> **Assumption:** "G. Auth" means Google Authentication.

> **Assumption:** G. Auth may create or authenticate a User. The guide does not state this.

## 26. Open Questions

- Is G. Auth the only sign-in method?
- Who may use it?
- How does it map to Users and Roles?
- What happens for an unknown Google account?
