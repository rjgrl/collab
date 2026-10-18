# Data Requirements

This document records only entities, attributes, and relationships that appear in the provided system guide.

> **Source:** [source-guide.md](./source-guide.md)

Do not treat this as a complete database schema. Field types, keys, uniqueness, and retention are not specified unless noted.

---

## Entities

| Entity | Source | Confirmed Attributes | Notes |
|--------|--------|----------------------|-------|
| Role | MODULES – Roles | Not specified | Part of RBAC |
| User | MODULES – Users | Not specified | Part of RBAC |
| Permission | MODULES – Permissions | Not specified | Part of RBAC |
| Department | MODULES – Departments | Not specified | Programs attach to a department. Faculties can be added to a department. |
| Program | MODULES – Program | Not specified | Attached to a department. Alumni attach to a program. |
| Faculty | MODULES – Faculties | Not specified | Can be added to a department. |
| Alumni Profile | MODULES – Alumni Profile | See sections below | Attached to a program. |
| Evidence | INTEGRATION – G. Drive (uploading of evidence) | Not specified | Existence is implied by the upload purpose only. |

---

## Alumni Profile Structure

| Section | Confirmed Fields | Source |
|---------|------------------|--------|
| Student Details | Not specified | MODULES – Student Details |
| Contact Info | Mobile #, Personal Email, Facebook Account | MODULES – Contact Info |
| Employment | Not specified | MODULES – Employment |
| Tracking | Not specified | MODULES – Tracking |

### Contact Info Fields

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Mobile # | Not specified | Not specified | Not specified | Listed under Contact Info |
| Personal Email | Not specified | Not specified | Not specified | Listed under Contact Info |
| Facebook Account | Not specified | Not specified | Not specified | Listed under Contact Info |

> **Requirement Status:** Types, required flags, and validation rules for Contact Info fields are not specified in the provided system guide.

---

## Relationships

```text
User ---- (unspecified) ---- Role ---- (unspecified) ---- Permission

Faculty > added to > Department

Alumni Profile > attached to > Program > attached to > Department
```

| Relationship | Cardinality | Source |
|-------------|-------------|--------|
| Faculty added to Department | Not specified | "Faculties can be added to department" |
| Alumni attached to Program | Not specified | "Alumni attached to program" |
| Program attached to Department | Not specified | "Program attached to department" |
| User to Role | Not specified | Implied by RBAC grouping only |
| Role to Permission | Not specified | Implied by RBAC grouping only |

> **Assumption:** Users relate to Roles and Roles relate to Permissions because the guide groups those three modules as RBAC. Cardinality is not specified.

---

## Dashboard Data

The dashboard example uses these values:

| Label | Example Value | Specified Meaning |
|-------|---------------|-------------------|
| Grouping | IT | Not specified whether IT is a department, program, or other group |
| # of graduates | 14750 | Count of graduates |
| tracked | 10000 | Count of tracked graduates |
| % tracked | 5% | Tracked percentage |

> **Requirement Conflict:** `10000 / 14750 ≈ 67.80%`, not `5%`. The intended formula is not specified.

> **Assumption:** The tracked count is related to Alumni Profile Tracking. The guide does not define that relationship.

---

## Data Ownership

> **Requirement Status:** Not specified in the provided system guide.

---

## Data Lifecycle and Status Values

> **Requirement Status:** Not specified in the provided system guide.

No status values (for example Draft, Active, Tracked, Untracked) are named in the guide.

---

## Data Retention

> **Requirement Status:** Not specified in the provided system guide.

---

## Validation Requirements

The guide lists Contact Info fields but does not define formats, uniqueness, or required/optional rules.

> **Requirement Status:** Not specified in the provided system guide.
