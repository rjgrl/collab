import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((file) => file && existsSync(file));
const findings = [];
for (const file of new Set(files)) {
  if (/(^|\/)\.env($|\.)/.test(file) && !/\.env\.(schema|example)$|\.example$/.test(file))
    findings.push(`${file}: environment file must remain private`);
  const content = readFileSync(file);
  if (content.includes(0) || content.length > 2_000_000) continue;
  const text = content.toString("utf8");
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s@]+@/,
  ];
  if (patterns.some((pattern) => pattern.test(text)))
    findings.push(`${file}: possible embedded credential`);
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${new Set(files).size} tracked and eligible files; no high-confidence secret patterns found. This is not a Git-history or credential-revocation audit.`,
  );
