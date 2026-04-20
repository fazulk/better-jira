interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export async function waitForHttpReady(
  url: string,
  { timeoutMs = 30_000, intervalMs = 250 }: WaitOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // Any HTTP response (including 4xx/5xx) means the server is listening.
      const response = await fetch(url, { method: "GET" });
      if (response.status >= 200 && response.status < 600) {
        return;
      }
    } catch {
      // Connection refused / socket error — still starting.
    }

    await sleep(intervalMs);
  }

  throw new Error(`timed out waiting for ${url} after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
