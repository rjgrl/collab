import type { Types } from "mongoose";
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
    if (process.env.SEED_DEMO_DATA === "true") await seedDemo(tx, password);
  });
}

async function upsertUnit<T>(find: () => Promise<T | null>, create: () => Promise<T>) {
  return (await find()) ?? create();
}

async function seedDemo(db: Database, password: string) {
  const college = (name: string) =>
    upsertUnit(
      () => db.College.findOne({ name }).lean(),
      async () =>
        (await db.College.create({ name, description: "Synthetic testing college" })).toObject(),
    );
  const department = (collegeId: Types.ObjectId, name: string) =>
    upsertUnit(
      () => db.Department.findOne({ collegeId, name }).lean(),
      async () =>
        (
          await db.Department.create({
            collegeId,
            name,
            description: "Synthetic testing department",
          })
        ).toObject(),
    );
  const program = (departmentId: Types.ObjectId, code: string, name: string) =>
    upsertUnit(
      () => db.Program.findOne({ departmentId, code }).lean(),
      async () => (await db.Program.create({ departmentId, code, name })).toObject(),
    );
  const cot = await college("College of Technologies");
  const coe = await college("College of Education");
  const it = await department(cot._id, "Information Technology");
  const auto = await department(cot._id, "Automotive Technology");
  const secEd = await department(coe._id, "Secondary Education");
  const bsit = await program(it._id, "BSIT", "Bachelor of Science in Information Technology");
  const bsat = await program(auto._id, "BSAT", "Bachelor of Science in Automotive Technology");
  const bsed = await program(secEd._id, "BSED", "Bachelor of Secondary Education");
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
    {
      studentNumber: "2021-0210",
      firstName: "Synthetic",
      lastName: "Graduate Four",
      gender: "Male",
      graduationYear: 2025,
      personalEmail: "graduate.four@collab.test",
      employmentStatus: "unknown",
      isTracked: false,
      programId: bsat._id,
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
  // One account per faculty role level; the shared password is the private bootstrap password.
  const role = await db.Role.findOne({ key: "faculty" }).orFail().lean();
  const faculty = [
    {
      email: "college.head@collab.test",
      first: "Synthetic",
      last: "College Head",
      roleLevel: "college",
      departmentId: it._id,
    },
    {
      email: "department.head@collab.test",
      first: "Synthetic",
      last: "Department Head",
      roleLevel: "department",
      departmentId: it._id,
    },
    {
      email: "faculty.it@collab.test",
      first: "Synthetic",
      last: "IT Faculty",
      roleLevel: "faculty",
      departmentId: it._id,
      assign: "2020-0001",
    },
    {
      email: "faculty.education@collab.test",
      first: "Synthetic",
      last: "Education Faculty",
      roleLevel: "faculty",
      departmentId: secEd._id,
      assign: "2019-0144",
    },
  ] as const;
  let employee = 0;
  for (const account of faculty) {
    employee++;
    const user =
      (await db.User.findOne({ email: account.email }).lean()) ??
      (
        await db.User.create({
          name: `${account.first} ${account.last}`,
          firstName: account.first,
          lastName: account.last,
          email: account.email,
          emailVerified: true,
          passwordHash: await hashPassword(password),
          status: "active",
        })
      ).toObject();
    await db.UserRole.updateOne(
      { userId: user._id, roleId: role._id },
      { $setOnInsert: { userId: user._id, roleId: role._id } },
      { upsert: true },
    );
    const record = await db.Faculty.findOneAndUpdate(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          employeeNumber: `DEMO-${String(employee).padStart(4, "0")}`,
          firstName: account.first,
          lastName: account.last,
          email: account.email,
          departmentId: account.departmentId,
          roleLevel: account.roleLevel,
          active: true,
        },
      },
      { upsert: true, returnDocument: "after" },
    ).orFail();
    if ("assign" in account)
      await db.Alumni.updateOne(
        { studentNumber: account.assign, assignedFacultyId: null },
        { $set: { assignedFacultyId: record._id } },
      );
  }
}
