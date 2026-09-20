# Administrator guide

## Users and roles

Super Admins manage Users and Roles.

- Create a user with email, password, and one or more roles
- Disable an account instead of deleting it
- Edit a role’s permissions; system roles (`super_admin`, `staff`, `viewer`) cannot be deleted

Permissions are assigned only through roles.

## Monitoring

- Dashboard totals are live MongoDB counts
- Audit log records sign-in, alumni changes, uploads, and integration toggles

## Maintenance

- Back up the MongoDB database on a schedule
- Back up `UPLOAD_DIR` if local evidence storage is used
- Rotate `admin@alumni.local` credentials after first deployment
- Keep `DATABASE_URL` and OAuth secrets out of git

## Logs

The API process logs email fallbacks, Drive upload failures, and request logs via Hono’s logger. Do not expose stack traces to the browser; API errors return short messages.
