import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./local-tools.mjs";

// Opt-in committed-source rehearsal. It never copies the caller's private env,
// local credentials, generated client or database into the new checkout.
const pnpm = process.env.npm_execpath;
if (!pnpm) throw Error("Run with pnpm run test:clone-local.");
// pnpm can expose either its JS entry or a standalone native executable.
const launcher = /\.(?:c?js|mjs)$/.test(pnpm) ? process.execPath : pnpm;
const pnpmArgs = (...args) => (launcher === process.execPath ? [pnpm, ...args] : args);
const root = path.join(projectRoot, ".tools", "phase6-clone-" + randomUUID());
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(?:PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TEMP|TMP|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(
      key,
    ),
  ),
);
Object.assign(env, {
  NODE_ENV: "development",
  CI: "true",
  PASSWORD_BREACH_CHECK: "local",
  PHASE6_CLONE_REHEARSAL: "true",
});
const steps = [];
async function run(command, args, cwd, label) {
  const start = performance.now();
  const log = path.join(projectRoot, ".tools", path.basename(root) + "-" + label + ".log");
  const output = [];
  const child = spawn(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => output.push(chunk));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  await writeFile(log, Buffer.concat(output));
  steps.push({
    command: [command === process.execPath ? "node" : command, ...args],
    label,
    code,
    milliseconds: Math.round(performance.now() - start),
    log: path.basename(log),
  });
  if (code !== 0) throw Error(label + " failed; inspect private local log " + log);
  console.log("PASS " + label);
}
await mkdir(path.dirname(root), { recursive: true });
try {
  await run(
    "git",
    [
      "clone",
      "--no-hardlinks",
      "--single-branch",
      "--branch",
      "development/phase6-cross-device-testing",
      projectRoot,
      root,
    ],
    projectRoot,
    "clone",
  );
  await run(launcher, pnpmArgs("install", "--frozen-lockfile"), root, "install");
  // Nonsecret alternate origins avoid interfering with the developer's app.
  await writeFile(
    path.join(root, "apps/server/.env"),
    "CORS_ORIGIN=http://127.0.0.1:3201\nAPP_URL=http://127.0.0.1:3200\n",
  );
  await writeFile(path.join(root, "apps/web/.env"), "VITE_SERVER_URL=http://127.0.0.1:3201\n");
  await run(launcher, pnpmArgs("setup:local", "--demo"), root, "setup");
  await run(launcher, pnpmArgs("run", "doctor"), root, "doctor");
  await run(launcher, pnpmArgs("build"), root, "build");
  for (const command of [
    "check-types",
    "test:browser-types",
    "test",
    "check:secrets",
    "check:production-build",
    "check:server-build",
  ])
    await run(launcher, pnpmArgs(command), root, command.replaceAll(":", "-"));
  await run(launcher, pnpmArgs("exec", "tsx", "scripts/clone-acceptance.ts"), root, "application");
  await run("git", ["diff", "--exit-code"], root, "tracked-clean");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  const result = {
    source: "local committed branch (not remote)",
    cloneDirectory: root,
    passed: !process.exitCode,
    steps,
    limits: [
      "same Windows device and package cache",
      "existing loopback MongoDB server, new random database",
      "no remote CI, provider delivery or physical second-device proof",
      "synthetic database and ignored private clone retained; no cleanup/delete",
    ],
  };
  await writeFile(
    path.join(projectRoot, ".tools", path.basename(root) + "-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log("Rehearsal evidence: .tools/" + path.basename(root) + "-results.json");
}
