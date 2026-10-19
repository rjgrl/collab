export async function drainAndDisconnect(
  close: () => Promise<void>,
  disconnect: () => Promise<void>,
  forceClose: () => void,
  timeoutMs = 10_000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      close(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          forceClose();
          reject(new Error("Request drain timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await disconnect();
  }
}
