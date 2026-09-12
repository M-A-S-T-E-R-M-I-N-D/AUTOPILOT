// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * TWO TICK LAWS for the fleet client (2026-09-12), from one incident: on a
 * project page, the very first state response landed BETWEEN the defer
 * scripts (/app.js had run, /project.js had not), `renderProjectPage` threw
 * a ReferenceError right after appending the back link, and the dirty-check
 * — its signature already recorded — skipped every identical tick after
 * it. The page stayed blank until the data changed; CI saw "flight log
 * never painted" three retries in a row and the phone's "six tabs" twice.
 *
 * 1. A tick that arrives before DOMContentLoaded waits for it — by then every
 *    defer script has executed.
 * 2. A render that throws never consumes the tick: the signature is
 *    forgotten, so the next identical tick tries again.
 *
 * Both are proved on a project page WITHOUT the project chunk, which is
 * exactly the incident's shape (`coreClientJs()` is /app.js alone): the render throws where the chunk's
 * functions should be, and `refresh()`'s catch paints the offline text.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, coreClientJs } from '../../src/web/shell.js';

const OFFLINE = STRINGS.en['offlineRetrying'];

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [
    {
      id: 'p1',
      slug: 'p1',
      name: 'p1',
      status: 'idle',
      createdAt: 1,
      primaryLanguage: 'typescript',
      fileCount: 1,
      totalBytes: 1,
      languages: [],
      topDirs: [],
      gate: 'js',
      backedUp: true,
      hotFiles: [],
      firings: 0,
      shipped: 0,
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      shipRate: 0,
      openFindings: 0,
      gauge: { critical: 0, high: 0, medium: 0, low: 0 },
      lastActivityAt: 1,
      activity: [],
      flightLog: [],
      tasks: [],
    },
  ],
};

// Same discipline as app-shell.test.ts: document.write keeps every listener
// the client registered on `document`/`window`; strip them between tests.
type Tracked = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const tracked: Tracked[] = [];
for (const target of [document, window] as EventTarget[]) {
  const native = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    tracked.push([target, type, listener, options]);
    return native(type, listener, options as AddEventListenerOptions | undefined);
  }) as typeof target.addEventListener;
}

function updatedText(): string {
  return (document.getElementById('updated')?.textContent ?? '').trim();
}

describe('fleet tick laws — a render that throws, a tick that arrives too early', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    document.open();
    document.write(renderShell('p1'));
    document.close();
    window.localStorage.clear();
    globalThis.fetch = vi.fn(async (url: unknown) =>
      String(url).startsWith('/api/state')
        ? { ok: true, json: async () => STATE }
        : { ok: false, status: 404, json: async () => ({}) },
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    for (const [target, type, listener, options] of tracked.splice(0)) {
      target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('a render that throws does not consume the tick — the next identical tick tries again', async () => {
    new Function(coreClientJs())();
    // Tick 1: the state lands, the project page's render throws where the
    // project chunk's functions should be, refresh() paints the offline text.
    await vi.advanceTimersByTimeAsync(0);
    expect(updatedText()).toBe(OFFLINE);

    // Tick 2 (the poll), same state: the render must be attempted AGAIN —
    // the head of renderFleet repaints "updated …", the body throws, and the
    // offline text returns. With the signature consumed by tick 1 the body
    // would have been skipped and "updated …" would have stayed.
    await vi.advanceTimersByTimeAsync(3000);
    expect(updatedText()).toBe(OFFLINE);
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('a tick that arrives before DOMContentLoaded waits for it', async () => {
    const before = updatedText();
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
    new Function(coreClientJs())();
    await vi.advanceTimersByTimeAsync(0);
    // The state fetch landed, but nothing rendered: no attempt, no throw, no offline text.
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
    expect(updatedText()).toBe(before);

    expect(document.querySelector('main#fleet .back')).toBeNull();

    // Every defer script has run: the waiting tick applies. On this chunk-less
    // project page it appends the back link and then throws (outside
    // refresh()'s catch, so jsdom reports it as an uncaught error — silenced
    // here); the back link is the proof the tick ran only now.
    window.addEventListener('error', (e) => e.preventDefault());
    delete (document as unknown as { readyState?: unknown }).readyState;
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('main#fleet .back')).not.toBeNull();
    expect(updatedText()).not.toBe(before);
  });
});
