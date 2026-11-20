import assert from "node:assert/strict";
import test from "node:test";

import { formatUiLabel } from "./ui-label";

test("formats system UI labels while preserving acronyms, product spelling and punctuation", () => {
  for (const [source, expected] of [
    ["roles and permissions", "Roles and Permissions"],
    ["API key", "API Key"],
    ["OAuth client ID", "OAuth Client ID"],
    ["Google reCAPTCHA", "Google reCAPTCHA"],
    ["imgBB API key", "imgBB API Key"],
    ["Sign in again", "Sign In Again"],
    ["Sign-in & security", "Sign-In & Security"],
    ["Rows per page", "Rows per Page"],
    ["Backup &amp; restore", "Backup &amp; Restore"],
    ["", ""],
  ]) {
    assert.equal(formatUiLabel(source), expected);
  }
});
