import type { z } from "zod";
import { authSchemas } from "./auth";
import { usersSchemas } from "./users";
import { rolesSchemas, permissionsSchemas } from "./roles";
import { alumniSchemas, meProfileSchemas, filesSchemas, selfEmploymentSchemas } from "./alumni";
import { assignSchemas, facultySchemas } from "./faculty";
import { contactsSchemas } from "./contacts";
import { collegesSchemas, departmentsSchemas, programsSchemas } from "./academic";
import { dashboardSchemas, reportsSchemas, aggregateSchemas } from "./reports";
import { integrationsSchemas } from "./integrations";
import { auditSchemas } from "./audit";
import { notificationsSchemas } from "./notifications";
import { backupsSchemas } from "./backups";

/**
 * The JSON API in one table: contract, method and path (relative to API_PREFIX). The web client
 * is built from it, docs/api/openapi.json is generated from it, and a server test proves Express
 * serves every entry. Add a route here first; the other three follow.
 */
export const API_PREFIX = "/api/v1";
/** Earlier unversioned prefix; still served, with Deprecation and Link successor headers. */
export const LEGACY_API_PREFIX = "/api";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ApiContract = { input: z.ZodType; output: z.ZodType };
export type ApiRoute<C extends ApiContract = ApiContract> = {
  contract: C;
  method: HttpMethod;
  path: string;
  /** Callable without a session cookie. Everything else needs a signed-in session. */
  public?: true;
};

const route = <C extends ApiContract>(
  contract: C,
  method: HttpMethod,
  path: string,
  options: { public?: true } = {},
): ApiRoute<C> => ({ contract, method, path, ...options });
const open = { public: true } as const;

export const API_ROUTES = {
  notifications: {
    list: route(notificationsSchemas.list, "GET", "/notifications"),
    markRead: route(notificationsSchemas.markRead, "PATCH", "/notifications/:id/read"),
  },
  auth: {
    registrationPrograms: route(
      authSchemas.registrationPrograms,
      "GET",
      "/auth/registration-programs",
      open,
    ),
    config: route(authSchemas.config, "GET", "/auth/config", open),
    me: route(authSchemas.me, "GET", "/auth/me", open),
    login: route(authSchemas.login, "POST", "/auth/login", open),
    signup: route(authSchemas.signup, "POST", "/auth/signup", open),
    logout: route(authSchemas.logout, "POST", "/auth/logout", open),
    forgotPassword: route(
      authSchemas.forgotPassword,
      "POST",
      "/auth/password-reset-requests",
      open,
    ),
    resetPassword: route(authSchemas.resetPassword, "POST", "/auth/password-resets", open),
    mfaStatus: route(authSchemas.mfaStatus, "GET", "/auth/mfa"),
    beginMfa: route(authSchemas.beginMfa, "POST", "/auth/mfa/enrollments"),
    confirmMfa: route(authSchemas.confirmMfa, "POST", "/auth/mfa/confirmations"),
    verifyMfa: route(authSchemas.verifyMfa, "POST", "/auth/mfa/verifications"),
    verificationStatus: route(authSchemas.verificationStatus, "GET", "/auth/verification"),
    sendVerification: route(authSchemas.sendVerification, "POST", "/auth/verification-challenges"),
    confirmVerification: route(
      authSchemas.confirmVerification,
      "POST",
      "/auth/verification-confirmations",
    ),
    createGooglePassword: route(authSchemas.createGooglePassword, "POST", "/auth/password"),
    completeProfile: route(authSchemas.completeProfile, "PATCH", "/auth/profile-completion"),
    updateProfile: route(authSchemas.updateProfile, "PATCH", "/auth/profile"),
    changePassword: route(authSchemas.changePassword, "PATCH", "/auth/password"),
    requestEmailChange: route(
      authSchemas.requestEmailChange,
      "POST",
      "/auth/email-change-challenges",
    ),
    confirmEmailChange: route(
      authSchemas.confirmEmailChange,
      "POST",
      "/auth/email-change-confirmations",
    ),
  },
  users: {
    list: route(usersSchemas.list, "GET", "/users"),
    create: route(usersSchemas.create, "POST", "/users"),
    update: route(usersSchemas.update, "PATCH", "/users/:id"),
    setStatus: route(usersSchemas.setStatus, "PATCH", "/users/:id/status"),
  },
  roles: {
    list: route(rolesSchemas.list, "GET", "/roles"),
    create: route(rolesSchemas.create, "POST", "/roles"),
    update: route(rolesSchemas.update, "PATCH", "/roles/:id"),
    delete: route(rolesSchemas.delete, "DELETE", "/roles/:id"),
  },
  permissions: { list: route(permissionsSchemas.list, "GET", "/permissions") },
  colleges: {
    list: route(collegesSchemas.list, "GET", "/colleges"),
    create: route(collegesSchemas.create, "POST", "/colleges"),
    update: route(collegesSchemas.update, "PATCH", "/colleges/:id"),
    delete: route(collegesSchemas.delete, "DELETE", "/colleges/:id"),
  },
  faculty: {
    list: route(facultySchemas.list, "GET", "/faculty"),
    create: route(facultySchemas.create, "POST", "/faculty"),
    update: route(facultySchemas.update, "PATCH", "/faculty/:id"),
    assign: route(assignSchemas.assign, "POST", "/alumni/assign"),
  },
  departments: {
    list: route(departmentsSchemas.list, "GET", "/departments"),
    get: route(departmentsSchemas.get, "GET", "/departments/:id"),
    create: route(departmentsSchemas.create, "POST", "/departments"),
    update: route(departmentsSchemas.update, "PATCH", "/departments/:id"),
    delete: route(departmentsSchemas.delete, "DELETE", "/departments/:id"),
  },
  programs: {
    list: route(programsSchemas.list, "GET", "/programs"),
    get: route(programsSchemas.get, "GET", "/programs/:id"),
    create: route(programsSchemas.create, "POST", "/programs"),
    update: route(programsSchemas.update, "PATCH", "/programs/:id"),
    delete: route(programsSchemas.delete, "DELETE", "/programs/:id"),
  },
  alumni: {
    pendingAccounts: route(alumniSchemas.pendingAccounts, "GET", "/alumni/pending-accounts"),
    list: route(alumniSchemas.list, "GET", "/alumni"),
    get: route(alumniSchemas.get, "GET", "/alumni/:id"),
    history: route(alumniSchemas.history, "GET", "/alumni/:id/history"),
    update: route(alumniSchemas.update, "PATCH", "/alumni/:id"),
    addContact: route(contactsSchemas.create, "POST", "/alumni/:alumniId/contacts"),
    updateContact: route(contactsSchemas.update, "PATCH", "/alumni/:alumniId/contacts/:id"),
    deleteContact: route(contactsSchemas.delete, "DELETE", "/alumni/:alumniId/contacts/:id"),
    delete: route(alumniSchemas.delete, "DELETE", "/alumni/:id"),
    addEmployment: route(alumniSchemas.addEmployment, "POST", "/alumni/:alumniId/employments"),
    deleteEmployment: route(alumniSchemas.deleteEmployment, "DELETE", "/employments/:id"),
    updateEmployment: route(alumniSchemas.updateEmployment, "PATCH", "/employments/:id"),
    addTracking: route(alumniSchemas.addTracking, "POST", "/alumni/:alumniId/tracking-events"),
    trackingEvents: route(alumniSchemas.trackingEvents, "GET", "/alumni/:alumniId/tracking-events"),
    removePhoto: route(alumniSchemas.removePhoto, "DELETE", "/alumni/:alumniId/photo"),
  },
  me: {
    statistics: route(aggregateSchemas.summary, "GET", "/me/statistics"),
    employment: {
      create: route(selfEmploymentSchemas.create, "POST", "/me/employments"),
      update: route(selfEmploymentSchemas.update, "PATCH", "/me/employments/:id"),
      remove: route(selfEmploymentSchemas.remove, "DELETE", "/me/employments/:id"),
    },
    removeFile: route(filesSchemas.remove, "DELETE", "/me/files/:id"),
    profile: {
      get: route(meProfileSchemas.get, "GET", "/me/profile"),
      update: route(meProfileSchemas.update, "PATCH", "/me/profile"),
    },
  },
  dashboard: { summary: route(dashboardSchemas.summary, "GET", "/dashboard") },
  reports: {
    summary: route(reportsSchemas.summary, "GET", "/reports"),
    alumniCsv: route(reportsSchemas.alumniCsv, "GET", "/reports/alumni.csv"),
  },
  integrations: {
    list: route(integrationsSchemas.list, "GET", "/integrations"),
    enable: route(integrationsSchemas.enable, "POST", "/integrations/:key/enable"),
    updateCredentials: route(integrationsSchemas.update, "PUT", "/integrations/:key/credentials"),
    disable: route(integrationsSchemas.disable, "POST", "/integrations/:key/disable"),
    sendTestEmail: route(
      integrationsSchemas.sendTestEmail,
      "POST",
      "/integrations/email/test-messages",
    ),
    notifyAlumni: route(
      integrationsSchemas.notifyAlumni,
      "POST",
      "/integrations/email/notifications",
    ),
    importCsv: route(integrationsSchemas.importCsv, "POST", "/integrations/csv/imports"),
    importSheets: route(
      integrationsSchemas.importSheets,
      "POST",
      "/integrations/google-sheets/imports",
    ),
    exportSheets: route(
      integrationsSchemas.exportSheets,
      "POST",
      "/integrations/google-sheets/exports",
    ),
  },
  audit: { list: route(auditSchemas.list, "GET", "/audit") },
  files: { remove: route(filesSchemas.remove, "DELETE", "/files/:id") },
  backups: {
    overview: route(backupsSchemas.overview, "GET", "/backups"),
    create: route(backupsSchemas.create, "POST", "/backups"),
    schedule: route(backupsSchemas.schedule, "PUT", "/backups/schedule"),
    restore: route(backupsSchemas.restore, "POST", "/backups/:id/restore"),
    restoreStatus: route(backupsSchemas.restoreStatus, "GET", "/backups/restore"),
    endMaintenance: route(backupsSchemas.endMaintenance, "POST", "/backups/maintenance/end"),
  },
} as const;

/**
 * Endpoints that are not JSON-in/JSON-out (uploads, downloads, browser redirects, webhooks,
 * probes). They are documented in OpenAPI by hand from this list.
 */
export const RAW_ROUTES = [
  {
    method: "POST",
    path: "/files/evidence",
    kind: "upload",
    summary: "Upload evidence for an alumni record (multipart, field `file`, max 10 MB).",
  },
  {
    method: "GET",
    path: "/files/:id",
    kind: "download",
    summary: "Download a private evidence file.",
  },
  {
    method: "POST",
    path: "/me/files",
    kind: "upload",
    summary: "Upload own evidence (multipart, field `file`, max 10 MB).",
  },
  {
    method: "GET",
    path: "/me/files/:id",
    kind: "download",
    summary: "Download own evidence file.",
  },
  {
    method: "POST",
    path: "/me/photo",
    kind: "upload",
    summary: "Upload own profile photo (multipart, field `file`).",
  },
  { method: "DELETE", path: "/me/photo", kind: "json", summary: "Remove own profile photo." },
  {
    method: "GET",
    path: "/account-photos/:userId/:id",
    kind: "download",
    summary: "Read a stored account photo.",
  },
  { method: "GET", path: "/reports/alumni.pdf", kind: "download", summary: "Alumni list as PDF." },
  {
    method: "GET",
    path: "/reports/assignments.pdf",
    kind: "download",
    summary: "Faculty assignments as PDF.",
  },
  {
    method: "GET",
    path: "/reports/alumni/:id/profile.pdf",
    kind: "download",
    summary: "One alumni profile as PDF.",
  },
  {
    method: "POST",
    path: "/backups/import",
    kind: "upload",
    summary: "Import an encrypted .atsbak backup (multipart, field `backup`, max 20 GB).",
  },
  {
    method: "GET",
    path: "/auth/google",
    kind: "redirect",
    summary: "Start Google sign-in (browser redirect).",
  },
  {
    method: "GET",
    path: "/auth/google/callback",
    kind: "redirect",
    summary: "Google sign-in callback (browser redirect).",
  },
  {
    method: "POST",
    path: "/integrations/google-forms/webhook",
    kind: "webhook",
    summary: "Google Forms submission webhook (header `x-webhook-secret`, `Idempotency-Key`).",
  },
] as const satisfies readonly {
  method: HttpMethod;
  path: string;
  kind: "upload" | "download" | "redirect" | "webhook" | "json";
  summary: string;
}[];

/** Walks API_ROUTES, yielding each route with its dotted key (for example "auth.login"). */
export function* eachApiRoute(
  table: object = API_ROUTES,
  prefix: string[] = [],
): Generator<{ key: string; route: ApiRoute }> {
  for (const [name, value] of Object.entries(table)) {
    if (value && typeof value === "object" && "contract" in value && "method" in value)
      yield { key: [...prefix, name].join("."), route: value as ApiRoute };
    else if (value && typeof value === "object") yield* eachApiRoute(value, [...prefix, name]);
  }
}
