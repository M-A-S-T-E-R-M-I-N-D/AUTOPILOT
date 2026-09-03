// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the "files in flight" map (`.flightmap
 * .fnode`) used a native `title` attribute — mouse-hover only, unreachable
 * by keyboard, unlike every other chip/stat in the shell that already carries
 * the shared [data-tip] primitive. It now explains itself on hover/focus too.
 *
 * D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq) follow-up: the
 * aria-label duplicated the full data-tip sentence verbatim onto every node.
 * The tip now rides aria-describedby into a visually-hidden span that is a
 * sibling of the list — not a child of the li (a ul may only hold li
 * children, and nested text would be read back as list-item content).
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
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/deep/a.ts', kind: 'file', phase: 'do', at: 6, firingId: 'f1' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 5, firingId: 'f1' },
  ],
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

describe('flight map nodes explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rides each node tip on aria-describedby instead of duplicating it into aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const nodes = Array.from(document.querySelectorAll('.flightmap .fnode'));
    expect(nodes.length).toBe(2);
    for (const node of nodes) {
      const tip = node.getAttribute('data-tip');
      expect(tip).toBeTruthy();
      expect(node.hasAttribute('aria-label')).toBe(false);
      expect(node.hasAttribute('title')).toBe(false);
      const descId = node.getAttribute('aria-describedby');
      expect(descId).toBeTruthy();
      const desc = document.getElementById(descId ?? '');
      expect(desc?.classList.contains('sr-only')).toBe(true);
      expect(desc?.textContent).toBe(tip);
      // A sibling of the list, never a child of the li: a ul may only hold
      // li children, and nested text would read back as list-item content.
      expect(node.contains(desc)).toBe(false);
    }
    // Roving tabindex (D1 TAB-STOP ROVING): only the first node is a Tab
    // stop, not one per file — see flightmap-roving-tabindex.test.ts.
    expect(nodes[0]!.getAttribute('tabindex')).toBe('0');
    expect(nodes[1]!.getAttribute('tabindex')).toBe('-1');
  });

  it('names the path, touch count, and tool in the tooltip text', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const node = document.querySelector('.flightmap .fnode');
    expect(node?.getAttribute('data-tip')).toBe('src/deep/a.ts — 1 touch (Edit)');
  });
});
