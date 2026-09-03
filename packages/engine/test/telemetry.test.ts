// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseMetricsLine,
  parseProposalsLine,
  MAX_PROPOSALS,
  resolveIteration,
  computeMaxTurnsHit,
  buildFiringRecord,
  isBadFiring,
  mergeEnvelopeFacts,
  classifyNoop,
  type EnvelopeFacts,
  type FiringContext,
  type ParsedMetrics,
  type TaskProposal,
} from '../src/telemetry.js';

describe('parseProposalsLine', () => {
  it('parses proposed tasks with their lens and severity', () => {
    const text = [
      'did one unit of work',
      'PROPOSALS:[{"title":"Add rate limiting to /api/ask","dimension":"cybersecurity","severity":"high"},{"title":"Profile SSE tick cost","dimension":"ux"}]',
      'METRICS:{"item":"x","outcome":"shipped","sha":"abc"}',
    ].join('\n');
    expect(parseProposalsLine(text)).toEqual([
      {
        title: 'Add rate limiting to /api/ask',
        dimension: 'cybersecurity',
        severity: 'high',
        invalidTags: false,
        fromBacklog: false,
      },
      {
        title: 'Profile SSE tick cost',
        dimension: 'ux',
        severity: null,
        invalidTags: false,
        fromBacklog: false,
      },
    ]);
  });

  it('schema-validates dimension/severity against the canonical enums at the parse boundary', () => {
    const text =
      'PROPOSALS:[{"title":"Add rate limiting","dimension":"security","severity":"blocker"},{"title":"Fix typo","dimension":"ux","severity":"critical"}]';
    expect(parseProposalsLine(text)).toEqual([
      // out-of-enum tags ("security", "blocker") are dropped, never thrown —
      // but flagged via invalidTags instead of silently vanishing.
      {
        title: 'Add rate limiting',
        dimension: null,
        severity: null,
        invalidTags: true,
        fromBacklog: false,
      },
      {
        title: 'Fix typo',
        dimension: 'ux',
        severity: 'critical',
        invalidTags: false,
        fromBacklog: false,
      },
    ]);
  });

  it('tags a proposal lifted from docs/BACKLOG-999.md via "source":"backlog"', () => {
    const text =
      'PROPOSALS:[{"title":"Port the v2.4 loop","dimension":"data","source":"backlog"},{"title":"Fresh idea","source":"repo"}]';
    expect(parseProposalsLine(text)).toEqual([
      {
        title: 'Port the v2.4 loop',
        dimension: 'data',
        severity: null,
        invalidTags: false,
        fromBacklog: true,
      },
      {
        title: 'Fresh idea',
        dimension: null,
        severity: null,
        invalidTags: false,
        fromBacklog: false,
      },
    ]);
  });

  it('caps the count, trims titles, and drops blank/malformed entries', () => {
    const many = Array.from({ length: 9 }, (_, i) => `{"title":"t${i}"}`).join(',');
    expect(parseProposalsLine(`PROPOSALS:[${many}]`)).toHaveLength(MAX_PROPOSALS);
    const long = 'x'.repeat(500);
    const parsed = parseProposalsLine(
      `PROPOSALS:[{"title":"  ${long}  "},{"title":""},{"nope":1},null,"str"]`,
    );
    expect(parsed).toHaveLength(1);
    expect((parsed[0]?.title ?? '').length).toBe(200);
  });

  it('never throws: no line, bad JSON, or a non-array all yield []', () => {
    expect(parseProposalsLine('no proposals here')).toEqual([]);
    expect(parseProposalsLine('PROPOSALS:[broken')).toEqual([]);
    expect(parseProposalsLine('PROPOSALS:[}]')).toEqual([]);
  });

  it('trims leading/trailing whitespace from a title', () => {
    const parsed = parseProposalsLine('PROPOSALS:[{"title":"  Add retries  "}]');
    expect(parsed[0]?.title).toBe('Add retries');
  });

  it('flags invalidTags when only ONE of dimension/severity is out-of-enum', () => {
    const parsed = parseProposalsLine(
      'PROPOSALS:[{"title":"t","dimension":"ux","severity":"blocker"}]',
    );
    expect(parsed[0]).toMatchObject({ dimension: 'ux', severity: null, invalidTags: true });
  });

  it('does not match PROPOSALS: appearing mid-line (must be at line start)', () => {
    expect(parseProposalsLine('note: PROPOSALS:[{"title":"t"}]')).toEqual([]);
  });

  it('does not match when trailing non-whitespace content follows the array on the same line', () => {
    expect(parseProposalsLine('PROPOSALS:[{"title":"t"}] trailing junk')).toEqual([]);
  });

  it('allows trailing whitespace after the array on the same line', () => {
    const parsed = parseProposalsLine('PROPOSALS:[{"title":"t"}]   ');
    expect(parsed).toEqual([
      { title: 't', dimension: null, severity: null, invalidTags: false, fromBacklog: false },
    ]);
  });
});

describe('parseMetricsLine', () => {
  it('parses a well-formed METRICS line', () => {
    const text =
      'work done\nMETRICS:{"item":"AP-1","outcome":"shipped","sha":"abc123","kind":"feat","testsBefore":10,"testsAfter":12}\n';
    const parsed = parseMetricsLine(text);
    expect(parsed.status).toBe('ok');
    expect(parsed.report).toMatchObject({
      item: 'AP-1',
      outcome: 'shipped',
      sha: 'abc123',
      kind: 'feat',
      testsBefore: 10,
      testsAfter: 12,
    });
  });

  it('returns the LAST METRICS line when an earlier one was narrated first (the documented contract)', () => {
    // An agent may print an illustrative/preliminary METRICS line mid-output and
    // then emit the real one as its final line. The contract is "the last wins";
    // recording the first would persist the wrong firing outcome.
    const text =
      'METRICS:{"item":"draft","outcome":"deferred"}\n' +
      'METRICS:{"item":"final","outcome":"shipped","sha":"abc"}\n';
    const parsed = parseMetricsLine(text);
    expect(parsed.status).toBe('ok');
    expect(parsed.report).toMatchObject({ item: 'final', outcome: 'shipped', sha: 'abc' });
  });

  it('reports missing when there is no METRICS line', () => {
    expect(parseMetricsLine('just some prose, no metrics')).toEqual({
      status: 'missing',
      report: null,
    });
  });

  it('reports malformed on invalid JSON', () => {
    expect(parseMetricsLine('METRICS:{not valid json}')).toEqual({
      status: 'malformed',
      report: null,
    });
  });

  it('ignores a non-object METRICS payload as missing (object-only pattern)', () => {
    expect(parseMetricsLine('METRICS:[1,2,3]')).toEqual({ status: 'missing', report: null });
  });

  it('coerces wrong-typed fields to null (untrusted input)', () => {
    const parsed = parseMetricsLine('METRICS:{"item":42,"testsBefore":"ten","outcome":"deferred"}');
    expect(parsed.status).toBe('ok');
    expect(parsed.report).toMatchObject({ item: null, testsBefore: null, outcome: 'deferred' });
  });

  it('parses a "slice" completion so a partial-slice claim can be told apart from a full ship', () => {
    const parsed = parseMetricsLine(
      'METRICS:{"item":"AP-1","outcome":"shipped","sha":"abc","completion":"slice"}',
    );
    expect(parsed.report).toMatchObject({ completion: 'slice' });
  });

  it('drops an out-of-enum completion value to null instead of throwing (fail-loud parse boundary)', () => {
    const parsed = parseMetricsLine('METRICS:{"item":"AP-1","completion":"mostly"}');
    expect(parsed.report).toMatchObject({ completion: null });
  });

  it('defaults completion to null when absent (pre-existing firings never set it)', () => {
    const parsed = parseMetricsLine('METRICS:{"item":"AP-1","outcome":"shipped"}');
    expect(parsed.report).toMatchObject({ completion: null });
  });

  it('parses self-reported TDD-first compliance on a fix', () => {
    const compliant = parseMetricsLine('METRICS:{"item":"AP-1","kind":"fix","testFirst":true}');
    expect(compliant.report).toMatchObject({ testFirst: true });
    const violated = parseMetricsLine('METRICS:{"item":"AP-1","kind":"fix","testFirst":false}');
    expect(violated.report).toMatchObject({ testFirst: false });
  });

  it('defaults testFirst to null when absent or wrong-typed (untrusted input)', () => {
    expect(parseMetricsLine('METRICS:{"item":"AP-1"}').report).toMatchObject({ testFirst: null });
    expect(parseMetricsLine('METRICS:{"item":"AP-1","testFirst":"yes"}').report).toMatchObject({
      testFirst: null,
    });
  });

  it('parses PICK DISCIPLINE fields: picked_rank and deviation_reason', () => {
    const top = parseMetricsLine('METRICS:{"item":"AP-1","picked_rank":1}');
    expect(top.report).toMatchObject({ pickedRank: 1, deviationReason: null });

    const deviated = parseMetricsLine(
      'METRICS:{"item":"AP-1","picked_rank":3,"deviation_reason":"top task needs a human"}',
    );
    expect(deviated.report).toMatchObject({
      pickedRank: 3,
      deviationReason: 'top task needs a human',
    });
  });

  it('defaults picked_rank/deviation_reason to null when absent or wrong-typed (untrusted input)', () => {
    expect(parseMetricsLine('METRICS:{"item":"AP-1"}').report).toMatchObject({
      pickedRank: null,
      deviationReason: null,
    });
    expect(parseMetricsLine('METRICS:{"item":"AP-1","picked_rank":"first"}').report).toMatchObject({
      pickedRank: null,
    });
  });

  it('parses area, verifierUsed, and deferredTo fields', () => {
    const parsed = parseMetricsLine(
      'METRICS:{"item":"AP-1","area":"engine","verifierUsed":"tdd-guide","deferredTo":"AP-2"}',
    );
    expect(parsed.report).toMatchObject({
      area: 'engine',
      verifierUsed: 'tdd-guide',
      deferredTo: 'AP-2',
    });
  });

  it('parses a "complete" completion value', () => {
    const parsed = parseMetricsLine('METRICS:{"item":"AP-1","completion":"complete"}');
    expect(parsed.report).toMatchObject({ completion: 'complete' });
  });

  it('rejects a non-finite number (JSON numeric overflow) as null, not the literal value', () => {
    const parsed = parseMetricsLine('METRICS:{"testsBefore":1e999}');
    expect(parsed.report).toMatchObject({ testsBefore: null });
  });

  it('does not match METRICS: appearing mid-line (must be at line start)', () => {
    expect(parseMetricsLine('prefix METRICS:{"item":"x"}')).toEqual({
      status: 'missing',
      report: null,
    });
  });

  it('does not match when trailing non-whitespace content follows the JSON on the same line', () => {
    expect(parseMetricsLine('METRICS:{"item":"x"} trailing junk')).toEqual({
      status: 'missing',
      report: null,
    });
  });

  it('allows trailing whitespace after the JSON on the same line', () => {
    const parsed = parseMetricsLine('METRICS:{"item":"x"}   ');
    expect(parsed.status).toBe('ok');
  });
});

const okParsed = (report: ParsedMetrics['report']): ParsedMetrics => ({ status: 'ok', report });
const missingParsed: ParsedMetrics = { status: 'missing', report: null };

describe('resolveIteration', () => {
  it('prefers the self-report when present', () => {
    const parsed = parseMetricsLine(
      'METRICS:{"item":"AP-9","outcome":"shipped","sha":"deadbeef","kind":"fix"}',
    );
    const r = resolveIteration(parsed, { envelopeOk: true, headAdvanced: true, commit: null });
    expect(r).toMatchObject({
      item: 'AP-9',
      outcome: 'shipped',
      sha: 'deadbeef',
      kind: 'fix',
      iterMetrics: 'ok',
    });
  });

  it('derives from the commit when the self-report is missing but HEAD advanced', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: 'feat: add AP-42 the thing', shortSha: 'cafe123' },
    });
    expect(r).toMatchObject({
      item: 'AP-42',
      outcome: 'shipped',
      sha: 'cafe123',
      kind: 'feat',
      iterMetrics: 'inferred',
    });
  });

  it('falls back to "inferred" item when the commit has no ticket id', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: 'chore: tidy up', shortSha: 'f00d' },
    });
    expect(r).toMatchObject({ item: 'inferred', kind: 'chore', iterMetrics: 'inferred' });
  });

  it('derives a BOARD task id (web-…-…) from the commit subject — not just JIRA-style tickets', () => {
    // 2026-08-22 live gap: a firing that omitted METRICS but committed
    // "feat(dashboard): opt-in browser notifications … (web-msnsndlk-exw3t9)"
    // resolved item='inferred' — the JIRA-only ticket regex never matched the
    // board id sitting right in the subject, so the shipped task stayed
    // queued forever and had to be re-judged by a later firing at real cost.
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: {
        subject: 'feat(dashboard): opt-in browser notifications (web-msnsndlk-exw3t9)',
        shortSha: 'beef42',
      },
    });
    expect(r).toMatchObject({
      item: 'web-msnsndlk-exw3t9',
      outcome: 'shipped',
      iterMetrics: 'inferred',
    });
  });

  it('prefers the JIRA-style ticket when a subject carries both shapes', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: 'fix: AP-7 follow-up for web-msabcdef-1a2b3c', shortSha: 'd00d' },
    });
    expect(r).toMatchObject({ item: 'AP-7' });
  });

  it('marks envelope-error and keeps self-report fields when the envelope is missing', () => {
    const parsed = okParsed({
      item: 'AP-3',
      outcome: 'shipped',
      sha: 's',
      kind: 'feat',
      area: null,
      verifierUsed: null,
      deferredTo: null,
      testsBefore: null,
      testsAfter: null,
      completion: null,
      testFirst: null,
      pickedRank: null,
      deviationReason: null,
    });
    const r = resolveIteration(parsed, { envelopeOk: false, headAdvanced: false, commit: null });
    expect(r.iterMetrics).toBe('envelope-error');
    expect(r.item).toBe('AP-3');
  });

  it('keeps envelope-error (not inferred) when deriving from a commit without an envelope', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: false,
      headAdvanced: true,
      commit: { subject: 'fix: patch', shortSha: 'abc' },
    });
    expect(r.iterMetrics).toBe('envelope-error');
    expect(r.item).toBe('inferred');
  });

  it('returns nulls with the raw status when there is no report and no commit', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: false,
      commit: null,
    });
    expect(r).toMatchObject({
      item: null,
      sha: null,
      outcome: null,
      iterMetrics: 'missing',
      completion: null,
    });
  });

  it('carries a self-reported "slice" completion through untouched', () => {
    const parsed = parseMetricsLine(
      'METRICS:{"item":"AP-9","outcome":"shipped","sha":"deadbeef","completion":"slice"}',
    );
    const r = resolveIteration(parsed, { envelopeOk: true, headAdvanced: true, commit: null });
    expect(r.completion).toBe('slice');
  });

  it('trusts a commit-derived (no self-report) ship as "complete" — nothing said otherwise', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: 'feat: add AP-42 the thing', shortSha: 'cafe123' },
    });
    expect(r.completion).toBe('complete');
  });

  it('derives kind as null when the commit subject does not start with a lowercase word (regex must be anchored)', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: '42: fix urgent bug', shortSha: 'abc' },
    });
    expect(r.kind).toBeNull();
  });

  it('does not derive from a commit when a commit exists but HEAD did not advance (both operands required)', () => {
    const r = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: false,
      commit: { subject: 'feat: add AP-42 the thing', shortSha: 'cafe123' },
    });
    expect(r).toMatchObject({ item: null, sha: null, outcome: null, iterMetrics: 'missing' });
  });

  it('carries a self-reported testFirst through, and derives it as null (nothing said otherwise)', () => {
    const parsed = parseMetricsLine('METRICS:{"item":"AP-9","kind":"fix","testFirst":true}');
    const reported = resolveIteration(parsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    expect(reported.testFirst).toBe(true);

    const derived = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: 'fix: patch AP-9', shortSha: 'cafe123' },
    });
    expect(derived.testFirst).toBeNull();
  });

  it('carries a self-reported picked_rank/deviation_reason through, and derives both as null', () => {
    const parsed = parseMetricsLine(
      'METRICS:{"item":"AP-9","picked_rank":2,"deviation_reason":"top task blocked on ops"}',
    );
    const reported = resolveIteration(parsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    expect(reported.pickedRank).toBe(2);
    expect(reported.deviationReason).toBe('top task blocked on ops');

    const derived = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: 'fix: patch AP-9', shortSha: 'cafe123' },
    });
    expect(derived.pickedRank).toBeNull();
    expect(derived.deviationReason).toBeNull();
  });
});

describe('computeMaxTurnsHit', () => {
  it('is true on an explicit max_turns stop reason', () => {
    expect(computeMaxTurnsHit('max_turns', 5, 120)).toBe(true);
  });
  it('is true when turns reach the ceiling', () => {
    expect(computeMaxTurnsHit('end_turn', 120, 120)).toBe(true);
  });
  it('is false below the ceiling with a normal stop', () => {
    expect(computeMaxTurnsHit('end_turn', 30, 120)).toBe(false);
    expect(computeMaxTurnsHit(null, null, 120)).toBe(false);
  });
  it('is false when numTurns is null even if maxTurns is zero (the null check must short-circuit, not coerce)', () => {
    expect(computeMaxTurnsHit('end_turn', null, 0)).toBe(false);
  });
});

const ENV: EnvelopeFacts = {
  model: 'opus',
  exitCode: 0,
  isError: false,
  stopReason: 'end_turn',
  numTurns: 12,
  durationMs: 4000,
  costUsd: 6,
  tokensIn: 100,
  tokensOut: 200,
  cacheRead: 5000,
  cacheCreate: 50,
};

const CTX: FiringContext = {
  ts: '2026-07-07T00:00:00Z',
  firing: 1,
  promptVersion: 'abcd1234',
  retro: false,
  attempts: 1,
  quotaFallback: false,
  startedOn: 'primary',
  quotaStreak: 0,
  globalExhaust: false,
  headAdvanced: true,
  headBefore: 'h0',
  headAfter: 'h1',
  shaVerified: true,
  gateResult: 'passed',
  gateChecks: [{ label: 'typecheck', pass: true, durationMs: 10 }],
  resumed: null,
  guardDenials: 0,
  guardDenialDetails: [],
  subscriptionPriceUsd: null,
  machineWide30dListPriceUsd: null,
};

describe('buildFiringRecord', () => {
  it('assembles the record, computes testsDelta + shipped, and maps envelope facts', () => {
    const iter = resolveIteration(
      parseMetricsLine(
        'METRICS:{"item":"AP-1","outcome":"shipped","sha":"abc","kind":"feat","testsBefore":10,"testsAfter":13,"picked_rank":1}',
      ),
      { envelopeOk: true, headAdvanced: true, commit: null },
    );
    const rec = buildFiringRecord(CTX, ENV, iter, 120);
    expect(rec).toMatchObject({
      firing: 1,
      model: 'opus',
      item: 'AP-1',
      outcome: 'shipped',
      shipped: true,
      sha: 'abc',
      kind: 'feat',
      testsBefore: 10,
      testsAfter: 13,
      testsDelta: 3,
      maxTurnsHit: false,
      costUsd: 6,
      cacheRead: 5000,
      gateChecks: [{ label: 'typecheck', pass: true, durationMs: 10 }],
      pickedRank: 1,
      deviationReason: null,
      headBefore: 'h0',
      headAfter: 'h1',
    });
  });

  it('leaves testsDelta null when either bound is missing, and shipped false for non-ship outcomes', () => {
    const iter = resolveIteration(
      parseMetricsLine('METRICS:{"outcome":"deferred","testsBefore":10}'),
      {
        envelopeOk: true,
        headAdvanced: false,
        commit: null,
      },
    );
    const rec = buildFiringRecord(
      { ...CTX, gateResult: 'no-commit', shaVerified: false },
      ENV,
      iter,
      120,
    );
    expect(rec.testsDelta).toBeNull();
    expect(rec.shipped).toBe(false);
  });

  it('telemetry fairness: marks shipped (with an inferred item) when the gate passed a sha-verified commit even though the agent self-reported a non-ship outcome', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"noop"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    const rec = buildFiringRecord(CTX, ENV, iter, 120);
    expect(rec.shipped).toBe(true);
    expect(rec.outcome).toBe('shipped');
    expect(rec.item).toBe('inferred');
  });

  it('telemetry fairness: keeps the self-reported item when one was actually given', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"item":"AP-7","outcome":"noop"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    const rec = buildFiringRecord(CTX, ENV, iter, 120);
    expect(rec.shipped).toBe(true);
    expect(rec.item).toBe('AP-7');
  });

  it('does NOT mark shipped when the agent claims "shipped" but no commit landed (G2)', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"shipped","sha":"fake"}'), {
      envelopeOk: true,
      headAdvanced: false,
      commit: null,
    });
    const rec = buildFiringRecord(
      { ...CTX, gateResult: 'no-commit', headAdvanced: false },
      ENV,
      iter,
      120,
    );
    expect(rec.shipped).toBe(false);
    expect(rec.gateResult).toBe('no-commit');
  });

  it('propagates a self-reported "slice" completion into the record (task must stay open)', () => {
    const iter = resolveIteration(
      parseMetricsLine(
        'METRICS:{"item":"AP-1","outcome":"shipped","sha":"abc","completion":"slice"}',
      ),
      { envelopeOk: true, headAdvanced: true, commit: null },
    );
    const rec = buildFiringRecord(CTX, ENV, iter, 120);
    expect(rec.shipped).toBe(true);
    expect(rec.completion).toBe('slice');
  });

  it('propagates self-reported TDD-first compliance into the record', () => {
    const iter = resolveIteration(
      parseMetricsLine(
        'METRICS:{"item":"AP-1","outcome":"shipped","sha":"abc","kind":"fix","testFirst":true}',
      ),
      { envelopeOk: true, headAdvanced: true, commit: null },
    );
    const rec = buildFiringRecord(CTX, ENV, iter, 120);
    expect(rec.testFirst).toBe(true);
  });

  it('flags completionMissing when a shipped firing self-reports no completion tag (board web-msnshawt-1yd7px)', () => {
    const iter = resolveIteration(
      parseMetricsLine('METRICS:{"item":"AP-1","outcome":"shipped","sha":"abc"}'),
      { envelopeOk: true, headAdvanced: true, commit: null },
    );
    const rec = buildFiringRecord(CTX, ENV, iter, 120);
    expect(rec.shipped).toBe(true);
    expect(rec.completion).toBeNull();
    expect(rec.completionMissing).toBe(true);
  });

  it('does not flag completionMissing when the shipped firing tags "slice" or "complete"', () => {
    const sliceIter = resolveIteration(
      parseMetricsLine(
        'METRICS:{"item":"AP-1","outcome":"shipped","sha":"abc","completion":"slice"}',
      ),
      { envelopeOk: true, headAdvanced: true, commit: null },
    );
    expect(buildFiringRecord(CTX, ENV, sliceIter, 120).completionMissing).toBe(false);

    const completeIter = resolveIteration(
      parseMetricsLine(
        'METRICS:{"item":"AP-1","outcome":"shipped","sha":"abc","completion":"complete"}',
      ),
      { envelopeOk: true, headAdvanced: true, commit: null },
    );
    expect(buildFiringRecord(CTX, ENV, completeIter, 120).completionMissing).toBe(false);
  });

  it('does not flag completionMissing on a non-shipped firing even with no completion tag', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"noop"}'), {
      envelopeOk: true,
      headAdvanced: false,
      commit: null,
    });
    const rec = buildFiringRecord(
      { ...CTX, gateResult: 'no-commit', shaVerified: false },
      ENV,
      iter,
      120,
    );
    expect(rec.shipped).toBe(false);
    expect(rec.completionMissing).toBe(false);
  });

  it('does not flag completionMissing on a derived/inferred shipped firing (no self-report to omit the tag)', () => {
    const iter = resolveIteration(missingParsed, {
      envelopeOk: true,
      headAdvanced: true,
      commit: { subject: 'feat: inferred ship', shortSha: 'deadbee' },
    });
    const rec = buildFiringRecord(CTX, ENV, iter, 120);
    expect(rec.shipped).toBe(true);
    expect(rec.completion).toBe('complete');
    expect(rec.completionMissing).toBe(false);
  });

  it('records a reverted firing honestly, overriding a "shipped" self-report', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"shipped","sha":"abc"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    const rec = buildFiringRecord({ ...CTX, gateResult: 'reverted' }, ENV, iter, 120);
    expect(rec.outcome).toBe('reverted');
    expect(rec.shipped).toBe(false);
    expect(rec.gateResult).toBe('reverted');
  });

  it('leaves testsDelta null when testsBefore is missing but testsAfter is present (both bounds required)', () => {
    const iter = resolveIteration(
      parseMetricsLine('METRICS:{"outcome":"deferred","testsAfter":12}'),
      {
        envelopeOk: true,
        headAdvanced: false,
        commit: null,
      },
    );
    const rec = buildFiringRecord(
      { ...CTX, gateResult: 'no-commit', shaVerified: false },
      ENV,
      iter,
      120,
    );
    expect(rec.testsDelta).toBeNull();
  });

  it('telemetry fairness: marks shipped from a self-report alone when gate passed but sha was not verified', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"shipped","sha":"abc"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    const rec = buildFiringRecord({ ...CTX, shaVerified: false }, ENV, iter, 120);
    expect(rec.shipped).toBe(true);
  });

  it('does not mark shipped from a non-ship self-report when the gate passed but sha was not verified', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"noop"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    const rec = buildFiringRecord({ ...CTX, shaVerified: false }, ENV, iter, 120);
    expect(rec.shipped).toBe(false);
  });

  it('WARM SESSIONS (docs/epics/0009-warm-sessions.md): threads ctx.resumed through to the persisted record', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"shipped","sha":"abc"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    expect(buildFiringRecord({ ...CTX, resumed: true }, ENV, iter, 120).resumed).toBe(true);
    expect(buildFiringRecord({ ...CTX, resumed: false }, ENV, iter, 120).resumed).toBe(false);
    expect(buildFiringRecord({ ...CTX, resumed: null }, ENV, iter, 120).resumed).toBeNull();
  });

  it('threads ctx.guardDenials through to the persisted record (headless surfacing sweep, board web-msnqqjmd-9bx0wd)', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"shipped","sha":"abc"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    expect(buildFiringRecord({ ...CTX, guardDenials: 0 }, ENV, iter, 120).guardDenials).toBe(0);
    expect(buildFiringRecord({ ...CTX, guardDenials: 4 }, ENV, iter, 120).guardDenials).toBe(4);
  });

  it('threads ctx.guardDenialDetails through to the persisted record (GUARD-DENIAL telemetry, board web-msr0ug27-hj1w27)', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"shipped","sha":"abc"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    const detail = { kind: 'containment' as const, target: 'outside the target repo.' };
    expect(
      buildFiringRecord({ ...CTX, guardDenialDetails: [] }, ENV, iter, 120).guardDenialDetails,
    ).toEqual([]);
    expect(
      buildFiringRecord({ ...CTX, guardDenialDetails: [detail] }, ENV, iter, 120)
        .guardDenialDetails,
    ).toEqual([detail]);
  });

  it('cost semantics v3: derives realCostUsd from ctx subscriptionPriceUsd/pool total, null when unconfigured', () => {
    const iter = resolveIteration(parseMetricsLine('METRICS:{"outcome":"shipped","sha":"abc"}'), {
      envelopeOk: true,
      headAdvanced: true,
      commit: null,
    });
    expect(buildFiringRecord(CTX, ENV, iter, 120).realCostUsd).toBeNull();
    const configured = {
      ...CTX,
      subscriptionPriceUsd: 100,
      machineWide30dListPriceUsd: 1000,
    };
    // ENV.costUsd is 6 (see ENV above): 6 * (100 / 1000) = 0.6.
    expect(buildFiringRecord(configured, ENV, iter, 120).realCostUsd).toBeCloseTo(0.6);
  });
});

describe('isBadFiring', () => {
  it('flags error, max-turns, envelope-error, and non-zero exit', () => {
    expect(isBadFiring({ ...ENV, isError: true }, 'ok', false)).toBe(true);
    expect(isBadFiring(ENV, 'ok', true)).toBe(true);
    expect(isBadFiring(ENV, 'envelope-error', false)).toBe(true);
    expect(isBadFiring({ ...ENV, exitCode: 1 }, 'ok', false)).toBe(true);
  });
  it('is false for a clean firing', () => {
    expect(isBadFiring(ENV, 'ok', false)).toBe(false);
  });
});

describe('classifyNoop (NOOP→VERDICT, lever 6)', () => {
  const VERDICT: TaskProposal = {
    title: 'VERDICT split web-abc123: needs three separate slices',
    dimension: null,
    severity: null,
    invalidTags: false,
    fromBacklog: false,
  };

  it('is null for any gateResult other than no-commit — verdict classification is noop-only', () => {
    expect(classifyNoop('passed', undefined)).toBeNull();
    expect(classifyNoop('reverted', undefined)).toBeNull();
    expect(classifyNoop('checkpointed', undefined)).toBeNull();
    expect(classifyNoop('skipped', undefined)).toBeNull();
    expect(classifyNoop('unverifiable', undefined)).toBeNull();
  });

  it('is silent for a no-commit firing with no proposals — the waste this lever targets', () => {
    expect(classifyNoop('no-commit', undefined)).toBe('silent');
    expect(classifyNoop('no-commit', [])).toBe('silent');
  });

  it('is verdict-carrying for a no-commit firing that emitted at least one PROPOSALS entry', () => {
    expect(classifyNoop('no-commit', [VERDICT])).toBe('verdict-carrying');
  });
});

describe('mergeEnvelopeFacts (FINISH-LINE EXTENSION accounting)', () => {
  it('sums resource fields and takes status fields from the FINAL attempt', () => {
    const first: EnvelopeFacts = { ...ENV, stopReason: 'max_turns', model: 'sonnet' };
    const last: EnvelopeFacts = { ...ENV, numTurns: 8, costUsd: 1.5, stopReason: 'end_turn' };
    const merged = mergeEnvelopeFacts(first, last);
    expect(merged.numTurns).toBe(20);
    expect(merged.costUsd).toBe(7.5);
    expect(merged.tokensIn).toBe(200);
    expect(merged.stopReason).toBe('end_turn'); // the extension ending IS the firing ending
    expect(merged.model).toBe('opus'); // final attempt
  });

  it('null-safe sums: one side carries, both-null stays null (never a fabricated 0)', () => {
    const first: EnvelopeFacts = { ...ENV, costUsd: null, numTurns: null, durationMs: null };
    const last: EnvelopeFacts = { ...ENV, costUsd: 2, numTurns: null, durationMs: null };
    const merged = mergeEnvelopeFacts(first, last);
    expect(merged.costUsd).toBe(2); // one side present carries
    expect(merged.numTurns).toBeNull(); // both absent stays honestly unknown
    expect(merged.durationMs).toBeNull();
  });
});
