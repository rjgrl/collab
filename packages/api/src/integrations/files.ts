import { createSign, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
  if (input.preferImageHost && env.imgbbApiKey) {
    return uploadImgbb(env.imgbbApiKey, input.buffer, input.originalName);
  }

  if (env.googleServiceAccountJson) {
    try {
      return await uploadDrive(env, input);
    } catch (error) {
      console.error("[drive:fallback]", error);
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
  const safeName = input.originalName.replaceAll(/[^A-Za-z0-9._-]/g, "_");
  const storageKey = `${Date.now()}-${randomUUID()}-${safeName}`;
  await writeFile(path.join(uploadDir, storageKey), input.buffer);
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
  "application/vnd.ms-excel",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
