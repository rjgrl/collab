import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { it } from "node:test";
import sharp from "sharp";
import {
  driveStore,
  imageStore,
  imgbbStore,
  prepareProfileImage,
  storeFile,
  PROFILE_IMAGE_MAX_EDGE,
} from "./files";

type Call = { url: string; init?: RequestInit };
function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fn, calls };
}
const serviceAccount = JSON.stringify({
  client_email: "uploader@project.iam.gserviceaccount.test",
  private_key: generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
});
const upload = {
  buffer: Buffer.from("synthetic"),
  mimeType: "application/pdf",
  originalName: "proof.pdf",
};

it("uploads to imgBB with the documented parameters and keeps the delete URL", async () => {
  const net = fakeFetch(() =>
    Response.json({
      success: true,
      data: {
        id: "2ndCYJK",
        url: "https://i.ibb.co/x/a.webp",
        delete_url: "https://ibb.co/2ndCYJK/del",
      },
    }),
  );
  const stored = await imgbbStore("synthetic-key", net.fn).put({
    ...upload,
    mimeType: "image/webp",
  });
  assert.equal(net.calls[0]!.url, "https://api.imgbb.com/1/upload");
  assert.equal(net.calls[0]!.init?.method, "POST");
  const body = new URLSearchParams(String(net.calls[0]!.init?.body));
  assert.equal(body.get("key"), "synthetic-key");
  assert.equal(body.get("image"), upload.buffer.toString("base64"));
  assert.equal(body.get("name"), "proof.pdf");
  assert.deepEqual(
    {
      provider: stored.provider,
      storageKey: stored.storageKey,
      url: stored.url,
      deleteUrl: stored.deleteUrl,
    },
    {
      provider: "imgbb",
      storageKey: "2ndCYJK",
      url: "https://i.ibb.co/x/a.webp",
      deleteUrl: "https://ibb.co/2ndCYJK/del",
    },
  );
  const rejected = fakeFetch(() => Response.json({ success: false }));
  await assert.rejects(() => imgbbStore("k", rejected.fn).put(upload), /rejected/);
});

it("uploads to a Shared Drive folder privately and fails loudly", async () => {
  const net = fakeFetch((url) =>
    url.startsWith("https://oauth2.googleapis.com/token")
      ? Response.json({ access_token: "synthetic-token" })
      : Response.json({ id: "drive-file-1" }),
  );
  const env = { googleServiceAccountJson: serviceAccount, googleDriveFolderId: "folder-1" };
  const stored = await driveStore(env, net.fn).put(upload);
  assert.equal(stored.storageKey, "drive-file-1");
  const create = net.calls[1]!;
  const url = new URL(create.url);
  assert.equal(url.searchParams.get("supportsAllDrives"), "true");
  assert.equal(url.searchParams.get("uploadType"), "multipart");
  const createBody = create.init?.body;
  assert.ok(createBody);
  assert.match(String((createBody as Buffer).toString()), /"parents":\["folder-1"\]/);
  assert.equal(
    net.calls.some((c) => c.url.includes("/permissions")),
    false,
    "never shares files",
  );
  assert.equal(stored.url, undefined, "no web link is stored");
  const failing = fakeFetch((u) =>
    u.startsWith("https://oauth2")
      ? Response.json({ access_token: "t" })
      : new Response("", { status: 403 }),
  );
  await assert.rejects(
    () => driveStore(env, failing.fn).put(upload),
    /Google Drive upload failed: 403/,
  );
});

it("never falls back to local disk when the configured Drive store fails", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 500 }));
  await assert.rejects(() =>
    storeFile(
      {
        googleServiceAccountJson: serviceAccount,
        googleDriveFolderId: "folder-1",
        uploadDir: "/nonexistent",
      },
      upload,
    ),
  );
});

it("picks the image host from IMAGE_HOST_PROVIDER and keeps evidence off public hosts", () => {
  assert.equal(imageStore({ imgbbApiKey: "k" }).provider, "imgbb");
  assert.equal(imageStore({ imgbbApiKey: "k", imageHostProvider: "local" }).provider, "local");
  assert.equal(
    imageStore({
      imgbbApiKey: "k",
      imageHostProvider: "google_drive",
      googleServiceAccountJson: "{}",
      googleDriveFolderId: "f",
    }).provider,
    "google_drive",
  );
  assert.equal(imageStore({}).provider, "local");
  assert.throws(() => imageStore({ imageHostProvider: "s3" }), /IMAGE_HOST_PROVIDER/);
});

it("resizes, re-encodes and strips metadata from profile images", async () => {
  const big = await sharp({
    create: { width: 3000, height: 1500, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .jpeg()
    .withExif({ IFD0: { Copyright: "synthetic-private-metadata" } })
    .toBuffer();
  assert.ok((await sharp(big).metadata()).exif, "fixture carries EXIF");
  const out = await prepareProfileImage({
    buffer: big,
    mimeType: "image/jpeg",
    originalName: "me.jpg",
  });
  const meta = await sharp(out.buffer).metadata();
  assert.equal(out.mimeType, "image/webp");
  assert.equal(out.originalName, "me.webp");
  assert.equal(meta.format, "webp");
  assert.equal(Math.max(meta.width!, meta.height!), PROFILE_IMAGE_MAX_EDGE);
  assert.equal(meta.exif, undefined, "metadata stripped");
  assert.ok(out.buffer.length < big.length);
  const small = await sharp({
    create: { width: 200, height: 100, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (
      await sharp(
        (await prepareProfileImage({ buffer: small, mimeType: "image/png", originalName: "s.png" }))
          .buffer,
      ).metadata()
    ).width,
    200,
    "never enlarged",
  );
  await assert.rejects(() =>
    prepareProfileImage({
      buffer: Buffer.from("not an image"),
      mimeType: "image/png",
      originalName: "x.png",
    }),
  );
});
