# Alumni Profile

**Functionality ID:** ALUM-001  
**Source:** System Guide – MODULES – Alumni Profile and its subsections

## 1. Overview

Alumni Profile is a listed system module. It contains Student Details, Contact Info, Employment, and Tracking. An alumni record is attached to a program.

## 2. Purpose

Hold the alumni record used for academic attachment and tracking.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who creates, views, or edits an Alumni Profile. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Assumption:** A program exists if the alumni record is to be attached to a program. The guide does not require a program before profile creation.

## 5. Functional Requirements

- The system must include an Alumni Profile module. (`FR-ALUM-001`)
- The Alumni Profile must include Student Details. (`FR-ALUM-002`)
- The Alumni Profile must include Contact Info. (`FR-ALUM-003`)
- The Alumni Profile must include Employment. (`FR-ALUM-007`)
- The Alumni Profile must include Tracking. (`FR-ALUM-008`)
- The alumni record must be attachable to a program. (`FR-ACAD-005`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed structure:

```text
Alumni Profile
  ├── Student Details
  ├── Contact Info
  ├── Employment
  └── Tracking
```

And:

```text
Alumni attached to program -> Program attached to department
```

## 7. Inputs

The profile as a whole has no additional fields listed beyond its sections.

See [Contact Info](./contact-info.md) for the only enumerated fields.

Student Details, Employment, and Tracking fields are not specified.

## 8. Business Rules

- Alumni Profile contains Student Details, Contact Info, Employment, and Tracking.
- Alumni are attached to a program.

No completeness, approval, or uniqueness rules are specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |
| Export | Not specified |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

Tracking may relate to dashboard "tracked" status. That relationship is not defined.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Entity | Specified Structure |
|--------|---------------------|
| Alumni Profile | Sections: Student Details, Contact Info, Employment, Tracking |
| Contact Info | Mobile #, Personal Email, Facebook Account |

Relationship: Alumni attached to Program.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Integrations that may relate to profiles, with no binding stated in the guide:

- G. Drive (uploading of evidence)
- Image BB / G. Drive
- Email
- G. Forms
- G. Sheets

## 16. UI Requirements

The guide lists Alumni Profile and its sections. Pages, forms, tabs, and tables are not described.

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

Access is subject to RBAC. Contact Info includes Personal Email and Mobile #. Handling rules for that data are not specified.

## 20. Edge Cases

- Profile with empty sections — not specified.
- Profile not attached to a program — not specified.
- Relationship between Alumni Profile and User — not specified.

## 21. Acceptance Criteria

Given the implemented system  
When an Alumni Profile is inspected  
Then it must include Student Details, Contact Info, Employment, and Tracking

Given an alumni record  
When the academic hierarchy is applied  
Then the alumni record is attached to a program

## 22. Test Scenarios

### Positive Tests

- Alumni Profile module exists.
- Profile includes the four listed sections.
- Contact Info includes Mobile #, Personal Email, and Facebook Account.
- Alumni can be attached to a program.

### Negative Tests

- Fields not listed in the guide must not be treated as confirmed requirements.

### Edge Cases

- Empty sections and missing program attachment are unspecified.

## 23. Dependencies

- [Student Details](./student-details.md)
- [Contact Info](./contact-info.md)
- [Employment](./employment.md)
- [Tracking](./tracking.md)
- [Attach Alumni to Program](../academic-structure/attach-alumni-to-program.md)

## 24. Related Functionalities

- [Graduate Tracking Statistics](../dashboard/graduate-tracking-statistics.md)
- [Manage Users](../rbac/manage-users.md)

## 25. Assumptions

> **Assumption:** The four sections belong to one alumni record.

> **Assumption:** Alumni Profile is not automatically the same entity as User.

## 26. Open Questions

- Who creates and edits a profile?
- What fields exist outside Contact Info?
- Is the alumnus a User?
- How does Tracking affect the dashboard?
