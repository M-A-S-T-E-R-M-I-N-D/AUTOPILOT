// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  buildCommitReviewPrompt,
  describeCommitReview,
  parseCommitReview,
  resolveCommitReviewModel,
  runCommitReview,
  ModelCommitReviewer,
  MAX_REVIEW_DIFF_CHARS,
  MAX_REVIEW_FINDINGS,
} from '../src/commit-review.js';
import type { CommitReviewPort, ModelEnvelope, ModelPort, ModelResponse } from '../src/ports.js';

function envelope(over: Partial<ModelEnvelope> = {}): ModelEnvelope {
  return {
    result: null,
    isError: false,
    apiErrorStatus: null,
    costUsd: 0.01,
    numTurns: 1,
    durationMs: 900,
    stopReason: 'end_turn',
    modelUsed: 'claude-haiku-4-5-20251001',
    tokensIn: 800,
    tokensOut: 60,
    cacheRead: 0,
    cacheCreate: 0,
    ...over,
  };
}

class FakeModel implements ModelPort {
  readonly calls: { model: string; prompt: string }[] = [];
  constructor(private readonly reply: ModelResponse) {}
  invoke(model: string, prompt: string): Promise<ModelResponse> {
    this.calls.push({ model, prompt });
    return Promise.resolve(this.reply);
  }
}

const REQUEST = { headBefore: 'h0', headAfter: 'h1', subject: 'fix: guard the parser' };
const DIFF = 'diff --git a/src/a.ts b/src/a.ts\n+export const x = 1;\n';

describe('buildCommitReviewPrompt', () => {
  it('asks to FIND problems, fences the diff as data, and names the reply line', () => {
    const prompt = buildCommitReviewPrompt('fix: guard the parser', DIFF);
    expect(prompt).toMatch(/find problems/i);
    expect(prompt).toContain('fix: guard the parser');
    expect(prompt).toContain(DIFF);
    expect(prompt).toMatch(/untrusted data/i);
    expect(prompt).toContain('REVIEW:');
  });

  it('truncates an oversized diff and says so instead of silently dropping the tail', () => {
    const huge = 'x'.repeat(MAX_REVIEW_DIFF_CHARS + 500);
    const prompt = buildCommitReviewPrompt(null, huge);
    expect(prompt).not.toContain(huge);
    expect(prompt).toContain(`first ${MAX_REVIEW_DIFF_CHARS} of ${huge.length} characters`);
    expect(prompt).toContain('(no subject)');
  });
});

describe('parseCommitReview', () => {
  it('reads the findings from the LAST REVIEW line', () => {
    const text = [
      'I looked at the diff.',
      'REVIEW:[{"severity":"low","problem":"stale"}]',
      'REVIEW:[{"severity":"high","file":"src/a.ts","problem":"the guard is inverted"}]',
    ].join('\n');
    expect(parseCommitReview(text)).toEqual([
      { severity: 'high', file: 'src/a.ts', problem: 'the guard is inverted' },
    ]);
  });

  it('an empty list is a real verdict: reviewed, nothing found', () => {
    expect(parseCommitReview('REVIEW:[]')).toEqual([]);
  });

  it('no REVIEW line, or one that is not a JSON array, is no verdict at all', () => {
    expect(parseCommitReview('looks fine to me')).toBeNull();
    expect(parseCommitReview('REVIEW:{"severity":"high"}')).toBeNull();
    expect(parseCommitReview('REVIEW:[not json')).toBeNull();
  });

  it('drops malformed entries, clips long text, and caps the count', () => {
    const entries = [
      { severity: 'urgent', problem: 'unknown severity' },
      { severity: 'medium' },
      'not an object',
      { severity: 'medium', file: 42, problem: `  ${'p'.repeat(600)}  ` },
      ...Array.from({ length: MAX_REVIEW_FINDINGS + 3 }, (_, i) => ({
        severity: 'low',
        problem: `n${i}`,
      })),
    ];
    const findings = parseCommitReview(`REVIEW:${JSON.stringify(entries)}`);
    expect(findings).toHaveLength(MAX_REVIEW_FINDINGS);
    expect(findings?.[0]?.severity).toBe('medium');
    expect(findings?.[0]?.file).toBeNull();
    expect(findings?.[0]?.problem.length).toBeLessThanOrEqual(300);
    expect(findings?.[1]).toEqual({ severity: 'low', file: null, problem: 'n0' });
  });
});

describe('ModelCommitReviewer', () => {
  it('reviews the firing diff with the configured model and records what it found', async () => {
    const model = new FakeModel({
      stdout: '',
      exitCode: 0,
      envelope: envelope({
        result: 'REVIEW:[{"severity":"medium","file":"src/a.ts","problem":"no test"}]',
      }),
    });
    const diffCalls: [string, string][] = [];
    const reviewer = new ModelCommitReviewer({
      model,
      modelName: 'haiku',
      diffText: (from, to) => {
        diffCalls.push([from, to]);
        return Promise.resolve(DIFF);
      },
    });

    const review = await reviewer.review(REQUEST);

    expect(diffCalls).toEqual([['h0', 'h1']]);
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]?.model).toBe('haiku');
    expect(model.calls[0]?.prompt).toContain(DIFF);
    expect(review).toEqual({
      status: 'reviewed',
      model: 'claude-haiku-4-5-20251001',
      costUsd: 0.01,
      findings: [{ severity: 'medium', file: 'src/a.ts', problem: 'no test' }],
    });
  });

  it('skips without a model call when there is no diff to review', async () => {
    const model = new FakeModel({ stdout: '', exitCode: 0, envelope: envelope() });
    const reviewer = new ModelCommitReviewer({
      model,
      modelName: 'haiku',
      diffText: () => Promise.resolve('  \n'),
    });
    expect(await reviewer.review(REQUEST)).toEqual({
      status: 'skipped',
      reason: 'no diff text to review',
    });
    expect(model.calls).toHaveLength(0);
  });

  it('a failed reviewer call or an unreadable reply is a skip with its reason, never a finding', async () => {
    const failed = new ModelCommitReviewer({
      model: new FakeModel({ stdout: 'boom', exitCode: 1, envelope: null }),
      modelName: 'haiku',
      diffText: () => Promise.resolve(DIFF),
    });
    expect(await failed.review(REQUEST)).toEqual({
      status: 'skipped',
      reason: 'the reviewer call failed (exit 1)',
    });

    const rambling = new ModelCommitReviewer({
      model: new FakeModel({
        stdout: '',
        exitCode: 0,
        envelope: envelope({ result: 'Looks good!' }),
      }),
      modelName: 'haiku',
      diffText: () => Promise.resolve(DIFF),
    });
    expect(await rambling.review(REQUEST)).toEqual({
      status: 'skipped',
      reason: 'the reviewer reply carried no REVIEW line',
    });
  });
});

describe('runCommitReview', () => {
  it('turns a throwing reviewer into a recorded skip — the review never fails a firing', async () => {
    const throwing: CommitReviewPort = { review: () => Promise.reject(new Error('spawn EPERM')) };
    expect(await runCommitReview(throwing, REQUEST)).toEqual({
      status: 'skipped',
      reason: 'the reviewer failed: spawn EPERM',
    });
  });
});

describe('describeCommitReview', () => {
  it('names the top finding, a clean review, or why the review was skipped', () => {
    expect(
      describeCommitReview({
        status: 'reviewed',
        model: 'haiku',
        costUsd: null,
        findings: [
          { severity: 'medium', file: null, problem: 'the subject overclaims' },
          { severity: 'low', file: 'a.ts', problem: 'naming' },
        ],
      }),
    ).toBe('commit review (haiku): 2 findings — top: [medium] the subject overclaims');
    expect(
      describeCommitReview({ status: 'reviewed', model: 'haiku', costUsd: 0, findings: [] }),
    ).toBe('commit review (haiku): no findings');
    expect(describeCommitReview({ status: 'skipped', reason: 'no diff text to review' })).toBe(
      'commit review skipped — no diff text to review',
    );
  });
});

describe('resolveCommitReviewModel', () => {
  it('defaults to haiku, honors an override, and "off" turns the pass off', () => {
    expect(resolveCommitReviewModel({})).toBe('haiku');
    expect(resolveCommitReviewModel({ AUTOPILOT_REVIEW_MODEL: ' sonnet ' })).toBe('sonnet');
    expect(resolveCommitReviewModel({ AUTOPILOT_REVIEW_MODEL: 'OFF' })).toBeNull();
    expect(resolveCommitReviewModel({ AUTOPILOT_REVIEW_MODEL: '' })).toBe('haiku');
  });
});
