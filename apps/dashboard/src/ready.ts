// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface WaitForHealthOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 150;
const PROBE_TIMEOUT_MS = 1000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll a health URL until it responds OK or the timeout elapses; returns whether
 * the server became ready. Used to avoid opening the browser before the detached
 * server is actually listening (the connection-refused race). Dependencies (fetch,
 * clock, sleep) are injectable so the retry/timeout logic is deterministically
 * testable without real timers or sockets.
 */
export async function waitForHealth(
  url: string,
  options: WaitForHealthOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      if (res.ok) return true;
    } catch {
      /* not listening yet — retry until the deadline */
    }
    await sleep(intervalMs);
  }
  return false;
}
