import assert from "node:assert/strict";
import { it } from "node:test";
import { modelFixture } from "./model-test-fixture";
import { upsertGoogleUser } from "./session";

it("preserves an account-managed photo or explicit removal on later Google sign-in", async () => {
  for (const image of [
    "/api/account-photos/111111111111111111111111/222222222222222222222222",
    null,
  ]) {
    const f = modelFixture({
      User: [
        {
          _id: "111111111111111111111111",
          name: "Account Name",
          email: "photo@example.test",
          status: "active",
          emailVerified: true,
          passwordHash: "synthetic",
          image,
        },
      ],
    });
    const user = await upsertGoogleUser(f.db, {
      email: "photo@example.test",
      name: "Provider Name",
      image: "https://provider.example.test/photo.jpg",
    });
    assert.equal(user.image, image);
    assert.equal(user.name, "Account Name");
    assert.equal(f.tables.User![0]!.image, image);
  }
});
