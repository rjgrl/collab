# Non-Functional Requirements

Only non-functional requirements supported by the provided system guide are listed. Categories with no source support are marked as not specified.

> **Source:** [source-guide.md](./source-guide.md)

---

## Confirmed

| ID | Category | Requirement | Source |
|----|----------|-------------|--------|
| NFR-001 | Maintainability / Architecture | Integrations must be modular. | INTEGRATION grouping labeled **Modular** |
| NFR-002 | Security | Access control is implemented as RBAC (Rule Based Access Control) using Roles, Users, and Permissions. | MODULES – RBAC grouping |
| NFR-003 | Security | The system integrates reCAPTCHA. | INTEGRATION – reCAPTCHA |
| NFR-004 | Security / Authentication | The system integrates G. Auth. | INTEGRATION – G. Auth |

> **Assumption for NFR-003 and NFR-004:** reCAPTCHA and G. Auth are listed as integrations. Their exact non-functional targets (bot-resistance, identity provider, session rules) are not specified.

---

## Not Specified

The provided system guide does not state requirements for:

| Category | Status |
|----------|--------|
| Performance | Not specified |
| Scalability | Not specified |
| Availability | Not specified |
| Reliability | Not specified |
| Usability | Not specified |
| Accessibility | Not specified |
| Compatibility | Not specified |
| Backup and recovery | Not specified |
| Logging | Not specified |
| Monitoring | Not specified |
| Session timeout | Not specified |
| Password / credential policy | Not specified |
| Encryption / data protection standards | Not specified |
| Browser or device support | Not specified |
| Localization | Not specified |

---

## Modular Integrations

The guide labels the following integrations as Modular:

1. reCAPTCHA
2. G. Auth
3. G. Drive (uploading of evidence)
4. Email
5. Image BB / G. Drive
6. G. Forms
7. G. Sheets

> **Assumption:** "Modular" means each integration can be implemented, replaced, or isolated without rewriting core modules. The guide does not define the modularization mechanism.

---

## Security Notes From the Guide Only

- RBAC is a stated control model.
- reCAPTCHA is a stated integration.
- G. Auth is a stated integration.

No additional security controls are specified.
