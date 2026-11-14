import { QueryCache, QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { errorResponseSchema } from "@Alumni-Tracking-Ss/contracts/common";
import { uploadOutputSchema } from "@Alumni-Tracking-Ss/contracts/alumni";
import { backupsSchemas } from "@Alumni-Tracking-Ss/contracts/backups";
import { API_PREFIX, API_ROUTES } from "@Alumni-Tracking-Ss/contracts/api-routes";
import { ENV } from "@/env";
import { markSessionEnded } from "@/lib/session-ended";

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
  if (response.status === 401) noteUnauthorized();
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
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

type RouteEndpoint<R> = R extends {
  contract: { input: infer I extends z.ZodType; output: z.ZodType<infer O> };
}
  ? ReturnType<typeof endpoint<I, O>>
  : never;
type ClientOf<T> = {
  [K in keyof T]: T[K] extends { contract: unknown; method: string }
    ? RouteEndpoint<T[K]>
    : ClientOf<T[K]>;
};
function buildClient<T extends object>(table: T): ClientOf<T> {
  return Object.fromEntries(
    Object.entries(table).map(([name, value]) => [
      name,
      "contract" in value && "method" in value
        ? endpoint(value.contract, value.method, `${API_PREFIX}${value.path}`)
        : buildClient(value as object),
    ]),
  ) as ClientOf<T>;
}

// Every JSON endpoint comes from the shared route table (packages/contracts/src/api-routes.ts),
// the same table the OpenAPI description and the server route test are generated from.
const routes = buildClient(API_ROUTES);
export const client = {
  ...routes,
  backups: { ...routes.backups, import: uploadBackupFile },
};
export const api = client;

export async function uploadBackupFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".atsbak"))
    throw new Error("Select an .atsbak backup file.");
  const data = new FormData();
  data.append("backup", file);
  return readJson(
    await fetch(`${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${API_PREFIX}/backups/import`, {
      method: "POST",
      credentials: "include",
      body: data,
    }),
    backupsSchemas.import.output,
  );
}

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
  const url = `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${API_PREFIX}/${options.alumniId ? "files/evidence" : "me/files"}`;
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
let sessionCheck: Promise<void> | undefined;
/**
 * A 401 while signed in may mean the session ended. Confirm with /auth/me (a 401 can also come
 * from an action) before telling the user; signed-out pages have no cached user and are skipped.
 */
function noteUnauthorized() {
  if (sessionCheck || !queryClient.getQueryData(api.auth.me.queryOptions().queryKey)) return;
  sessionCheck = client.auth
    .me()
    .then((user) => {
      if (!user) {
        markSessionEnded();
        // Error toasts from the refused request would only repeat the notice.
        toast.dismiss();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      sessionCheck = undefined;
    });
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        // The session-ended dialog explains a 401; a toast would only repeat it.
        error instanceof RestError && error.status === 401
          ? undefined
          : toast.error(error.message, {
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

/** Downloads a server-generated PDF; errors surface the server's message like JSON calls do. */
export async function downloadPdf(
  path: string,
  query: Record<string, string | number | undefined> = {},
) {
  const search = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined || value === "" ? [] : [[key, String(value)]],
    ),
  );
  const response = await fetch(
    `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${API_PREFIX}${path}${search.size ? `?${search}` : ""}`,
    { credentials: "include" },
  );
  if (!response.ok) await readJson(response, z.unknown());
  const disposition = response.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "report.pdf";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
