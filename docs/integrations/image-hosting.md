# Image BB / G. Drive

**Functionality ID:** INT-005  
**Source:** System Guide – INTEGRATION – 5. Image BB / G. Drive; group labeled Modular

## 1. Overview

Image BB / G. Drive is the fifth listed integration. Integrations are labeled Modular.

> **Assumption:** "Image BB" means imgBB / ImageBB image hosting. The guide does not expand the name.

> **Assumption:** "G. Drive" means Google Drive.

## 2. Purpose

Integrate Image BB and/or G. Drive, listed together on one line.

The guide does not state whether they are alternatives, fallbacks, or used together.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who uploads or views images. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must integrate Image BB and/or G. Drive for image hosting. (`FR-INT-005`)
- Integrations must be modular. (`FR-INT-008`)

G. Drive is also listed separately for uploading of evidence (`FR-INT-003`).

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

No image types, sizes, or destinations are listed.

## 8. Business Rules

- Image BB / G. Drive is a required integration line item.
- The integration is part of the Modular integration set.

> **Requirement Conflict:** G. Drive is listed for evidence upload and again with Image BB. Confirm one integration with two uses versus two separate Drive uses.

Whether Image BB and G. Drive are mutually exclusive is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

> **Requirement Status:** Not specified in the provided system guide.

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful image store | Not specified |
| Provider failure | Not specified |
| Choice between Image BB and G. Drive | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

> **Requirement Status:** Not specified in the provided system guide.

No image URL or file-id fields are listed.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

Confirmed: Image BB / G. Drive is listed and must be modular.

Not specified: endpoints, API keys, or response payloads.

## 16. UI Requirements

> **Requirement Status:** Not specified in the provided system guide.

The guide does not say which screens show images (profile photo or other).

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid file | Not specified |
| Provider error | Not specified |
| Unauthorized user | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. Public vs private image hosting is not specified.

## 20. Edge Cases

- One provider down, the other available — not specified.
- Same file stored as evidence and as an image — not specified.

## 21. Acceptance Criteria

Given the system integrations  
When they are inspected  
Then Image BB / G. Drive must be included  
And it must be treated as part of the Modular integration set

Given the slash listing  
When the hosting choice is implemented  
Then Image BB-only, Drive-only, or both must be confirmed first

## 22. Test Scenarios

### Positive Tests

- Image BB / G. Drive is listed as an integration.
- The integration is modular.

### Negative Tests

- A single provider must not be assumed without confirmation.

### Edge Cases

- Dual Drive listing with evidence upload.
- Provider failover is unspecified.

## 23. Dependencies

- [G. Drive (uploading of evidence)](./google-drive-evidence.md)
- Modular integration set (`FR-INT-008`)

## 24. Related Functionalities

- [Alumni Profile](../alumni-profile/alumni-profile.md)

## 25. Assumptions

> **Assumption:** "Image BB" means imgBB / ImageBB.

> **Assumption:** This line item is for images, while integration 3 is for evidence. The guide does not define the difference.

## 26. Open Questions

- Are Image BB and G. Drive alternatives or complementary?
- Which images are stored?
- Is profile photography in scope?
- Is this the same Drive integration as evidence upload?
