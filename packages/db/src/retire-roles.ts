import { ROLE } from "@Alumni-Tracking-Ss/contracts/names";
import type { Database } from "./index";
import { LEGACY_ALUMNI_ROLE_KEY, RETIRED_ROLE_KEYS } from "./permissions";

export interface RetiredRolesReport {
  /** Removed role keys still present in the database. */
  roles: string[];
  /** Accounts that held a removed role (removed on apply). */
  accounts: number;
  /** Of those, accounts left with no role at all; they need to be recreated (e.g. as faculty). */
  accountsWithoutRoles: number;
  /** Alumni accounts whose role is (or will be) renamed from "viewer" to "alumni". */
  renamedAlumniAccounts: number;
}

/** True while any removed or not-yet-renamed role remains; the server refuses to start. */
export async function hasLegacyRoles(db: Database) {
  return Boolean(
    await db.Role.exists({ key: { $in: [LEGACY_ALUMNI_ROLE_KEY, ...RETIRED_ROLE_KEYS] } }),
  );
}

/**
 * Renames the Alumni role from "viewer" to "alumni" in place (same id, grants and permissions,
 * so no account loses access), then deletes roles with removed keys ("staff", "admin") and their
 * grants. Accounts that held only a removed role keep signing in but have no access until an
 * administrator recreates them from the Faculty page. Not reversible: rollback restores neither.
 */
export async function retireRoles(db: Database, apply = true): Promise<RetiredRolesReport> {
  const report: RetiredRolesReport = {
    roles: [],
    accounts: 0,
    accountsWithoutRoles: 0,
    renamedAlumniAccounts: 0,
  };
  const legacyAlumni = await db.Role.findOne({ key: LEGACY_ALUMNI_ROLE_KEY }).lean();
  if (legacyAlumni) {
    report.renamedAlumniAccounts = await db.UserRole.countDocuments({ roleId: legacyAlumni._id });
    if (apply) {
      const alumni = await db.Role.findOne({ key: ROLE.alumni }).lean();
      if (!alumni) {
        await db.Role.updateOne(
          { _id: legacyAlumni._id },
          { $set: { key: ROLE.alumni, name: "Alumni", isSystem: true } },
        );
      } else {
        // Both exist (e.g. seeded before migrating): move the grants, then drop the old role.
        for (const grant of await db.UserRole.find({ roleId: legacyAlumni._id }).lean())
          await db.UserRole.updateOne(
            { userId: grant.userId, roleId: alumni._id },
            { $setOnInsert: { userId: grant.userId, roleId: alumni._id } },
            { upsert: true },
          );
        await db.UserRole.deleteMany({ roleId: legacyAlumni._id });
        await db.RolePermission.deleteMany({ roleId: legacyAlumni._id });
        await db.Role.deleteOne({ _id: legacyAlumni._id });
      }
    }
  }
  for (const key of RETIRED_ROLE_KEYS) {
    const role = await db.Role.findOne({ key }).lean();
    if (!role) continue;
    report.roles.push(key);
    const grants = await db.UserRole.find({ roleId: role._id }).lean();
    report.accounts += grants.length;
    for (const grant of grants)
      if (!(await db.UserRole.exists({ userId: grant.userId, roleId: { $ne: role._id } })))
        report.accountsWithoutRoles++;
    if (!apply) continue;
    await db.UserRole.deleteMany({ roleId: role._id });
    await db.RolePermission.deleteMany({ roleId: role._id });
    await db.Role.deleteOne({ _id: role._id });
  }
  return report;
}
