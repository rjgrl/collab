import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveDatabaseUrl } from "./config";

const local = "mongodb://127.0.0.1:27018/config_test?replicaSet=rs0";
const cloudUrl = new URL("mongodb+srv://cluster.example.test/alumni_tracking");
cloudUrl.username = "synthetic";
cloudUrl.password = "SECRET";
const cloud = cloudUrl.toString();

it("resolves MONGO_URI and preserves the legacy configuration contract", () => {
  assert.equal(resolveDatabaseUrl({ MONGO_URI: cloud }), cloud);
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: local }), local);
  assert.equal(resolveDatabaseUrl({ MONGO_URI: cloud, DATABASE_URL: cloud }), cloud);
  assert.equal(resolveDatabaseUrl({ MONGO_URI: ` ${cloud} ` }), cloud);
  assert.equal(resolveDatabaseUrl({ MONGO_URI: "", DATABASE_URL: local }), local);
});

it("refuses missing, conflicting or invalid settings without credentials or a fallback", () => {
  for (const config of [
    {},
    { MONGO_URI: " " },
    { MONGO_URI: cloud, DATABASE_URL: local },
    { MONGO_URI: "invalid-secret-value" },
  ])
    assert.throws(
      () => resolveDatabaseUrl(config),
      (error) =>
        error instanceof Error &&
        !error.message.includes("SECRET") &&
        !error.message.includes("invalid-secret-value") &&
        /MONGO_URI/.test(error.message),
    );
});
