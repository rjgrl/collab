import assert from "node:assert/strict";
import { it } from "node:test";
import sharp from "sharp";
import { alumniOutputSchema } from "@Alumni-Tracking-Ss/contracts/alumni";
import { renderPdf } from "./modules/reports/pdf/render";
import { profileSheet } from "./modules/reports/pdf/templates/profile-sheet";

const record = alumniOutputSchema.parse({
  id: "000000000000000000000201",
  studentNumber: "2021-0210",
  firstName: "Test",
  lastName: "Alumni",
  programId: "000000000000000000000302",
  program: {
    id: "000000000000000000000302",
    code: "BSIT",
    name: "Synthetic BSIT",
    departmentId: "000000000000000000000301",
    department: {
      id: "000000000000000000000301",
      name: "Synthetic IT",
      collegeId: "000000000000000000000300",
    },
  },
});
const meta = { generatedBy: "Tester", generatedAt: new Date("2026-01-01T00:00:00Z") };

it("prints a small profile photo beside the name and still renders without one", async () => {
  const png = await sharp({
    create: { width: 192, height: 192, channels: 3, background: "#1e3a5f" },
  })
    .png()
    .toBuffer();
  const withPhoto = await renderPdf(
    profileSheet(record, { ...meta, photo: `data:image/png;base64,${png.toString("base64")}` }),
  );
  const without = await renderPdf(profileSheet(record, meta));
  assert.match(withPhoto.toString("latin1"), /\/Subtype \/Image/);
  assert.doesNotMatch(without.toString("latin1"), /\/Subtype \/Image/);
  // Still one page: the 2 × 2 inch image does not push the layout around.
  assert.equal(withPhoto.toString("latin1").match(/\/Type \/Page\b/g)?.length, 1);
});
