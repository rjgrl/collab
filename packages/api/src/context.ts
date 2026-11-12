import type { Database } from "@Alumni-Tracking-Ss/db";
import type { AuthUser } from "@Alumni-Tracking-Ss/contracts/auth";
export type { AuthUser } from "@Alumni-Tracking-Ss/contracts/auth";

export type IntegrationEnv = {
  recaptchaSecretKey?: string;
  recaptchaSiteKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleServiceAccountJson?: string;
  googleDriveFolderId?: string;
  googleSheetsSpreadsheetId?: string;
  googleSheetsServiceAccountJson?: string;
  googleFormsWebhookSecret?: string;
  smtpUrl?: string;
  smtpFrom?: string;
  emailApiKey?: string;
  verificationSecret?: string;
  mfaEncryptionKey?: string;
  integrationEncryptionKey?: string;
  smsProvider?: {
    sendCode: (phone: string) => Promise<string>;
    checkCode: (sid: string, phone: string, code: string) => Promise<boolean>;
  };
  connectionTester?: (key: string, values: Record<string, string>) => Promise<void>;
  imgbbApiKey?: string;
  imageHostProvider?: string;
  uploadDir?: string;
  appUrl?: string;
  webOrigin?: string;
};

export type Context = {
  db: Database;
  sessionToken: string | null;
  sessionStorageToken?: string | null;
  onSessionRotation?: (session: { token: string; expiresAt: Date }) => void;
  user: AuthUser | null;
  ipAddress: string | null;
  userAgent: string | null;
  integrationEnv: IntegrationEnv;
};
