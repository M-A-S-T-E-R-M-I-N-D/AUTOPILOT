// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { waitForHealth } from '../src/ready.js';

/** A deterministic monotonic clock advancing `step` ms per read (no real timers). */
function makeClock(step = 5): () => number {
  let t = 0;
  return () => {
    const value = t;
    t += step;
    return value;
  };
}

const noSleep = async (): Promise<void> => {};

function okResponse(): Response {
  return new Response('{"ok":true}', { status: 200 });
}

describe('waitForHealth', () => {
  it('resolves true when the first probe is OK', async () => {
    const fetchImpl = (async () => okResponse()) as unknown as typeof fetch;
    const ready = await waitForHealth('http://x/api/health', {
      fetchImpl,
      sleep: noSleep,
      now: makeClock(),
    });
    expect(ready).toBe(true);
  });

  it('retries until the (still-starting) server becomes ready', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls < 3) throw new Error('ECONNREFUSED');
      return okResponse();
    }) as unknown as typeof fetch;

    const ready = await waitForHealth('http://x/api/health', {
      fetchImpl,
      sleep: noSleep,
      now: makeClock(),
      intervalMs: 1,
    });
    expect(ready).toBe(true);
    expect(calls).toBe(3);
  });

  it('treats a non-OK status as not-ready and keeps polling', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('starting', { status: 503 });
    }) as unknown as typeof fetch;

    const ready = await waitForHealth('http://x/api/health', {
      fetchImpl,
      sleep: noSleep,
      now: makeClock(10),
      timeoutMs: 30,
    });
    expect(ready).toBe(false);
    expect(calls).toBeGreaterThan(0);
  });

  it('resolves false when the deadline passes without readiness', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const ready = await waitForHealth('http://x/api/health', {
      fetchImpl,
      sleep: noSleep,
      now: makeClock(10),
      timeoutMs: 30,
      intervalMs: 10,
    });
    expect(ready).toBe(false);
  });

  it('never probes once now() has already reached the deadline (now() < deadline boundary)', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return okResponse();
    }) as unknown as typeof fetch;

    // A fixed clock and a zero timeout make now() === deadline on the very
    // first loop check — the loop must not run at all.
    const ready = await waitForHealth('http://x/api/health', {
      fetchImpl,
      sleep: noSleep,
      now: () => 100,
      timeoutMs: 0,
    });
    expect(ready).toBe(false);
    expect(calls).toBe(0);
  });

  it('uses the injected intervalMs (not the default) as the real setTimeout delay', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls < 2) throw new Error('ECONNREFUSED');
      return okResponse();
    }) as unknown as typeof fetch;

    const ready = await waitForHealth('http://x/api/health', {
      fetchImpl,
      intervalMs: 1,
    });

    expect(ready).toBe(true);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1);
    setTimeoutSpy.mockRestore();
  });

  it('passes an AbortSignal timeout on every health probe request', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return okResponse();
    }) as unknown as typeof fetch;

    await waitForHealth('http://x/api/health', {
      fetchImpl,
      sleep: noSleep,
      now: makeClock(),
    });

    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to a real timer-based sleep when none is injected', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls < 2) throw new Error('ECONNREFUSED');
      return okResponse();
    }) as unknown as typeof fetch;

    const ready = await waitForHealth('http://x/api/health', {
      fetchImpl,
      intervalMs: 5,
    });
    expect(ready).toBe(true);
    expect(calls).toBe(2);
  });

  it('falls back to the real global fetch when none is injected (connection refused, times out false)', async () => {
    const ready = await waitForHealth('http://127.0.0.1:1/never', {
      sleep: noSleep,
      now: makeClock(10),
      timeoutMs: 20,
      intervalMs: 10,
    });
    expect(ready).toBe(false);
  });
});
