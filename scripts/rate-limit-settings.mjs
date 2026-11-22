import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Optional server limits and their built-in defaults. The server reads them with boundedSetting():
 * absent/blank means the default; anything else must be a whole number from 1 to max, or the
 * server rejects the configuration. rate-limit-settings.test.mjs keeps these in sync with the code.
 */
export const NUMERIC_LIMITS = [
  {
    key: "API_RATE_LIMIT",
    fallback: 300,
    max: 10000,
    about: "API requests per minute per signed-in user or anonymous IP",
  },
  {
    key: "API_IP_RATE_LIMIT",
    fallback: 3000,
    max: 100000,
    about: "API requests per minute shared by one IP (e.g. a campus network)",
  },
  {
    key: "AUTH_ACCOUNT_LIMIT",
    fallback: 5,
    max: 100,
    about: "failed/in-progress password attempts per account per 15 minutes",
  },
  {
    key: "AUTH_IP_LIMIT",
    fallback: 30,
    max: 1000,
    about: "sign-in, MFA and reset requests per IP per window",
  },
  {
    key: "AUTH_IP_WINDOW_SECONDS",
    fallback: 900,
    max: 86400,
    about: "length of that sign-in IP window in seconds",
  },
  {
    key: "SESSION_IDLE_MINUTES",
    fallback: 30,
    max: 1440,
    about: "minutes of inactivity before a session ends",
  },
];
const STORES = ["mongodb", "memory"];

function storeDefaults(env) {
  return {
    API_RATE_STORE: "mongodb",
    AUTH_IP_STORE: env.NODE_ENV === "production" ? "mongodb" : "memory",
  };
}

/** The values the server will use for this environment, and any configuration it would reject. */
export function effectiveRateLimits(env) {
  const rows = [];
  const errors = [];
  for (const { key, fallback, max, about } of NUMERIC_LIMITS) {
    const raw = env[key];
    if (raw === undefined || raw === "") {
      rows.push({ key, value: fallback, source: "default", about });
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max)
      errors.push(`${key} must be a whole number from 1 to ${max} (remove it to use ${fallback}).`);
    else rows.push({ key, value: parsed, source: "configured", about });
  }
  for (const [key, fallback] of Object.entries(storeDefaults(env))) {
    const raw = env[key];
    const value = key === "API_RATE_STORE" ? (raw ?? fallback) : raw || fallback;
    if (!STORES.includes(value)) errors.push(`${key} must be mongodb or memory.`);
    else if (key === "API_RATE_STORE" && env.NODE_ENV === "production" && value !== "mongodb")
      errors.push(`${key} must be mongodb in production.`);
    else
      rows.push({
        key,
        value,
        source: raw === value ? "configured" : "default",
        about: key === "API_RATE_STORE" ? "API counter storage" : "sign-in IP counter storage",
      });
  }
  return { rows, errors };
}

export const REFERENCE_MARKER = "# --- Optional limits (commented = built-in default in use) ---";

/** Commented reference lines; uncomment and edit a line to override its default. */
export function rateLimitReference() {
  const lines = [
    "",
    REFERENCE_MARKER,
    "# Uncomment a line and restart `pnpm dev` to change it. Full list: apps/server/.env.schema.",
    "# Out-of-range values are rejected, not ignored. Check with `pnpm run doctor`.",
  ];
  for (const { key, fallback, max, about } of NUMERIC_LIMITS)
    lines.push(`# ${about} (1-${max}):`, `# ${key}=${fallback}`);
  lines.push(
    "# API counter storage; mongodb shares counts across refreshes/servers (required in production):",
    "# API_RATE_STORE=mongodb",
    "# Sign-in IP counter storage; default memory in development, mongodb in production:",
    "# AUTH_IP_STORE=memory",
    "",
  );
  return lines.join("\n");
}

/**
 * Appends the commented reference once. Never changes or removes existing settings, and adds
 * nothing active, so behavior is identical before and after. Returns whether it appended.
 */
export async function addRateLimitReference(file) {
  const text = existsSync(file) ? await readFile(file, "utf8") : "";
  if (text.includes(REFERENCE_MARKER)) return false;
  await writeFile(
    file,
    `${text}${text.endsWith("\n") || !text ? "" : "\n"}${rateLimitReference()}`,
    {
      mode: 0o600,
    },
  );
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/server/.env");
  if (!existsSync(file)) {
    console.error("apps/server/.env does not exist; nothing was changed.");
    process.exitCode = 1;
  } else
    console.log(
      (await addRateLimitReference(file))
        ? "Added commented optional limits to apps/server/.env. No active setting changed."
        : "apps/server/.env already lists the optional limits; nothing changed.",
    );
}
