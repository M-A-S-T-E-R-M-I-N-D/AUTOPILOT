// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * LANE HALF-STEP GUARD, the LANDING panel's expression (board
 * web-mtq2cubl-e5z0ae, slice 2): `read/project-detail.ts`'s `LandingInfo`
 * has carried `halfSteps` — open (`in_progress`) board tasks whose shipped
 * slices sit in the commits a land would carry — since slice 1, but the
 * card never rendered them, so the manual EXECUTE path could still ship a
 * known half-step with the plain "Land this branch?" prompt. These tests
 * cover the pure row/confirm math (`web/landing-panel.ts`) directly and the
 * REAL served client bundle in jsdom against a URL-aware mocked fetch, the
 * same rig `landing-panel.test.ts` drives for the overlap warning.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { landingHalfStepItems, landingExecuteConfirmMessage } from '../../src/web/landing-panel.js';

const BASE_CONFIRM =
  'Land this branch?\n\nThis runs the full verification gate, then (only if it passes) a real git merge into the base branch. This cannot be undone by this dashboard.';

describe('landingHalfStepItems', () => {
  it('names the task, its lane, and how many shipped slices and files sit in the diff', () => {
    const [row] = landingHalfStepItems([
      {
        taskId: 'web-abc123',
        title: 'EPIC 9 slice 3: the thing',
        assignee: 'fleet-2',
        commits: ['a1b2c3d', 'e5f6a7b'],
        files: ['src/a.ts', 'src/b.ts', 'test/a.test.ts'],
      },
    ]);
    expect(row?.text).toBe(
      '⚠ web-abc123 is still in progress on fleet-2 — 2 shipped slices (3 files) in this diff: landing now ships a half-step',
    );
    expect(row?.tip).toBe(
      'EPIC 9 slice 3: the thing — a1b2c3d, e5f6a7b — src/a.ts, src/b.ts, test/a.test.ts',
    );
  });

  it('uses singular forms for one slice and one file, and omits the lane when nobody holds the task', () => {
    const [row] = landingHalfStepItems([
      {
        taskId: 'web-solo',
        title: 'operator-moved',
        assignee: null,
        commits: ['1234567'],
        files: ['README.md'],
      },
    ]);
    expect(row?.text).toBe(
      '⚠ web-solo is still in progress — 1 shipped slice (1 file) in this diff: landing now ships a half-step',
    );
    expect(row?.text).not.toContain(' on ');
    expect(row?.tip).toBe('operator-moved — 1234567 — README.md');
  });

  it('drops the file clause from the tip when the slices carry no file list', () => {
    const [row] = landingHalfStepItems([
      { taskId: 'web-nofiles', title: 't', assignee: 'fleet-3', commits: ['abcdef0'], files: [] },
    ]);
    expect(row?.text).toContain('(0 files)');
    expect(row?.tip).toBe('t — abcdef0');
  });

  it('renders nothing for an empty list', () => {
    expect(landingHalfStepItems([])).toEqual([]);
  });
});

describe('landingExecuteConfirmMessage with half-steps', () => {
  it('leaves the overlap-only and plain prompts byte-identical when no half-step is passed', () => {
    expect(landingExecuteConfirmMessage([])).toBe(BASE_CONFIRM);
    expect(landingExecuteConfirmMessage([], [])).toBe(BASE_CONFIRM);
    expect(landingExecuteConfirmMessage(['branch-a'])).toBe(
      landingExecuteConfirmMessage(['branch-a'], []),
    );
  });

  it('names a single half-step task and says the automatic ritual would refuse it', () => {
    const msg = landingExecuteConfirmMessage([], ['web-abc123']);
    expect(msg.startsWith('⚠ web-abc123 is still in progress')).toBe(true);
    expect(msg).toContain('its shipped slices');
    expect(msg).toContain('HALF-STEP');
    expect(msg).toContain('automatic landing ritual refuses');
    expect(msg.endsWith(BASE_CONFIRM)).toBe(true);
  });

  it('pluralizes across several half-step tasks', () => {
    const msg = landingExecuteConfirmMessage([], ['web-a', 'web-b']);
    expect(msg).toContain('web-a, web-b are still in progress');
    expect(msg).toContain('their shipped slices');
  });

  it('stacks the overlap clause first, then the half-step clause, then the base prompt', () => {
    const msg = landingExecuteConfirmMessage(['branch-a'], ['web-a']);
    const overlapAt = msg.indexOf('branch-a has unlanded work');
    const halfStepAt = msg.indexOf('web-a is still in progress');
    const baseAt = msg.indexOf('Land this branch?');
    expect(overlapAt).toBeGreaterThanOrEqual(0);
    expect(halfStepAt).toBeGreaterThan(overlapAt);
    expect(baseAt).toBeGreaterThan(halfStepAt);
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

const HALF_STEP = {
  taskId: 'web-abc123',
  title: 'EPIC 9 slice 3: the thing',
  assignee: 'fleet-2',
  commits: ['a1b2c3d'],
  files: ['src/a.ts'],
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

async function waitForExecuteButton(): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const b = document.querySelector('[data-land-execute]');
    expect(b).not.toBeNull();
    return b as HTMLButtonElement;
  });
}

describe('the LANDING card renders the lane half-step guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns, as an alert, when an in_progress task has shipped slices in the diff', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [
        { shortSha: 'a1b2c3d', subject: 'feat: slice 3 (web-abc123)', files: ['src/a.ts'] },
      ],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
      halfSteps: [HALF_STEP],
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-half-step')).not.toBeNull();
    });

    const row = document.querySelector('.landing-half-step');
    expect(row?.textContent).toContain('web-abc123');
    expect(row?.textContent).toContain('fleet-2');
    expect(row?.textContent).toContain('1 shipped slice');
    expect(row?.getAttribute('tabindex')).toBe('0');
    expect(row?.getAttribute('data-tip')).toContain('EPIC 9 slice 3: the thing');
    expect(row?.getAttribute('aria-label')).toContain('web-abc123');
    // The alert role lives on the wrapper, never on the <ul> — an <li> whose
    // parent has lost its list role trips axe's listitem rule.
    const wrap = document.querySelector('.landing-half-steps');
    expect(wrap?.getAttribute('role')).toBe('alert');
    expect(row?.parentElement?.tagName).toBe('UL');
    expect(row?.parentElement?.hasAttribute('role')).toBe(false);
    // Shares the overlap list's amber surface (no new CSS) while keeping its
    // own hooks.
    expect(row?.parentElement?.classList.contains('landing-overlaps')).toBe(true);
    expect(row?.classList.contains('landing-overlap')).toBe(true);
  });

  it('seeds one roving Tab stop across several half-step rows', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: x', files: ['src/a.ts'] }],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
      halfSteps: [HALF_STEP, { ...HALF_STEP, taskId: 'web-def456', assignee: null }],
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.landing-half-step')).toHaveLength(2);
    });
    const stops = Array.from(document.querySelectorAll('.landing-half-step')).map((n) =>
      n.getAttribute('tabindex'),
    );
    expect(stops).toEqual(['0', '-1']);
  });

  it('renders no half-step warning when halfSteps is empty or absent', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: solo work', files: ['a.ts'] }],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
      halfSteps: [],
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });
    expect(document.querySelector('.landing-half-steps')).toBeNull();
    const button = await waitForExecuteButton();
    expect(button.hasAttribute('data-land-half-steps')).toBe(false);
  });

  it('folds the half-step task into the EXECUTE confirm so it is the last thing read before landing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [
        { shortSha: 'a1b2c3d', subject: 'feat: slice 3 (web-abc123)', files: ['src/a.ts'] },
      ],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
      halfSteps: [HALF_STEP],
    });

    const button = await waitForExecuteButton();
    expect(button.getAttribute('data-land-half-steps')).toBe(JSON.stringify(['web-abc123']));

    button.click();

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('web-abc123 is still in progress'),
    );
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('HALF-STEP'));
    // Cancelling the confirm must not fire the execute request at all.
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/landing/execute', expect.anything());
  });

  it('carries both guards into one confirm when a sibling overlap and a half-step coincide', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: shared', files: ['shared.txt'] }],
      diffstat: { filesChanged: 1, insertions: 1, deletions: 0 },
      overlaps: [{ branch: 'autopilot/flight-worktree-p1--fleet-2', files: ['shared.txt'] }],
      halfSteps: [HALF_STEP],
    });

    const button = await waitForExecuteButton();
    button.click();

    const message = vi.mocked(window.confirm).mock.calls[0]?.[0] ?? '';
    expect(message).toContain('autopilot/flight-worktree-p1--fleet-2 has unlanded work');
    expect(message).toContain('web-abc123 is still in progress');
    expect(message.endsWith(BASE_CONFIRM)).toBe(true);
  });
});
