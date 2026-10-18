import { createSign, randomUUID } from "node:crypto";
import { mkdir, writeFile, realpath, readFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";

import type { IntegrationEnv } from "../context";

export type StoredFile = {
  provider: "local" | "google_drive" | "imgbb";
  storageKey: string;
  url?: string;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

export async function storeFile(
  env: IntegrationEnv,
  input: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    preferImageHost?: boolean;
  },
): Promise<StoredFile> {
  if (input.preferImageHost && env.imageHostProvider === "local") return storeLocal(env, input);
  if (input.preferImageHost && env.imageHostProvider !== "google_drive" && env.imgbbApiKey) {
    return uploadImgbb(env.imgbbApiKey, input.buffer, input.originalName);
  }

  if (env.googleServiceAccountJson && env.googleDriveFolderId) {
    try {
      return await uploadDrive(env, input);
    } catch {
      console.warn("Drive storage unavailable; storing file in private local storage.");
    }
  }

  return storeLocal(env, input);
}

async function storeLocal(
  env: IntegrationEnv,
  input: { buffer: Buffer; originalName: string },
): Promise<StoredFile> {
  const uploadDir = env.uploadDir || path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const storageKey = randomUUID();
  await writeFile(path.join(uploadDir, storageKey), input.buffer, { flag: "wx", mode: 0o600 });
  return { provider: "local", storageKey };
}

async function uploadImgbb(apiKey: string, buffer: Buffer, name: string): Promise<StoredFile> {
  const body = new URLSearchParams({
    key: apiKey,
    image: buffer.toString("base64"),
    name,
  });

  const response = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    body,
  });

  if (!response.ok) {
    throw new Error("imgBB upload failed");
  }

  const payload = (await response.json()) as {
    success?: boolean;
    data?: { url?: string; id?: string };
  };

  if (!payload.success || !payload.data?.url) {
    throw new Error("imgBB upload rejected");
  }

  return {
    provider: "imgbb",
    storageKey: payload.data.id || payload.data.url,
    url: payload.data.url,
  };
}

async function uploadDrive(
  env: IntegrationEnv,
  input: { buffer: Buffer; mimeType: string; originalName: string },
): Promise<StoredFile> {
  const token = await googleAccessToken(env.googleServiceAccountJson!, [
    "https://www.googleapis.com/auth/drive.file",
  ]);

  const metadata: Record<string, unknown> = {
    name: input.originalName,
  };
  if (env.googleDriveFolderId) {
    metadata.parents = [env.googleDriveFolderId];
  }

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
  const suffix = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(prefix), input.buffer, Buffer.from(suffix)]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
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

  if (!response.ok) {
    throw new Error(`Google Drive upload failed: ${response.status}`);
  }

  const payload = (await response.json()) as { id: string; webViewLink?: string };
  return {
    provider: "google_drive",
    storageKey: payload.id,
    url: payload.webViewLink,
  };
}

export async function googleAccessToken(json: string, scopes: string[]) {
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

  const response = await fetch("https://oauth2.googleapis.com/token", {
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
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.storageKey)}?alt=media`,
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
