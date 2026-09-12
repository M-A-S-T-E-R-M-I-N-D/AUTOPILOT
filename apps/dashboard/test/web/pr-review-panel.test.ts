// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the KEEPER PR REVIEW panel's pure formatting
 * math (`web/pr-review-panel.ts`) — the dashboard UI surface for `GET
 * /api/pr-review` + `POST /api/pr-review/execute` (BOARD web-mss50ia0-s6vtbd,
 * "PLATFORM 4/7"), the follow-up slice `flight/pr-review.ts`'s header
 * comment flagged as deferred.
 *
 * i18n (board web-msnsndki-dz3vn1): `prReviewDecisionLabel`/
 * `prReviewConfirmMessage`/`prReviewExecuteResult`/`prReviewExecuteTip` stay
 * spliced into the bundle via `.toString()` (see `web/features/pr-review.ts`),
 * so — the same route `flightProgressOf`/the `connect-panel.ts` family
 * took — each now takes the bundle's `tr()` as its last parameter instead of
 * composing English literals directly. Every English assertion below passes
 * a STRINGS.en-backed translator and is byte-for-byte what the old literals
 * produced; the Hebrew cases prove the numbers, decisions and server-sent
 * reasoning land where each locale's template puts them.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import {
  prReviewDecisionLabel,
  prReviewConfirmMessage,
  prReviewExecuteResult,
  prReviewExecuteTip,
  prReviewGuestNote,
  awaitingApprovalChecksUrl,
  checkDiagnosisResult,
  type PrReviewPanelTranslator,
} from '../../src/web/pr-review-panel.js';

/** A translator over one real STRINGS table, substituting `{name}` slots the
 *  way the bundle's `tr()` (`web/features/locale.ts`) does. */
function translatorFor(locale: 'en' | 'he'): PrReviewPanelTranslator {
  return (key, subs) => {
    const text: string = STRINGS[locale][key];
    if (!subs) return text;
    return Object.keys(subs).reduce((t, k) => t.split('{' + k + '}').join(String(subs[k])), text);
  };
}
const trEn = translatorFor('en');
const trHe = translatorFor('he');

describe('prReviewDecisionLabel', () => {
  it('labels a merge decision', () => {
    expect(prReviewDecisionLabel('merge', trEn)).toBe('✓ merge');
  });

  it('labels a request-changes decision', () => {
    expect(prReviewDecisionLabel('request-changes', trEn)).toBe('✗ request changes');
  });

  it('labels a queue-for-human decision', () => {
    expect(prReviewDecisionLabel('queue-for-human', trEn)).toBe('🟣 queue for human');
  });

  it('labels a queue-for-human decision awaiting approval with a distinct badge', () => {
    expect(prReviewDecisionLabel('queue-for-human', trEn, true)).toBe(
      '🔒 awaiting approval to run CI',
    );
  });

  it('falls back to the generic queue-for-human badge when awaitingApproval is explicitly false', () => {
    expect(prReviewDecisionLabel('queue-for-human', trEn, false)).toBe('🟣 queue for human');
  });

  it('ignores awaitingApproval for merge/request-changes decisions', () => {
    expect(prReviewDecisionLabel('merge', trEn, true)).toBe('✓ merge');
    expect(prReviewDecisionLabel('request-changes', trEn, true)).toBe('✗ request changes');
  });

  it('echoes back an unrecognized decision verbatim rather than throwing', () => {
    expect(prReviewDecisionLabel('mystery', trEn)).toBe('mystery');
  });

  it('reads each label from the injected locale table', () => {
    expect(prReviewDecisionLabel('merge', trHe)).toBe('✓ ' + STRINGS.he.prReviewMergeLabel);
    expect(prReviewDecisionLabel('request-changes', trHe)).toBe(
      '✗ ' + STRINGS.he.prReviewRequestChangesLabel,
    );
    expect(prReviewDecisionLabel('queue-for-human', trHe)).toBe(
      '🟣 ' + STRINGS.he.prReviewQueueForHumanLabel,
    );
    expect(prReviewDecisionLabel('queue-for-human', trHe, true)).toBe(
      '🔒 ' + STRINGS.he.prReviewAwaitingApprovalLabel,
    );
  });
});

describe('awaitingApprovalChecksUrl', () => {
  it("appends /checks to the PR's own url", () => {
    expect(awaitingApprovalChecksUrl('https://github.com/acme/widgets/pull/42')).toBe(
      'https://github.com/acme/widgets/pull/42/checks',
    );
  });

  it('returns undefined when the candidate carries no url', () => {
    expect(awaitingApprovalChecksUrl(undefined)).toBeUndefined();
  });
});

describe('prReviewConfirmMessage', () => {
  const pr = { number: 42, title: 'fix: leaky socket' };

  it('warns this cannot be undone for a merge decision', () => {
    const msg = prReviewConfirmMessage(
      pr,
      {
        decision: 'merge',
        reasoning: 'policy-green — gate passed, no conflicts, no security-sensitive paths touched.',
      },
      trEn,
    );
    expect(msg).toContain('Apply KEEPER review to #42 "fix: leaky socket"?');
    expect(msg).toContain('Decision: ✓ merge');
    expect(msg).toContain('policy-green');
    expect(msg).toContain('cannot be undone by this dashboard');
  });

  it('omits the undo notice for a request-changes decision', () => {
    const msg = prReviewConfirmMessage(
      pr,
      {
        decision: 'request-changes',
        reasoning: 'the gate failed.',
      },
      trEn,
    );
    expect(msg).not.toContain('cannot be undone');
  });

  it('omits the undo notice for a queue-for-human decision', () => {
    const msg = prReviewConfirmMessage(
      pr,
      {
        decision: 'queue-for-human',
        reasoning: 'touches a guard path.',
      },
      trEn,
    );
    expect(msg).not.toContain('cannot be undone');
  });

  it('reads the sentence and the undo clause from the injected locale table, keeping the server reasoning as sent', () => {
    const msg = prReviewConfirmMessage(pr, { decision: 'merge', reasoning: 'policy-green' }, trHe);
    expect(msg).toContain(STRINGS.he.prReviewConfirmUndoMerge);
    expect(msg).toContain('policy-green');
    expect(msg).toContain('#42');
    expect(msg).toContain('fix: leaky socket');
  });
});

describe('prReviewExecuteTip', () => {
  const pr = { number: 42, title: 'fix: leaky socket' };

  it('names the PR and decision, warning this cannot be undone for a merge decision', () => {
    const tip = prReviewExecuteTip(pr, { decision: 'merge', reasoning: 'policy-green' }, trEn);
    expect(tip).toBe(
      'Apply KEEPER review to #42: ✓ merge. This approves AND squash-merges the PR — it cannot be undone by this dashboard.',
    );
  });

  it('names the reversible-comment-only path for a request-changes decision', () => {
    const tip = prReviewExecuteTip(
      pr,
      { decision: 'request-changes', reasoning: 'gate red' },
      trEn,
    );
    expect(tip).toBe(
      'Apply KEEPER review to #42: ✗ request changes. This posts a review/comment on GitHub — reversible there.',
    );
  });

  it('reads its clauses from the injected locale table', () => {
    const tip = prReviewExecuteTip(pr, { decision: 'merge', reasoning: 'policy-green' }, trHe);
    expect(tip).toContain(STRINGS.he.prReviewConfirmUndoMerge);
    expect(tip).toContain('#42');
  });
});

describe('prReviewGuestNote (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899)', () => {
  it('names the repo owner and the signed-in login', () => {
    const note = prReviewGuestNote({
      login: 'a-contributor',
      nameWithOwner: 'octocat/hello-world',
      role: 'user',
    });

    expect(note).toBe(
      'PR review actions on this repo are taken by its maintainer (octocat) — you are signed in as a-contributor.',
    );
  });
});

describe('prReviewExecuteResult', () => {
  it('joins every planned command detail in order on success', () => {
    const result = prReviewExecuteResult(
      {
        results: [
          { command: { details: 'approving #42 — policy-green' }, code: 0 },
          { command: { details: 'merging #42 (squash, branch deleted)' }, code: 0 },
        ],
      },
      trEn,
    );
    expect(result.text).toBe(
      '✓ approving #42 — policy-green; merging #42 (squash, branch deleted).',
    );
    expect(result.className).toBe('pr-review-result pr-review-result-ok');
  });

  it('reports the first failing command, not a generic message', () => {
    const result = prReviewExecuteResult(
      {
        results: [
          { command: { details: 'approving #42 — policy-green' }, code: 0 },
          { command: { details: 'merging #42 (squash, branch deleted)' }, code: 1 },
        ],
      },
      trEn,
    );
    expect(result.text).toBe('✗ merging #42 (squash, branch deleted) failed (exit 1).');
    expect(result.className).toBe('pr-review-result pr-review-result-fail');
  });

  it('falls back to the error field when there are no results', () => {
    expect(prReviewExecuteResult({ error: 'PR is no longer open' }, trEn).text).toBe(
      '✗ PR is no longer open',
    );
  });

  it('falls back to a generic message when neither results nor error are present', () => {
    expect(prReviewExecuteResult({}, trEn).text).toBe('✗ PR review execute failed.');
  });

  it('names the fresh verdict when the stale-decision guard refused to run', () => {
    const result = prReviewExecuteResult(
      {
        staleDecision: true,
        decision: { decision: 'merge', reasoning: 'policy-green' },
        results: [],
      },
      trEn,
    );
    expect(result.text).toContain('Not applied');
    expect(result.text).toContain('✓ merge');
    expect(result.className).toBe('pr-review-result pr-review-result-fail');
  });

  it('degrades to "unknown" when a stale refusal carries no fresh decision', () => {
    expect(prReviewExecuteResult({ staleDecision: true, results: [] }, trEn).text).toContain(
      '"unknown"',
    );
  });

  it('treats a null/undefined response as a failure', () => {
    expect(prReviewExecuteResult(null, trEn).text).toBe('✗ PR review execute failed.');
    expect(prReviewExecuteResult(undefined, trEn).className).toBe(
      'pr-review-result pr-review-result-fail',
    );
  });

  it('reads the generic failure and stale-decision sentence from the injected locale table', () => {
    expect(prReviewExecuteResult({}, trHe).text).toBe(
      '✗ ' + STRINGS.he.prReviewExecuteFailedGeneric,
    );
    expect(prReviewExecuteResult({ staleDecision: true, results: [] }, trHe).text).toContain(
      STRINGS.he.prReviewUnknownDecision,
    );
  });
});

describe('checkDiagnosisResult — the 🔧 Diagnose button’s result line (epic 0020 slice 8)', () => {
  it('reads a defect verdict as a failure and shows the classifier’s own evidence', () => {
    const result = checkDiagnosisResult({
      diagnosis: {
        verdict: 'defect',
        reasoning: ['The PR directly touches the failing test file(s): a.test.ts.'],
      },
    });
    expect(result.className).toBe('pr-review-result pr-review-result-fail');
    expect(result.text).toBe(
      '✗ Defect — The PR directly touches the failing test file(s): a.test.ts.',
    );
  });

  it('reads a flake verdict as ok — safe to re-run', () => {
    const result = checkDiagnosisResult({
      diagnosis: {
        verdict: 'flake',
        reasoning: ['a.test.ts is already quarantined as flaky (x).'],
      },
    });
    expect(result.className).toBe('pr-review-result pr-review-result-ok');
    expect(result.text).toBe('✓ Flake — a.test.ts is already quarantined as flaky (x).');
  });

  it('gives an unknown verdict its own neutral styling — not a green or a red verdict', () => {
    const result = checkDiagnosisResult({
      diagnosis: {
        verdict: 'unknown',
        reasoning: ['Could not identify a failing test file from the job log.'],
      },
    });
    expect(result.className).toBe('pr-review-result pr-review-result-warn');
    expect(result.text).toBe(
      '? Unknown — Could not identify a failing test file from the job log.',
    );
  });

  it('renders a bare refusal (nothing failing, or no log to read) with the same neutral styling', () => {
    const result = checkDiagnosisResult({
      reason: 'No gating check is failing — there is nothing to diagnose.',
    });
    expect(result.className).toBe('pr-review-result pr-review-result-warn');
    expect(result.text).toBe('? No gating check is failing — there is nothing to diagnose.');
  });

  it('treats a null/undefined response as an unclassifiable refusal, not a crash', () => {
    expect(checkDiagnosisResult(null).text).toBe('? Nothing to diagnose.');
    expect(checkDiagnosisResult(undefined).className).toBe(
      'pr-review-result pr-review-result-warn',
    );
  });
});
