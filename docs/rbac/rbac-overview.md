# RBAC (Rule Based Access Control)

**Functionality ID:** RBAC-001  
**Source:** System Guide – MODULES – Roles, Users, and Permissions grouped as RBAC (Rule Based Access Control)

## 1. Overview

RBAC is the access-control grouping on the system guide. It is formed from three modules: Roles, Users, and Permissions. The guide labels this grouping **RBAC (Rule Based Access Control)**.

## 2. Purpose

Provide the system's access-control model by combining Roles, Users, and Permissions.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide defines a Roles module but does not name roles that administer or consume RBAC. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

> **Assumption:** Roles, Users, and Permissions records exist or can be created through their modules.

## 5. Functional Requirements

- The system must include a Roles module. (`FR-RBAC-001`)
- The system must include a Users module. (`FR-RBAC-002`)
- The system must include a Permissions module. (`FR-RBAC-003`)
- Roles, Users, and Permissions must operate together as RBAC (Rule Based Access Control). (`FR-RBAC-004`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed structure only:

1. The system provides Users, Roles, and Permissions modules.
2. Those modules function together as RBAC.

Assignment steps, login, and enforcement timing are not described.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

## 8. Business Rules

- Roles, Users, and Permissions are the RBAC modules.

> **Requirement Conflict:** The guide names the model **Rule Based Access Control** while listing Roles, Users, and Permissions. Confirm whether the intended model is role-based, rule-based, or both.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

Who can view, create, edit, delete, or manage RBAC configuration is not specified.

> **Requirement Status:** Not specified in the provided system guide.

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

Unauthorized access behavior, success messages, and failure messages are not defined.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Entity | Specified Fields | Relationships |
|--------|------------------|---------------|
| Role | Not specified | Grouped with Users and Permissions as RBAC |
| User | Not specified | Grouped with Roles and Permissions as RBAC |
| Permission | Not specified | Grouped with Roles and Users as RBAC |

> **Assumption:** Users relate to Roles and Roles relate to Permissions. Cardinality is not specified.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Related integrations that may interact with access control:

- G. Auth
- reCAPTCHA

Those integrations do not define RBAC APIs.

## 16. UI Requirements

> **Requirement Status:** Not specified in the provided system guide.

The guide lists Roles, Users, and Permissions as modules. Pages, forms, and tables are not described.

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

- Access control is specified as RBAC using Roles, Users, and Permissions.

Authentication, session management, and data-protection details are not specified beyond the existence of G. Auth and reCAPTCHA as integrations.

## 20. Edge Cases

- A user with no role.
- A role with no permissions.
- Conflicting interpretation of "Rule Based" vs Roles/Users/Permissions.

> **Requirement Status:** Handling of these cases is not specified.

## 21. Acceptance Criteria

Given the system includes Roles, Users, and Permissions  
When RBAC is evaluated against the system guide  
Then those three modules must exist  
And they must be the system's stated RBAC grouping

Given named role permissions  
When implementation begins  
Then named roles must not be invented  
And role names must be confirmed first

## 22. Test Scenarios

### Positive Tests

- Roles module is present.
- Users module is present.
- Permissions module is present.
- The three modules are treated as one RBAC grouping.

### Negative Tests

- Access rules that are not specified must not be assumed in tests as confirmed behavior.

### Edge Cases

- Clarify Rule-Based vs Role-Based before writing enforcement tests.

## 23. Dependencies

- [Manage Roles](./manage-roles.md)
- [Manage Users](./manage-users.md)
- [Manage Permissions](./manage-permissions.md)
- [G. Auth](../integrations/google-auth.md)
- [reCAPTCHA](../integrations/recaptcha.md)

## 24. Related Functionalities

- [User Roles and Permissions](../user-roles-and-permissions.md)
- [Workflows – WF-001](../workflows.md)

## 25. Assumptions

> **Assumption:** Users are associated with Roles and Roles are associated with Permissions.

> **Assumption:** "G. Auth" may be used together with RBAC after identity is established. The guide does not state this sequence.

## 26. Open Questions

- Is RBAC role-based, rule-based, or both?
- Which named roles exist?
- How are roles and permissions assigned?
- When is access checked?
