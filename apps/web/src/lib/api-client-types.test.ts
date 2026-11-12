import assert from "node:assert/strict";
import { it } from "node:test";
import type { client } from "./api";

// Type-level checks, enforced by `tsc` in `pnpm check`. The client is generated from the shared
// route table; if its mapped types ever widened to `any`, these @ts-expect-error lines would
// become unused and fail type checking.
type LoginInput = Parameters<typeof client.auth.login>[0];
type RoleList = Awaited<ReturnType<typeof client.roles.list>>;

// @ts-expect-error unknown fields are rejected by the contract-derived input type
const unknownField: LoginInput = { email: "a@example.test", password: "x", extra: true };
// @ts-expect-error the email must be a string
const wrongType: LoginInput = { email: 1, password: "x" };
// @ts-expect-error roles.list returns an array, not a single role
const notArray: RoleList = { id: "x" };

it("keeps contract types on the generated API client", () => {
  assert.ok([unknownField, wrongType, notArray].length === 3);
});
