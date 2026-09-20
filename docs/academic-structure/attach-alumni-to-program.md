# Attach Alumni to Program

**Functionality ID:** ACAD-005  
**Source:** System Guide – MODULES – "Alumni attached to program -> Program attached to department"

## 1. Overview

This functionality is the explicit hierarchy: an alumni record is attached to a program, and that program is attached to a department.

## 2. Purpose

Place each alumni record under a program, and place that program under a department.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who attaches alumni to a program. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Assumption:** An alumni record, a program, and a department exist for the full chain. Creation order is not specified.

## 5. Functional Requirements

- The system must attach an alumni record to a program. (`FR-ACAD-005`)
- The system must attach a program to a department. (`FR-ACAD-006`)

## 6. User Flow

Confirmed chain:

```text
Alumni attached to program -> Program attached to department
```

1. A program is attached to a department.
2. An alumni record is attached to that program.

UI steps are not specified.

## 7. Inputs

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Alumni | Not specified | Not specified | Not specified | The alumni record being attached |
| Program | Not specified | Not specified | Not specified | The program receiving the alumni |
| Department | Not specified | Not specified | Not specified | The department the program attaches to |

## 8. Business Rules

- Alumni are attached to a program.
- A program is attached to a department.

Whether an alumni record can attach to more than one program is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

The guide does not say whether an alumni record may exist without a program.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| Attach alumni to program | Not specified who may perform it |
| Detach or change program | Not specified |
| Attach program to department | Not specified who may perform it |

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful attach | Not specified |
| Missing program or department | Not specified |
| Duplicate attach | Not specified |
| Unauthorized access | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

This attachment may affect dashboard graduate counts. The guide does not define that calculation.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

```text
Alumni Profile > attached to > Program > attached to > Department
```

Cardinality and history of attachments are not specified.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

## 16. UI Requirements

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

Access is subject to RBAC. Specific attach permissions are not specified.

## 20. Edge Cases

- Alumni with no program — not specified.
- Alumni attached to multiple programs — not specified.
- Changing program after tracking data exists — not specified.

## 21. Acceptance Criteria

Given an alumni record and a program  
When the stated rule is implemented  
Then the alumni record is attached to the program

Given a program and a department  
When the stated rule is implemented  
Then the program is attached to the department

## 22. Test Scenarios

### Positive Tests

- An alumni record can be attached to a program.
- A program can be attached to a department.
- The chain Alumni → Program → Department can be represented.

### Negative Tests

- Unauthorized behavior is unspecified and must not be assumed.

### Edge Cases

- Multiple programs per alumni and missing attachments are unspecified.

## 23. Dependencies

- [Alumni Profile](../alumni-profile/alumni-profile.md)
- [Manage Programs](./manage-programs.md)
- [Manage Departments](./manage-departments.md)

## 24. Related Functionalities

- [Tracking](../alumni-profile/tracking.md)
- [Graduate Tracking Statistics](../dashboard/graduate-tracking-statistics.md)

## 25. Assumptions

> **Assumption:** "Attached" means a stored association.

> **Assumption:** Dashboard graduate counts may be based on this hierarchy. The guide does not define the formula.

## 26. Open Questions

- Who performs the attachment?
- Can one alumni record attach to multiple programs?
- Must every alumni record have a program?
- Does changing the attachment change dashboard counts?
