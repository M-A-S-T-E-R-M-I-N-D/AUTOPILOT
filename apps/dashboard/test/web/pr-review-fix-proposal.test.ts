// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The diff-approval UI shell for a `defect` verdict's proposed fix commit
 * (VERDICT ap-mtydvfm1-0 slice (a), epic 0020 slice 8, board
 * web-mtvpuoj4-tv1z09) — `web/pr-review-panel.ts`'s pure
 * `fixProposalDiffLines`/`fixProposalApproveDisabledReason`/
 * `fixProposalDiscardTip` already had their own unit coverage
 * (`pr-review-panel.test.ts`), but nothing exercised the live wiring: the
 * 🔧 Diagnose button's response reaching `web/features/pr-review.ts`'s
 * `renderFixProposal` and landing in the DOM. `diagnoseFailedCheck` itself
 * never populates `fixProposal` yet (slice (b), fix-commit generation, is a
 * separate follow-up) — this drives the panel with an injected response
 * carrying one, the same way `pr-review-result-live-region.test.ts` drives
 * the Apply flow with an injected execute response.
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

const QUEUED_WITH_FAILED_CHECK = [
  {
    pr: {
      number: 7,
      title: 'fix: flaky test',
      checkRuns: [{ name: 'ci', state: 'fail' }],
    },
    decision: { decision: 'queue-for-human', reasoning: 'red check' },
  },
];

const FIX_PROPOSAL = {
  title: 'Fix the off-by-one in add()',
  summary: 'add() returns a + b + 1; the PR touches this exact line.',
  diff:
    'diff --git a/src/add.ts b/src/add.ts\n' +
    '--- a/src/add.ts\n' +
    '+++ b/src/add.ts\n' +
    '@@ -1,3 +1,3 @@\n' +
    '-export function add(a, b) { return a + b + 1; }\n' +
    '+export function add(a, b) { return a + b; }',
  filesChanged: ['src/add.ts'],
};

function boot(diagnosisResponses: readonly unknown[]): void {
  document.open();
  document.write(renderShell());
  document.close();
  let call = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pr-review/diagnose')) {
      const body = diagnosisResponses[Math.min(call, diagnosisResponses.length - 1)];
      call += 1;
      return { ok: true, json: async () => body } as unknown as Response;
    }
    if (url.includes('/api/pr-review')) {
      return {
        ok: true,
        json: async () => ({ plans: QUEUED_WITH_FAILED_CHECK }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('diff-approval UI shell (VERDICT ap-mtydvfm1-0 slice a)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the proposed fix commit — title, summary, colored diff lines, and a permanently-disabled Approve — when a defect verdict carries one', async () => {
    boot([
      { diagnosis: { verdict: 'defect', reasoning: ['evidence'], fixProposal: FIX_PROPOSAL } },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="7"]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-diagnose="7"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-fix-proposal')).not.toBeNull();
    });
    expect(document.querySelector('.pr-fix-proposal-title')?.textContent).toBe(FIX_PROPOSAL.title);
    expect(document.querySelector('.pr-fix-proposal-summary')?.textContent).toBe(
      FIX_PROPOSAL.summary,
    );

    const diffLineClasses = Array.from(document.querySelectorAll('.pr-fix-diff > div')).map(
      (line) => line.className,
    );
    expect(diffLineClasses).toEqual([
      'diff-meta',
      'diff-file',
      'diff-file',
      'diff-hunk',
      'diff-remove',
      'diff-add',
    ]);

    const approveBtn = document.querySelector('[data-pr-fix-approve="7"]') as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
    expect(approveBtn.getAttribute('aria-disabled')).toBe('true');
    expect(approveBtn.getAttribute('data-tip')).toContain('Nothing is pushed to the PR branch');

    expect(document.querySelector('[data-pr-fix-discard="7"]')).not.toBeNull();
  });

  it('discards the proposal on click without touching GitHub — no confirm dialog, no fetch', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    boot([
      { diagnosis: { verdict: 'defect', reasoning: ['evidence'], fixProposal: FIX_PROPOSAL } },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="7"]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-diagnose="7"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.pr-fix-proposal')).not.toBeNull();
    });
    const fetchCallsBeforeDiscard = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .length;

    (document.querySelector('[data-pr-fix-discard="7"]') as HTMLButtonElement).click();

    expect(document.querySelector('.pr-fix-proposal')).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      fetchCallsBeforeDiscard,
    );
  });

  it('clears a standing proposal once a later Diagnose comes back flake/unknown — no stale fix commit left on screen', async () => {
    boot([
      { diagnosis: { verdict: 'defect', reasoning: ['evidence'], fixProposal: FIX_PROPOSAL } },
      { diagnosis: { verdict: 'flake', reasoning: ['already quarantined'] } },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="7"]')).not.toBeNull();
    });
    const diagnoseBtn = () => document.querySelector('[data-pr-diagnose="7"]') as HTMLButtonElement;
    diagnoseBtn().click();
    await vi.waitFor(() => {
      expect(document.querySelector('.pr-fix-proposal')).not.toBeNull();
    });

    await vi.waitFor(() => {
      expect(diagnoseBtn().disabled).toBe(false);
    });
    diagnoseBtn().click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-result')?.textContent).toContain('Flake');
    });
    expect(document.querySelector('.pr-fix-proposal')).toBeNull();
  });

  it('never renders the shell when the verdict carries no fixProposal at all', async () => {
    boot([{ diagnosis: { verdict: 'unknown', reasoning: ['no evidence'] } }]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-diagnose="7"]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-diagnose="7"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-result')?.textContent).toContain('Unknown');
    });
    expect(document.querySelector('.pr-fix-proposal')).toBeNull();
  });
});
