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
