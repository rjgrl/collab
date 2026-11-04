import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createDatabase } from "@Alumni-Tracking-Ss/db";
import { migrateDatabase } from "@Alumni-Tracking-Ss/db/migration";
import { seedDatabase } from "@Alumni-Tracking-Ss/db/seed-data";
import { createSession } from "@Alumni-Tracking-Ss/api/services/session";
import { createApp } from "./app";
import { adminCookie } from "./local-admin";

// Scoped PDF exports. PDF text is glyph-encoded, so each export's row count is read back from
// the audit entry the export writes; profile access is checked by status code.
if (process.env.NODE_ENV === "production") throw new Error("Synthetic local acceptance only.");
process.env.NODE_ENV = "test";
process.env.PASSWORD_BREACH_CHECK = "local";
process.env.DATABASE_URL = `mongodb://127.0.0.1:27018/collab_reports_${randomBytes(8).toString("hex")}?replicaSet=rs0`;
process.env.SEED_ADMIN_EMAIL = "synthetic-admin@example.test";
process.env.SEED_ADMIN_PASSWORD = randomBytes(24).toString("base64url");
process.env.SEED_DEMO_DATA = "true";
delete process.env.STAFF_EMAIL_DOMAINS;

const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const origin = "http://localhost:3001";
try {
  assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
  await seedDatabase(db);
  const app = createApp({ db, config: { nodeEnv: "test", origin }, integrationEnv: {} });
  const cookies: Record<string, string> = {};
  for (const name of ["college.head", "department.head", "faculty.it", "faculty.education"]) {
    const user = await db.User.findOne({ email: `${name}@collab.test` })
      .orFail()
      .lean();
    cookies[name] = `ats_session=${(await createSession(db, String(user._id), {})).token}`;
  }
  cookies.admin = await adminCookie(db);
  const get = (who: string, url: string) =>
    request(app)
      .get(url)
      .set("Cookie", cookies[who]!)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
  const lastSummary = async (action: string) =>
    (await db.AuditLog.findOne({ action }).sort({ createdAt: -1, _id: -1 }).lean())!.summary;
  const pdfRows = async (who: string, query = "") => {
    const response = await get(who, `/api/reports/alumni.pdf${query}`);
    assert.equal(response.status, 200, `${who} ${query}`);
    assert.equal(response.headers["content-type"], "application/pdf");
    assert.match(
      response.headers["content-disposition"]!,
      /attachment; filename="alumni-list\.pdf"/,
    );
    assert.equal((response.body as Buffer).subarray(0, 5).toString(), "%PDF-");
    return Number(/\((\d+) rows\)/.exec(await lastSummary("reports.pdf.alumni"))![1]);
  };

  assert.equal(await pdfRows("faculty.it"), 1);
  assert.equal(await pdfRows("department.head"), 2);
  assert.equal(await pdfRows("college.head"), 3);
  assert.equal(await pdfRows("admin"), 4);
  const coe = String(
    (await db.College.findOne({ name: "College of Education" }).orFail().lean())._id,
  );
  assert.equal(await pdfRows("admin", `?collegeId=${coe}`), 1, "college filter");
  assert.equal(await pdfRows("college.head", `?collegeId=${coe}`), 0, "filters never widen scope");
  assert.equal(await pdfRows("admin", "?graduationYear=2023"), 1, "batch year filter");
  const bsat = String((await db.Program.findOne({ code: "BSAT" }).orFail().lean())._id);
  assert.equal(await pdfRows("admin", `?programId=${bsat}`), 1, "program filter");
  assert.equal((await get("admin", "/api/reports/alumni.pdf?collegeId=bad")).status, 400);

  const g1 = String((await db.Alumni.findOne({ studentNumber: "2020-0001" }).orFail().lean())._id);
  const g3 = String((await db.Alumni.findOne({ studentNumber: "2019-0144" }).orFail().lean())._id);
  const profile = await get("faculty.it", `/api/reports/alumni/${g1}/profile.pdf`);
  assert.equal(profile.status, 200);
  assert.match(profile.headers["content-disposition"]!, /alumni-2020-0001\.pdf/);
  assert.equal(
    (await get("faculty.it", `/api/reports/alumni/${g3}/profile.pdf`)).status,
    404,
    "cross-department",
  );
  assert.equal(
    (await get("faculty.education", `/api/reports/alumni/${g3}/profile.pdf`)).status,
    200,
  );

  const assignmentRows = async (who: string) => {
    const response = await get(who, "/api/reports/assignments.pdf");
    assert.equal(response.status, 200);
    return Number(/\((\d+) alumni\)/.exec(await lastSummary("reports.pdf.assignments"))![1]);
  };
  assert.equal(await assignmentRows("faculty.it"), 1);
  assert.equal(await assignmentRows("department.head"), 2);
  assert.equal(await assignmentRows("admin"), 4);

  // CSV exports now read contacts first, falling back to legacy profile fields.
  await db.AlumniContact.create({
    alumniId: g1,
    type: "phone",
    value: "+639171112222",
    isPrimary: true,
  });
  const csv = await request(app).get("/api/reports/alumni.csv").set("Cookie", cookies["admin"]!);
  assert.match(csv.body.csv as string, /\+639171112222/);
  assert.match(
    csv.body.csv as string,
    /graduate\.three@collab\.test/,
    "legacy email still exported",
  );
  console.log(
    "PASS reports: scoped alumni-list PDF with college/program/year filters, profile PDF 404 across departments, scoped assignment PDF, contacts in CSV.",
  );
} finally {
  await db.connection.dropDatabase().catch(() => undefined);
  await db.disconnect();
}
