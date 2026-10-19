import { createHash, randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { mapFormPayload } from "../integrations/forms";
import { ImportRowError, upsertImportedAlumni } from "./importer";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const response = (importJobId: string, replayed: boolean) => ({
  totalRows: 1,
  successCount: 1,
  errorCount: 0,
  errors: [],
  importJobId,
  replayed,
});
export async function acceptFormsSubmission(
  db: Database,
  key: string | undefined,
  payload: Record<string, unknown>,
) {
  if (!key || !/^[A-Za-z0-9_.:-]{16,128}$/.test(key))
    throw new ORPCError("BAD_REQUEST", {
      message: "Supply a stable 16-128 character Idempotency-Key for this form response.",
    });
  const row = { ...mapFormPayload(payload), isTracked: true };
  const keyHash = digest(`google_forms:${key}`);
  const payloadHash = digest(JSON.stringify(row));
  const cached = async () => {
    const receipt = await db.formsReceipt.findUnique({ where: { keyHash } });
    if (!receipt) return null;
    if (receipt.payloadHash !== payloadHash)
      throw new ORPCError("CONFLICT", {
        message: "This submission ID was already used with different data.",
      });
    return response(receipt.importJobId, true);
  };
  const prior = await cached();
  if (prior) return prior;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const importJobId = randomBytes(12).toString("hex");
        await tx.formsReceipt.create({ data: { keyHash, payloadHash, importJobId } });
        const existing = await tx.alumni.findUnique({
          where: { studentNumber: row.studentNumber },
        });
        if (existing?.deletedAt)
          throw new ImportRowError(
            "This alumni record is archived. Ask an administrator to review it.",
          );
        await upsertImportedAlumni(tx, row, true);
        await tx.importJob.create({
          data: {
            id: importJobId,
            source: "google_forms",
            status: "completed",
            totalRows: 1,
            successCount: 1,
            errorCount: 0,
            errors: [],
            completedAt: new Date(),
          },
        });
        return response(importJobId, false);
      });
    } catch (error) {
      if (error instanceof ImportRowError)
        throw new ORPCError("BAD_REQUEST", { message: error.message });
      const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
      if (code !== "P2002" && code !== "P2034") throw error;
      const winner = await cached();
      if (winner) return winner;
      // A competing transaction may not have committed yet. Retry only a
      // bounded number of times; the sender retains the same key on 503.
    }
  }
  throw new ORPCError("SERVICE_UNAVAILABLE", {
    message: "Submission is busy. Retry with the same submission ID.",
  });
}
