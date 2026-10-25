import { hashPassword, type Database } from "./index";
import { PERMISSIONS, ROLE_PRESETS } from "./permissions";
const integrationKeys = [
  "recaptcha",
  "google_auth",
  "google_drive",
  "email",
  "image_host",
  "google_forms",
  "google_sheets",
] as const;

export async function seedDatabase(db: Database) {
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "Repository seeding is development/test only; use a reviewed production provisioning procedure.",
    );
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Configure private bootstrap administrator credentials with a password of at least 12 characters.",
    );
  await db.transaction(async (tx) => {
    for (const permission of PERMISSIONS)
      await tx.Permission.updateOne(
        { key: permission.key },
        { $set: permission },
        { upsert: true },
      );
    const permissions = await tx.Permission.find().lean();
    const permissionByKey = new Map(permissions.map((item) => [item.key, item]));
    for (const preset of Object.values(ROLE_PRESETS)) {
      const existing = await tx.Role.findOne({ key: preset.key }).lean();
      const role = await tx.Role.findOneAndUpdate(
        { key: preset.key },
        { $set: { name: preset.name, description: preset.description, isSystem: true } },
        { upsert: true, returnDocument: "after" },
      ).orFail();
      if (existing && preset.key !== "super_admin") continue;
      for (const key of preset.permissions) {
        const permission = permissionByKey.get(key);
        if (permission)
          await tx.RolePermission.updateOne(
            { roleId: role._id, permissionId: permission._id },
            { $setOnInsert: { roleId: role._id, permissionId: permission._id } },
            { upsert: true },
          );
      }
    }
    const existingAdmin = await tx.User.findOne({ email }).lean();
    if (!existingAdmin) {
      const role = await tx.Role.findOne({ key: "super_admin" }).orFail();
      const user = await new tx.User({
        name: "System Administrator",
        email,
        emailVerified: true,
        passwordHash: await hashPassword(password),
        status: "active",
      }).save();
      await new tx.UserRole({ userId: user._id, roleId: role._id }).save();
    }
    for (const key of integrationKeys)
      await tx.IntegrationSetting.updateOne(
        { key },
        {
          $setOnInsert: {
            key,
            enabled: key !== "google_forms",
            notes:
              "Modular integration. Live credentials are optional; providers remain subject to configuration and policy.",
          },
        },
        { upsert: true },
      );
    if (process.env.SEED_DEMO_DATA === "true") await seedDemo(tx);
  });
}

async function seedDemo(db: Database) {
  const it = await db.Department.findOneAndUpdate(
    { name: "Information Technology" },
    {
      $setOnInsert: {
        name: "Information Technology",
        description: "Synthetic testing department",
      },
    },
    { upsert: true, returnDocument: "after" },
  ).orFail();
  const educ = await db.Department.findOneAndUpdate(
    { name: "Education" },
    {
      $setOnInsert: {
        name: "Education",
        description: "Synthetic testing department",
      },
    },
    { upsert: true, returnDocument: "after" },
  ).orFail();
  const bsit = await db.Program.findOneAndUpdate(
    { departmentId: it._id, code: "BSIT" },
    {
      $setOnInsert: {
        departmentId: it._id,
        code: "BSIT",
        name: "Bachelor of Science in Information Technology",
      },
    },
    { upsert: true, returnDocument: "after" },
  ).orFail();
  const bsed = await db.Program.findOneAndUpdate(
    { departmentId: educ._id, code: "BSED" },
    {
      $setOnInsert: {
        departmentId: educ._id,
        code: "BSED",
        name: "Bachelor of Secondary Education",
      },
    },
    { upsert: true, returnDocument: "after" },
  ).orFail();
  const samples = [
    {
      studentNumber: "2020-0001",
      firstName: "Synthetic",
      lastName: "Graduate One",
      gender: "Female",
      graduationYear: 2024,
      personalEmail: "graduate.one@collab.test",
      employmentStatus: "employed",
      isTracked: true,
      programId: bsit._id,
      employer: "Synthetic Test Employer",
      jobTitle: "Junior Developer",
    },
    {
      studentNumber: "2020-0002",
      firstName: "Synthetic",
      lastName: "Graduate Two",
      gender: "Male",
      graduationYear: 2024,
      personalEmail: "graduate.two@collab.test",
      employmentStatus: "unknown",
      isTracked: false,
      programId: bsit._id,
    },
    {
      studentNumber: "2019-0144",
      firstName: "Synthetic",
      lastName: "Graduate Three",
      gender: "Female",
      graduationYear: 2023,
      personalEmail: "graduate.three@collab.test",
      employmentStatus: "employed",
      isTracked: true,
      programId: bsed._id,
      employer: "Synthetic Test School",
      jobTitle: "Teacher I",
    },
  ];
  for (const { employer, jobTitle, ...sample } of samples) {
    if (await db.Alumni.exists({ studentNumber: sample.studentNumber })) continue;
    const alumni = await new db.Alumni({
      ...sample,
      lastTrackedAt: sample.isTracked ? new Date() : null,
    }).save();
    if (employer)
      await new db.Employment({
        alumniId: alumni._id,
        employer,
        jobTitle,
        isCurrent: true,
        status: "employed",
      }).save();
    if (sample.isTracked)
      await new db.TrackingEvent({
        alumniId: alumni._id,
        isTracked: true,
        notes: "Seeded synthetic tracked graduate",
        source: "seed",
      }).save();
  }
}
