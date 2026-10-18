import type { Database } from "@Alumni-Tracking-Ss/db";
import type { PermissionKey } from "@Alumni-Tracking-Ss/db";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: "active" | "disabled";
  roles: string[];
  permissions: PermissionKey[];
};

export type IntegrationEnv = {
  recaptchaSecretKey?: string;
  recaptchaSiteKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleServiceAccountJson?: string;
  googleDriveFolderId?: string;
  googleSheetsSpreadsheetId?: string;
  googleFormsWebhookSecret?: string;
  smtpUrl?: string;
  smtpFrom?: string;
  imgbbApiKey?: string;
  imageHostProvider?: string;
  uploadDir?: string;
  appUrl?: string;
};

export type Context = {
  db: Database;
  sessionToken: string | null;
  user: AuthUser | null;
  ipAddress: string | null;
  userAgent: string | null;
  integrationEnv: IntegrationEnv;
};
