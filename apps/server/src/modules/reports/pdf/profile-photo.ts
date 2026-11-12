import sharp from "sharp";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { readPrivateFile } from "@Alumni-Tracking-Ss/api/integrations/files";

/** Edge of the embedded photo in pixels: printed at 2 × 2 inches, about 216 dpi. */
const EDGE = 432;

async function toBuffer(data: Awaited<ReturnType<typeof readPrivateFile>>) {
  return Buffer.isBuffer(data) ? data : Buffer.from(await new Response(data).arrayBuffer());
}

/**
 * The alumnus's current photo as a small square PNG data URL for pdfmake, or null when there is
 * no photo or it cannot be read. Only this app's stored photos are read; never an arbitrary URL.
 */
export async function profilePhotoDataUrl(
  context: Context,
  alumni: { id: string; photoUrl?: string | null },
): Promise<string | null> {
  const url = alumni.photoUrl;
  if (!url) return null;
  try {
    const evidenceId = url.match(/^\/api\/(?:me\/)?files\/([a-f\d]{24})$/i)?.[1];
    const account = url.match(/^\/api\/account-photos\/([a-f\d]{24})\/([a-f\d]{24})$/i);
    const record = evidenceId
      ? await context.db.EvidenceFile.findOne({
          _id: evidenceId,
          alumniId: alumni.id,
          kind: "image",
          deletedAt: null,
        }).lean()
      : account
        ? await context.db.AccountPhoto.findOne({
            _id: account[2],
            userId: account[1],
            deletedAt: null,
          }).lean()
        : // imgBB-hosted photo: the evidence row keeps its public URL.
          await context.db.EvidenceFile.findOne({
            alumniId: alumni.id,
            kind: "image",
            url,
            deletedAt: null,
          }).lean();
    if (!record) return null;
    const source = await toBuffer(
      await readPrivateFile(context.integrationEnv, { ...record, url: record.url ?? null }),
    );
    // Square corners, like an ID photo.
    const png = await sharp(source, { limitInputPixels: 40_000_000, animated: false })
      .resize(EDGE, EDGE, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // A missing or unreadable photo must never block the PDF.
    return null;
  }
}
