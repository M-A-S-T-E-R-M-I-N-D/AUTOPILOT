// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE KEEPER ISSUE-TRIAGE PANEL'S DOSSIER/NEEDS-FORMAT BADGES GET A STROKE
 * ICON INSTEAD OF A BAKED-IN EMOJI (epic 0025, icon system). Executes the
 * ACTUAL client bundle (`clientJs()`), the same real-bundle convention
 * `issue-triage-labels.test.ts` uses for this same panel.
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

function bootWithTriage(triage: unknown[]): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
    }
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => ({ triage }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

function plan(decision: string, number: number) {
  return {
    issue: { number, title: 'An issue', labels: [] },
    decision: { decision, reasoning: 'Because.' },
  };
}

describe('the KEEPER issue-triage panel dossier/needs-format badges', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carries a clipboard-list stroke icon on a dossier decision, no baked-in emoji', async () => {
    bootWithTriage([plan('dossier', 1)]);

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-badge-dossier')).not.toBeNull();
    });
    const badge = document.querySelector('.issue-triage-badge-dossier');
    expect(badge?.querySelector('svg.icon-clipboard-list')).not.toBeNull();
    expect(badge?.textContent).toBe('dossier → maintainer');
  });

  it('carries a pen-line stroke icon on a needs-format decision, no baked-in emoji', async () => {
    bootWithTriage([plan('needs-format', 2)]);

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-badge-needs-format')).not.toBeNull();
    });
    const badge = document.querySelector('.issue-triage-badge-needs-format');
    expect(badge?.querySelector('svg.icon-pen-line')).not.toBeNull();
    expect(badge?.textContent).toBe('needs the template');
  });

  it('stays text-only (no icon) on an accept decision', async () => {
    bootWithTriage([plan('accept', 3)]);

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-badge-accept')).not.toBeNull();
    });
    const badge = document.querySelector('.issue-triage-badge-accept');
    expect(badge?.querySelector('svg')).toBeNull();
    expect(badge?.textContent).toBe('✓ accept');
  });
});
