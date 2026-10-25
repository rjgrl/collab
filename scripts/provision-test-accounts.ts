import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createDatabase, hashPassword } from "../packages/db/src/index";
import { migrateDatabase } from "../packages/db/src/migration";
import { seedDatabase } from "../packages/db/src/seed-data";
import { registerUser } from "../packages/api/src/services/session";
import { readLocalConfig, isManagedLocalDatabase } from "./local-env.mjs";
import { projectRoot, runTsx, runTool } from "./local-tools.mjs";

if (process.env.NODE_ENV === "production") throw new Error("Test accounts are development-only.");
if (process.argv.slice(2).some((arg) => arg !== "--start") || process.argv.length > 3)
  throw new Error("Use accounts:local or dev:accounts without database arguments.");
const local = await readLocalConfig(projectRoot);
if (
  [local.server.NODE_ENV, local.web.NODE_ENV, local.database.NODE_ENV].includes("production") ||
  (local.effective.DATABASE_URL && !isManagedLocalDatabase(local.effective.DATABASE_URL))
)
  throw new Error("Test-account tooling requires the managed local development configuration.");
const directory = path.join(projectRoot, ".tools", "test-accounts");
const latest = path.join(directory, "latest.txt");
const profileSchema = z.object({
  databaseUrl: z
    .string()
    .refine(
      (value) =>
        isManagedLocalDatabase(value) &&
        /^\/collab_test_accounts_[a-f0-9]{16}$/.test(new URL(value).pathname),
    ),
  sessionSecret: z.string().regex(/^[a-f0-9]{64}$/),
  mfaEncryptionKey: z.string().regex(/^[a-f0-9]{64}$/),
  accounts: z
    .array(
      z.object({
        role: z.enum(["Administrator", "Staff", "Alumni"]),
        email: z.email(),
        password: z.string().min(24),
      }),
    )
    .length(3),
});
if (process.argv[2] === "--start") {
  const filename = (await readFile(latest, "utf8")).trim();
  if (!/^[a-f0-9]{16}\.json$/.test(filename))
    throw new Error("Invalid private test-account pointer.");
  const profile = profileSchema.parse(
    JSON.parse(await readFile(path.join(directory, filename), "utf8")),
  );
  await runTsx("local-mongo.ts");
  // Preserve the private profile overrides when launching the normal entry points.
  const launchEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^_+VARLOCK_/.test(key)),
  );
  Object.assign(launchEnv, {
    NODE_ENV: "development",
    DATABASE_URL: profile.databaseUrl,
    SESSION_SECRET: profile.sessionSecret,
    MFA_ENCRYPTION_KEY: profile.mfaEncryptionKey,
    LOCAL_DISABLE_MFA: "true",
    LOCAL_REQUIRE_EMAIL_VERIFICATION: "false",
    LOCAL_REQUIRE_PHONE_VERIFICATION: "false",
    ALLOW_PUBLIC_SIGNUP: "true",
    PORT: "3004",
    CORS_ORIGIN: "http://localhost:3003",
    APP_URL: "http://localhost:3003",
    VITE_SERVER_URL: "http://localhost:3003",
    API_PROXY_TARGET: "http://localhost:3004",
    UPLOAD_DIR: path.join(
      projectRoot,
      ".tools",
      "test-account-uploads",
      filename.replace(".json", ""),
    ),
  });
  console.log(
    "Synthetic role application: http://localhost:3003 (normal API on 3004). Working database configuration is unchanged.",
  );
  await Promise.all([
    runTool("tsx", "tsx", ["watch", "src/index.ts"], {
      cwd: path.join(projectRoot, "apps/server"),
      env: launchEnv,
    }),
    runTool("vite-plus", "vp", ["dev", "--port", "3003", "--strictPort"], {
      cwd: path.join(projectRoot, "apps/web"),
      env: launchEnv,
    }),
  ]);
} else {
  await runTsx("local-mongo.ts");
  const suffix = randomBytes(8).toString("hex");
  const profile = profileSchema.parse({
    databaseUrl: `mongodb://127.0.0.1:27018/collab_test_accounts_${suffix}?replicaSet=rs0`,
    sessionSecret: randomBytes(32).toString("hex"),
    mfaEncryptionKey: randomBytes(32).toString("hex"),
    accounts: ["Administrator", "Staff", "Alumni"].map((role) => ({
      role,
      email: `${role.toLowerCase()}@collab.test`,
      password: randomBytes(24).toString("base64url"),
    })),
  });
  const [administrator, staff, alumni] = profile.accounts;
  assert.ok(administrator && staff && alumni);
  Object.assign(process.env, {
    NODE_ENV: "development",
    DATABASE_URL: profile.databaseUrl,
    SEED_ADMIN_EMAIL: administrator.email,
    SEED_ADMIN_PASSWORD: administrator.password,
    SEED_DEMO_DATA: "false",
    PASSWORD_BREACH_CHECK: "local",
    LOCAL_REQUIRE_EMAIL_VERIFICATION: "false",
    LOCAL_REQUIRE_PHONE_VERIFICATION: "false",
  });
  const db = createDatabase({ DATABASE_URL: profile.databaseUrl });
  try {
    await db.ready();
    assert.equal(
      (await db.connection.db!.listCollections({}, { nameOnly: true }).toArray()).length,
      0,
      "Provisioning requires a fresh synthetic namespace.",
    );
    assert.deepEqual((await migrateDatabase(db, "apply")).conflicts, []);
    await seedDatabase(db);
    const staffRole = await db.Role.findOne({ key: "staff" }).orFail();
    const staffUser = await db.User.create({
      name: "Local Staff",
      firstName: "Local",
      lastName: "Staff",
      email: staff.email,
      passwordHash: await hashPassword(staff.password),
    });
    await db.UserRole.create({ userId: staffUser._id, roleId: staffRole._id });
    const department = await db.Department.create({
      name: "Synthetic test department",
    });
    const program = await db.Program.create({
      code: "SYNTHETIC",
      name: "Synthetic test degree",
      departmentId: department._id,
    });
    const graduate = await registerUser(db, {
      firstName: "Local",
      middleName: "",
      lastName: "Graduate",
      suffix: "",
      email: alumni.email,
      password: alumni.password,
      phoneNumber: "+639171234567",
      gender: "Female",
      studentNumber: "SYNTHETIC-LOCAL-001",
      graduationYear: 2024,
      programId: String(program._id),
    });
    assert.ok(graduate.alumniId);
    assert.equal(await db.User.countDocuments(), 3);
    assert.equal(await db.UserRole.countDocuments(), 3);
    assert.equal(await db.Alumni.countDocuments(), 1);
    assert.equal(
      await db.MfaCredential.countDocuments(),
      0,
      "Administrators enroll through the normal security flow.",
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, `${suffix}.json`), JSON.stringify(profile, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    await writeFile(latest, `${suffix}.json\n`, { mode: 0o600 });
    console.log(
      `Provisioned and verified three real test accounts in a new synthetic namespace. Read credentials privately in .tools/test-accounts/${suffix}.json; run pnpm dev:accounts. Existing application data and configuration were preserved.`,
    );
  } finally {
    await db.disconnect();
  }
}
