import type { Database } from "./index";

export interface RetiredRecaptchaReport {
  /** True when a reCAPTCHA row still holds classic v2 credentials (a `secretKey`). */
  found: boolean;
  /** Whether that row was enabled; sign-in would reject everyone until re-entered. */
  wasEnabled: boolean;
  applied: boolean;
}

const LEGACY = { key: "recaptcha", "credentials.secretKey": { $exists: true } };

/** True while classic v2 reCAPTCHA keys remain; the server refuses to start. */
export async function hasLegacyRecaptchaKeys(db: Database) {
  return Boolean(await db.IntegrationSetting.exists(LEGACY));
}

/**
 * Schema version 4: reCAPTCHA moved to Fraud Defense (Enterprise) assessments, which need a
 * project ID and API key that v2 site/secret pairs cannot provide. An enabled v2 row would make
 * every production sign-in fail, so it is disabled and its sealed keys erased (with an audit entry);
 * a Super Admin re-enables it with new keys. Not reversible: rollback cannot restore erased keys.
 */
export async function retireRecaptchaV2(
  db: Database,
  apply = true,
): Promise<RetiredRecaptchaReport> {
  const row = await db.IntegrationSetting.findOne(LEGACY).lean();
  const report = { found: Boolean(row), wasEnabled: Boolean(row?.enabled), applied: false };
  if (!row || !apply) return report;
  await db.transaction(async (tx) => {
    const result = await tx.IntegrationSetting.updateOne(
      { _id: row._id, "credentials.secretKey": { $exists: true } },
      {
        $set: { enabled: false, credentialsUpdatedAt: new Date() },
        $unset: {
          credentials: "",
          credentialHints: "",
          keyFingerprint: "",
          credentialsUpdatedBy: "",
        },
      },
    );
    if (!result.modifiedCount) return;
    await tx.AuditLog.create({
      action: "integrations.disable",
      entity: "integration",
      entityId: String(row._id),
      summary:
        "Disabled reCAPTCHA; classic v2 keys erased by migration. Enable it with Fraud Defense keys.",
    });
    report.applied = true;
  });
  return report;
}
