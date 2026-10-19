import "varlock/auto-load";

import { createPrismaClient } from "./index";
import { hashPassword } from "./password";
import { PERMISSIONS, ROLE_PRESETS } from "./permissions";
import { ENV } from "./env";

const db = createPrismaClient(ENV);

const INTEGRATION_KEYS = [
  "recaptcha",
  "google_auth",
  "google_drive",
  "email",
  "image_host",
  "google_forms",
  "google_sheets",
] as const;

async function seedPermissions() {
  for (const permission of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: permission.key },
      update: {
        name: permission.name,
        description: permission.description,
        module: permission.module,
      },
      create: permission,
    });
  }
}

async function seedRoles() {
  const permissions = await db.permission.findMany();
  const permissionByKey = new Map(permissions.map((item) => [item.key, item]));

  for (const preset of Object.values(ROLE_PRESETS)) {
    const existingRole = await db.role.findUnique({ where: { key: preset.key } });
    const role = await db.role.upsert({
      where: { key: preset.key },
      update: {
        name: preset.name,
        description: preset.description,
        isSystem: true,
      },
      create: {
        key: preset.key,
        name: preset.name,
        description: preset.description,
        isSystem: true,
      },
    });

    if (existingRole && preset.key !== "super_admin") continue; // Preserve editable role assignments; repair protected administrator rights.
    for (const key of preset.permissions) {
      const permission = permissionByKey.get(key);
      if (!permission) {
        continue;
      }

      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Provide SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (at least 12 characters) through protected environment configuration.",
    );
  const existing = await db.user.findUnique({
    where: { email },
  });

  if (existing) {
    return existing;
  }

  const superAdmin = await db.role.findUniqueOrThrow({
    where: { key: "super_admin" },
  });

  const user = await db.user.create({
    data: {
      name: "System Administrator",
      email,
      emailVerified: true,
      passwordHash: await hashPassword(password),
      status: "active",
      userRoles: {
        create: { roleId: superAdmin.id },
      },
    },
  });

  return user;
}

async function seedIntegrations() {
  for (const key of INTEGRATION_KEYS) {
    await db.integrationSetting.upsert({
      where: { key },
      update: {},
      create: {
        key,
        enabled: key !== "google_forms",
        notes: "Modular integration. Live credentials are optional; fallbacks are used when unset.",
      },
    });
  }
}

async function backfillDeletedAt() {
  await Promise.all([
    db.department.updateMany({ where: { deletedAt: { isSet: false } }, data: { deletedAt: null } }),
    db.program.updateMany({ where: { deletedAt: { isSet: false } }, data: { deletedAt: null } }),
    db.faculty.updateMany({ where: { deletedAt: { isSet: false } }, data: { deletedAt: null } }),
    db.alumni.updateMany({ where: { deletedAt: { isSet: false } }, data: { deletedAt: null } }),
    db.evidenceFile.updateMany({
      where: { deletedAt: { isSet: false } },
      data: { deletedAt: null },
    }),
  ]);
}

async function seedAcademicStructure() {
  const it = await db.department.upsert({
    where: { code: "IT" },
    update: { name: "Information Technology", description: "Information Technology department" },
    create: {
      code: "IT",
      name: "Information Technology",
      description: "Information Technology department used by the dashboard grouping example.",
      deletedAt: null,
    },
  });

  const educ = await db.department.upsert({
    where: { code: "EDUC" },
    update: { name: "Education" },
    create: {
      code: "EDUC",
      name: "Education",
      description: "College of Education",
      deletedAt: null,
    },
  });

  const bsit = await db.program.upsert({
    where: {
      departmentId_code: {
        departmentId: it.id,
        code: "BSIT",
      },
    },
    update: { name: "Bachelor of Science in Information Technology" },
    create: {
      departmentId: it.id,
      code: "BSIT",
      name: "Bachelor of Science in Information Technology",
      description: "Undergraduate IT program",
      deletedAt: null,
    },
  });

  const bsed = await db.program.upsert({
    where: {
      departmentId_code: {
        departmentId: educ.id,
        code: "BSED",
      },
    },
    update: { name: "Bachelor of Secondary Education" },
    create: {
      departmentId: educ.id,
      code: "BSED",
      name: "Bachelor of Secondary Education",
      deletedAt: null,
    },
  });

  return { it, educ, bsit, bsed };
}

async function seedAlumni(programIds: { bsit: string; bsed: string }) {
  const samples = [
    {
      studentNumber: "2020-0001",
      firstName: "Synthetic",
      lastName: "Graduate One",
      gender: "Female",
      graduationYear: 2024,
      personalEmail: "graduate.one@collab.test",
      employmentStatus: "employed" as const,
      isTracked: true,
      programId: programIds.bsit,
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
      employmentStatus: "unknown" as const,
      isTracked: false,
      programId: programIds.bsit,
    },
    {
      studentNumber: "2019-0144",
      firstName: "Synthetic",
      lastName: "Graduate Three",
      gender: "Female",
      graduationYear: 2023,
      personalEmail: "graduate.three@collab.test",
      employmentStatus: "employed" as const,
      isTracked: true,
      programId: programIds.bsed,
      employer: "Synthetic Test School",
      jobTitle: "Teacher I",
    },
  ];

  for (const sample of samples) {
    const existing = await db.alumni.findUnique({
      where: { studentNumber: sample.studentNumber },
    });

    if (existing) {
      continue;
    }

    const alumni = await db.alumni.create({
      data: {
        studentNumber: sample.studentNumber,
        firstName: sample.firstName,
        lastName: sample.lastName,
        gender: sample.gender,
        graduationYear: sample.graduationYear,
        personalEmail: sample.personalEmail,
        employmentStatus: sample.employmentStatus,
        isTracked: sample.isTracked,
        lastTrackedAt: sample.isTracked ? new Date() : null,
        deletedAt: null,
        programId: sample.programId,
      },
    });

    if (sample.employer) {
      await db.employment.create({
        data: {
          alumniId: alumni.id,
          employer: sample.employer,
          jobTitle: sample.jobTitle,
          isCurrent: true,
          status: "employed",
        },
      });
    }

    if (sample.isTracked) {
      await db.trackingEvent.create({
        data: {
          alumniId: alumni.id,
          isTracked: true,
          notes: "Seeded tracked graduate",
          source: "seed",
        },
      });
    }
  }
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw Error(
      "Repository seeding is development/test only; production provisioning requires a reviewed operator procedure.",
    );
  if (process.env.SEED_DEMO_DATA === "true" && process.env.NODE_ENV === "production")
    throw new Error("Demo data is disabled in production.");
  if (
    !process.env.SEED_ADMIN_EMAIL ||
    !process.env.SEED_ADMIN_PASSWORD ||
    process.env.SEED_ADMIN_PASSWORD.length < 12
  )
    throw new Error("Configure bootstrap administrator credentials before seeding.");
  await seedPermissions();
  await seedRoles();
  await seedAdmin();
  await seedIntegrations();
  if (process.env.SEED_DEMO_DATA === "true") {
    if (process.env.NODE_ENV === "production")
      throw new Error("Demo data is disabled in production.");
    const academic = await seedAcademicStructure();
    await seedAlumni({ bsit: academic.bsit.id, bsed: academic.bsed.id });
  }
  await backfillDeletedAt();
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
