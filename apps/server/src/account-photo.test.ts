import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import type { AuthUser, Context } from "@Alumni-Tracking-Ss/api/context";
import { modelFixture } from "@Alumni-Tracking-Ss/api/test-utils/model-test-fixture";
import sharp from "sharp";
import { loadAuthUser } from "@Alumni-Tracking-Ss/api/services/session";
import { MAX_ACCOUNT_PHOTO_BYTES } from "@Alumni-Tracking-Ss/contracts/account-photo";
import { createApp } from "./app";
import { uploadEvidence } from "./modules/files/service";
import { filesService } from "./modules/alumni/service";
import {
  downloadAccountPhoto,
  removeAccountPhoto,
  uploadAccountPhoto,
} from "./modules/account-photos/service";

const userId = "111111111111111111111111";
const otherId = "222222222222222222222222";
const alumniId = "333333333333333333333333";
const origin = "https://app.example.test";
const png = await sharp({
  create: { width: 4, height: 4, channels: 3, background: "#336699" },
})
  .png()
  .toBuffer();
// Valid PNG header and chunk layout, corrupt pixel data: passes sniffing, fails decoding.
const corruptPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZx8AAAAASUVORK5CYII=",
  "base64",
);
// Photos are re-encoded on upload, so stored and served bytes are WebP.
const isWebp = (buffer: Buffer) => buffer.subarray(8, 12).toString("latin1") === "WEBP";
function viewer(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: userId,
    name: "Photo Owner",
    email: "photo@example.test",
    image: null,
    status: "active",
    roles: ["staff"],
    permissions: [],
    mfaVerified: true,
    ...overrides,
  };
}
function fixture(linked = false) {
  const f = modelFixture({
    User: [
      {
        _id: userId,
        name: "Photo Owner",
        email: "photo@example.test",
        status: "active",
        ...(linked ? { alumniId } : {}),
      },
    ],
    Alumni: linked ? [{ _id: alumniId, photoUrl: "/api/files/444444444444444444444444" }] : [],
    EvidenceFile: [{ _id: "444444444444444444444444", alumniId, kind: "image", deletedAt: null }],
  });
  const context: Context = {
    db: f.db,
    user: viewer(),
    sessionToken: "synthetic",
    ipAddress: null,
    userAgent: null,
    integrationEnv: {},
  };
  return { ...f, context };
}
function file(buffer = png, mimetype = "image/png"): Express.Multer.File {
  return {
    buffer,
    size: buffer.length,
    originalname: "photo.png",
    mimetype,
  } as Express.Multer.File;
}
function app(f: ReturnType<typeof fixture>, user = viewer()) {
  return createApp({
    db: f.db,
    config: { nodeEnv: "test", origin },
    integrationEnv: f.context.integrationEnv,
    sessionLoader: async (_db, token) => (token ? user : null),
  });
}

it("lets every account role upload, replace and remove photos without an Alumni record", async (t) => {
  const uploadDir = await mkdtemp(path.join(tmpdir(), "account-photos-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  for (const roles of [["super_admin"], ["faculty"], ["staff"], ["alumni"]]) {
    const f = fixture();
    f.context.integrationEnv.uploadDir = uploadDir;
    const server = app(f, viewer({ roles }));
    const first = await request(server)
      .post("/api/me/photo")
      .set("Authorization", "Bearer synthetic")
      .attach("file", png, "photo.png")
      .expect(201);
    const firstUrl = String((first.body as { image: string }).image);
    assert.match(firstUrl, /^\/api\/account-photos\/[a-f\d]{24}\/[a-f\d]{24}$/);
    const image = await request(server)
      .get(firstUrl)
      .set("Authorization", "Bearer synthetic")
      .expect(200);
    assert.match(String(image.headers["content-type"]), /image\/webp/);
    assert.match(String(image.headers["cache-control"]), /private, no-store/);
    assert.ok(isWebp(image.body as Buffer));
    const stored = f.tables.AccountPhoto![0]!;
    const storageKey = String(stored.storageKey);
    const next = await request(server)
      .post("/api/me/photo")
      .set("Authorization", "Bearer synthetic")
      .attach("file", png, "replacement.png")
      .expect(201);
    const nextUrl = (next.body as { image: string }).image;
    assert.notEqual(nextUrl, firstUrl);
    assert.ok(stored.deletedAt instanceof Date);
    await request(server).get(firstUrl).set("Authorization", "Bearer synthetic").expect(404);
    await request(server)
      .delete("/api/me/photo")
      .set("Authorization", "Bearer synthetic")
      .expect(200, { image: null });
    await request(server).get(nextUrl).set("Authorization", "Bearer synthetic").expect(404);
    assert.equal(f.tables.User![0]!.image, null);
    assert.ok(isWebp(await readFile(path.join(uploadDir, storageKey))));
    assert.equal(f.tables.EvidenceFile!.length, 1);
  }
});

it("syncs linked Alumni pointers, falls back to existing photos, and prevents resurrection on removal", async (t) => {
  const f = fixture(true);
  const uploadDir = await mkdtemp(path.join(tmpdir(), "account-photos-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  f.context.integrationEnv.uploadDir = uploadDir;
  assert.equal(
    (await loadAuthUser(f.db, userId))!.image,
    "/api/me/files/444444444444444444444444?preview=1",
  );
  const uploaded = await uploadAccountPhoto(f.context, file());
  assert.equal(f.tables.Alumni![0]!.photoUrl, uploaded.image);
  assert.equal((await loadAuthUser(f.db, userId))!.image, uploaded.image);
  await removeAccountPhoto(f.context);
  assert.equal(f.tables.Alumni![0]!.photoUrl, null);
  assert.equal((await loadAuthUser(f.db, userId))!.image, null);
  assert.equal(f.tables.EvidenceFile![0]!.deletedAt, null);
});

it("enforces owner and management access and blocks Alumni with legacy management grants", async (t) => {
  const f = fixture(true);
  const uploadDir = await mkdtemp(path.join(tmpdir(), "account-photos-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  f.context.integrationEnv.uploadDir = uploadDir;
  const { image } = await uploadAccountPhoto(f.context, file());
  const id = image.split("/").at(-1)!;
  for (const user of [
    viewer({ id: otherId }),
    viewer({ id: otherId, roles: ["alumni"], permissions: ["users.read", "alumni.read"] }),
  ]) {
    await assert.rejects(
      downloadAccountPhoto({ ...f.context, user }, userId, id),
      /Missing permission|only access My Profile/,
    );
  }
  // alumni.read alone is not enough: the viewer must also have the alumnus in scope, like the detail page.
  await assert.rejects(
    downloadAccountPhoto(
      { ...f.context, user: viewer({ id: otherId, permissions: ["alumni.read"] }) },
      userId,
      id,
    ),
    /Alumni record not found/,
  );
  for (const access of [
    { permissions: ["users.read"] },
    { permissions: ["alumni.read"], roles: ["super_admin"] },
  ]) {
    assert.deepEqual(
      (
        await downloadAccountPhoto(
          { ...f.context, user: viewer({ id: otherId, ...access }) },
          userId,
          id,
        )
      ).buffer as Buffer,
      await readFile(
        path.join(
          f.context.integrationEnv.uploadDir!,
          String(f.tables.AccountPhoto![0]!.storageKey),
        ),
      ),
    );
  }
  f.tables.User![0]!.alumniId = undefined;
  await assert.rejects(
    downloadAccountPhoto(
      { ...f.context, user: viewer({ id: otherId, permissions: ["alumni.read"] }) },
      userId,
      id,
    ),
  );
  await request(app(f)).get(image).expect(401);
});

it("rejects wrong contents, unsupported types, oversized uploads, and cross-origin cookie mutations", async () => {
  const f = fixture();
  await assert.rejects(
    uploadAccountPhoto(f.context, file(Buffer.from("not an image"))),
    /valid JPEG/,
  );
  await assert.rejects(uploadAccountPhoto(f.context, file(png, "image/svg+xml")), /valid JPEG/);
  await assert.rejects(uploadAccountPhoto(f.context, file(corruptPng)), /uncorrupted image/);
  await assert.rejects(
    uploadAccountPhoto(f.context, file(Buffer.alloc(MAX_ACCOUNT_PHOTO_BYTES + 1))),
    /10 MB/,
  );
  await request(app(f))
    .post("/api/me/photo")
    .set("Authorization", "Bearer synthetic")
    .attach("file", Buffer.from("bad"), "photo.png")
    .expect(400);
  await request(app(f))
    .post("/api/me/photo")
    .set("Authorization", "Bearer synthetic")
    .attach("file", Buffer.alloc(MAX_ACCOUNT_PHOTO_BYTES + 1), "photo.png")
    .expect(413);
  await request(app(f))
    .delete("/api/me/photo")
    .set("Cookie", "ats_session=synthetic")
    .set("Origin", "https://other.example.test")
    .expect(403);
  assert.equal(f.tables.AccountPhoto?.length ?? 0, 0);
});

it("rolls back current pointers and archive markers together when a transaction fails", async (t) => {
  const f = fixture(true);
  const uploadDir = await mkdtemp(path.join(tmpdir(), "account-photos-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  f.context.integrationEnv.uploadDir = uploadDir;
  const first = await uploadAccountPhoto(f.context, file());
  f.failTransaction(new Error("synthetic transaction failure"));
  await assert.rejects(uploadAccountPhoto(f.context, file()), /synthetic transaction/);
  assert.equal(f.tables.User![0]!.image, first.image);
  assert.equal(f.tables.Alumni![0]!.photoUrl, first.image);
  assert.equal(f.tables.AccountPhoto!.length, 1);
  assert.equal(f.tables.AccountPhoto![0]!.deletedAt, undefined);
  await assert.rejects(removeAccountPhoto(f.context), /synthetic transaction/);
  assert.equal(f.tables.User![0]!.image, first.image);
});

it("keeps retained legacy image upload/removal compatible with the canonical account avatar", async (t) => {
  const f = fixture(true);
  const uploadDir = await mkdtemp(path.join(tmpdir(), "account-photos-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  f.context.integrationEnv.uploadDir = uploadDir;
  await uploadAccountPhoto(f.context, file());
  const managed = f.tables.AccountPhoto![0]!;
  const legacyId = "555555555555555555555555";
  const legacyDb = new Proxy(f.db, {
    get(target, property) {
      if (property === "transaction")
        return (work: (db: typeof f.db) => Promise<unknown>) =>
          target.transaction(() => work(legacyDb));
      if (property === "EvidenceFile")
        return {
          ...target.EvidenceFile,
          create: async (data: Record<string, unknown>) => {
            f.tables.EvidenceFile!.push({ _id: legacyId, ...data });
            return { ...data, _id: { toHexString: () => legacyId, toString: () => legacyId } };
          },
        };
      return target[property as keyof typeof target];
    },
  });
  const context = { ...f.context, db: legacyDb };
  await uploadEvidence(context, { alumniId, kind: "image" }, file(), true);
  assert.equal(f.tables.User![0]!.image, `/api/files/${legacyId}`);
  assert.equal(f.tables.Alumni![0]!.photoUrl, `/api/files/${legacyId}`);
  assert.ok(managed.deletedAt instanceof Date);
  await filesService.remove(context, { id: "444444444444444444444444" }, true);
  assert.equal(f.tables.User![0]!.image, `/api/files/${legacyId}`);
  await filesService.remove(context, { id: legacyId }, true);
  assert.equal(f.tables.User![0]!.image, null);
  assert.equal(f.tables.Alumni![0]!.photoUrl, null);
  assert.equal((await loadAuthUser(f.db, userId))!.image, null);
});

it("refuses evidence beyond 50 files per alumnus before storing anything", async (t) => {
  const f = fixture(true);
  const uploadDir = await mkdtemp(path.join(tmpdir(), "evidence-cap-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  f.context.integrationEnv.uploadDir = uploadDir;
  f.tables.EvidenceFile = Array.from({ length: 50 }, (_, index) => ({
    _id: `e${index}`,
    alumniId,
    kind: "evidence",
    deletedAt: null,
  }));
  await assert.rejects(
    () => uploadEvidence(f.context, { alumniId, kind: "evidence" }, file(png, "image/png"), true),
    /at most 50 evidence files/,
  );
  assert.equal(f.tables.EvidenceFile.length, 50);
  assert.deepEqual(await readdir(uploadDir), [], "nothing stored on disk");
  // Removed files do not count: the upload gets past the cap (this fixture then stops later).
  f.tables.EvidenceFile[0]!.deletedAt = new Date();
  await assert.rejects(
    () => uploadEvidence(f.context, { alumniId, kind: "evidence" }, file(png, "image/png"), true),
    (error: Error) => !/at most 50 evidence files/.test(error.message),
  );
});

it("downloads evidence kept on imgBB or Google Drive as the real bytes, not {}", async () => {
  const f = fixture(true);
  f.tables.EvidenceFile = [
    {
      _id: "666666666666666666666666",
      alumniId,
      kind: "evidence",
      provider: "imgbb",
      url: "https://i.ibb.co/abc/proof.png",
      storageKey: "abc",
      originalName: "proof.png",
      mimeType: "image/png",
      deletedAt: null,
    },
  ];
  const original = globalThis.fetch;
  // The remote host answers with a stream, as fetch does for any real response body.
  globalThis.fetch = (async () =>
    new Response(new Blob([new Uint8Array(png)]).stream(), { status: 200 })) as typeof fetch;
  try {
    const response = await request(app(f, viewer({ alumniId })))
      .get("/api/me/files/666666666666666666666666")
      .set("Authorization", "Bearer synthetic")
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    assert.equal(response.headers["content-type"], "image/png");
    assert.ok(Buffer.compare(response.body as Buffer, png) === 0, "the file's own bytes");
  } finally {
    globalThis.fetch = original;
  }
});
