export const PERMISSIONS = [
  { key: "users.read", name: "View users", module: "rbac", description: "List and view user accounts" },
  { key: "users.write", name: "Manage users", module: "rbac", description: "Create and update user accounts and role assignments" },
  { key: "users.delete", name: "Disable users", module: "rbac", description: "Disable user accounts" },
  { key: "roles.read", name: "View roles", module: "rbac", description: "List and view roles" },
  { key: "roles.write", name: "Manage roles", module: "rbac", description: "Create and update roles and their permissions" },
  { key: "roles.delete", name: "Delete roles", module: "rbac", description: "Delete non-system roles" },
  { key: "permissions.read", name: "View permissions", module: "rbac", description: "List permission catalog" },
  { key: "departments.read", name: "View departments", module: "academic", description: "List and view departments" },
  { key: "departments.write", name: "Manage departments", module: "academic", description: "Create and update departments" },
  { key: "departments.delete", name: "Delete departments", module: "academic", description: "Soft-delete departments" },
  { key: "programs.read", name: "View programs", module: "academic", description: "List and view programs" },
  { key: "programs.write", name: "Manage programs", module: "academic", description: "Create and update programs attached to departments" },
  { key: "programs.delete", name: "Delete programs", module: "academic", description: "Soft-delete programs" },
  { key: "faculties.read", name: "View faculties", module: "academic", description: "List and view faculties" },
  { key: "faculties.write", name: "Manage faculties", module: "academic", description: "Create and update faculties and department assignments" },
  { key: "faculties.delete", name: "Delete faculties", module: "academic", description: "Soft-delete faculties" },
  { key: "alumni.read", name: "View alumni", module: "alumni", description: "List and view alumni profiles" },
  { key: "alumni.write", name: "Manage alumni", module: "alumni", description: "Create and update alumni profiles, contact, employment, and program attachment" },
  { key: "alumni.delete", name: "Delete alumni", module: "alumni", description: "Soft-delete alumni records" },
  { key: "tracking.write", name: "Update tracking", module: "alumni", description: "Record tracking events and tracked status" },
  { key: "files.read", name: "View evidence", module: "files", description: "View and download evidence files" },
  { key: "files.write", name: "Upload evidence", module: "files", description: "Upload evidence and images" },
  { key: "files.delete", name: "Delete evidence", module: "files", description: "Soft-delete evidence files" },
  { key: "dashboard.read", name: "View dashboard", module: "dashboard", description: "View graduate tracking statistics" },
  { key: "reports.read", name: "View reports", module: "reports", description: "View graduate and alumni reports" },
  { key: "reports.export", name: "Export reports", module: "reports", description: "Export CSV or Google Sheets reports" },
  { key: "integrations.read", name: "View integrations", module: "integrations", description: "View modular integration status" },
  { key: "integrations.write", name: "Manage integrations", module: "integrations", description: "Enable or disable modular integrations and run imports" },
  { key: "audit.read", name: "View audit log", module: "audit", description: "View activity history" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key);

export const ROLE_PRESETS = {
  super_admin: {
    key: "super_admin",
    name: "Super Admin",
    description: "Full access to RBAC, academic structure, alumni, files, dashboard, and integrations.",
    permissions: PERMISSION_KEYS,
  },
  staff: {
    key: "staff",
    name: "Staff",
    description: "Maintain academic structure and alumni tracking. Cannot manage RBAC.",
    permissions: PERMISSION_KEYS.filter(
      (key) =>
        !key.startsWith("users.") &&
        !key.startsWith("roles.") &&
        key !== "permissions.read" &&
        key !== "audit.read",
    ),
  },
  viewer: {
    key: "viewer",
    name: "Viewer",
    description: "Read-only access to academic structure, alumni, dashboard, and reports.",
    permissions: [
      "departments.read",
      "programs.read",
      "faculties.read",
      "alumni.read",
      "files.read",
      "dashboard.read",
      "reports.read",
    ] satisfies PermissionKey[],
  },
} as const;
