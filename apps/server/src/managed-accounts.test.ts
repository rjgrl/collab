import assert from "node:assert/strict";
import { it } from "node:test";
import request from "supertest";
import { PERMISSION_KEYS } from "@Alumni-Tracking-Ss/db";
import type { AuthUser } from "@Alumni-Tracking-Ss/api/context";
import { modelFixture } from "@Alumni-Tracking-Ss/api/services/model-test-fixture";
import { createApp } from "./app";

const origin = "https://app.example.test";
const userId = "111111111111111111111111";
const alumniId = "222222222222222222222222";
const programId = "333333333333333333333333";
function fixture(roles: string[]) {
  const f = modelFixture({
    User: [{ id: userId, alumniId, firstName: "Existing", lastName: "Owner" }],
    Alumni: [{ id: alumniId, studentNumber: "HISTORICAL", programId }],
  });
  const actor: AuthUser = {
    id: userId,
    name: "Synthetic Actor",
    email: "actor@example.test",
    image: null,
    status: "active",
    roles,
    permissions: [...PERMISSION_KEYS],
    mfaVerified: true,
  };
  const app = createApp({
    db: f.db,
    config: { nodeEnv: "test", origin },
    integrationEnv: {},
    sessionLoader: async () => actor,
  });
  return { ...f, app };
}

it("POST users denies Staff and custom actors holding legacy users.write grants before persistence", async () => {
  for (const roles of [["staff"], ["legacy_manager"], ["viewer"]]) {
    const f = fixture(roles);
    const before = structuredClone(f.tables);
    const response = await request(f.app)
      .post("/api/users")
      .set("Cookie", "ats_session=synthetic")
      .set("Origin", origin)
      .send({
        firstName: "Managed",
        lastName: "Account",
        email: "managed@example.test",
        password: "Synthetic managed passphrase 123!",
      });
    assert.equal(response.status, 403, JSON.stringify(response.body));
    assert.equal(f.operations.length, 0);
    assert.deepEqual(f.tables, before);
  }
});

it("legacy manual Alumni create/link HTTP endpoints reject all management actors without altering history", async () => {
  for (const roles of [["staff"], ["admin"], ["super_admin"], ["legacy_manager"]]) {
    const f = fixture(roles);
    const before = structuredClone(f.tables);
    const create = await request(f.app)
      .post("/api/alumni")
      .set("Cookie", "ats_session=synthetic")
      .set("Origin", origin)
      .send({
        firstName: "Manual",
        lastName: "Alumni",
        studentNumber: "MANUAL",
        gender: "Female",
        programId,
      });
    assert.equal(create.status, 403, JSON.stringify(create.body));
    assert.match(create.body.error, /self-register/);
    const link = await request(f.app)
      .post(`/api/users/${userId}/alumni-link`)
      .set("Cookie", "ats_session=synthetic")
      .set("Origin", origin)
      .send({ alumniId });
    assert.equal(link.status, 403, JSON.stringify(link.body));
    assert.match(link.body.error, /own registration/);
    assert.equal(f.operations.length, 0);
    assert.deepEqual(f.tables, before);
  }
});
