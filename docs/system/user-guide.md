# User guide

Sign in at `/login`. Navigation only shows modules your role can access.

## Sign in

1. Open http://localhost:3001/login
2. Use email and password, or Google if that integration is configured
3. Complete reCAPTCHA or the local “I am not a robot” checkbox when shown

The first account created on an empty database becomes Super Admin. A seeded Super Admin is created by `pnpm run db:seed`.

## Academic structure

1. Create **Departments**
2. Create **Programs** attached to a department
3. Create **Faculties** and assign them to one or more departments

## Alumni

1. Open **Alumni** and add a profile attached to a program
2. Record **Student details** and **Contact info** (Mobile #, Personal Email, Facebook Account)
3. Add **Employment** history
4. Use **Tracking** to mark a graduate tracked or untracked
5. Upload **evidence** or an image from the profile page

## Dashboard and reports

The dashboard shows graduates, tracked count, untracked count, and percent tracked overall and by department.

Reports can download CSV. Google Sheets export runs when that integration is configured.

## Integrations

Super Admin / Staff with `integrations.write` can enable or disable each modular integration, import CSV, import Sheets, and send a test email.
