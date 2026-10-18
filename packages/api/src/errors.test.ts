import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailable, publicErrorMessage } from "./errors";

describe("isDatabaseUnavailable", () => {
  it("detects Atlas replica-set timeouts", () => {
    const error = new Error("Kind: Server selection timeout: No available servers. Topology: { Type: ReplicaSetNoPrimary }");
    assert.equal(isDatabaseUnavailable(error), true);
  });

  it("detects Prisma P2010 metadata", () => {
    const error = Object.assign(new Error("Raw query failed"), {
      code: "P2010",
      meta: { message: "received fatal alert: InternalError" },
    });
    assert.equal(isDatabaseUnavailable(error), true);
  });

  it("returns false for normal auth errors", () => {
    assert.equal(isDatabaseUnavailable(new Error("Invalid email or password.")), false);
  });
});

describe("publicErrorMessage", () => {
  it("hides Prisma internals behind a database message", () => {
    const error = Object.assign(new Error("Invalid `db.session.findUnique()` invocation"), { code: "P2010" });
    assert.equal(publicErrorMessage(error), DATABASE_UNAVAILABLE_MESSAGE);
  });
});
