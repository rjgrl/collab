import { Schema, type Connection, type Model, type SchemaDefinition, Types } from "mongoose";

export interface Identified {
  _id: Types.ObjectId;
}
export interface Created extends Identified {
  createdAt: Date;
}
export interface Timestamped extends Created {
  updatedAt: Date;
}
export type UserStatus = "active" | "disabled";
export type EmploymentKind = "employed" | "unemployed" | "unknown";
export type StorageProvider = "local" | "google_drive" | "imgbb";
export type ImportSource = "csv" | "google_sheets" | "google_forms";
export type ImportStatus = "pending" | "completed" | "failed";
export interface UserRecord extends Timestamped {
  name: string;
  email: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  verificationRequired: boolean;
  needsProfileCompletion: boolean;
  status: UserStatus;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  suffix?: string | null;
  alumniId?: Types.ObjectId | null;
  image?: string | null;
  phoneNumber?: string | null;
  gender?: string | null;
  facebookAccount?: string | null;
  passwordHash?: string | null;
}
export interface SessionRecord extends Timestamped {
  token: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  googleVerifiedAt?: Date | null;
  mfaVersion?: string | null;
  mfaVerifiedAt?: Date | null;
  lastSeenAt?: Date | null;
}
export interface RoleRecord extends Timestamped {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
}
export interface PermissionRecord extends Timestamped {
  key: string;
  name: string;
  description: string;
  module: string;
}
export interface UserRoleRecord extends Created {
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
}
export interface RolePermissionRecord extends Created {
  roleId: Types.ObjectId;
  permissionId: Types.ObjectId;
}
export interface DepartmentRecord extends Timestamped {
  name: string;
  description: string;
  deletedAt?: Date | null;
}
export interface ProgramRecord extends DepartmentRecord {
  code: string;
  departmentId: Types.ObjectId;
}
export interface FacultyRecord extends Timestamped {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  deletedAt?: Date | null;
}
export interface FacultyDepartmentRecord extends Created {
  facultyId: Types.ObjectId;
  departmentId: Types.ObjectId;
}
export interface AlumniRecord extends Timestamped {
  employmentRevision?: number;
  studentNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  gender?: string | null;
  graduationYear?: number | null;
  batch?: string | null;
  mobileNumber?: string | null;
  personalEmail?: string | null;
  facebookAccount?: string | null;
  employmentStatus: EmploymentKind;
  isTracked: boolean;
  lastTrackedAt?: Date | null;
  programId: Types.ObjectId;
  photoUrl?: string | null;
  deletedAt?: Date | null;
}
export interface EmploymentRecord extends Timestamped {
  alumniId: Types.ObjectId;
  employer: string;
  jobTitle?: string | null;
  industry?: string | null;
  location?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  isCurrent: boolean;
  status: EmploymentKind;
  notes: string;
}
export interface TrackingEventRecord extends Created {
  alumniId: Types.ObjectId;
  isTracked: boolean;
  notes: string;
  source: string;
  recordedAt: Date;
  createdById?: Types.ObjectId | null;
}
export interface EvidenceFileRecord extends Timestamped {
  employmentId?: Types.ObjectId | null;
  alumniId: Types.ObjectId;
  trackingEventId?: Types.ObjectId | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  provider: StorageProvider;
  storageKey: string;
  url?: string | null;
  kind: string;
  createdById?: Types.ObjectId | null;
  deletedAt?: Date | null;
}
export interface NotificationRecord extends Created {
  recipientId: Types.ObjectId;
  alumniId: Types.ObjectId;
  evidenceId: Types.ObjectId;
  summary: string;
  readAt?: Date | null;
}
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface AuditLogRecord extends Created {
  actorId?: Types.ObjectId | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: unknown;
  ipAddress?: string | null;
}
export interface IntegrationSettingRecord extends Identified {
  key: string;
  enabled: boolean;
  notes: string;
  updatedAt: Date;
}
export interface ImportJobRecord extends Created {
  source: ImportSource;
  status: ImportStatus;
  fileName?: string | null;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors?: unknown;
  createdById?: Types.ObjectId | null;
  completedAt?: Date | null;
}
export interface VerificationChallengeRecord extends Identified {
  userId: Types.ObjectId;
  kind: string;
  target: string;
  nonce: string;
  codeHash?: string | null;
  providerSid?: string | null;
  expiresAt: Date;
  sentAt: Date;
  attempts: number;
  consumedAt?: Date | null;
  updatedAt: Date;
}
export interface MfaCredentialRecord extends Identified {
  userId: Types.ObjectId;
  version: string;
  secretCipher?: string | null;
  lastStep: number;
  recoveryHashes: string[];
  pendingCipher?: string | null;
  pendingSession?: string | null;
  pendingUntil?: Date | null;
  updatedAt: Date;
}
export interface AuthThrottleRecord extends Identified {
  key: string;
  count: number;
  expiresAt: Date;
}
export interface PasswordResetRecord extends Identified {
  tokenHash: string;
  userId: Types.ObjectId;
  passwordVersion: string;
  expiresAt: Date;
  consumedAt?: Date | null;
}
export interface FormsReceiptRecord extends Created {
  keyHash: string;
  payloadHash: string;
  importJobId: Types.ObjectId;
}

const requiredString = { type: String, required: true } as const;
const text = { type: String, default: "" } as const;
const no = { type: Boolean, default: false } as const;
const yes = { type: Boolean, default: true } as const;
const objectId = Schema.Types.ObjectId;
const ref = (name: string, required = true) => ({ type: objectId, ref: name, required });
const employment = {
  type: String,
  enum: ["employed", "unemployed", "unknown"],
  default: "unknown",
} as const;

function schema<T>(
  collection: string,
  definition: SchemaDefinition<T>,
  timestamps: boolean | { createdAt: boolean; updatedAt: boolean } = true,
) {
  return new Schema<T>(definition, {
    collection,
    timestamps,
    autoCreate: false,
    autoIndex: false,
    versionKey: false,
    strict: true,
  });
}
const createdOnly = { createdAt: true, updatedAt: false };
const updatedOnly = { createdAt: false, updatedAt: true };

export const schemas = {
  User: schema<UserRecord>("User", {
    name: requiredString,
    email: requiredString,
    emailVerified: no,
    phoneVerified: no,
    verificationRequired: no,
    needsProfileCompletion: no,
    image: String,
    phoneNumber: String,
    gender: String,
    facebookAccount: String,
    passwordHash: String,
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    firstName: String,
    middleName: String,
    lastName: String,
    suffix: String,
    alumniId: ref("Alumni", false),
  }),
  Session: schema<SessionRecord>("Session", {
    token: requiredString,
    userId: ref("User"),
    expiresAt: { type: Date, required: true },
    ipAddress: String,
    userAgent: String,
    googleVerifiedAt: Date,
    mfaVersion: String,
    mfaVerifiedAt: Date,
    lastSeenAt: Date,
  }),
  Role: schema<RoleRecord>("Role", {
    key: requiredString,
    name: requiredString,
    description: text,
    isSystem: no,
  }),
  Permission: schema<PermissionRecord>("Permission", {
    key: requiredString,
    name: requiredString,
    description: text,
    module: requiredString,
  }),
  UserRole: schema<UserRoleRecord>(
    "UserRole",
    { userId: ref("User"), roleId: ref("Role") },
    createdOnly,
  ),
  RolePermission: schema<RolePermissionRecord>(
    "RolePermission",
    { roleId: ref("Role"), permissionId: ref("Permission") },
    createdOnly,
  ),
  Department: schema<DepartmentRecord>("Department", {
    name: requiredString,
    description: text,
    deletedAt: Date,
  }),
  Program: schema<ProgramRecord>("Program", {
    code: requiredString,
    name: requiredString,
    description: text,
    departmentId: ref("Department"),
    deletedAt: Date,
  }),
  Faculty: schema<FacultyRecord>("Faculty", {
    employeeNumber: requiredString,
    firstName: requiredString,
    lastName: requiredString,
    email: String,
    deletedAt: Date,
  }),
  FacultyDepartment: schema<FacultyDepartmentRecord>(
    "FacultyDepartment",
    { facultyId: ref("Faculty"), departmentId: ref("Department") },
    createdOnly,
  ),
  Alumni: schema<AlumniRecord>("Alumni", {
    employmentRevision: { type: Number, default: 0 },
    studentNumber: requiredString,
    firstName: requiredString,
    lastName: requiredString,
    middleName: String,
    suffix: String,
    gender: String,
    graduationYear: Number,
    batch: String,
    mobileNumber: String,
    personalEmail: String,
    facebookAccount: String,
    employmentStatus: employment,
    isTracked: no,
    lastTrackedAt: Date,
    programId: ref("Program"),
    photoUrl: String,
    deletedAt: Date,
  }),
  Employment: schema<EmploymentRecord>("Employment", {
    alumniId: ref("Alumni"),
    employer: requiredString,
    jobTitle: String,
    industry: String,
    location: String,
    startDate: Date,
    endDate: Date,
    isCurrent: no,
    status: { ...employment, default: "employed" },
    notes: text,
  }),
  TrackingEvent: schema<TrackingEventRecord>(
    "TrackingEvent",
    {
      alumniId: ref("Alumni"),
      isTracked: { type: Boolean, required: true },
      notes: text,
      source: { type: String, default: "manual" },
      recordedAt: { type: Date, default: Date.now },
      createdById: ref("User", false),
    },
    createdOnly,
  ),
  EvidenceFile: schema<EvidenceFileRecord>("EvidenceFile", {
    employmentId: ref("Employment", false),
    alumniId: ref("Alumni"),
    trackingEventId: ref("TrackingEvent", false),
    originalName: requiredString,
    mimeType: requiredString,
    sizeBytes: { type: Number, required: true },
    provider: { type: String, enum: ["local", "google_drive", "imgbb"], required: true },
    storageKey: requiredString,
    url: String,
    kind: { type: String, default: "evidence" },
    createdById: ref("User", false),
    deletedAt: Date,
  }),
  Notification: schema<NotificationRecord>(
    "Notification",
    {
      recipientId: ref("User"),
      alumniId: ref("Alumni"),
      evidenceId: ref("EvidenceFile"),
      summary: requiredString,
      readAt: { type: Date, default: null },
    },
    createdOnly,
  ),
  AuditLog: schema<AuditLogRecord>(
    "AuditLog",
    {
      actorId: ref("User", false),
      action: requiredString,
      entity: requiredString,
      entityId: String,
      summary: text,
      metadata: Schema.Types.Mixed,
      ipAddress: String,
    },
    createdOnly,
  ),
  IntegrationSetting: schema<IntegrationSettingRecord>(
    "IntegrationSetting",
    { key: requiredString, enabled: yes, notes: text },
    updatedOnly,
  ),
  ImportJob: schema<ImportJobRecord>(
    "ImportJob",
    {
      source: { type: String, enum: ["csv", "google_sheets", "google_forms"], required: true },
      status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
      fileName: String,
      totalRows: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      errorCount: { type: Number, default: 0 },
      errors: Schema.Types.Mixed,
      createdById: ref("User", false),
      completedAt: Date,
    },
    createdOnly,
  ),
  VerificationChallenge: schema<VerificationChallengeRecord>(
    "VerificationChallenge",
    {
      userId: ref("User"),
      kind: requiredString,
      target: requiredString,
      nonce: requiredString,
      codeHash: String,
      providerSid: String,
      expiresAt: { type: Date, required: true },
      sentAt: { type: Date, required: true },
      attempts: { type: Number, default: 0 },
      consumedAt: Date,
    },
    updatedOnly,
  ),
  MfaCredential: schema<MfaCredentialRecord>(
    "MfaCredential",
    {
      userId: ref("User"),
      version: text,
      secretCipher: String,
      lastStep: { type: Number, default: -1 },
      recoveryHashes: { type: [String], default: [] },
      pendingCipher: String,
      pendingSession: String,
      pendingUntil: Date,
    },
    updatedOnly,
  ),
  AuthThrottle: schema<AuthThrottleRecord>(
    "AuthThrottle",
    {
      key: requiredString,
      count: { type: Number, default: 0 },
      expiresAt: { type: Date, required: true },
    },
    false,
  ),
  PasswordReset: schema<PasswordResetRecord>(
    "PasswordReset",
    {
      tokenHash: requiredString,
      userId: ref("User"),
      passwordVersion: requiredString,
      expiresAt: { type: Date, required: true },
      consumedAt: Date,
    },
    false,
  ),
  FormsReceipt: schema<FormsReceiptRecord>(
    "FormsReceipt",
    { keyHash: requiredString, payloadHash: requiredString, importJobId: ref("ImportJob") },
    createdOnly,
  ),
};

// Explicit names and key order preserve Prisma-created indexes. Merely declaring
// these indexes never writes them: only the reviewed migration applies changes.
schemas.User.index({ email: 1 }, { unique: true, name: "User_email_key" });
schemas.User.index(
  { alumniId: 1 },
  {
    unique: true,
    name: "User_alumniId_key",
    partialFilterExpression: { alumniId: { $type: "objectId" } },
  },
);
schemas.Session.index({ token: 1 }, { unique: true, name: "Session_token_key" });
schemas.Session.index({ userId: 1 }, { name: "Session_userId_idx" });
schemas.Role.index({ key: 1 }, { unique: true, name: "Role_key_key" });
schemas.Permission.index({ key: 1 }, { unique: true, name: "Permission_key_key" });
schemas.UserRole.index(
  { userId: 1, roleId: 1 },
  { unique: true, name: "UserRole_userId_roleId_key" },
);
schemas.UserRole.index({ roleId: 1 }, { name: "UserRole_roleId_idx" });
schemas.RolePermission.index(
  { roleId: 1, permissionId: 1 },
  { unique: true, name: "RolePermission_roleId_permissionId_key" },
);
schemas.RolePermission.index({ permissionId: 1 }, { name: "RolePermission_permissionId_idx" });
schemas.Program.index(
  { departmentId: 1, code: 1 },
  { unique: true, name: "Program_departmentId_code_key" },
);
schemas.Program.index({ departmentId: 1 }, { name: "Program_departmentId_idx" });
schemas.Faculty.index({ employeeNumber: 1 }, { unique: true, name: "Faculty_employeeNumber_key" });
schemas.FacultyDepartment.index(
  { facultyId: 1, departmentId: 1 },
  { unique: true, name: "FacultyDepartment_facultyId_departmentId_key" },
);
schemas.FacultyDepartment.index(
  { departmentId: 1 },
  { name: "FacultyDepartment_departmentId_idx" },
);
schemas.Alumni.index({ studentNumber: 1 }, { unique: true, name: "Alumni_studentNumber_key" });
schemas.Alumni.index({ programId: 1 }, { name: "Alumni_programId_idx" });
schemas.Alumni.index({ isTracked: 1 }, { name: "Alumni_isTracked_idx" });
schemas.Alumni.index({ graduationYear: 1 }, { name: "Alumni_graduationYear_idx" });
schemas.Employment.index({ alumniId: 1 }, { name: "Employment_alumniId_idx" });
schemas.TrackingEvent.index({ alumniId: 1 }, { name: "TrackingEvent_alumniId_idx" });
schemas.EvidenceFile.index({ alumniId: 1 }, { name: "EvidenceFile_alumniId_idx" });
schemas.EvidenceFile.index({ trackingEventId: 1 }, { name: "EvidenceFile_trackingEventId_idx" });
schemas.AuditLog.index({ actorId: 1 }, { name: "AuditLog_actorId_idx" });
schemas.AuditLog.index({ entity: 1, entityId: 1 }, { name: "AuditLog_entity_entityId_idx" });
schemas.Notification.index(
  { recipientId: 1, readAt: 1, createdAt: -1 },
  { name: "Notification_recipient_read_created_idx" },
);
schemas.Notification.index(
  { recipientId: 1, evidenceId: 1 },
  { name: "Notification_recipient_evidence_key", unique: true },
);
schemas.AuditLog.index({ createdAt: 1 }, { name: "AuditLog_createdAt_idx" });
schemas.IntegrationSetting.index({ key: 1 }, { unique: true, name: "IntegrationSetting_key_key" });
schemas.ImportJob.index({ createdById: 1 }, { name: "ImportJob_createdById_idx" });
schemas.VerificationChallenge.index(
  { userId: 1, kind: 1 },
  { unique: true, name: "VerificationChallenge_userId_kind_key" },
);
schemas.MfaCredential.index({ userId: 1 }, { unique: true, name: "MfaCredential_userId_key" });
schemas.AuthThrottle.index({ key: 1 }, { unique: true, name: "AuthThrottle_key_key" });
schemas.AuthThrottle.index({ expiresAt: 1 }, { name: "AuthThrottle_expiresAt_idx" });
schemas.PasswordReset.index(
  { tokenHash: 1 },
  { unique: true, name: "PasswordReset_tokenHash_key" },
);
schemas.PasswordReset.index({ userId: 1 }, { name: "PasswordReset_userId_idx" });
schemas.PasswordReset.index({ expiresAt: 1 }, { name: "PasswordReset_expiresAt_idx" });
schemas.FormsReceipt.index({ keyHash: 1 }, { unique: true, name: "FormsReceipt_keyHash_key" });

export function createModels(connection: Connection) {
  return {
    User: connection.model("User", schemas.User),
    Session: connection.model("Session", schemas.Session),
    Role: connection.model("Role", schemas.Role),
    Permission: connection.model("Permission", schemas.Permission),
    UserRole: connection.model("UserRole", schemas.UserRole),
    RolePermission: connection.model("RolePermission", schemas.RolePermission),
    Department: connection.model("Department", schemas.Department),
    Program: connection.model("Program", schemas.Program),
    Faculty: connection.model("Faculty", schemas.Faculty),
    FacultyDepartment: connection.model("FacultyDepartment", schemas.FacultyDepartment),
    Alumni: connection.model("Alumni", schemas.Alumni),
    Employment: connection.model("Employment", schemas.Employment),
    TrackingEvent: connection.model("TrackingEvent", schemas.TrackingEvent),
    EvidenceFile: connection.model("EvidenceFile", schemas.EvidenceFile),
    Notification: connection.model("Notification", schemas.Notification),
    AuditLog: connection.model("AuditLog", schemas.AuditLog),
    IntegrationSetting: connection.model("IntegrationSetting", schemas.IntegrationSetting),
    ImportJob: connection.model("ImportJob", schemas.ImportJob),
    VerificationChallenge: connection.model("VerificationChallenge", schemas.VerificationChallenge),
    MfaCredential: connection.model("MfaCredential", schemas.MfaCredential),
    AuthThrottle: connection.model("AuthThrottle", schemas.AuthThrottle),
    PasswordReset: connection.model("PasswordReset", schemas.PasswordReset),
    FormsReceipt: connection.model("FormsReceipt", schemas.FormsReceipt),
  };
}
export type DatabaseModels = ReturnType<typeof createModels>;
export type ModelRecord<T> = T extends Model<infer R> ? R : never;
