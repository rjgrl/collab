# Manage Programs

**Functionality ID:** ACAD-002  
**Source:** System Guide – MODULES – Program; "Alumni attached to program -> Program attached to department"

## 1. Overview

Program is a listed system module. A program is attached to a department. An alumni record is attached to a program.

## 2. Purpose

Provide the program record that sits between a department and an alumni record.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | No named role is given authority over Program. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

- A department exists if a program is to be attached to a department.

> **Assumption:** The attachment rule implies a department must exist first. Creation order is not specified.

## 5. Functional Requirements

- The system must include a Program module. (`FR-ACAD-002`)
- The system must attach a program to a department. (`FR-ACAD-006`)
- The system must attach an alumni record to a program. (`FR-ACAD-005`)

The guide does not enumerate create, view, edit, or delete operations for a program.

## 6. User Flow

Confirmed relationship only:

```text
Alumni attached to program -> Program attached to department
```

1. A program is attached to a department.
2. An alumni record is attached to that program.

Step-by-step UI flow is not specified.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

No program attributes are listed.

## 8. Business Rules

- A program is attached to a department.
- An alumni record is attached to a program.

Whether a program can attach to more than one department is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |
| Attach to department | Not specified who may perform it |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Entity | Specified Fields | Relationships |
|--------|------------------|---------------|
| Program | Not specified | Attached to Department; Alumni attached to Program |

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

## 16. UI Requirements

The guide lists Program as a module. Screens are not described.

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid input | Not specified |
| Unauthorized user | Not specified |
| Record not found | Not specified |
| Program without department | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. Specific program permissions are not specified.

## 20. Edge Cases

- Program with no alumni — not specified.
- Moving a program to another department — not specified.
- Effect on dashboard counts when programs change — not specified.

## 21. Acceptance Criteria

Given the implemented system  
When modules are inspected  
Then a Program module must exist

Given a program  
When the academic hierarchy is applied  
Then the program is attached to a department

Given an alumni record  
When it is attached as specified  
Then it is attached to a program

## 22. Test Scenarios

### Positive Tests

- Program module exists.
- A program can be attached to a department.
- An alumni record can be attached to a program.

### Negative Tests

- Operations not listed in the guide must not be treated as confirmed requirements.

### Edge Cases

- Orphan program (no department) is unspecified.

## 23. Dependencies

- [Manage Departments](./manage-departments.md)
- [Attach Alumni to Program](./attach-alumni-to-program.md)

## 24. Related Functionalities

- [Alumni Profile](../alumni-profile/alumni-profile.md)
- [Graduate Tracking Statistics](../dashboard/graduate-tracking-statistics.md)

## 25. Assumptions

> **Assumption:** Program records can be maintained. CRUD details were not enumerated.

> **Assumption:** The guide uses the singular "Program" for the module name. This is preserved.

## 26. Open Questions

- What fields does a Program have?
- Which operations are supported?
- Who may manage programs?
- Can a program belong to more than one department?
