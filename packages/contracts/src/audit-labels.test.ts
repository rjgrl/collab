import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditFieldLabel,
  renderAuditSummary,
} from "./audit-labels";

// Template-literal action keys and the keys they expand to. A new template must be added here.
const TEMPLATE_ACTIONS: Record<string, string[]> = {
  "`auth.${kind}_verified`": ["auth.email_verified", "auth.phone_verified"],
};
const ACTION_KEY = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

it("every audit action written in the codebase has a label", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== "test-utils" && entry !== "node_modules") walk(path);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) files.push(path);
    }
  };
  walk(join(root, "apps/server/src"));
  walk(join(root, "packages/api/src"));

  const found = new Map<string, string>();
  const problems: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf-8");
    text.split(/\r?\n/).forEach((line, index) => {
      const where = `${relative(root, file)}:${index + 1}`;
      // `action: <expr>` inside an object literal (writeAudit input)
      const property = line.match(/\baction:\s*(.+?),?\s*$/);
      if (property) {
        const expression = property[1]!;
        if (expression in TEMPLATE_ACTIONS)
          for (const key of TEMPLATE_ACTIONS[expression]!) found.set(key, where);
        else if (expression.includes("`"))
          problems.push(`${where}: unlisted template ${expression}`);
        else
          for (const [, literal] of expression.matchAll(/"([^"]+)"/g))
            if (ACTION_KEY.test(literal!)) found.set(literal!, where);
      }
    });
    // Helpers: audit(db, context, "<action>", ...) and audited(context, "<action>", ...),
    // matched on the whole file because calls often span several lines.
    for (const match of text.matchAll(/\baudited\(\s*[^,]+,\s*"([^"]+)"/g))
      found.set(match[1]!, relative(root, file));
    for (const match of text.matchAll(/\baudit\(\s*[^,]+,\s*[^,]+,\s*"([^"]+)"/g))
      found.set(match[1]!, relative(root, file));
  }

  assert.ok(found.size > 40, `expected to find the audit actions, found ${found.size}`);
  assert.deepEqual(problems, []);
  const missing = [...found].filter(([key]) => !(key in AUDIT_ACTION_LABELS));
  assert.deepEqual(
    missing.map(([key, where]) => `${key} (${where})`),
    [],
    "every audit action needs a label in AUDIT_ACTION_LABELS",
  );
});

it("auditActionLabel fallback never contains '.' or '_'", () => {
  const testCases = ["foo.bar", "foo_bar", "foo.bar_baz", "test.action.with_underscores"];
  for (const testCase of testCases) {
    // First remove from known labels if it exists to force fallback
    const label = auditActionLabel(testCase);
    assert(
      !label.includes(".") && !label.includes("_"),
      `Fallback label "${label}" for action "${testCase}" should not contain . or _`,
    );
  }
});

it("renderAuditSummary renders field labels and values", () => {
  const names = {
    roles: { r1: "Admin", r2: "Editor" },
    permissions: { "users.read": "View users", "users.write": "Manage users" },
  };

  const result = renderAuditSummary(
    {
      entity: "user",
      summary: 'firstName: "John" → "Jane"; lastName: "Doe" → "Smith"',
    },
    names,
  );

  assert(result.includes("First name"), "should render 'First name' label");
  assert(result.includes("Last name"), "should render 'Last name' label");
  assert(result.includes('"John" → "Jane"'), "should preserve string values with quotes");
});

it("renderAuditSummary handles null values", () => {
  const names = {
    roles: {},
    permissions: {},
  };

  const result = renderAuditSummary(
    {
      entity: "alumni",
      summary: 'notes: "old note" → null',
    },
    names,
  );

  assert(result.includes("none"), "should render null as 'none'");
});

it("renderAuditSummary handles boolean values", () => {
  const names = {
    roles: {},
    permissions: {},
  };

  const result = renderAuditSummary(
    {
      entity: "alumni",
      summary: "active: true → false",
    },
    names,
  );

  assert(result.includes("yes"), "should render true as 'yes'");
  assert(result.includes("no"), "should render false as 'no'");
});

it("renderAuditSummary handles roleIds", () => {
  const names = {
    roles: { r1: "Admin", r2: "Editor" },
    permissions: {},
  };

  const result = renderAuditSummary(
    {
      entity: "user",
      summary: 'roleIds: ["r1","r2"] → ["r1"]',
    },
    names,
  );

  assert(result.includes("Admin, Editor"), "should render role IDs as role names");
  assert(result.includes("Admin"), "should render single role ID");
});

it("renderAuditSummary handles permissionKeys", () => {
  const names = {
    roles: {},
    permissions: { "users.read": "View users", "users.write": "Manage users" },
  };

  const result = renderAuditSummary(
    {
      entity: "role",
      summary: 'permissionKeys: ["users.read","users.write"] → ["users.read"]',
    },
    names,
  );

  assert(result.includes("View users, Manage users"), "should render permission keys as names");
  assert(result.includes("View users"), "should render single permission key");
});

it("renderAuditSummary handles JSON strings inside values", () => {
  const names = {
    roles: {},
    permissions: {},
  };

  const result = renderAuditSummary(
    {
      entity: "college",
      summary: 'description: "has; semicolon" → "other; value"',
    },
    names,
  );

  // Should parse correctly despite ; inside string
  assert(result.includes("Description"), "should handle semicolons inside JSON strings");
});

it("renderAuditSummary returns original on parse failure", () => {
  const names = {
    roles: {},
    permissions: {},
  };

  const original = "malformed: notjson → invalid";
  const result = renderAuditSummary(
    {
      entity: "user",
      summary: original,
    },
    names,
  );

  assert.equal(result, original, "should return original on parse failure");
});

it("renderAuditSummary handles 'No audited fields changed.'", () => {
  const names = {
    roles: {},
    permissions: {},
  };

  const result = renderAuditSummary(
    {
      entity: "user",
      summary: "No audited fields changed.",
    },
    names,
  );

  assert.equal(result, "No audited fields changed.");
});

it("renderAuditSummary preserves prefix text", () => {
  const names = {
    roles: { r1: "Admin" },
    permissions: {},
  };

  const result = renderAuditSummary(
    {
      entity: "role",
      summary: 'Saved role "Admin": name: "old" → "new"',
    },
    names,
  );

  assert(result.includes('Saved role "Admin"'), "should preserve prefix text");
});

it("auditFieldLabel returns entity-specific override", () => {
  const label = auditFieldLabel("role", "description");
  assert.equal(label, "Note", "role.description should map to 'Note'");
});

it("auditFieldLabel returns generic field label", () => {
  const label = auditFieldLabel("user", "firstName");
  assert.equal(label, "First name");
});

it("auditFieldLabel returns sentence-cased fallback for unknown fields", () => {
  const label = auditFieldLabel("user", "customField");
  assert.equal(label, "Custom field", "should sentence-case unknown fields");
});
