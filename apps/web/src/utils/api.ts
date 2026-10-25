import { QueryCache, QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { errorResponseSchema } from "@Alumni-Tracking-Ss/contracts/common";
import { authSchemas } from "@Alumni-Tracking-Ss/contracts/auth";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";
import { rolesSchemas, permissionsSchemas } from "@Alumni-Tracking-Ss/contracts/roles";
import {
  alumniSchemas,
  meProfileSchemas,
  filesSchemas,
  selfEmploymentSchemas,
  uploadOutputSchema,
} from "@Alumni-Tracking-Ss/contracts/alumni";
import { departmentsSchemas, programsSchemas } from "@Alumni-Tracking-Ss/contracts/academic";
import {
  dashboardSchemas,
  reportsSchemas,
  aggregateSchemas,
} from "@Alumni-Tracking-Ss/contracts/reports";
import { integrationsSchemas } from "@Alumni-Tracking-Ss/contracts/integrations";
import { auditSchemas } from "@Alumni-Tracking-Ss/contracts/audit";
import { notificationsSchemas } from "@Alumni-Tracking-Ss/contracts/notifications";
import { ENV } from "../env";

export class RestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function readJson<O>(response: Response, schema: z.ZodType<O>): Promise<O> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(payload);
    throw new RestError(
      parsed.success ? parsed.data.error : "Request failed. Try again.",
      response.status,
      parsed.success ? parsed.data.code : "REQUEST_FAILED",
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new Error("The server returned an unexpected response. Refresh and try again.");
  return parsed.data;
}

type InputArgs<S extends z.ZodType> =
  undefined extends z.input<S> ? [input?: z.input<S>] : [input: z.input<S>];
type QueryArgs<S extends z.ZodType> =
  undefined extends z.input<S>
    ? [options?: { input?: z.input<S> }]
    : [options: { input: z.input<S> }];

// A small fetch helper: the contract validates both request input and the untrusted response.
function endpoint<I extends z.ZodType, O>(
  contract: { input: I; output: z.ZodType<O> },
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
) {
  async function request(input: z.input<I> | undefined, signal?: AbortSignal): Promise<O> {
    const parsed: unknown = contract.input.parse(input);
    const fields =
      parsed && typeof parsed === "object" ? Object.fromEntries(Object.entries(parsed)) : {};
    const resolved = path.replace(/:([A-Za-z]+)/g, (_match: string, key: string) => {
      const value: unknown = fields[key];
      if (typeof value !== "string") throw new Error("A record ID is required.");
      delete fields[key];
      return encodeURIComponent(value);
    });
    const url = new URL(
      `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${resolved}`,
      window.location.origin,
    );
    if (method === "GET")
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null && value !== "")
          url.searchParams.set(key, String(value));
      }
    return readJson(
      await fetch(url, {
        method,
        credentials: "include",
        signal,
        ...(method === "GET"
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) }),
      }),
      contract.output,
    );
  }
  return Object.assign((...args: InputArgs<I>) => request(args[0]), {
    queryOptions: (...args: QueryArgs<I>) => ({
      queryKey: ["rest", method, path, args[0]?.input ?? null] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => request(args[0]?.input, signal),
    }),
  });
}

export const client = {
  notifications: {
    list: endpoint(notificationsSchemas.list, "GET", "/api/notifications"),
    markRead: endpoint(notificationsSchemas.markRead, "PATCH", "/api/notifications/:id/read"),
  },
  auth: {
    registrationPrograms: endpoint(
      authSchemas.registrationPrograms,
      "GET",
      "/api/auth/registration-programs",
    ),
    config: endpoint(authSchemas.config, "GET", "/api/auth/config"),
    me: endpoint(authSchemas.me, "GET", "/api/auth/me"),
    login: endpoint(authSchemas.login, "POST", "/api/auth/login"),
    signup: endpoint(authSchemas.signup, "POST", "/api/auth/signup"),
    logout: endpoint(authSchemas.logout, "POST", "/api/auth/logout"),
    forgotPassword: endpoint(
      authSchemas.forgotPassword,
      "POST",
      "/api/auth/password-reset-requests",
    ),
    resetPassword: endpoint(authSchemas.resetPassword, "POST", "/api/auth/password-resets"),
    mfaStatus: endpoint(authSchemas.mfaStatus, "GET", "/api/auth/mfa"),
    beginMfa: endpoint(authSchemas.beginMfa, "POST", "/api/auth/mfa/enrollments"),
    confirmMfa: endpoint(authSchemas.confirmMfa, "POST", "/api/auth/mfa/confirmations"),
    verifyMfa: endpoint(authSchemas.verifyMfa, "POST", "/api/auth/mfa/verifications"),
    verificationStatus: endpoint(authSchemas.verificationStatus, "GET", "/api/auth/verification"),
    sendVerification: endpoint(
      authSchemas.sendVerification,
      "POST",
      "/api/auth/verification-challenges",
    ),
    confirmVerification: endpoint(
      authSchemas.confirmVerification,
      "POST",
      "/api/auth/verification-confirmations",
    ),
    createGooglePassword: endpoint(authSchemas.createGooglePassword, "POST", "/api/auth/password"),
    completeProfile: endpoint(authSchemas.completeProfile, "PATCH", "/api/auth/profile-completion"),
    updateProfile: endpoint(authSchemas.updateProfile, "PATCH", "/api/auth/profile"),
    changePassword: endpoint(authSchemas.changePassword, "PATCH", "/api/auth/password"),
  },
  users: {
    list: endpoint(usersSchemas.list, "GET", "/api/users"),
    create: endpoint(usersSchemas.create, "POST", "/api/users"),
    update: endpoint(usersSchemas.update, "PATCH", "/api/users/:id"),
    setStatus: endpoint(usersSchemas.setStatus, "PATCH", "/api/users/:id/status"),
    linkAlumni: endpoint(alumniSchemas.linkAlumni, "POST", "/api/users/:id/alumni-link"),
  },
  roles: {
    list: endpoint(rolesSchemas.list, "GET", "/api/roles"),
    create: endpoint(rolesSchemas.create, "POST", "/api/roles"),
    update: endpoint(rolesSchemas.update, "PATCH", "/api/roles/:id"),
    delete: endpoint(rolesSchemas.delete, "DELETE", "/api/roles/:id"),
  },
  permissions: { list: endpoint(permissionsSchemas.list, "GET", "/api/permissions") },
  departments: {
    list: endpoint(departmentsSchemas.list, "GET", "/api/departments"),
    get: endpoint(departmentsSchemas.get, "GET", "/api/departments/:id"),
    create: endpoint(departmentsSchemas.create, "POST", "/api/departments"),
    update: endpoint(departmentsSchemas.update, "PATCH", "/api/departments/:id"),
    delete: endpoint(departmentsSchemas.delete, "DELETE", "/api/departments/:id"),
  },
  programs: {
    list: endpoint(programsSchemas.list, "GET", "/api/programs"),
    get: endpoint(programsSchemas.get, "GET", "/api/programs/:id"),
    create: endpoint(programsSchemas.create, "POST", "/api/programs"),
    update: endpoint(programsSchemas.update, "PATCH", "/api/programs/:id"),
    delete: endpoint(programsSchemas.delete, "DELETE", "/api/programs/:id"),
  },
  alumni: {
    pendingAccounts: endpoint(alumniSchemas.pendingAccounts, "GET", "/api/alumni/pending-accounts"),
    list: endpoint(alumniSchemas.list, "GET", "/api/alumni"),
    get: endpoint(alumniSchemas.get, "GET", "/api/alumni/:id"),
    create: endpoint(alumniSchemas.create, "POST", "/api/alumni"),
    update: endpoint(alumniSchemas.update, "PATCH", "/api/alumni/:id"),
    delete: endpoint(alumniSchemas.delete, "DELETE", "/api/alumni/:id"),
    addEmployment: endpoint(
      alumniSchemas.addEmployment,
      "POST",
      "/api/alumni/:alumniId/employments",
    ),
    deleteEmployment: endpoint(alumniSchemas.deleteEmployment, "DELETE", "/api/employments/:id"),
    updateEmployment: endpoint(alumniSchemas.updateEmployment, "PATCH", "/api/employments/:id"),
    addTracking: endpoint(
      alumniSchemas.addTracking,
      "POST",
      "/api/alumni/:alumniId/tracking-events",
    ),
  },
  me: {
    statistics: endpoint(aggregateSchemas.summary, "GET", "/api/me/statistics"),
    employment: {
      create: endpoint(selfEmploymentSchemas.create, "POST", "/api/me/employments"),
      update: endpoint(selfEmploymentSchemas.update, "PATCH", "/api/me/employments/:id"),
      remove: endpoint(selfEmploymentSchemas.remove, "DELETE", "/api/me/employments/:id"),
    },
    removeFile: endpoint(filesSchemas.remove, "DELETE", "/api/me/files/:id"),
    profile: {
      get: endpoint(meProfileSchemas.get, "GET", "/api/me/profile"),
      update: endpoint(meProfileSchemas.update, "PATCH", "/api/me/profile"),
    },
  },
  dashboard: { summary: endpoint(dashboardSchemas.summary, "GET", "/api/dashboard") },
  reports: {
    summary: endpoint(reportsSchemas.summary, "GET", "/api/reports"),
    alumniCsv: endpoint(reportsSchemas.alumniCsv, "GET", "/api/reports/alumni.csv"),
  },
  integrations: {
    list: endpoint(integrationsSchemas.list, "GET", "/api/integrations"),
    toggle: endpoint(integrationsSchemas.toggle, "PATCH", "/api/integrations/:key"),
    sendTestEmail: endpoint(
      integrationsSchemas.sendTestEmail,
      "POST",
      "/api/integrations/email/test-messages",
    ),
    notifyAlumni: endpoint(
      integrationsSchemas.notifyAlumni,
      "POST",
      "/api/integrations/email/notifications",
    ),
    importCsv: endpoint(integrationsSchemas.importCsv, "POST", "/api/integrations/csv/imports"),
    importSheets: endpoint(
      integrationsSchemas.importSheets,
      "POST",
      "/api/integrations/google-sheets/imports",
    ),
    exportSheets: endpoint(
      integrationsSchemas.exportSheets,
      "POST",
      "/api/integrations/google-sheets/exports",
    ),
  },
  audit: { list: endpoint(auditSchemas.list, "GET", "/api/audit") },
  files: { remove: endpoint(filesSchemas.remove, "DELETE", "/api/files/:id") },
};
export const api = client;
export async function uploadProfileFile(options: {
  file: File;
  kind: "image" | "evidence";
  alumniId?: string;
  employmentId?: string;
  onProgress: (percent: number) => void;
}) {
  if (options.file.size > 10 * 1024 * 1024) throw new Error("File must be 10 MB or smaller.");
  const data = new FormData();
  data.append("file", options.file);
  data.append("kind", options.kind);
  if (options.alumniId) data.append("alumniId", options.alumniId);
  if (options.employmentId) data.append("employmentId", options.employmentId);
  const url = `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/api/${options.alumniId ? "files/evidence" : "me/files"}`;
  return new Promise<z.infer<typeof uploadOutputSchema>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.timeout = 30000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and retry."));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Retry when your connection is available."));
    xhr.onload = () => {
      void readJson(
        new Response(xhr.responseText, { status: xhr.status }),
        uploadOutputSchema,
      ).then(resolve, reject);
    };
    xhr.send(data);
  });
}
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        toast.error(error.message, {
          action: {
            label: "Retry",
            onClick: () => {
              query.invalidate();
            },
          },
        }),
    }),
  });
}
export const queryClient = createQueryClient();
