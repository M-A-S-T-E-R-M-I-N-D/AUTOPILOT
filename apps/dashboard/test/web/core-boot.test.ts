// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CODE-SPLIT dynamic half (web/chunks.ts): on `/` the deferred chunks arrive
 * later (defer) — on a slow connection much later — so the CORE chunk alone
 * must boot the home page. Evaluating it with the deferred chunks entirely
 * absent is exactly that first paint; a bare call into a deferred module
 * would throw here. The static half (no unguarded cross-chunk calls) lives
 * in test/tooling/chunks.test.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { coreClientJs, renderShell } from '../../src/web/shell.js';

// A project whose card Details panel has a per-firing trace to draw. That
// trace (features/firing-timeline.ts) rides /panels.js, so core's own reads
// of its state maps must survive the chunk being absent.
const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 1, shipped: 1, openFindings: 0, cost: 0 },
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
      firings: 1,
      shipped: 1,
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      shipRate: 1,
      openFindings: 0,
      gauge: { critical: 0, high: 0, medium: 0, low: 0 },
      lastActivityAt: 1,
      activity: [
        { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 2, firingId: 'f1' },
      ],
      flightLog: [],
      tasks: [],
    },
  ],
};

describe('core chunk self-sufficiency', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('evaluating the CORE chunk alone throws nothing at load', () => {
    expect(() => new Function(coreClientJs())()).not.toThrow();
  });

  it('the CORE chunk alone paints a home card whose project has a per-firing trace', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (url: unknown) =>
      String(url).startsWith('/api/state')
        ? { ok: true, json: async () => STATE }
        : { ok: false, status: 404, json: async () => ({}) },
    ) as unknown as typeof fetch;

    new Function(coreClientJs())();
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector('article.card[data-project="p1"]')).not.toBeNull();
    expect((document.getElementById('updated')?.textContent ?? '').trim()).not.toBe(
      STRINGS.en['offlineRetrying'],
    );
  });
});
