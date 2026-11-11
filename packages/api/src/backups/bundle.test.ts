import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { BundleWriter, RECORD, readBundle, safeRelativePath, type BundleRecord } from "./bundle";

const key = Buffer.from("7a".repeat(32), "hex");
const id = "20261109000000-0a1b2c3d";
const dir = await mkdtemp(path.join(tmpdir(), "ats-bundle-"));
after(() => rm(dir, { recursive: true, force: true }));
const archive = randomBytes(1024 * 1024 * 2 + 777);

async function sample(name = "sample.atsbak") {
  const file = path.join(dir, name);
  const writer = await BundleWriter.create(file, key, id, new Date());
  await writer.record(RECORD.manifest, "manifest.json", Buffer.from('{"backupId":"x"}'));
  for (let offset = 0; offset < archive.length; offset += 65536)
    await writer.record(RECORD.archive, "", archive.subarray(offset, offset + 65536));
  await writer.record(RECORD.file, "evidence/a.pdf", Buffer.from("first file"));
  await writer.record(RECORD.file, "photos/b.png", Buffer.from("second file"));
  await writer.record(RECORD.digest, "digest.json", Buffer.from("{}"));
  await writer.close();
  return file;
}
async function records(file: string, readKey = key, readId = id) {
  const seen: BundleRecord[] = [];
  await readBundle(file, readKey, readId, (record) => {
    seen.push({ ...record, data: Buffer.from(record.data) });
  });
  return seen;
}
/** Chunk boundaries: [offset, length] of each sealed chunk after the header. */
async function chunks(file: string) {
  const bytes = await readFile(file);
  let position = 8 + 2 + bytes.readUInt16BE(8);
  const found: [number, number][] = [];
  while (position < bytes.length) {
    const length = 33 + bytes.readUInt32BE(position);
    found.push([position, length]);
    position += length;
  }
  return { bytes, found };
}

it("round-trips records across several 1 MiB chunks without plaintext on disk", async () => {
  const file = await sample();
  const seen = await records(file);
  assert.deepEqual(
    Buffer.concat(seen.filter((r) => r.type === RECORD.archive).map((r) => r.data)),
    archive,
  );
  assert.deepEqual(
    seen.filter((r) => r.type === RECORD.file).map((r) => [r.name, r.data.toString()]),
    [
      ["evidence/a.pdf", "first file"],
      ["photos/b.png", "second file"],
    ],
  );
  assert.equal(seen[0]!.type, RECORD.manifest);
  assert.equal(seen.at(-1)!.type, RECORD.digest);
  const { bytes, found } = await chunks(file);
  assert.ok(found.length >= 3);
  assert.ok(!bytes.includes(Buffer.from("first file")));
});

it("rejects tampering, reordering, truncation, trailing bytes, the wrong key and the wrong id", async () => {
  const file = await sample("tamper.atsbak");
  const { bytes, found } = await chunks(file);
  const write = async (name: string, data: Buffer) => {
    const target = path.join(dir, name);
    await writeFile(target, data);
    return target;
  };
  const flipped = Buffer.from(bytes);
  flipped[found[1]![0] + 40]! ^= 1;
  const [first, second] = [found[0]!, found[1]!];
  const swapped = Buffer.concat([
    bytes.subarray(0, first[0]),
    bytes.subarray(second[0], second[0] + second[1]),
    bytes.subarray(first[0], first[0] + first[1]),
    bytes.subarray(second[0] + second[1]),
  ]);
  const last = found.at(-1)!;
  for (const broken of [
    await write("flip.atsbak", flipped),
    await write("swap.atsbak", swapped),
    await write("drop-final.atsbak", bytes.subarray(0, last[0])),
    await write("cut.atsbak", bytes.subarray(0, bytes.length - 5)),
    await write("trailing.atsbak", Buffer.concat([bytes, Buffer.from("extra")])),
  ])
    await assert.rejects(() => records(broken));
  await assert.rejects(() => records(file, Buffer.from("7b".repeat(32), "hex")));
  await assert.rejects(() => records(file, key, "20261109000000-ffffffff"));
});

it("rejects file records that are absolute or escape the upload directory", () => {
  assert.deepEqual(safeRelativePath("evidence/a.pdf"), ["evidence", "a.pdf"]);
  for (const name of ["../x", "/abs", "a/../../b", "C:/x", String.raw`a\b`, "", "a//b"])
    assert.throws(() => safeRelativePath(name), name);
});
