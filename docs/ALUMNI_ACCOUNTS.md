# Alumni accounts

The built-in `viewer` role is displayed as **Alumni** in Members, role management,
and account menus. Its stored key and permission assignments remain compatible with
existing databases. Administrator and Staff roles retain precedence for mixed-role
accounts.

Members > Add user defaults to Alumni. Creating an Alumni account requires its
student number, active degree program, names and contact details. The account,
role assignment, Alumni record and audit entry commit in one transaction. The
profile immediately appears in the Alumni registry as a registered account.
Creating these linked records requires both `users.write` and `alumni.write`.
Staff and Administrator accounts can still be created without academic details.

For API clients, omitting `roleIds` from `POST /api/users` selects the built-in
Alumni role. An Alumni account requires `alumniProfile`, containing the academic
and contact fields used by public registration. Explicit Staff/Administrator role
selection keeps the existing account-only flow.

Older Alumni accounts and new Google accounts without academic information appear
under **Accounts awaiting profile completion** in the Alumni tab. Authorized
registry managers can search and paginate these accounts; Alumni cannot browse
them. Only names, emails, IDs and creation dates are returned by
`GET /api/alumni/pending-accounts`. Department and tracking filters apply only to
registry profiles, while the name/email search also filters pending accounts.

Unlinked Alumni must complete their academic profile at sign-in. Existing student
records are never claimed automatically: an administrator must review ownership
and use Members > Link alumni profile. Pending accounts do not count as graduates
or registered registry profiles until linked. No historical account or profile
records are rewritten by this change.

Verification: account service regression tests, real MongoDB acceptance in
`pnpm test:completion-db`, and desktop/mobile flows in
`tests/browser/completion.spec.ts` cover creation, visibility, profile completion,
authorization, rollback and accessible table landmarks.
