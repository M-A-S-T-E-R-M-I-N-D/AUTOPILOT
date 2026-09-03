// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the task board's drag handle (`.task-drag-handle`)
 * used a native `title` attribute — mouse-hover only — unlike every other chip/
 * stat in the shell that already carries the shared [data-tip] primitive. It's
 * decorative (aria-hidden, reorder has an accessible ↑/↓ button equivalent), so
 * the fix is data-tip WITHOUT tabindex: hover still explains it, but it stays out
 * of the keyboard focus order instead of becoming a focusable-but-hidden element.
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
  lastActivityAt: 1,
  flightLog: [],
  tasks: [
    { id: 't1', title: 'Fix the thing', status: 'queued', source: 'human' },
    { id: 't2', title: 'Ship the other thing', status: 'in_progress', source: 'human' },
  ],
  activity: [],
};

const STATE = {
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

describe('task drag handle explains itself on hover without stealing keyboard focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('carries data-tip instead of a native title, and stays aria-hidden with no tabindex', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const handles = Array.from(document.querySelectorAll('.task-drag-handle'));
    expect(handles.length).toBe(2);
    for (const handle of handles) {
      expect(handle.getAttribute('data-tip')).toBe('Drag to reorder');
      expect(handle.hasAttribute('title')).toBe(false);
      expect(handle.getAttribute('aria-hidden')).toBe('true');
      expect(handle.hasAttribute('tabindex')).toBe(false);
    }
  });
});
