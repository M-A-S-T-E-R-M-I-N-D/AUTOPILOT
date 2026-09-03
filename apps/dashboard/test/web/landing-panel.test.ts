// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The post-flight LANDING card (web-msm59yvg-hk7hkw): the project page's inside
 * page fetches GET /api/landing on demand and renders the checked-out branch's
 * unmerged commits + diffstat against its base. These tests drive the REAL
 * served client bundle in jsdom against a URL-aware mocked fetch.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { landingWorktreeDivergence, landingJobLine } from '../../src/web/landing-panel.js';

describe('landingWorktreeDivergence (web-msvbzahx-uiemjb)', () => {
  it('warns with a pluralized count when commits are stranded on the flight worktree', () => {
    const text = landingWorktreeDivergence([{ sha: 'a1b2c3d' }, { sha: 'e4f5g6h' }]);
    expect(text).toContain('2 commits');
    expect(text).toContain('stranded');
  });

  it('uses the singular form for exactly one stranded commit', () => {
    expect(landingWorktreeDivergence([{ sha: 'a1b2c3d' }])).toContain('1 commit ');
  });

  it('returns null when nothing is stranded', () => {
    expect(landingWorktreeDivergence([])).toBeNull();
  });
});

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

function bootWithLanding(landing: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/landing')) {
      return { ok: true, json: async () => ({ landing }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the post-flight LANDING card', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the branch, base, diffstat, and unmerged commits', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [
        { shortSha: 'a1b2c3d', subject: 'feat: add landing card', files: ['a.ts', 'b.ts'] },
        { shortSha: 'e5f6a7b', subject: 'fix: typo', files: ['c.ts'] },
      ],
      diffstat: { filesChanged: 3, insertions: 42, deletions: 7 },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });

    expect(document.querySelector('.landing-branch-name')?.textContent).toBe('autopilot/flight');
    expect(document.querySelector('.landing-base-name')?.textContent).toBe('main');
    const chips = Array.from(document.querySelectorAll('.landing-diffstat .chip')).map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(['3 files', '+42', '-7']);
    const rows = document.querySelectorAll('.landing-commit');
    expect(rows).toHaveLength(2);
    const first = rows[0] as HTMLLIElement;
    expect(first.querySelector('.landing-commit-sha')?.textContent).toBe('a1b2c3d');
    expect(first.querySelector('.landing-commit-subject')?.textContent).toBe(
      'feat: add landing card',
    );
    expect(first.querySelector('.landing-commit-files')?.textContent).toBe('2 files');
  });

  it('makes the branch, base, each commit sha, and each commit subject explain themselves on hover/focus', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [
        { shortSha: 'a1b2c3d', subject: 'feat: add landing card', files: ['a.ts', 'b.ts'] },
      ],
      diffstat: { filesChanged: 1, insertions: 5, deletions: 1 },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });

    const branchName = document.querySelector('.landing-branch-name');
    expect(branchName?.getAttribute('tabindex')).toBe('0');
    expect(branchName?.getAttribute('data-tip')).toBeTruthy();
    expect(branchName?.getAttribute('aria-label')).toContain('autopilot/flight');

    // Roving reality (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only
    // the line/row's leading field is a Tab stop; the rest still self-explain
    // via data-tip/aria-label but start at -1 until the roving stop moves.
    const baseName = document.querySelector('.landing-base-name');
    expect(baseName?.getAttribute('tabindex')).toBe('-1');
    expect(baseName?.getAttribute('data-tip')).toBeTruthy();
    expect(baseName?.getAttribute('aria-label')).toContain('main');

    const sha = document.querySelector('.landing-commit-sha');
    expect(sha?.getAttribute('tabindex')).toBe('0');
    expect(sha?.getAttribute('data-tip')).toBeTruthy();
    expect(sha?.getAttribute('aria-label')).toContain('a1b2c3d');

    const subject = document.querySelector('.landing-commit-subject');
    expect(subject?.getAttribute('tabindex')).toBe('-1');
    expect(subject?.getAttribute('data-tip')).toBe('What this commit changed');
    expect(subject?.getAttribute('aria-label')).toContain('feat: add landing card');

    const arrow = document.querySelector('.landing-branch-arrow');
    expect(arrow?.getAttribute('tabindex')).toBe('-1');
    expect(arrow?.getAttribute('data-tip')).toBeTruthy();
    expect(arrow?.getAttribute('aria-label')).toBeTruthy();
  });

  it('shows an honest "nothing to land" state when the branch is level with its base', async () => {
    bootWithLanding(null);

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-panel')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.landing-body')?.textContent).toContain('Nothing to land');
    });
    expect(document.querySelector('.landing-commits')).toBeNull();
  });

  it('warns when a sibling flight branch has its own unlanded work touching the same file (fleet anti-duplication, defense-stack item 3)', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: touch shared.txt', files: ['shared.txt'] }],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
      overlaps: [{ branch: 'autopilot/flight-worktree-p1--fleet-2', files: ['shared.txt'] }],
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-overlap')).not.toBeNull();
    });

    const warning = document.querySelector('.landing-overlap');
    expect(warning?.textContent).toContain('autopilot/flight-worktree-p1--fleet-2');
    expect(warning?.textContent).toContain('1 file');
    expect(warning?.getAttribute('tabindex')).toBe('0');
    expect(warning?.getAttribute('data-tip')).toBe('shared.txt');
    expect(document.querySelector('.landing-overlaps')?.getAttribute('role')).toBe('alert');
  });

  it('renders no overlap warning when overlaps is empty or absent', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: solo work', files: ['a.ts'] }],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });
    expect(document.querySelector('.landing-overlaps')).toBeNull();
  });

  it('names the overlapping sibling branch in the EXECUTE confirm dialog instead of a blind-merge prompt (BOARD web-msw5zxfi-oa2olf)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: touch shared.txt', files: ['shared.txt'] }],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
      overlaps: [{ branch: 'autopilot/flight-worktree-p1--fleet-2', files: ['shared.txt'] }],
    });

    const button = await vi.waitFor(() => {
      const b = document.querySelector('[data-land-execute]');
      expect(b).not.toBeNull();
      return b as HTMLButtonElement;
    });
    expect(button.getAttribute('data-land-overlap-branches')).toBe(
      JSON.stringify(['autopilot/flight-worktree-p1--fleet-2']),
    );

    button.click();

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('autopilot/flight-worktree-p1--fleet-2'),
    );
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('lead consolidation'));
    // Cancelling the confirm must not fire the execute request at all.
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/landing/execute', expect.anything());
  });

  it('falls back to the plain "Land this branch?" confirm when nothing overlaps', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: solo work', files: ['a.ts'] }],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
    });

    const button = await vi.waitFor(() => {
      const b = document.querySelector('[data-land-execute]');
      expect(b).not.toBeNull();
      return b as HTMLButtonElement;
    });
    expect(button.hasAttribute('data-land-overlap-branches')).toBe(false);

    button.click();

    expect(window.confirm).toHaveBeenCalledWith(
      'Land this branch?\n\nThis runs the full verification gate, then (only if it passes) a real git merge into the base branch. This cannot be undone by this dashboard.',
    );
  });

  it('collapses a run of consecutive same-task commits into one expandable group row (COCKPIT 2/6)', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [
        { shortSha: 'a1b2c3d', subject: 'feat: step one (BOARD web-abc123)', files: ['a.ts'] },
        { shortSha: 'e5f6a7b', subject: 'fix: step two (BOARD web-abc123)', files: ['b.ts'] },
        { shortSha: '1234567', subject: 'docs: unrelated', files: ['c.md'] },
      ],
      diffstat: { filesChanged: 3, insertions: 10, deletions: 2 },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });

    expect(document.querySelectorAll('.landing-commit-group')).toHaveLength(1);
    expect(document.querySelectorAll('.landing-commits > .landing-commit')).toHaveLength(1);

    const toggle = document.querySelector('.landing-group-toggle') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.querySelector('.landing-group-label')?.textContent).toBe('web-abc123');
    expect(toggle.querySelector('.landing-group-count')?.textContent).toBe('Show all (2)');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('data-tip')).toBe(
      '2 commits sharing the same board task, collapsed into one row — expand to see each individually',
    );

    const nested = document.querySelector('.landing-commit-nested') as HTMLUListElement;
    expect(nested.hidden).toBe(true);
    expect(nested.querySelectorAll('.landing-commit')).toHaveLength(2);
    expect(toggle.getAttribute('aria-controls')).toBe(nested.id);

    toggle.click();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(nested.hidden).toBe(false);
    expect(toggle.querySelector('.landing-group-count')?.textContent).toBe('Hide');

    toggle.click();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(nested.hidden).toBe(true);
    expect(toggle.querySelector('.landing-group-count')?.textContent).toBe('Show all (2)');
  });

  it('gives the flight debrief\'s "notable events" line a hover/focus chip per event (web-msm66jlc-gm4oom)', async () => {
    const projectWithDebrief = {
      ...PROJECT,
      flightLog: [
        {
          shipped: true,
          gateResult: null,
          died: null,
          cost: 1,
          durationMs: 100,
          guardDenials: 2,
          autoformatRescued: true,
        },
      ],
    };
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/landing')) {
        return { ok: true, json: async () => ({ landing: null }) } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ ...STATE, projects: [projectWithDebrief] }),
      } as unknown as Response;
    });
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.flight-debrief-notable')).not.toBeNull();
    });

    const chips = document.querySelectorAll('.flight-debrief-notable .chip');
    expect(Array.from(chips).map((c) => c.textContent)).toEqual([
      '2 guard denials',
      '1 auto-remediation',
    ]);
    // Roving reality (D1 TAB-STOP ROVING): the notable line shares one Tab
    // stop seeded on its first chip; every chip still self-explains.
    expect(Array.from(chips).map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1']);
    for (const chip of chips) {
      expect(chip.getAttribute('data-tip')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('degrades to an honest unavailable message when the fetch fails', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/landing')) throw new Error('network down');
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-body')?.textContent).toContain(
        'Landing preview unavailable',
      );
    });
  });
});

describe('landingJobLine — the LAND button telling the truth while it works', () => {
  const RUNNING_JOB = {
    phase: 'gate',
    startedAt: 1_000,
    stepIndex: 4,
    stepTotal: 5,
    steps: [
      { label: 'pnpm run lint', state: 'pass', durationMs: 12_000 },
      { label: 'pnpm run test', state: 'running' },
    ],
  };

  it('names the step actually running and how long the land has taken — the difference between "the 140s test leg" and "nothing is happening"', () => {
    const line = landingJobLine(RUNNING_JOB, 1_000 + 95_000);
    expect(line?.text).toContain('pnpm run test');
    expect(line?.text).toContain('4/5');
    expect(line?.text).toContain('1m35s');
    expect(line?.busy).toBe(true);
  });

  it('shows seconds alone under a minute, so an early glance is not padded with a useless 0m', () => {
    expect(landingJobLine(RUNNING_JOB, 1_000 + 12_000)?.text).toContain('12s');
  });

  it('falls back to a starting line before any gate step has reported in', () => {
    const line = landingJobLine({ phase: 'gate', startedAt: 0, steps: [] }, 0);
    expect(line?.text).toContain('starting the gate');
    expect(line?.busy).toBe(true);
  });

  it('renders the self-healing wait as work in progress, not as a failure — a queued landing is working as intended', () => {
    const line = landingJobLine(
      {
        phase: 'waiting-for-flight',
        startedAt: 0,
        steps: [],
        note: 'asked the flight to stop after its current firing',
      },
      30_000,
    );
    expect(line?.text).toContain('⏳ Queued');
    expect(line?.text).toContain('asked the flight to stop');
    expect(line?.busy).toBe(true);
    expect(line?.className).not.toContain('fail');
  });

  it('hands a finished job to the same verdict renderer the panel always used, and releases the button', () => {
    const landed = landingJobLine(
      { phase: 'finished', startedAt: 0, steps: [], result: { ok: true, details: 'merged.' } },
      1,
    );
    expect(landed?.text).toBe('✓ Landed — merged.');
    expect(landed?.busy).toBe(false);

    const refused = landingJobLine(
      {
        phase: 'finished',
        startedAt: 0,
        steps: [],
        result: { ok: false, details: 'pnpm run test failed (exit 1)' },
      },
      1,
    );
    expect(refused?.text).toContain('pnpm run test failed');
    expect(refused?.className).toContain('landing-result-fail');
    expect(refused?.busy).toBe(false);
  });

  it('renders nothing at all when there is no job — an idle panel must not claim a landing', () => {
    expect(landingJobLine(null, 0)).toBeNull();
    expect(landingJobLine(undefined, 0)).toBeNull();
  });

  it('never reports negative elapsed time when a clock skews backwards', () => {
    expect(landingJobLine({ phase: 'gate', startedAt: 5_000, steps: [] }, 0)?.text).toContain('0s');
  });
});
