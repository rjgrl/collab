import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readPrivateFile, validateEvidence } from "./integrations/files";

it("rejects spoofed MIME metadata, executable content, and empty evidence", async () => {
  assert.equal(
    await validateEvidence(Buffer.from("<script>alert(1)</script>"), "image/png"),
    false,
  );
  assert.equal(await validateEvidence(Buffer.from("<html>x</html>"), "text/csv"), false);
  assert.equal(await validateEvidence(Buffer.alloc(0), "application/pdf"), false);
  assert.equal(
    await validateEvidence(Buffer.from("%PDF-1.7\nsynthetic\n"), "application/pdf"),
    true,
  );
  assert.equal(await validateEvidence(Buffer.from("name,status\nTest,tracked"), "text/csv"), true);
});
it("contains local file reads within private storage", async (t) => {
  const fixture = await mkdtemp(path.join(tmpdir(), "collab-files-"));
  const uploadDir = path.join(fixture, "private");
  await mkdir(uploadDir);
  await writeFile(path.join(fixture, "outside"), "private");
  await writeFile(path.join(uploadDir, "evidence"), "synthetic");
  t.after(async () => {
    await unlink(path.join(fixture, "outside"));
    await unlink(path.join(uploadDir, "evidence"));
    await rmdir(uploadDir);
    await rmdir(fixture);
  });
  await assert.rejects(
    () =>
      readPrivateFile({ uploadDir }, { provider: "local", storageKey: "../outside", url: null }),
    /Invalid storage key/,
  );
  assert.equal(
    String(
      await readPrivateFile(
        { uploadDir },
        { provider: "local", storageKey: "evidence", url: null },
      ),
    ),
    "synthetic",
  );
});
it("does not fetch arbitrary stored image URLs", async () => {
  await assert.rejects(
    () =>
      readPrivateFile(
        {},
        { provider: "imgbb", storageKey: "synthetic", url: "http://127.0.0.1/private" },
      ),
    /Invalid image host/,
  );
});
