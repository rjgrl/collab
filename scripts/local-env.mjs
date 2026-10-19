import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";

export const LOCAL_DATABASE_URL = "mongodb://127.0.0.1:27018/alumni_tracking?replicaSet=rs0";

async function readEnv(file) {
  return existsSync(file) ? parseEnv(await readFile(file, "utf8")) : {};
}

export function isManagedLocalDatabase(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "mongodb:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === "27018" &&
      url.searchParams.get("replicaSet") === "rs0" &&
      !url.username &&
      !url.password &&
      /^\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      ![...url.searchParams.keys()].some(
        (key) => !["replicaSet", "serverSelectionTimeoutMS", "connectTimeoutMS"].includes(key),
      )
    );
  } catch {
    return false;
  }
}

export async function readLocalConfig(root, inherited = process.env) {
  const server = await readEnv(path.join(root, "apps/server/.env"));
  const web = await readEnv(path.join(root, "apps/web/.env"));
  const database = await readEnv(path.join(root, "packages/db/.env"));
  if (
    !inherited.DATABASE_URL &&
    server.DATABASE_URL &&
    database.DATABASE_URL &&
    server.DATABASE_URL !== database.DATABASE_URL
  )
    throw new Error(
      "Server and DB environment files point to different databases. Existing values were preserved; make their DATABASE_URL values agree before continuing.",
    );
  return {
    server,
    web,
    database,
    effective: {
      ...server,
      ...database,
      ...Object.fromEntries(
        Object.entries(inherited).filter(([, value]) => value !== undefined && value !== ""),
      ),
    },
  };
}

async function fillMissingEnv(file, defaults) {
  let text = existsSync(file) ? await readFile(file, "utf8") : "";
  const current = parseEnv(text);
  for (const [key, value] of Object.entries(defaults)) {
    if (current[key]?.trim()) continue;
    const assignment = `${key}=${JSON.stringify(value)}`;
    const line = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, "m");
    text = line.test(text)
      ? text.replace(line, () => assignment)
      : `${text}${text.endsWith("\n") || !text ? "" : "\n"}${assignment}\n`;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, { mode: 0o600 });
}

export async function prepareLocalEnv(root, { demo = false, inherited = process.env } = {}) {
  const { server, web, database, effective } = await readLocalConfig(root, inherited);
  if ([server.NODE_ENV, web.NODE_ENV, database.NODE_ENV, inherited.NODE_ENV].includes("production"))
    throw new Error(
      "setup:local refuses production environments. Use docs/deployment.md for deployment.",
    );
  for (const candidate of [server.DATABASE_URL, database.DATABASE_URL, inherited.DATABASE_URL]) {
    if (candidate?.trim() && !isManagedLocalDatabase(candidate))
      throw new Error(
        "Existing DATABASE_URL is not the managed localhost:27018 rs0 database. It was preserved. Use the manual setup guide for a custom database.",
      );
  }
  // Each checkout gets its own persistent development database. Never silently
  // reuse another clone's default database on the same MongoDB instance.
  const databaseUrl =
    effective.DATABASE_URL ||
    `mongodb://127.0.0.1:27018/collab_dev_${randomBytes(6).toString("hex")}?replicaSet=rs0`;
  const email = effective.SEED_ADMIN_EMAIL || "admin@collab.test";
  const password = effective.SEED_ADMIN_PASSWORD || randomBytes(24).toString("base64url");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12)
    throw new Error(
      "Existing bootstrap credentials are invalid. Set a valid SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD of at least 12 characters privately.",
    );
  await fillMissingEnv(path.join(root, "apps/server/.env"), {
    NODE_ENV: "development",
    CORS_ORIGIN: "http://localhost:3001",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: databaseUrl,
    UPLOAD_DIR: "./uploads",
    SESSION_SECRET: randomBytes(32).toString("hex"),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  });
  await fillMissingEnv(path.join(root, "apps/web/.env"), {
    NODE_ENV: "development",
    VITE_SERVER_URL: "http://localhost:3001",
  });
  await fillMissingEnv(path.join(root, "packages/db/.env"), {
    SEED_ADMIN_EMAIL: email,
    SEED_ADMIN_PASSWORD: password,
    SEED_DEMO_DATA: demo ? "true" : "false",
  });
  const loginFile = path.join(root, ".tools/local-login.txt");
  await mkdir(path.dirname(loginFile), { recursive: true });
  if (!existsSync(loginFile))
    await writeFile(
      loginFile,
      `Local testing account only. Do not share or commit this file.\nEmail: ${email}\nPassword: ${password}\n`,
      { mode: 0o600, flag: "wx" },
    );
  return {
    databaseUrl,
    email,
    password,
    loginFile,
    demo: demo || effective.SEED_DEMO_DATA === "true",
  };
}
