// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DETECTED BACKLOG (headless-surfacing sweep, web-msnqqjmd-9bx0wd): the project
 * page's inside page fetches GET /api/backlog on demand and renders open board
 * tasks a recent commit may have already shipped — fly.ts's end-of-flight
 * reconciliation sweep used to only print this to the flight console. These
 * tests drive the REAL served client bundle in jsdom against a URL-aware
 * mocked fetch.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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

function bootWithBacklog(candidates: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/backlog')) {
      return { ok: true, json: async () => ({ candidates }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the DETECTED BACKLOG panel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a proposed match with its commit evidence and a confirm button', async () => {
    bootWithBacklog([
      {
        taskId: 't1',
        taskTitle: 'add widget parser support',
        commitSha: 'abc1234',
        commitSubject: 'feat(widget): add widget parser support',
        score: 0.9,
        matchedVia: 'subject',
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('.backlog-panel')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.backlog-item')).toHaveLength(1);
    });

    const item = document.querySelector('.backlog-item');
    expect(item?.textContent).toContain('add widget parser support');
    expect(item?.textContent).toContain('abc1234');
    expect(item?.textContent).toContain('feat(widget): add widget parser support');

    const titleSpan = item?.querySelector('span');
    expect(titleSpan?.textContent).toBe('add widget parser support');
    expect(titleSpan?.getAttribute('tabindex')).toBe('0');
    expect(titleSpan?.getAttribute('data-tip')).toBe('Board task t1');
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the title's own text already gives it
    // an accessible name, so aria-label must not restate it plus duplicate
    // the full data-tip sentence verbatim — the tip rides aria-describedby
    // into a visually-hidden span instead (same fix as c3c57f5d for the task
    // board's own title span).
    expect(titleSpan?.getAttribute('aria-label')).toBeNull();
    const descId = titleSpan?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId!);
    expect(desc?.className).toBe('sr-only');
    expect(desc?.textContent).toBe('Board task t1');

    const confirmBtn = item?.querySelector('[data-task-done]');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn?.getAttribute('data-task-done')).toBe('t1');
    expect(confirmBtn?.getAttribute('data-tip')).toBe(
      'Mark "add widget parser support" done — this commit appears to have shipped it',
    );
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): the button
    // already names itself from its "✓ confirm done" content, so the tip
    // rides aria-describedby into a visually-hidden SIBLING span instead of
    // an aria-label duplicating data-tip verbatim (same fix as 7ae0105d for
    // the phase-rail segment buttons).
    expect(confirmBtn?.hasAttribute('aria-label')).toBe(false);
    const confirmDescId = confirmBtn?.getAttribute('aria-describedby');
    expect(confirmDescId).toBeTruthy();
    const confirmDesc = document.getElementById(confirmDescId!);
    expect(confirmDesc?.className).toBe('sr-only');
    expect(confirmDesc?.textContent).toBe(confirmBtn?.getAttribute('data-tip'));
    // A SIBLING, never a child — nested, its text would bleed into the
    // button's content-computed accessible name.
    expect(confirmBtn?.contains(confirmDesc)).toBe(false);
    const matchChip = item?.querySelector('.backlog-match');
    expect(matchChip?.getAttribute('data-tip')).toBe(
      'Possible match: commit abc1234 "feat(widget): add widget parser support" — never applied automatically, confirm below to mark the task done.',
    );
    // The chip's aria-label states the essential fact concisely instead of
    // duplicating the tip's full guidance sentence (same fix as 189137e0
    // for the task-row chips).
    expect(matchChip?.getAttribute('aria-label')).toBe('Possible match: commit abc1234');
  });

  it('gives each row ONE shared Tab stop across its title and match chip, not one each', async () => {
    bootWithBacklog([
      {
        taskId: 't1',
        taskTitle: 'add widget parser support',
        commitSha: 'abc1234',
        commitSubject: 'feat(widget): add widget parser support',
        score: 0.9,
        matchedVia: 'subject',
      },
      {
        taskId: 't2',
        taskTitle: 'otlp endpoint wiring',
        commitSha: 'def5678',
        commitSubject: 'feat(otlp): wire endpoint',
        score: 0.9,
        matchedVia: 'subject',
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.backlog-item')).toHaveLength(2);
    });

    const rows = Array.from(document.querySelectorAll('.backlog-item'));
    for (const row of rows) {
      const title = row.querySelector('span');
      const chip = row.querySelector('.backlog-match');
      expect(title?.getAttribute('tabindex')).toBe('0');
      expect(chip?.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('moves the roving stop within a row with ArrowRight/ArrowLeft, without crossing into another row', async () => {
    bootWithBacklog([
      {
        taskId: 't1',
        taskTitle: 'add widget parser support',
        commitSha: 'abc1234',
        commitSubject: 'feat(widget): add widget parser support',
        score: 0.9,
        matchedVia: 'subject',
      },
      {
        taskId: 't2',
        taskTitle: 'otlp endpoint wiring',
        commitSha: 'def5678',
        commitSubject: 'feat(otlp): wire endpoint',
        score: 0.9,
        matchedVia: 'subject',
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.backlog-item')).toHaveLength(2);
    });

    const rows = Array.from(document.querySelectorAll('.backlog-item'));
    const row1Title = rows[0]!.querySelector('span') as HTMLElement;
    const row1Chip = rows[0]!.querySelector('.backlog-match') as HTMLElement;
    const row2Title = rows[1]!.querySelector('span') as HTMLElement;

    row1Title.focus();
    row1Title.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(row1Chip);
    expect(row1Title.getAttribute('tabindex')).toBe('-1');
    expect(row1Chip.getAttribute('tabindex')).toBe('0');
    // The second row's own roving group is untouched by the first row's navigation.
    expect(row2Title.getAttribute('tabindex')).toBe('0');

    row1Chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(row1Title);
    expect(row1Title.getAttribute('tabindex')).toBe('0');
  });

  it('flags a file-path match distinctly from a subject-text match', async () => {
    bootWithBacklog([
      {
        taskId: 't2',
        taskTitle: 'otlp endpoint wiring',
        commitSha: 'def5678',
        commitSubject: 'wip(autopilot): checkpoint — firing 12 died mid-unit',
        score: 0.5,
        matchedVia: 'path',
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('.backlog-match')).not.toBeNull();
    });
    expect(document.querySelector('.backlog-match')?.textContent).toContain(
      'matched via changed files',
    );
    expect(document.querySelector('.backlog-match')?.getAttribute('data-tip')).toBe(
      'Possible match: commit def5678 "wip(autopilot): checkpoint — firing 12 died mid-unit" [matched via changed files, not subject text] — file overlap alone is too weak a signal to confirm from here; check the commit before marking this done on the task board.',
    );
    // D1 ATTRIBUTE PAYLOAD (epic 0015): concise aria-label, and the
    // weak-signal caveat survives into it — a path match must not announce
    // itself with the same confidence as a subject match.
    expect(document.querySelector('.backlog-match')?.getAttribute('aria-label')).toBe(
      'Possible match (files only): commit def5678',
    );
    // File-overlap alone is too loose to drive a one-click "done" action
    // (web-mssrob7o-yhkgbt) — a path match is annotation-only, no confirm button.
    expect(document.querySelector('.backlog-item [data-task-done]')).toBeNull();
  });

  it('shows an honest "no unconfirmed matches" state instead of an empty panel', async () => {
    bootWithBacklog([]);

    await vi.waitFor(() => {
      expect(document.querySelector('.backlog-panel')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.backlog-body')?.textContent).toContain(
        'No unconfirmed matches',
      );
    });
    expect(document.querySelector('.backlog-item')).toBeNull();
  });

  it('degrades to an honest unavailable message when the fetch fails', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/backlog')) throw new Error('network down');
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.backlog-body')?.textContent).toContain(
        'Detected backlog unavailable',
      );
    });
  });
});
