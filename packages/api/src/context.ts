import type { Database } from "@Alumni-Tracking-Ss/db";
import type { PermissionKey } from "@Alumni-Tracking-Ss/db";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: "active" | "disabled";
  needsProfileCompletion?: boolean;
  needsPassword?: boolean;
  mfaRequired?: boolean;
  mfaEnrolled?: boolean;
  mfaVerified?: boolean;
  mfaFresh?: boolean;
  mfaVersion?: string;
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
  verificationSecret?: string;
  mfaEncryptionKey?: string;
  smsProvider?: {
    sendCode: (phone: string) => Promise<string>;
    checkCode: (sid: string, phone: string, code: string) => Promise<boolean>;
  };
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
