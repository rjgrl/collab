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
  const existing = await db.user.findUnique({
    where: { email: "admin@alumni.local" },
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
      email: "admin@alumni.local",
      emailVerified: true,
      passwordHash: await hashPassword("AlumniAdmin123!"),
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
        enabled: true,
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
    db.evidenceFile.updateMany({ where: { deletedAt: { isSet: false } }, data: { deletedAt: null } }),
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

  const facultyA = await db.faculty.upsert({
    where: { employeeNumber: "FAC-1001" },
    update: { firstName: "Maria", lastName: "Santos", email: "maria.santos@alumni.local" },
    create: {
      employeeNumber: "FAC-1001",
      firstName: "Maria",
      lastName: "Santos",
      email: "maria.santos@alumni.local",
      deletedAt: null,
    },
  });

  const facultyB = await db.faculty.upsert({
    where: { employeeNumber: "FAC-1002" },
    update: { firstName: "Jose", lastName: "Reyes" },
    create: {
      employeeNumber: "FAC-1002",
      firstName: "Jose",
      lastName: "Reyes",
      email: "jose.reyes@alumni.local",
      deletedAt: null,
    },
  });

  await db.facultyDepartment.upsert({
    where: {
      facultyId_departmentId: {
        facultyId: facultyA.id,
        departmentId: it.id,
      },
    },
    update: {},
    create: { facultyId: facultyA.id, departmentId: it.id },
  });

  await db.facultyDepartment.upsert({
    where: {
      facultyId_departmentId: {
        facultyId: facultyB.id,
        departmentId: educ.id,
      },
    },
    update: {},
    create: { facultyId: facultyB.id, departmentId: educ.id },
  });

  return { it, educ, bsit, bsed };
}

async function seedAlumni(programIds: { bsit: string; bsed: string }) {
  const samples = [
    {
      studentNumber: "2020-0001",
      firstName: "Ana",
      lastName: "Cruz",
      gender: "Female",
      graduationYear: 2024,
      batch: "2020",
      mobileNumber: "09171234567",
      personalEmail: "ana.cruz@example.com",
      facebookAccount: "https://facebook.com/ana.cruz",
      employmentStatus: "employed" as const,
      isTracked: true,
      programId: programIds.bsit,
      employer: "SoftServe PH",
      jobTitle: "Junior Developer",
    },
    {
      studentNumber: "2020-0002",
      firstName: "Luis",
      lastName: "Garcia",
      gender: "Male",
      graduationYear: 2024,
      batch: "2020",
      mobileNumber: "09181234567",
      personalEmail: "luis.garcia@example.com",
      facebookAccount: "luis.garcia",
      employmentStatus: "unknown" as const,
      isTracked: false,
      programId: programIds.bsit,
    },
    {
      studentNumber: "2019-0144",
      firstName: "Elena",
      lastName: "Ramos",
      gender: "Female",
      graduationYear: 2023,
      batch: "2019",
      personalEmail: "elena.ramos@example.com",
      employmentStatus: "employed" as const,
      isTracked: true,
      programId: programIds.bsed,
      employer: "Rizal National High School",
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
        batch: sample.batch,
        mobileNumber: sample.mobileNumber,
        personalEmail: sample.personalEmail,
        facebookAccount: sample.facebookAccount,
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
  await seedPermissions();
  await seedRoles();
  await seedAdmin();
  await seedIntegrations();
  const academic = await seedAcademicStructure();
  await seedAlumni({ bsit: academic.bsit.id, bsed: academic.bsed.id });
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
