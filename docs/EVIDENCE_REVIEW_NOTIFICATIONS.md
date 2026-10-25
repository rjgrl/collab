# Evidence review and account details

The header notification bell sits between the theme control and the signed-in
account menu. Its badge counts unread messages for the current Staff account.
The menu refreshes when opened and every 30 seconds while the application is open.

An Alumni account uploading a private evidence file creates one notification per
active Staff account in the same database transaction as the evidence record.
Profile photos and Staff uploads do not create review notifications. Each message
preserves the uploader's profile name, student number and uploaded filename, and
links to the evidence on the existing Alumni review screen. Uploading evidence
leaves the tracking decision unchanged.

Staff must currently hold Alumni and evidence read access to read notifications.
Every notification read/update is scoped to the authenticated recipient; Alumni
and other recipients cannot read or mark a Staff member's messages. Opening a
message marks that recipient's copy read. `Notification` has recipient/read/time
and unique recipient/evidence indexes; run the ordinary database migration before
enabling the upload flow on another installation.

My Profile and management Alumni screens no longer edit personal details.
Settings > Account owns personal name, gender, phone and Facebook changes. Those
changes synchronize the linked Alumni profile. A phone change clears phone
verification and invalidates earlier phone challenges. Signup and pending account
completion retain their required setup flow. Completed accounts cannot reuse
onboarding to change personal details, and the retired self-profile edit API
rejects writes. Imports also preserve linked account-owned names and contact data.

Academic identity, employment, evidence and tracking remain in the Alumni workflow.
Administrators retain their existing explicit user-management permissions.

Proof is covered by `notifications.test.ts`, account ownership/import regression
tests, and desktop/mobile notification and ownership browser scenarios. Tests cover
recipient isolation, unread persistence, notification rollback, invalid upload and
photo exclusions, Settings synchronization and the separate Staff tracking decision.
