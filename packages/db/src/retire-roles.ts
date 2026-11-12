import type { Database } from "./index";
import { RETIRED_ROLE_KEYS } from "./permissions";

export interface RetiredRolesReport {
  /** Retired role keys still present in the database. */
  roles: string[];
  /** Accounts that held a retired role (removed on apply). */
  accounts: number;
  /** Of those, accounts left with no role at all; they need to be recreated (e.g. as faculty). */
  accountsWithoutRoles: number;
}

/**
 * Removes retired system roles and their grants. Accounts that held only a retired role keep
 * signing in but have no access until an administrator recreates them from the Faculty page.
 * Not reversible: rollback does not restore a retired role.
 */
export async function retireRoles(db: Database, apply = true): Promise<RetiredRolesReport> {
  const report: RetiredRolesReport = { roles: [], accounts: 0, accountsWithoutRoles: 0 };
  for (const key of RETIRED_ROLE_KEYS) {
    const role = await db.Role.findOne({ key, isSystem: true }).lean();
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
