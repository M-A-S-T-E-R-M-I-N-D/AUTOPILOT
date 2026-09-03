// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression trip-wire for a documented hand-sync risk (epic 0002 "shell
 * decomposition", slice 1): `web/shell.ts`'s client-side `firingCallsign` is
 * a hand-written mirror of `read/fleet.ts`'s server-side `firingCallsign` —
 * the CALLSIGN_WORDS list and hash loop are copy-pasted, not shared, because
 * the client ships as a plain string (no bundler/framework, CSP `self`-only).
 * Both copies carry a "keep in sync or the SAME firing renders two names"
 * comment, but nothing enforced it — no test ever drove the REAL client
 * bundle and compared its rendered callsign against the server's own
 * function. This closes that gap: it renders the live worker card through
 * `clientJs()` (the exact bytes served as /app.js) and asserts the DOM text
 * equals `firingCallsign()` computed from the server module, for several
 * ids — including the numbered and unnumbered branches. A future edit to
 * either copy's word list or hash (without updating the other) fails this
 * test instead of silently drifting.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { firingCallsign } from '../../src/read/fleet.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

const BASE_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  flightLog: [],
  tasks: [],
};

function stateWithLiveFiring(firingId: string) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [
      {
        ...BASE_PROJECT,
        activity: [
          {
            tool: 'Bash',
            target: 'pnpm run test',
            kind: 'command',
            phase: 'gate',
            at: 1,
            firingId,
          },
        ],
      },
    ],
    empty: false,
  };
}

async function renderedCallsign(firingId: string): Promise<string | null> {
  vi.useFakeTimers();
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({ ok: true, json: async () => stateWithLiveFiring(firingId) }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
  const text = document.querySelector('.live-callsign')?.textContent ?? null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  return text;
}

describe('client-side firingCallsign stays in sync with the server copy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['p1:firing-3', 'p1:firing-9', 'firing-427', 'no-number-here'])(
    'renders the exact server-computed callsign for %s',
    async (firingId) => {
      expect(await renderedCallsign(firingId)).toBe(firingCallsign(firingId));
    },
  );
});
