import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export async function runTool(
  packageName,
  binName,
  args,
  { cwd = projectRoot, env = process.env, toolRoot = projectRoot } = {},
) {
  const packageDir = path.join(toolRoot, "node_modules", packageName);
  const manifestPath = path.join(packageDir, "package.json");
  if (!existsSync(manifestPath))
    throw new Error("Dependencies are missing. Run pnpm install --frozen-lockfile first.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[binName];
  if (!entry) throw new Error(`Cannot locate the installed ${binName} command.`);
  const child = spawn(process.execPath, [path.resolve(packageDir, entry), ...args], {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const onInterrupt = () => forward("SIGINT");
  const onTerminate = () => forward("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `${binName} ${args[0] ?? ""} stopped (${signal || code}). Review the preceding error; later setup steps were not run.`,
              ),
            ),
      );
    });
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

export const runTsx = (file, options) =>
  runTool("tsx", "tsx", [path.join(projectRoot, "scripts", file)], options);
export const runWorkspace = (args, options) =>
  runTool("vite-plus", "vp", ["run", ...args], options);
