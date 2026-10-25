import { createHash, randomBytes } from "node:crypto";
import type { Database } from "@Alumni-Tracking-Ss/db";
import { ApiError } from "../http-error";
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
function retryable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return (
    code === 11000 ||
    code === 112 ||
    code === 244 ||
    code === 251 ||
    ("hasErrorLabel" in error &&
      typeof error.hasErrorLabel === "function" &&
      error.hasErrorLabel("TransientTransactionError"))
  );
}
export async function acceptFormsSubmission(
  db: Database,
  key: string | undefined,
  payload: Record<string, unknown>,
) {
  if (!key || !/^[A-Za-z0-9_.:-]{16,128}$/.test(key))
    throw new ApiError("BAD_REQUEST", {
      message: "Supply a stable 16-128 character Idempotency-Key for this form response.",
    });
  const row = { ...mapFormPayload(payload), isTracked: true };
  const keyHash = digest("google_forms:" + key),
    payloadHash = digest(JSON.stringify(row));
  const cached = async () => {
    const receipt = await db.FormsReceipt.findOne({ keyHash }).lean();
    if (!receipt) return null;
    if (receipt.payloadHash !== payloadHash)
      throw new ApiError("CONFLICT", {
        message: "This submission ID was already used with different data.",
      });
    return response(String(receipt.importJobId), true);
  };
  const prior = await cached();
  if (prior) return prior;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const importJobId = randomBytes(12).toString("hex");
        await tx.FormsReceipt.create({ keyHash, payloadHash, importJobId });
        await upsertImportedAlumni(tx, row, true);
        await tx.ImportJob.create({
          _id: importJobId,
          source: "google_forms",
          status: "completed",
          totalRows: 1,
          successCount: 1,
          errorCount: 0,
          errors: [],
          completedAt: new Date(),
        });
        return response(importJobId, false);
      });
    } catch (error) {
      if (error instanceof ImportRowError)
        throw new ApiError("BAD_REQUEST", { message: error.message });
      if (!retryable(error)) throw error;
      const winner = await cached();
      if (winner) return winner;
    }
  }
  throw new ApiError("SERVICE_UNAVAILABLE", {
    message: "Submission is busy. Retry with the same submission ID.",
    data: { retryAfterSeconds: 1 },
  });
}
