# Manage Departments

**Functionality ID:** ACAD-001  
**Source:** System Guide – MODULES – Departments; "Faculties can be added to department"; "Program attached to department"

## 1. Overview

Departments is a listed system module. A department is the parent of a program and can have faculties added to it.

## 2. Purpose

Provide the department record that programs attach to and that faculties can be added to.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | No named role is given authority over Departments. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must include a Departments module. (`FR-ACAD-001`)
- A program must be attachable to a department. (`FR-ACAD-006`)
- Faculties must be addable to a department. (`FR-ACAD-004`)

The guide does not enumerate create, view, edit, or delete operations for a department.

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed relationships only:

1. A department exists.
2. A program can be attached to that department.
3. A faculty can be added to that department.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

No department attributes are listed. The dashboard example uses the label **IT**. The guide does not state that IT is a department.

## 8. Business Rules

- Faculties can be added to a department.
- A program is attached to a department.

Cardinality (one-to-many vs many-to-many) is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |
| Manage attachments | Not specified |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Entity | Specified Fields | Relationships |
|--------|------------------|---------------|
| Department | Not specified | Program attached to Department; Faculty can be added to Department |

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

## 16. UI Requirements

The guide lists Departments as a module. Screens are not described.

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

Access is subject to RBAC. Specific department permissions are not specified.

## 20. Edge Cases

- Department with no programs — not specified.
- Department with no faculties — not specified.
- Deleting a department that has programs or faculties — not specified.

## 21. Acceptance Criteria

Given the implemented system  
When modules are inspected  
Then a Departments module must exist

Given a program  
When it is attached as specified  
Then it is attached to a department

Given a faculty  
When it is added as specified  
Then it can be added to a department

## 22. Test Scenarios

### Positive Tests

- Departments module exists.
- A program can be associated with a department.
- A faculty can be associated with a department.

### Negative Tests

- Operations not listed in the guide must not be treated as confirmed requirements.

### Edge Cases

- Empty department, delete-with-children, and duplicate names are unspecified.

## 23. Dependencies

- [Manage Programs](./manage-programs.md)
- [Manage Faculties](./manage-faculties.md)
- [Assign Faculty to Department](./assign-faculty-to-department.md)

## 24. Related Functionalities

- [Attach Alumni to Program](./attach-alumni-to-program.md)
- [Graduate Tracking Statistics](../dashboard/graduate-tracking-statistics.md)

## 25. Assumptions

> **Assumption:** Departments are records that can be maintained. CRUD details were not enumerated.

> **Assumption:** The dashboard label IT might be a department. This is not stated.

## 26. Open Questions

- What fields does a Department have?
- Which operations are supported?
- Who may manage departments?
- Is IT a department?
