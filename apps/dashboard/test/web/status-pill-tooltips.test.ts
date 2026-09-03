// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the project card's status pill
 * (`.card-head .pill`) and the task board's status pill (`.tasks .pill`)
 * used to be plain, unexplained text — unlike the chips/stats around them,
 * which already carry the shared [data-tip] primitive. They now explain
 * themselves on hover/focus too, and keep their status color-coding class
 * (e.g. `.pill-flying`, `.task-needs_approval`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 4,
  shipped: 3,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.75,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [
    { id: 't1', title: 'Queued task', status: 'queued' },
    { id: 't2', title: 'Approval-pending task', status: 'needs_approval', source: 'self' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 4,
    shipped: 3,
    openFindings: 0,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('status pills explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes the project card status pill keyboard-reachable with a tooltip and accessible label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const pill = document.querySelector('.card-head .pill');
    expect(pill).not.toBeNull();
    expect(pill?.classList.contains('pill-flying')).toBe(true);
    expect(pill?.getAttribute('tabindex')).toBe('0');
    expect(pill?.getAttribute('data-tip')).toBeTruthy();
    expect(pill?.getAttribute('aria-label')).toBeTruthy();
  });

  it('makes every task status pill keyboard-reachable with a tooltip and accessible label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const pills = Array.from(document.querySelectorAll('.tasks .pill'));
    expect(pills.length).toBe(2);
    for (const pill of pills) {
      expect(pill.getAttribute('tabindex')).toBe('0');
      expect(pill.getAttribute('data-tip')).toBeTruthy();
      expect(pill.getAttribute('aria-label')).toBeTruthy();
    }
    expect(pills[0]?.classList.contains('task-queued')).toBe(true);
    expect(pills[1]?.classList.contains('task-needs_approval')).toBe(true);
  });
});
