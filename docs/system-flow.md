# System Flow

> **Requirement Status:** An end-to-end system flow is not specified in the provided system guide.

The flows that can be drawn from the guide are documented in [workflows.md](./workflows.md).

```text
RBAC (Roles + Users + Permissions)
        │
        ▼
Academic structure
  Department ← Program ← Alumni Profile
  Department ← Faculty
        │
        ▼
Alumni Profile
  Student Details
  Contact Info (Mobile #, Personal Email, Facebook Account)
  Employment
  Tracking
        │
        ▼
Dashboard: # of graduates / tracked / % tracked
        │
        ▼
Modular integrations
  reCAPTCHA, G. Auth, G. Drive (evidence),
  Email, Image BB / G. Drive, G. Forms, G. Sheets
```
