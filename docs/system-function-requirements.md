# System Function Requirements

Alumni Tracking System, split by the three users of the system.

Printable copy: [system-function-requirements.pdf](./system-function-requirements.pdf)

| User                | System role   | What this user is for                                                                                                           |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Admin               | `super_admin` | Runs the whole system, including accounts, roles, and the audit log.                                                            |
| Staff / Coordinator | `staff`       | Maintains departments, programs, faculties, alumni, tracking, files, reports, and integrations.                                 |
| User / Alumni       | `viewer`      | Signs in and reads academic structure, alumni profiles, evidence, the dashboard, and reports. A new sign-up receives this role. |

A higher user also has every function of the users below them. Admin includes Staff / Coordinator and User / Alumni. Staff / Coordinator includes User / Alumni.

## Admin

Functions only the Admin can perform. The Admin also has every function in the Staff / Coordinator and User / Alumni sections.

| Code     | Name             | Description                                                                                                                       |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| RBAC-001 | View users       | Lists accounts and the roles assigned to each account.                                                                            |
| RBAC-002 | Create user      | Creates an account with a name, email, password, and one or more roles.                                                           |
| RBAC-003 | Update user      | Changes a user's name, password, status, or role assignments.                                                                     |
| RBAC-004 | Disable user     | Sets an account to disabled so it can no longer sign in.                                                                          |
| RBAC-005 | View roles       | Lists roles and the permissions attached to each role.                                                                            |
| RBAC-006 | Create role      | Creates a role with a key, name, description, and a set of permissions.                                                           |
| RBAC-007 | Update role      | Changes a role's name, description, or permission set.                                                                            |
| RBAC-008 | Delete role      | Deletes a role that is not a protected system role.                                                                               |
| RBAC-009 | View permissions | Lists the permission catalog grouped by module.                                                                                   |
| RBAC-010 | Enforce access   | Every protected action checks the caller's permissions. A missing permission is rejected. Permissions come from the user's roles. |
| AUD-001  | View audit log   | Lists recent activity, including the actor, action, entity, summary, and time.                                                    |

## Staff / Coordinator

Functions the Staff / Coordinator can perform beyond read-only access. This user also has every function in the User / Alumni section. This user cannot manage accounts, roles, permissions, or the audit log.

| Code     | Name                         | Description                                                                                                                                             |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACAD-002 | Create department            | Creates a department with a code, name, and description.                                                                                                |
| ACAD-003 | Update department            | Changes a department's code, name, or description.                                                                                                      |
| ACAD-004 | Delete department            | Soft-deletes a department so it no longer appears in active lists.                                                                                      |
| ACAD-006 | Create program               | Creates a program and attaches it to a department.                                                                                                      |
| ACAD-007 | Update program               | Changes a program's details or moves it to another department.                                                                                          |
| ACAD-008 | Delete program               | Soft-deletes a program.                                                                                                                                 |
| ACAD-010 | Create faculty               | Creates a faculty record.                                                                                                                               |
| ACAD-011 | Assign faculty to department | Adds a faculty to one or more departments, or updates that assignment.                                                                                  |
| ACAD-012 | Delete faculty               | Soft-deletes a faculty record.                                                                                                                          |
| ALUM-003 | Create alumni                | Creates a profile with student details, contact info, and a required program. The student number must be unique.                                        |
| ALUM-004 | Update alumni                | Edits student details, contact info, employment status, or the attached program.                                                                        |
| ALUM-005 | Delete alumni                | Soft-deletes an alumni record.                                                                                                                          |
| ALUM-008 | Add employment               | Records an employer, job title, industry, location, dates, and whether the job is current. The profile's employment status is updated from that record. |
| ALUM-009 | Remove employment            | Removes an employment record from a profile.                                                                                                            |
| ALUM-010 | Update tracking              | Marks a graduate tracked or untracked and records a tracking event with a note and timestamp.                                                           |
| ALUM-011 | Attach alumni to program     | Sets the program on an alumni record. That program belongs to one department.                                                                           |
| RPT-002  | Export CSV                   | Downloads an alumni CSV, optionally filtered by department and tracked status.                                                                          |
| RPT-003  | Export Google Sheets         | Exports alumni rows to Google Sheets when that integration is configured.                                                                               |
| FILE-001 | Upload evidence              | Uploads an evidence file or image and attaches it to an alumni profile.                                                                                 |
| FILE-003 | Delete evidence              | Soft-deletes an evidence file.                                                                                                                          |
| FILE-004 | Store images                 | Stores images on imgBB, Google Drive, or local disk, depending on which provider is configured.                                                         |
| INT-001  | reCAPTCHA                    | Enables or disables reCAPTCHA. Live keys call Google; missing keys use the local checkbox.                                                              |
| INT-002  | Google authentication        | Enables or disables Google sign-in. It is available only when client id and secret are set.                                                             |
| INT-003  | Google Drive evidence        | Sends evidence uploads to Google Drive when a service account and folder are configured; otherwise they stay on local disk.                             |
| INT-004  | Email                        | Sends email through SMTP when configured. Otherwise the message is logged. Can send a test message and a message to an alumnus.                         |
| INT-005  | Image hosting                | Sends image uploads to imgBB or Google Drive when configured, and to local storage otherwise.                                                           |
| INT-006  | Google Forms import          | Accepts a signed Google Forms webhook and creates or updates alumni rows.                                                                               |
| INT-007  | Google Sheets import         | Imports alumni rows from the configured spreadsheet.                                                                                                    |
| INT-008  | CSV import                   | Imports pasted or uploaded CSV rows as alumni and records success count, error count, and row errors.                                                   |
| INT-009  | Integration status           | Shows which modular integrations are enabled and whether their credentials are present.                                                                 |
| INT-010  | Toggle integration           | Enables or disables a modular integration without changing the rest of the system.                                                                      |

## User / Alumni

Functions a User / Alumni can perform. This is the role given to a new sign-up. Access is read-only.

| Code     | Name                     | Description                                                                                                                                                                                                            |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-001 | Sign in                  | Signs in with email and password. A valid account receives a session; a wrong password or disabled account is rejected.                                                                                                |
| AUTH-002 | Sign up                  | Registers with name, email, and password and receives a session. Duplicate emails are rejected. Public registration receives Viewer access. Administrative access is initialized through the protected seed procedure. |
| AUTH-003 | Sign out                 | Ends the current session and clears the session cookie.                                                                                                                                                                |
| AUTH-004 | Current session          | Returns the signed-in user, assigned roles, and effective permissions, or an empty session when nobody is signed in.                                                                                                   |
| AUTH-005 | Google sign-in           | Signs in through Google and returns to the app with a session, when Google OAuth is configured and enabled.                                                                                                            |
| AUTH-006 | Bot check                | Sign-in and sign-up require reCAPTCHA when it is enabled. Live keys use Google reCAPTCHA; otherwise a local "I am not a robot" checkbox is used.                                                                       |
| ACAD-001 | View departments         | Lists and opens departments, including their programs and assigned faculties.                                                                                                                                          |
| ACAD-005 | View programs            | Lists programs and the department each program belongs to.                                                                                                                                                             |
| ACAD-009 | View faculties           | Lists faculties and the departments they belong to.                                                                                                                                                                    |
| ALUM-001 | Search alumni            | Lists alumni and filters by name or student number, department, program, graduation year, and tracked or untracked status.                                                                                             |
| ALUM-002 | View alumni profile      | Opens one profile, including program and department, contact, employment history, tracking events, and evidence files.                                                                                                 |
| ALUM-006 | Student details          | Reads student number, name, middle name, gender, graduation year, and batch on a profile.                                                                                                                              |
| ALUM-007 | Contact info             | Reads mobile number, personal email, and Facebook account on a profile.                                                                                                                                                |
| FILE-002 | View evidence            | Opens or downloads an evidence file.                                                                                                                                                                                   |
| DASH-001 | Graduate statistics      | Sees total graduates, tracked count, untracked count, and tracked percentage. Percentage is tracked divided by graduates, rounded to two decimals.                                                                     |
| DASH-002 | Statistics by department | Sees graduate count, tracked count, and tracked percentage for each department.                                                                                                                                        |
| RPT-001  | View reports             | Opens graduate and alumni report totals. Export stays with Staff / Coordinator and Admin.                                                                                                                              |

Seeded Admin sign-in: the private `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` values supplied at initialization.
