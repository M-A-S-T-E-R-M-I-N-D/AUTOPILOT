// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Landing EXECUTE v3's last flagged gap (web-msnqeegt-ki7dm0): a successful
 * self-hosted land fires a fire-and-forget rebuild+restart server-side, but
 * the LANDING panel showed no affordance for it — the result line just said
 * "Landed" and the panel would race a normal /api/landing fetch against the
 * server that was about to swap itself out mid-poll. These tests drive the
 * REAL served client bundle in jsdom to prove the panel now says so, and
 * keeps saying so across re-renders until the grace period lapses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

const LANDING = {
  branch: 'autopilot/flight',
  base: 'main',
  commits: [{ shortSha: 'a1b2c3d', subject: 'feat: land me', files: ['a.ts'] }],
  diffstat: { filesChanged: 1, insertions: 5, deletions: 1 },
};

function boot(executeResponse: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn((url: string) => {
    if (url === '/api/landing/execute') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => executeResponse,
      } as unknown as Response);
    }
    // Durable landing jobs (2026-08-30): the panel learns a land's OUTCOME
    // from the job endpoint, not from the execute POST's own promise — the
    // POST routinely outlives the button that sent it. Mirror the server:
    // the job carries the same verdict the execute call returned.
    if (url.startsWith('/api/landing/job')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          job: {
            projectId: 'p1',
            phase: 'finished',
            startedAt: 1,
            updatedAt: 2,
            steps: [],
            attempts: 1,
            result: executeResponse,
          },
        }),
      } as unknown as Response);
    }
    if (url.includes('/api/landing')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ landing: LANDING }),
      } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => STATE } as unknown as Response);
  }) as unknown as typeof fetch;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  new Function(clientJs())();
}

describe('LANDING EXECUTE self-restart affordance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a rebuilding affordance and keeps it across re-renders when restarting is true', async () => {
    boot({ ok: true, reason: 'landed', details: 'merged.', restarting: true });
    await vi.advanceTimersByTimeAsync(1);

    const button = document.querySelector('[data-land-execute]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button!.click();
    await vi.advanceTimersByTimeAsync(1);

    // renderFleet normally skips its rebuild when the polled data is unchanged
    // (a land alone doesn't move firings/cost) — the click handler must force
    // the repaint itself, so the affordance appears immediately, not on the
    // next incidental poll tick.
    let status = document.querySelector('.landing-restarting');
    expect(status?.textContent).toContain('rebuilding & restarting');
    expect(status?.getAttribute('role')).toBe('status');
    expect(document.querySelector('[data-land-execute]')).toBeNull(); // panel replaced, no stray button

    // Still inside the grace period on the next poll tick: must keep showing
    // the affordance instead of racing a fresh /api/landing fetch.
    await vi.advanceTimersByTimeAsync(3000);
    status = document.querySelector('.landing-restarting');
    expect(status?.textContent).toContain('rebuilding & restarting');

    // Once the grace period lapses, normal fetching resumes.
    await vi.advanceTimersByTimeAsync(20000);
    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });
    expect(document.querySelector('.landing-restarting')).toBeNull();
  });

  it('does NOT show the rebuilding affordance for a normal (non-self-hosted) land', async () => {
    boot({ ok: true, reason: 'landed', details: 'merged.', restarting: false });
    await vi.advanceTimersByTimeAsync(1);

    const button = document.querySelector('[data-land-execute]') as HTMLButtonElement | null;
    button!.click();
    await vi.advanceTimersByTimeAsync(1);

    const resultEl = document.querySelector('.landing-result');
    expect(resultEl?.textContent).toBe('✓ Landed — merged.');
    expect(document.querySelector('.landing-restarting')).toBeNull();
  });
});
