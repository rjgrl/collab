# Contact Info

**Functionality ID:** ALUM-003  
**Source:** System Guide – MODULES – Alumni Profile / Contact Info

## 1. Overview

Contact Info is a listed subsection of Alumni Profile. It is the only profile section with enumerated fields: Mobile #, Personal Email, and Facebook Account.

## 2. Purpose

Store alumni contact information on the Alumni Profile.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who may view or edit Contact Info. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

- An Alumni Profile exists or is being created.

> **Assumption:** Contact Info is not a standalone module.

## 5. Functional Requirements

- The Alumni Profile must include Contact Info. (`FR-ALUM-003`)
- Contact Info must include Mobile #. (`FR-ALUM-004`)
- Contact Info must include Personal Email. (`FR-ALUM-005`)
- Contact Info must include Facebook Account. (`FR-ALUM-006`)

The guide does not state that these fields are required, unique, or validated.

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed content only:

1. Contact Info is part of Alumni Profile.
2. Contact Info includes Mobile #, Personal Email, and Facebook Account.

## 7. Inputs

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Mobile # | Not specified | Not specified | Not specified | Listed under Contact Info |
| Personal Email | Not specified | Not specified | Not specified | Listed under Contact Info |
| Facebook Account | Not specified | Not specified | Not specified | Listed under Contact Info |

No other contact fields are listed.

## 8. Business Rules

- Contact Info is part of Alumni Profile.
- The listed contact fields are Mobile #, Personal Email, and Facebook Account.

Use of Personal Email for the Email integration is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

Format for Mobile #, email syntax, and Facebook Account format are not specified.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

Email is a listed integration. The guide does not say Contact Info.Personal Email is the notification address.

## 14. Database / Data Requirements

| Field | Specified |
|-------|-----------|
| Mobile # | Yes — name only |
| Personal Email | Yes — name only |
| Facebook Account | Yes — name only |

Types, lengths, uniqueness, and retention are not specified.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Possible related integrations, not bound by the guide:

- Email
- G. Forms

## 16. UI Requirements

The guide lists the three fields. Labels, placeholders, and input controls are not described.

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid input | Not specified |
| Unauthorized user | Not specified |
| Missing data | Not specified |
| Duplicate data | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Contact Info includes Mobile # and Personal Email. Protection, masking, and access rules for those values are not specified beyond RBAC.

## 20. Edge Cases

- Empty contact fields — not specified.
- Multiple mobile numbers or emails — not specified.
- Facebook Account as URL vs username — not specified.

## 21. Acceptance Criteria

Given an Alumni Profile  
When Contact Info is inspected  
Then it must include Mobile #, Personal Email, and Facebook Account

Given no validation rules in the guide  
When invalid formats are entered  
Then expected rejection behavior remains unspecified until confirmed

## 22. Test Scenarios

### Positive Tests

- Contact Info exists on Alumni Profile.
- Mobile # is present as a field.
- Personal Email is present as a field.
- Facebook Account is present as a field.

### Negative Tests

- Additional contact fields must not be treated as confirmed requirements.
- Required/optional behavior must not be assumed.

### Edge Cases

- Blank values, format errors, and duplicates are unspecified.

## 23. Dependencies

- [Alumni Profile](./alumni-profile.md)

## 24. Related Functionalities

- [Email](../integrations/email.md)
- [Student Details](./student-details.md)

## 25. Assumptions

> **Assumption:** The three listed items are data fields on Contact Info.

> **Assumption:** "Personal Email" is distinct from any unspecified institutional email. A second email field is not in the guide.

## 26. Open Questions

- Are the three fields required?
- What formats are valid?
- Can there be more than one value per field?
- Is Personal Email used by the Email integration?
- Who may view these fields?
