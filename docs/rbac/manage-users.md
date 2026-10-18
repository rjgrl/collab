# Manage Users

**Functionality ID:** RBAC-003  
**Source:** System Guide – MODULES – Users

## 1. Overview

Users is a listed system module and one of the three modules that form RBAC (Rule Based Access Control).

## 2. Purpose

Provide the Users part of RBAC.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | No named role is given authority over the Users module. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

- The system includes RBAC.  
  Other preconditions are not specified.

## 5. Functional Requirements

- The system must include a Users module. (`FR-RBAC-002`)
- Users must participate in RBAC with Roles and Permissions. (`FR-RBAC-004`)

The guide does not enumerate create, view, edit, deactivate, or delete operations.

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

G. Auth is a listed integration. The guide does not state that G. Auth creates or signs in Users.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

No user attributes are listed. Alumni Contact Info fields are not stated to be User fields.

## 8. Business Rules

- Users is a module of RBAC.

No other user rules are specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |
| Deactivate | Not specified |
| Assign role | Not specified |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

Email is a listed integration. The guide does not state that user events send email.

## 14. Database / Data Requirements

| Entity | Specified Fields |
|--------|------------------|
| User | Not specified |

Relationship to Alumni Profile is not specified.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Possible related integrations (purpose not tied to Users in the guide):

- G. Auth
- Email
- reCAPTCHA

## 16. UI Requirements

The guide lists Users as a module. Screens are not described.

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid input | Not specified |
| Unauthorized user | Not specified |
| Record not found | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Users is part of RBAC. G. Auth and reCAPTCHA are listed integrations. Binding those integrations to user management is not specified.

## 20. Edge Cases

- Relationship between a User and an Alumni Profile — not specified.
- Duplicate users — not specified.

## 21. Acceptance Criteria

Given the implemented system  
When modules are inspected  
Then a Users module must exist  
And it must be part of the RBAC grouping with Roles and Permissions

## 22. Test Scenarios

### Positive Tests

- Users module exists.
- Users is grouped with Roles and Permissions as RBAC.

### Negative Tests

- Operations not listed in the guide must not be treated as confirmed requirements.

### Edge Cases

- User-to-alumni linkage is unspecified.

## 23. Dependencies

- [RBAC Overview](./rbac-overview.md)
- [Manage Roles](./manage-roles.md)
- [Manage Permissions](./manage-permissions.md)
- [G. Auth](../integrations/google-auth.md)

## 24. Related Functionalities

- [Alumni Profile](../alumni-profile/alumni-profile.md)

## 25. Assumptions

> **Assumption:** A Users module is expected to hold user records used by RBAC. Specific CRUD operations were not enumerated.

> **Assumption:** A User may be distinct from an Alumni Profile. The guide does not define the relationship.

## 26. Open Questions

- What fields does a User have?
- Which operations are supported?
- Who may manage users?
- How does G. Auth relate to Users?
- Is an alumnus a User?
