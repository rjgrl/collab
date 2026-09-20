# Testing

## Unit tests

```bash
pnpm test
```

Covered:

- Dashboard percent formula, including zero graduates
- Unique permission keys and valid role presets
- CSV quoting/round-trip
- Google Forms field mapping
- MongoDB `deletedAt` filters that include unset fields

## Functional checks

| Area | Case | Expected |
|------|------|----------|
| Auth | Login with seeded admin | Session cookie, dashboard |
| Auth | Login with wrong password | Error, no session |
| RBAC | Viewer cannot open Users | Forbidden / hidden nav |
| Academic | Create department then program | Program attached to department |
| Faculty | Assign faculty to IT | Faculty listed on department |
| Alumni | Create profile with contact fields | Mobile, personal email, Facebook stored |
| Tracking | Mark tracked | Dashboard tracked count increases |
| Files | Upload pdf/png under 10 MB | File listed; unauthorized users cannot fetch |
| Files | Upload exe or oversized file | Rejected |
| Dashboard | IT grouping | Department code IT has its own counts |
| Reports | CSV export | File downloads from live data |
| Integrations | CSV import invalid row | Row reported, not inserted |
| reCAPTCHA | Unconfigured secret | Local checkbox required |

## Security checks

- Passwords stored as scrypt hashes, never plaintext
- Protected oRPC procedures require a session and permission
- File download requires `files.read`
- Google Forms webhook requires secret in production
- Error responses do not include SQL, stack traces, or credentials

## AI testing

Not applicable. No AI assistant is in the requirements.

## Browser verification (2026-09-20)

Verified against the running app at `http://localhost:3001` with seeded `admin@alumni.local`:

| Area | Result |
|------|--------|
| Login / session | Signed in as System Administrator |
| Alumni list | Three seeded profiles (Cruz, Garcia, Ramos) with contact fields |
| Dashboard | Graduates 3, Tracked 2, Untracked 1, 66.67%; IT 2/1 50%; EDUC 1/1 100% |
| Departments | EDUC and IT with program and faculty counts |
| Programs | BSIT (2 alumni) attached to IT; BSED (1 alumni) attached to EDUC |
| Users | Super Admin listed; create-user form and role checkboxes present |
| Reports | CSV export controls present; totals match dashboard after the `deletedAt` filter fix |

A MongoDB query bug initially hid all academic and alumni records (`deletedAt: null` does not match unset fields). List/count queries now match both `null` and unset `deletedAt`.

- The source guide does not define field lists for Student Details, Employment, or Tracking beyond Contact Info. Implemented fields are assumptions.
- Named roles are assumed.
- Dashboard `5%` example is not used as a formula.
- Live Google / imgBB / SMTP features need credentials; fallbacks are used otherwise.
- `db:push` against Atlas must be run by a developer to create collections.
- MongoDB omits optional `deletedAt` unless it is written. Queries therefore match both `null` and unset values.
