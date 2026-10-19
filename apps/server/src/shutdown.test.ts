import assert from "node:assert/strict";
import { it } from "node:test";
import { drainAndDisconnect } from "./shutdown";
import { createServer } from "node:http";
import { once } from "node:events";
it("finishes an in-flight TCP response before disconnecting dependencies", async () => {
  let finishResponse: (() => void) | undefined;
  const events: string[] = [];
  const server = createServer((_request, response) => {
    finishResponse = () => response.end("complete");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const reached = once(server, "request");
    const pending = fetch(`http://127.0.0.1:${address.port}`, {
      headers: { Connection: "close" },
      signal: AbortSignal.timeout(3000),
    });
    await reached;
    const shutdown = drainAndDisconnect(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
      async () => {
        events.push("disconnect");
      },
      () => server.closeAllConnections(),
      3000,
    );
    assert.deepEqual(events, []);
    finishResponse!();
    assert.equal(await (await pending).text(), "complete");
    await shutdown;
    assert.deepEqual(events, ["disconnect"]);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
it("drains requests before disconnecting the database", async () => {
  const events: string[] = [];
  await drainAndDisconnect(
    async () => {
      events.push("drain");
    },
    async () => {
      events.push("disconnect");
    },
    () => {
      events.push("force");
    },
  );
  assert.deepEqual(events, ["drain", "disconnect"]);
});
it("forces stalled request closure and disconnects on drain timeout", async () => {
  const events: string[] = [];
  await assert.rejects(
    () =>
      drainAndDisconnect(
        () => new Promise(() => {}),
        async () => {
          events.push("disconnect");
        },
        () => {
          events.push("force");
        },
        10,
      ),
    /timed out/,
  );
  assert.deepEqual(events, ["force", "disconnect"]);
});
