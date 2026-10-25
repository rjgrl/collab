# User guide

## Registration and sign-in

Open `/login`. Public signup must be enabled by the operator. Enter separate first/last names, optional middle name/custom suffix, email, phone, gender, password, student number and an active degree program. Graduation year and Facebook URL are optional. Successful signup creates one account and one owned profile together, with Alumni access only. A conflicting student number stops signup without leaving an orphan account. For an existing imported record, ask an Administrator to review and provision/link the account; knowing a student number or matching email never proves ownership.

Google appears only when configured/enabled. New Google users confirm their structured names, contact and academic details and create a password using recent Google verification. Email/phone verification is required in strict mode; local managed testing can explicitly waive these delivery gates while keeping contacts unverified. See [local contact policy](../operations/ACCOUNT_SECURITY.md). Administrator MFA can be paused for managed local development with LOCAL_DISABLE_MFA=true; otherwise it is required; Staff and Alumni have no mandatory MFA even with historical enrollment.

## Alumni: My Profile

My Profile shows your student/program/department identity separately from editable personal details. Save names, gender, mobile contact and Facebook URL. Linked account/profile names stay synchronized. The security phone and email verification are separate from the profile's contact details. Staff maintain student identifiers, academic assignments and tracking decisions.

Use Employment to add, edit or remove your employer, position, industry, location, dates and notes. At most one job is current. A current job has no end date. Choosing another current job clears the previous current flag; removing or ending jobs recalculates the employment summary. Removing a job preserves its uploaded evidence and detaches the removed job reference. These changes are self-reported and do not mark you tracked.

Photo and evidence keeps a profile photo distinct from confidential employment proof. Choose the purpose, optional related employment and a JPEG/PNG/WebP/PDF file (images only for photos, maximum 10 MB). Upload progress and errors appear in the form. Preview/download requires your active session and ownership; remove asks for confirmation and soft-deletes metadata. Local/private Drive files remain behind authorized routes. An institution-approved public photo host, when explicitly enabled, has a different public-photo privacy policy; it is never used for private employment evidence.

University statistics exposes aggregate counts only. A cohort or nonzero tracked/untracked cell smaller than five is withheld. Department breakdowns are all withheld if any small department could be inferred by subtraction. There are no record links, drill-through, names or exports. Zero is displayed honestly; 0 graduates yields 0.00%.

Account settings provides confirmed names, secure password change, session controls and optional authenticator management. Alumni cannot use the directory, management APIs or CSV export even if an older role retains broad grants. Archiving your alumni record removes profile/file access but preserves the authentication account and history for administrative review.

## Staff and Administrators

Navigation follows effective permissions; the server checks every request independently. Current management scope is institution-wide. Faculty management has been removed; existing historical records are retained.

1. Manage departments and their programs. Add/edit identifiers and descriptions; missing/archived references and duplicate identifiers are rejected.
2. Search alumni by name, student number or email, with department/tracking filters and page controls. A label distinguishes a registered account from a profile-only record.
3. Edit permitted academic/contact details, employment, tracking and private evidence. Tracking events preserve actor, time, source and note. Archive requires confirmation, removes the profile from normal lists/counts and keeps history/account records.
4. Dashboard and Reports use the same eligible population and department/tracking filters. Registered profiles are distinct from all alumni profiles. Tracked percentage is tracked / eligible graduates ? 100, displayed to two decimals. CSV neutralizes spreadsheet formulas; Sheets uses RAW values and the same filters. Exports stop above 10,000 records.
5. Administrators manage accounts, roles, audits and integrations in Settings. Integrations and provider controls are Administrator-only, even if Staff retain historical integration grants. Staff keep CSV exports; Sheets provider actions are Admin-only.

For setup and generated role accounts see the [README](../../README.md). Live provider credentials/delivery and production deployment remain operator acceptance steps.

Imports preserve an existing tracking decision when the tracking column is absent/blank. Explicit true/false (also 1/0 or yes/no) records the authorized importing actor; unrecognized flags reject the row.
