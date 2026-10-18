# G. Drive (Uploading of Evidence)

**Functionality ID:** INT-003  
**Source:** System Guide – INTEGRATION – 3. G. Drive (uploading of evidence); group labeled Modular

## 1. Overview

G. Drive is listed as an integration whose stated purpose is uploading of evidence.

> **Assumption:** "G. Drive" means Google Drive. The guide does not expand the abbreviation.

## 2. Purpose

Upload evidence using G. Drive.

The guide does not define what evidence is or which module owns it.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who uploads evidence. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must integrate G. Drive for uploading of evidence. (`FR-INT-003`)
- Integrations must be modular. (`FR-INT-008`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed outcome only:

```text
System → G. Drive → uploading of evidence
```

## 7. Inputs

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Evidence | Not specified | Not specified | Not specified | Item being uploaded |
| Destination | G. Drive | Yes (stated integration) | Not specified | Upload target |

File types, size limits, and naming rules are not specified.

## 8. Business Rules

- G. Drive is used for uploading of evidence.
- The integration is part of the Modular integration set.

> **Requirement Conflict:** G. Drive also appears under "Image BB / G. Drive". Confirm whether evidence upload and image hosting are the same Drive integration or two uses.

The guide does not bind evidence to Employment, Tracking, or another section.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| Upload | Not specified who may perform it |
| View | Not specified |
| Delete | Not specified |

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful upload | Not specified |
| Failed upload | Not specified |
| Unauthorized access | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

Whether upload changes Tracking is not specified.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

Evidence is implied by the upload purpose. No evidence fields are listed.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Confirmed: G. Drive is used for uploading of evidence and must be modular.

Not specified: Drive APIs, folders, sharing, or file metadata.

## 16. UI Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid file | Not specified |
| Unauthorized user | Not specified |
| Drive error | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. File permission, sharing, and personal-data handling for evidence are not specified.

## 20. Edge Cases

- Large files — not specified.
- Duplicate uploads — not specified.
- Evidence without an alumni record — not specified.

## 21. Acceptance Criteria

Given the system integrations  
When they are inspected  
Then G. Drive must be included for uploading of evidence  
And it must be treated as part of the Modular integration set

Given no definition of evidence  
When testers ask what file is valid  
Then that definition remains unspecified

## 22. Test Scenarios

### Positive Tests

- G. Drive integration exists for uploading of evidence.
- The integration is modular.

### Negative Tests

- File-type and size rules must not be assumed.

### Edge Cases

- Dual listing with Image BB / G. Drive.
- Missing definition of evidence.

## 23. Dependencies

- Modular integration set (`FR-INT-008`)

## 24. Related Functionalities

- [Image BB / G. Drive](./image-hosting.md)
- [Tracking](../alumni-profile/tracking.md)
- [Employment](../alumni-profile/employment.md)

## 25. Assumptions

> **Assumption:** "G. Drive" means Google Drive.

> **Assumption:** Evidence is a file stored in Drive and associated with some system record. Association is not specified.

## 26. Open Questions

- What is evidence?
- Which record does an upload belong to?
- Who may upload or view it?
- Is this the same Drive integration as Image BB / G. Drive?
- Do uploads change Tracking?
