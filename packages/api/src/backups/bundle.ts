import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { open, type FileHandle } from "node:fs/promises";

/**
 * Encrypted backup container. Layout: "ATSBAK1\n", a 2-byte length + JSON header
 * ({ backupId, createdAt }, no secrets), then chunks of
 * [4-byte ciphertext length][1-byte final flag][12-byte IV][16-byte GCM tag][ciphertext].
 * Each chunk is AES-256-GCM sealed with AAD `ats-backup:v1:<backupId>:<index>:<final>`, so a
 * flipped byte, reordered or dropped chunk, truncation or trailing data fails before any
 * plaintext is used. Inside, records are [type][2-byte name length][name][8-byte length][data].
 */
const MAGIC = Buffer.from("ATSBAK1\n", "ascii");
const CHUNK_BYTES = 1024 * 1024;
export const RECORD = { manifest: 1, archive: 2, file: 3, digest: 4 } as const;
export type RecordType = (typeof RECORD)[keyof typeof RECORD];

const aad = (backupId: string, index: number, final: boolean) =>
  Buffer.from(`ats-backup:v1:${backupId}:${index}:${final ? 1 : 0}`, "utf8");

export class BundleWriter {
  private pending: Buffer[] = [];
  private size = 0;
  private index = 0;
  private constructor(
    private readonly handle: FileHandle,
    private readonly key: Buffer,
    private readonly backupId: string,
  ) {}

  static async create(path: string, key: Buffer, backupId: string, createdAt: Date) {
    const handle = await open(path, "wx", 0o600);
    const header = Buffer.from(JSON.stringify({ backupId, createdAt: createdAt.toISOString() }));
    const length = Buffer.alloc(2);
    length.writeUInt16BE(header.length);
    await handle.write(Buffer.concat([MAGIC, length, header]));
    return new BundleWriter(handle, key, backupId);
  }

  async record(type: RecordType, name: string, data: Buffer) {
    const nameBytes = Buffer.from(name, "utf8");
    const head = Buffer.alloc(11 + nameBytes.length);
    head.writeUInt8(type, 0);
    head.writeUInt16BE(nameBytes.length, 1);
    nameBytes.copy(head, 3);
    head.writeBigUInt64BE(BigInt(data.length), 3 + nameBytes.length);
    await this.push(head);
    await this.push(data);
  }

  async close() {
    await this.flush(true);
    await this.handle.close();
  }

  async abort() {
    await this.handle.close().catch(() => undefined);
  }

  private async push(data: Buffer) {
    this.pending.push(data);
    this.size += data.length;
    while (this.size >= CHUNK_BYTES) await this.flush(false);
  }

  private async flush(final: boolean) {
    const all = this.pending.length === 1 ? this.pending[0]! : Buffer.concat(this.pending);
    const plain = final ? all : all.subarray(0, CHUNK_BYTES);
    const rest = all.subarray(plain.length);
    this.pending = rest.length ? [rest] : [];
    this.size = rest.length;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(aad(this.backupId, this.index, final));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    const head = Buffer.alloc(5);
    head.writeUInt32BE(body.length);
    head.writeUInt8(final ? 1 : 0, 4);
    await this.handle.write(Buffer.concat([head, iv, cipher.getAuthTag(), body]));
    this.index++;
  }
}

export type BundleRecord = { type: RecordType; name: string; data: Buffer };

async function readExactly(handle: FileHandle, length: number, position: number) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : null;
}

export async function readBundleHeader(path: string) {
  const handle = await open(path, "r");
  try {
    const magic = await readExactly(handle, MAGIC.length + 2, 0);
    if (!magic || !magic.subarray(0, MAGIC.length).equals(MAGIC))
      throw new Error("Not a backup file.");
    const headerLength = magic.readUInt16BE(MAGIC.length);
    const headerBytes = await readExactly(handle, headerLength, MAGIC.length + 2);
    if (!headerBytes) throw new Error("Backup file is truncated.");
    const header = JSON.parse(headerBytes.toString("utf8")) as {
      backupId?: string;
      createdAt?: string;
    };
    if (!header.backupId || !header.createdAt) throw new Error("Backup header is incomplete.");
    return { backupId: header.backupId, createdAt: header.createdAt };
  } finally {
    await handle.close();
  }
}

/** Streams authenticated records to `onRecord`; throws on any integrity failure. */
export async function readBundle(
  path: string,
  key: Buffer,
  expectedBackupId: string,
  onRecord: (record: BundleRecord) => Promise<void> | void,
) {
  const handle = await open(path, "r");
  try {
    const magic = await readExactly(handle, MAGIC.length + 2, 0);
    if (!magic || !magic.subarray(0, MAGIC.length).equals(MAGIC))
      throw new Error("Not a backup file.");
    const headerLength = magic.readUInt16BE(MAGIC.length);
    const headerBytes = await readExactly(handle, headerLength, MAGIC.length + 2);
    const header = headerBytes
      ? (JSON.parse(headerBytes.toString("utf8")) as { backupId?: string })
      : {};
    if (header.backupId !== expectedBackupId)
      throw new Error("Backup file does not match its catalog entry.");
    let position = MAGIC.length + 2 + headerLength;
    let index = 0;
    let finalSeen = false;
    let buffered = Buffer.alloc(0);
    for (;;) {
      const head = await readExactly(handle, 33, position);
      if (!head) {
        const { bytesRead } = await handle.read(Buffer.alloc(1), 0, 1, position);
        if (bytesRead) throw new Error("Backup file is truncated.");
        break;
      }
      if (finalSeen) throw new Error("Backup file has trailing data.");
      const length = head.readUInt32BE(0);
      const final = head.readUInt8(4) === 1;
      if (length > CHUNK_BYTES + 16) throw new Error("Backup chunk is too large.");
      const body = await readExactly(handle, length, position + 33);
      if (!body) throw new Error("Backup file is truncated.");
      const decipher = createDecipheriv("aes-256-gcm", key, head.subarray(5, 17));
      decipher.setAAD(aad(expectedBackupId, index, final));
      decipher.setAuthTag(head.subarray(17, 33));
      const plain = Buffer.concat([decipher.update(body), decipher.final()]);
      position += 33 + length;
      index++;
      finalSeen = final;
      buffered = buffered.length ? Buffer.concat([buffered, plain]) : plain;
      // Emit every complete record in the authenticated plaintext seen so far.
      for (;;) {
        if (buffered.length < 3) break;
        const nameLength = buffered.readUInt16BE(1);
        if (buffered.length < 11 + nameLength) break;
        const dataLength = Number(buffered.readBigUInt64BE(3 + nameLength));
        const end = 11 + nameLength + dataLength;
        if (buffered.length < end) break;
        const type = buffered.readUInt8(0) as RecordType;
        if (!Object.values(RECORD).includes(type)) throw new Error("Unknown backup record.");
        const name = buffered.subarray(3, 3 + nameLength).toString("utf8");
        await onRecord({ type, name, data: buffered.subarray(11 + nameLength, end) });
        buffered = buffered.subarray(end);
      }
    }
    if (!finalSeen) throw new Error("Backup file is truncated.");
    if (buffered.length) throw new Error("Backup file ends inside a record.");
  } finally {
    await handle.close();
  }
}

/** Relative upload path from a file record, or an error for absolute or escaping names. */
export function safeRelativePath(name: string) {
  const parts = name.split("/");
  if (!name || name.startsWith("/") || /^[a-zA-Z]:/.test(name) || name.includes("\\"))
    throw new Error("Backup contains an invalid file path.");
  if (parts.some((part) => part === "" || part === "." || part === ".."))
    throw new Error("Backup contains an invalid file path.");
  return parts;
}
