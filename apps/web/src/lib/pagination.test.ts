import assert from "node:assert/strict";
import { it } from "node:test";
import { collectOptionPages } from "./pagination";

it("loads later option pages, including the last short page", async () => {
  const calls: number[] = [];
  const result = await collectOptionPages(async (page) => {
    calls.push(page);
    return page <= 2
      ? Array.from({ length: 100 }, (_, index) => (page - 1) * 100 + index)
      : [200, 201];
  });
  assert.equal(result.length, 202);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(result.at(-1), 201);
});
it("does not silently return a partial list when a later page fails", async () => {
  await assert.rejects(
    () =>
      collectOptionPages(async (page) => {
        if (page === 2) throw new Error("Request failed");
        return [1, 2];
      }, 2),
    /Request failed/,
  );
});
