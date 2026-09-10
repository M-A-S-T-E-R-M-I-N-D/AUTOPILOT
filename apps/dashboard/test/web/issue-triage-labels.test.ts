// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE KEEPER ISSUE-TRIAGE PANEL'S REAL LABEL CHIPS (epic 0020 "the legible
 * surface" slice 3, board web-mtt8loci-8hnte4, "labels render as real
 * chips"). `flight/issue-triage.ts`'s `fetchOpenIssues` already reads
 * `labels` off `gh issue list --json ...,labels,...` (`IncomingIssue.labels`)
 * — this covers the panel actually rendering that data instead of
 * discarding it at the client boundary, mirroring `issue-triage-link.test.ts`'s
 * coverage of the same slice's issue-number link. Executes the ACTUAL client
 * bundle (`clientJs()`), the same real-bundle convention
 * `issue-triage-link.test.ts`/`pool-client-link.test.ts` use.
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

const ISSUE_WITH_LABELS = {
  issue: {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    labels: ['bug', 'good first issue'],
  },
  decision: { decision: 'accept', reasoning: 'No matching open task.' },
};

describe('the KEEPER issue-triage panel renders real GitHub labels as chips', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one chip per label gh reported', async () => {
    bootWithTriage([ISSUE_WITH_LABELS]);

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.issue-triage-label-chip').length).toBe(2);
    });
    const chips = Array.from(document.querySelectorAll('.issue-triage-label-chip'));
    expect(chips.map((c) => c.textContent)).toEqual(['bug', 'good first issue']);
    expect(
      chips.every((c) => c.getAttribute('aria-label') === 'GitHub label: ' + c.textContent),
    ).toBe(true);
  });

  it('renders no labels row when the issue carries none', async () => {
    const noLabelsIssue = {
      ...ISSUE_WITH_LABELS,
      issue: { ...ISSUE_WITH_LABELS.issue, labels: [] },
    };
    bootWithTriage([noLabelsIssue]);

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-item')).not.toBeNull();
    });
    expect(document.querySelector('.issue-triage-labels')).toBeNull();
  });
});
