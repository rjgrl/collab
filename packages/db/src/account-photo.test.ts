import assert from "node:assert/strict";
import { it } from "node:test";
import mongoose, { Types } from "mongoose";
import { createModels, schemas } from "./models";
import { plannedIndexes } from "./migration";

it("keeps account photos separate from required Alumni evidence ownership and includes their migration index", async () => {
  const connection = mongoose.createConnection();
  const db = createModels(connection);
  const photo = new db.AccountPhoto({
    userId: new Types.ObjectId(),
    originalName: "photo.png",
    mimeType: "image/png",
    sizeBytes: 3,
    provider: "local",
    storageKey: "synthetic",
  });
  await photo.validate();
  assert.equal(schemas.AccountPhoto.path("alumniId"), undefined);
  assert.equal(schemas.AccountPhoto.path("userId").options.required, true);
  assert.equal(schemas.EvidenceFile.path("alumniId").options.required, true);
  assert.ok(
    plannedIndexes().some(
      (index) =>
        index.collection === "AccountPhoto" && index.name === "AccountPhoto_userId_createdAt_idx",
    ),
  );
  photo.mimeType = "image/svg+xml";
  await assert.rejects(photo.validate());
  await connection.close();
});
