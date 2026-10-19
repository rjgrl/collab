import { readFileSync } from "node:fs";
import { projectRoot } from "./local-tools.mjs";
import path from "node:path";

export function checkToolchain({
  node = process.versions.node,
  agent = process.env.npm_config_user_agent,
} = {}) {
  const [major, minor] = node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 15))
    throw Error(
      "Node.js 22.15+ is required; use the tested .node-version (26.10.0). Restart your terminal after switching Node.",
    );
  const expected = JSON.parse(
    readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ).packageManager;
  if (
    agent &&
    !agent.startsWith(expected.replace("@", "/") + " ") &&
    agent !== expected.replace("@", "/")
  )
    throw Error(
      "Use pnpm 12.5.1 from packageManager; run pnpm --version and follow docs/DEVELOPMENT_SETUP.md.",
    );
}
export function requireSetupConsent({ hasCollections, updateExisting }) {
  return !hasCollections || updateExisting ? "initialize" : "verify-only";
}
