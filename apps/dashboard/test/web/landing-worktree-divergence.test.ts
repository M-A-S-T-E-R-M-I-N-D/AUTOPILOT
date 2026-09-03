// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * SYNC-BACK SURFACING UI (web-msvbzahx-uiemjb, follow-up of web-msupuosk-gjll3p
 * / `a81221f`): `readLandingInfo` has computed `worktreeAhead` and
 * `landing-panel.ts`'s `landingWorktreeDivergence` has formatted its warning
 * text since the prior slice, but `renderLandingBody` never called it — the
 * LANDING card stayed silent about commits stranded on the flight worktree.
 * These tests drive the REAL served client bundle in jsdom to prove the
 * warning now actually reaches the DOM, including the exact scenario that
 * motivated it: a checkout that is level with base (nothing in `commits`)
 * while commits sit stranded on the worktree branch, previously invisible
 * because the card only ever read the checked-out branch.
 */

import { describe, it, expect, vi } from 'vitest';
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

function boot(landing: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn((url: string) => {
    if (url.includes('/api/landing')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ landing }),
      } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => STATE } as unknown as Response);
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('LANDING card worktree-divergence warning (web-msvbzahx-uiemjb)', () => {
  it('renders the stranded-commits warning when commits sit unmerged AND worktreeAhead is non-empty', async () => {
    boot({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: land me', files: ['a.ts'] }],
      diffstat: { filesChanged: 1, insertions: 5, deletions: 1 },
      worktreeAhead: [{ sha: 'e4f5g6h' }, { sha: 'i7j8k9l' }],
    });

    const warning = await vi.waitFor(() => {
      const el = document.querySelector('.landing-worktree-divergence');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(warning.textContent).toContain('2 commits stranded on the flight worktree');
    expect(warning.getAttribute('role')).toBe('alert');
  });

  it('renders the warning even when the checkout is level with base (nothing else to land) — the motivating blind spot', async () => {
    boot({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [],
      diffstat: { filesChanged: 0, insertions: 0, deletions: 0 },
      worktreeAhead: [{ sha: 'e4f5g6h' }],
    });

    const warning = await vi.waitFor(() => {
      const el = document.querySelector('.landing-worktree-divergence');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(warning.textContent).toContain('1 commit stranded on the flight worktree');
    // The "nothing to land" fallback still applies to the commit list itself.
    expect(document.querySelector('.landing-body')?.textContent).toContain('Nothing to land');
  });

  it('renders nothing when worktreeAhead is empty (in sync)', async () => {
    boot({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: land me', files: ['a.ts'] }],
      diffstat: { filesChanged: 1, insertions: 5, deletions: 1 },
      worktreeAhead: [],
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });
    expect(document.querySelector('.landing-worktree-divergence')).toBeNull();
  });
});
