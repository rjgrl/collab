import { createSign, randomUUID } from "node:crypto";
import { mkdir, writeFile, realpath, readFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import type { IntegrationEnv } from "../context";
import { ApiError } from "../http-error";

export type StorageProvider = "local" | "google_drive" | "imgbb";
export type StoredFile = {
  provider: StorageProvider;
  storageKey: string;
  url?: string;
  // imgBB only: the page that deletes the image. imgBB documents no delete API.
  deleteUrl?: string;
  // What was actually stored; differs from the upload when an image is resized.
  mimeType: string;
  sizeBytes: number;
};
type UploadInput = { buffer: Buffer; mimeType: string; originalName: string };

/** One shape for every backend so the image host or evidence store can be swapped by config. */
export interface FileStore {
  readonly provider: StorageProvider;
  put(input: UploadInput): Promise<StoredFile>;
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

export const PROFILE_IMAGE_MAX_EDGE = 1024;

/**
 * Downscales to fit 1024x1024, applies EXIF orientation, strips metadata (including GPS),
 * and re-encodes as WebP. A pixel limit rejects decompression bombs before decoding.
 */
export async function prepareProfileImage(input: UploadInput): Promise<UploadInput> {
  const buffer = await sharp(input.buffer, { limitInputPixels: 40_000_000, animated: false })
    .autoOrient()
    .resize({
      width: PROFILE_IMAGE_MAX_EDGE,
      height: PROFILE_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  return {
    buffer,
    mimeType: "image/webp",
    originalName: input.originalName.replace(/\.[^.]*$/, "") + ".webp",
  };
}

export function localStore(env: IntegrationEnv): FileStore {
  return {
    provider: "local",
    async put(input) {
      const uploadDir = env.uploadDir || path.join(process.cwd(), "uploads");
      await mkdir(uploadDir, { recursive: true });
      const storageKey = randomUUID();
      await writeFile(path.join(uploadDir, storageKey), input.buffer, { flag: "wx", mode: 0o600 });
      return {
        provider: "local",
        storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
      };
    },
  };
}

// API per https://api.imgbb.com/ : POST /1/upload with key + image (base64) + name; the
// response carries data.id, data.url and data.delete_url. Uploaded images are public.
export function imgbbStore(apiKey: string, fetcher: typeof fetch = fetch): FileStore {
  return {
    provider: "imgbb",
    async put(input) {
      const response = await fetcher("https://api.imgbb.com/1/upload", {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        body: new URLSearchParams({
          key: apiKey,
          image: input.buffer.toString("base64"),
          name: input.originalName,
        }),
      });
      if (!response.ok) throw new Error("imgBB upload failed");
      const payload = (await response.json()) as {
        success?: boolean;
        data?: { url?: string; id?: string; delete_url?: string };
      };
      if (!payload.success || !payload.data?.url) throw new Error("imgBB upload rejected");
      return {
        provider: "imgbb",
        storageKey: payload.data.id || payload.data.url,
        url: payload.data.url,
        deleteUrl: payload.data.delete_url,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
      };
    },
  };
}

// Service accounts have no storage quota and cannot own files, so the folder must sit in a
// Shared Drive (https://developers.google.com/workspace/drive/api/guides/about-shareddrives),
// and every request needs supportsAllDrives=true (…/guides/enable-shareddrives).
// No permissions are created: files stay private and are served by the backend only.
export function driveStore(env: IntegrationEnv, fetcher: typeof fetch = fetch): FileStore {
  return {
    provider: "google_drive",
    async put(input) {
      const token = await googleAccessToken(
        env.googleServiceAccountJson!,
        ["https://www.googleapis.com/auth/drive.file"],
        fetcher,
      );
      const metadata = { name: input.originalName, parents: [env.googleDriveFolderId!] };
      const boundary = `alumni_${randomUUID()}`;
      const prefix = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${input.mimeType}`,
        "",
        "",
      ].join("\r\n");
      const body = Buffer.concat([
        Buffer.from(prefix),
        input.buffer,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const response = await fetcher(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
        {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      if (!response.ok) throw new Error(`Google Drive upload failed: ${response.status}`);
      const payload = (await response.json()) as { id: string };
      return {
        provider: "google_drive",
        storageKey: payload.id,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
      };
    },
  };
}

const driveConfigured = (env: IntegrationEnv) =>
  Boolean(env.googleServiceAccountJson && env.googleDriveFolderId);

/** Private evidence: Google Drive when configured, otherwise local disk. Never a public host. */
export function evidenceStore(env: IntegrationEnv): FileStore {
  return driveConfigured(env) ? driveStore(env) : localStore(env);
}

/** Alumni profile photos: IMAGE_HOST_PROVIDER picks the host; default imgBB when keyed. */
export function imageStore(env: IntegrationEnv): FileStore {
  const choice = env.imageHostProvider?.trim().toLowerCase();
  if (choice === "local") return localStore(env);
  if (choice === "google_drive") return evidenceStore(env);
  if (choice && choice !== "imgbb")
    throw new Error("IMAGE_HOST_PROVIDER must be imgbb, google_drive or local.");
  return env.imgbbApiKey ? imgbbStore(env.imgbbApiKey) : evidenceStore(env);
}

/**
 * A configured provider that fails fails the upload: no silent fallback to another backend,
 * which would leave files somewhere operators do not expect (and could not back up).
 */
export async function storeFile(
  env: IntegrationEnv,
  input: UploadInput & { preferImageHost?: boolean; resizeImage?: boolean },
): Promise<StoredFile> {
  let prepared: UploadInput = input;
  if (input.resizeImage)
    try {
      prepared = await prepareProfileImage(input);
    } catch {
      // Magic bytes passed but the pixels do not decode (truncated, corrupt, or over the pixel limit).
      throw new ApiError("BAD_REQUEST", { message: "Choose a valid, uncorrupted image." });
    }
  return (input.preferImageHost ? imageStore(env) : evidenceStore(env)).put(prepared);
}

export async function googleAccessToken(
  json: string,
  scopes: string[],
  fetcher: typeof fetch = fetch,
) {
  const account = JSON.parse(json) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: scopes.join(" "),
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(account.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error("Google service account token failed");
  }

  const tokenPayload = (await response.json()) as { access_token: string };
  return tokenPayload.access_token;
}

export const ALLOWED_EVIDENCE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export async function validateEvidence(buffer: Buffer, claimedType: string) {
  if (
    !buffer.length ||
    buffer.length > MAX_EVIDENCE_BYTES ||
    !ALLOWED_EVIDENCE_TYPES.has(claimedType)
  )
    return false;
  try {
    const detected = await fileTypeFromBuffer(buffer);
    if (detected) return detected.mime === claimedType && ALLOWED_EVIDENCE_TYPES.has(detected.mime);
    if (claimedType !== "text/csv" || buffer.includes(0)) return false;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return !/^\s*</.test(text) && text.includes(",");
  } catch {
    return false;
  }
}

export async function readPrivateFile(
  env: IntegrationEnv,
  file: { provider: string; storageKey: string; url: string | null },
) {
  if (file.provider === "local") {
    const root = await realpath(env.uploadDir || path.join(process.cwd(), "uploads"));
    const target = await realpath(path.resolve(root, file.storageKey));
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Invalid storage key.");
    return readFile(target);
  }
  if (file.provider === "google_drive" && env.googleServiceAccountJson) {
    const token = await googleAccessToken(env.googleServiceAccountJson, [
      "https://www.googleapis.com/auth/drive.readonly",
    ]);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.storageKey)}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      },
    );
    if (!response.ok || !response.body) throw new Error("Private file is unavailable.");
    return response.body;
  }
  // imgBB is used only for intentionally public profile photos.
  if (file.provider === "imgbb" && file.url) {
    const url = new URL(file.url);
    if (url.protocol !== "https:" || !["i.ibb.co", "image.ibb.co"].includes(url.hostname))
      throw new Error("Invalid image host.");
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
    if (!response.ok || !response.body) throw new Error("Image unavailable.");
    return response.body;
  }
  throw new Error("Private storage is not configured.");
}
