// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The 🔧 Diagnose diff-approval shell, wired live (VERDICT
 * `ap-mtydvfm1-0` slice (a) follow-up, epic 0020 slice 8) — slice (a)
 * itself only proved `fixProposalDiffLines`/`fixProposalApproveDisabledReason`/
 * `fixProposalDiscardTip` (`web/pr-review-panel.ts`) against a hand-authored
 * fixture; nothing called them from the live panel yet. This exercises the
 * real generated client bundle (`clientJs()`, same `new Function(...)()`
 * boot every other PR review DOM test in this folder uses — see
 * `pr-review-result-live-region.test.ts`) end to end: click 🔧 Diagnose on a
 * card whose diagnose response carries a `fixProposal`, and the panel must
 * render a real diff block with a permanently-disabled Approve and a
 * client-only Discard — never a fabricated success, since no fix-commit
 * generator exists yet (slice (b), still open).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 0,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [],
  empty: true,
};

const PLAN = {
  pr: {
    number: 37,
    title: 'fix: leaky socket',
    checkRuns: [{ name: 'test (windows)', state: 'fail', optional: false }],
  },
  decision: { decision: 'queue-for-human', reasoning: 'a gating check is red' },
};

const FIX_PROPOSAL = {
  title: 'Close the socket in the finally block',
  summary: 'The test failure traces to a leaked handle this closes.',
  diff:
    'diff --git a/src/socket.ts b/src/socket.ts\n' +
    'index 111..222 100644\n' +
    '--- a/src/socket.ts\n' +
    '+++ b/src/socket.ts\n' +
    '@@ -10,6 +10,7 @@\n' +
    ' function open() {\n' +
    '-  return conn;\n' +
    '+  try { return conn; } finally { conn.close(); }\n' +
    ' }\n',
  filesChanged: ['src/socket.ts'],
};

function boot(diagnoseResponse: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pr-review/diagnose')) {
      return { ok: true, json: async () => diagnoseResponse } as unknown as Response;
    }
    if (url.includes('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans: [PLAN] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('the 🔧 Diagnose diff-approval shell, wired into the live panel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the fix proposal's title, summary and classified diff lines on a defect verdict", async () => {
    boot({ diagnosis: { verdict: 'defect', reasoning: ['evidence'], fixProposal: FIX_PROPOSAL } });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="37"]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-diagnose="37"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.fix-proposal')).not.toBeNull();
    });
    expect(document.querySelector('.fix-proposal-title')?.textContent).toBe(FIX_PROPOSAL.title);
    expect(document.querySelector('.fix-proposal-summary')?.textContent).toBe(FIX_PROPOSAL.summary);
    const diffLines = Array.from(document.querySelectorAll('.fix-proposal-diff > div'));
    expect(diffLines.length).toBe(FIX_PROPOSAL.diff.split('\n').length);
    expect(diffLines.map((d) => d.className)).toEqual([
      'diff-meta',
      'diff-meta',
      'diff-file',
      'diff-file',
      'diff-hunk',
      'diff-context',
      'diff-remove',
      'diff-add',
      'diff-context',
      'diff-context',
    ]);
  });

  it('renders Approve permanently disabled-with-reason and Discard as a live client-only control', async () => {
    boot({ diagnosis: { verdict: 'defect', reasoning: ['evidence'], fixProposal: FIX_PROPOSAL } });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="37"]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-diagnose="37"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.fix-proposal')).not.toBeNull();
    });

    const approveBtn = document.querySelector('.fix-proposal-approve') as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
    expect(approveBtn.getAttribute('aria-label')).toContain('not available yet');
    expect(approveBtn.getAttribute('aria-label')).toContain('Nothing is pushed');

    const discardBtn = document.querySelector('.fix-proposal-discard') as HTMLButtonElement;
    expect(discardBtn.disabled).toBe(false);
    expect(discardBtn.getAttribute('aria-label')).toContain(FIX_PROPOSAL.title);
    discardBtn.click();
    expect(document.querySelector('.fix-proposal')).toBeNull();
  });

  it('renders no fix-proposal block for a flake verdict or a defect with no fixProposal yet', async () => {
    boot({ diagnosis: { verdict: 'flake', reasoning: ['quarantined'] } });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="37"]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-diagnose="37"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-result')?.textContent).toContain('Flake');
    });
    expect(document.querySelector('.fix-proposal')).toBeNull();
  });

  it('replaces a prior block instead of stacking a second one on re-diagnose', async () => {
    boot({ diagnosis: { verdict: 'defect', reasoning: ['evidence'], fixProposal: FIX_PROPOSAL } });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="37"]')).not.toBeNull();
    });
    const btn = document.querySelector('[data-pr-diagnose="37"]') as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.fix-proposal')).not.toBeNull();
    });
    btn.click();
    await vi.waitFor(() => {
      expect(btn.disabled).toBe(false);
    });
    expect(document.querySelectorAll('.fix-proposal').length).toBe(1);
  });
});
