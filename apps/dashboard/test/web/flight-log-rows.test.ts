// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure flight-log row math
 * (`web/flight-log-rows.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `flightlog-slice-aware.test.ts` and
 * `project-page.test.ts` already regression-test parts of this logic
 * indirectly through the rendered DOM in `clientJs()`; these tests exercise
 * the real functions directly instead.
 */

import { describe, it, expect } from 'vitest';
import {
  flightLogDisplayRows,
  flightDetailLine,
  flightGroupSummary,
  sliceChipMeta,
  flightLogRowMeta,
  flightGroupHeadMeta,
  flightCostAgoMeta,
  flightLogMoreMeta,
} from '../../src/web/flight-log-rows.js';
import { fmtCost } from '../../src/web/format.js';

const verdictOf = (row: { verdict: string }) => row.verdict;

describe('flightLogDisplayRows', () => {
  it('collapses a run of 2+ consecutive same-task slices into one group row', () => {
    const log = [
      { id: 'f4', item: 'epic1', completion: 'slice' },
      { id: 'f3', item: 'epic1', completion: 'slice' },
      { id: 'f2', item: 'epic1', completion: 'slice' },
      { id: 'f1', item: null, completion: null },
      { id: 'f0', item: 'epic2', completion: 'slice' },
    ];
    const rows = flightLogDisplayRows(log);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ isGroup: true, item: 'epic1', rows: log.slice(0, 3) });
    expect(rows[1]).toEqual({ isGroup: false, row: log[3] });
    expect(rows[2]).toEqual({ isGroup: false, row: log[4] });
  });

  it('does not group an isolated slice with no run partner', () => {
    const isolated = { id: 'f0', item: 'epic2', completion: 'slice' };
    const rows = flightLogDisplayRows([isolated]);
    expect(rows).toEqual([{ isGroup: false, row: isolated }]);
  });

  it('does not group consecutive slices that advance different tasks', () => {
    const a = { id: 'f1', item: 'epic1', completion: 'slice' };
    const b = { id: 'f0', item: 'epic2', completion: 'slice' };
    const rows = flightLogDisplayRows([a, b]);
    expect(rows).toEqual([
      { isGroup: false, row: a },
      { isGroup: false, row: b },
    ]);
  });

  it('does not group non-slice firings even when they share an item id', () => {
    const a = { id: 'f1', item: 'epic1', completion: null };
    const b = { id: 'f0', item: 'epic1', completion: null };
    const rows = flightLogDisplayRows([a, b]);
    expect(rows).toEqual([
      { isGroup: false, row: a },
      { isGroup: false, row: b },
    ]);
  });

  it('groups an entire run at the start followed by an unrelated tail', () => {
    const a = { id: 'f2', item: 'epic1', completion: 'slice' };
    const b = { id: 'f1', item: 'epic1', completion: 'slice' };
    const c = { id: 'f0', item: null, completion: null };
    const rows = flightLogDisplayRows([a, b, c]);
    expect(rows).toEqual([
      { isGroup: true, item: 'epic1', rows: [a, b] },
      { isGroup: false, row: c },
    ]);
  });

  it('returns an empty array for an empty log', () => {
    expect(flightLogDisplayRows([])).toEqual([]);
  });
});

describe('flightDetailLine', () => {
  it('joins verdict, kind, sha, turns, and cost for a plain shipped firing', () => {
    const line = flightDetailLine(
      { kind: 'feat', sha: 'abc1234', turns: 12, cost: 0.42 },
      'shipped',
      fmtCost,
    );
    expect(line).toBe('shipped · feat · abc1234 · 12 turns · $0.42');
  });

  it('drops null kind/sha and defaults missing turns/cost to zero', () => {
    const line = flightDetailLine({ kind: null, sha: null }, 'shipped', fmtCost);
    expect(line).toBe('shipped · 0 turns · $0.00');
  });

  it('appends the model that ran the firing when recorded', () => {
    const line = flightDetailLine(
      { kind: 'feat', sha: 'abc1234', turns: 12, cost: 0.42, model: 'claude-sonnet-5' },
      'shipped',
      fmtCost,
    );
    expect(line).toBe('shipped · feat · abc1234 · 12 turns · $0.42 · claude-sonnet-5');
  });

  it('omits the model segment when none was recorded', () => {
    const line = flightDetailLine({ turns: 3, cost: 1 }, 'shipped', fmtCost);
    expect(line).toBe('shipped · 3 turns · $1.00');
  });

  it('appends the failed-check clause for a reverted firing', () => {
    const line = flightDetailLine(
      { turns: 3, cost: 1, failedCheck: 'typecheck' },
      'reverted',
      fmtCost,
    );
    expect(line).toBe('reverted · 3 turns · $1.00 · typecheck failed');
  });

  it('omits the failed-check clause for a reverted firing with no failedCheck', () => {
    const line = flightDetailLine({ turns: 3, cost: 1 }, 'reverted', fmtCost);
    expect(line).toBe('reverted · 3 turns · $1.00');
  });

  it('appends the checkpoint clause for a checkpointed firing', () => {
    const line = flightDetailLine({ turns: 118, cost: 2.5 }, 'checkpointed', fmtCost);
    expect(line).toBe(
      'checkpointed · 118 turns · $2.50 · hit the turn cap mid-unit — WIP packed into a checkpoint commit, next firing resumes it',
    );
  });

  it('appends the turn-cap clause for a turn-capped firing', () => {
    const line = flightDetailLine({ turns: 120 }, 'turn-capped', fmtCost);
    expect(line).toBe('turn-capped · 120 turns · $0.00 · hit the per-firing turn ceiling mid-work');
  });

  it('appends the CLI-error clause for an errored firing', () => {
    const line = flightDetailLine({ turns: 5 }, 'errored', fmtCost);
    expect(line).toBe('errored · 5 turns · $0.00 · CLI exited in error before any commit');
  });

  it('names the crashed check for an unverified firing with a failedCheck', () => {
    const line = flightDetailLine({ turns: 7, failedCheck: 'build' }, 'unverified', fmtCost);
    expect(line).toBe(
      'unverified · 7 turns · $0.00 · build crashed before it could judge the work — commit left in place',
    );
  });

  it('falls back to a generic gate-crash clause for an unverified firing with no failedCheck', () => {
    const line = flightDetailLine({ turns: 7 }, 'unverified', fmtCost);
    expect(line).toBe(
      'unverified · 7 turns · $0.00 · the gate crashed before it could judge the work — commit left in place',
    );
  });
});

describe('flightGroupSummary', () => {
  it('sums cost across every slice, resolves the task title, and builds the headline', () => {
    const rows = [
      { id: 'f3', cost: 0.2, verdict: 'shipped' },
      { id: 'f2', cost: 0.15, verdict: 'shipped' },
      { id: 'f1', cost: 0.25, verdict: 'shipped' },
    ];
    const entry = { isGroup: true as const, item: 'epic1', rows };
    const taskById = { epic1: { title: 'Ship the whole galaxy feature' } };
    const summary = flightGroupSummary(entry, taskById, verdictOf);
    expect(summary.newest).toBe(rows[0]);
    expect(summary.taskTitle).toBe('Ship the whole galaxy feature');
    expect(summary.totalCost).toBeCloseTo(0.6);
    expect(summary.groupId).toBe('group:epic1:f3');
    expect(summary.verdict).toBe('shipped');
    expect(summary.headline).toBe('Ship the whole galaxy feature — 3 slices');
  });

  it('falls back to the raw task id when the task is missing from taskById', () => {
    const rows = [{ id: 'f1', cost: 1, verdict: 'shipped' }];
    const entry = { isGroup: true as const, item: 'gone-task', rows };
    const summary = flightGroupSummary(entry, {}, verdictOf);
    expect(summary.taskTitle).toBe('gone-task');
    expect(summary.headline).toBe('gone-task — 1 slices');
  });

  it('treats a missing cost on any slice as zero', () => {
    const rows = [
      { id: 'f2', verdict: 'shipped' },
      { id: 'f1', cost: 0.5, verdict: 'shipped' },
    ];
    const entry = { isGroup: true as const, item: 'epic1', rows };
    const summary = flightGroupSummary(entry, { epic1: { title: 'Epic' } }, verdictOf);
    expect(summary.totalCost).toBe(0.5);
  });

  it('derives the verdict and groupId from the newest (first) row', () => {
    const rows = [
      { id: 'newest', cost: 0, verdict: 'reverted' },
      { id: 'older', cost: 0, verdict: 'shipped' },
    ];
    const entry = { isGroup: true as const, item: 'epic1', rows };
    const summary = flightGroupSummary(entry, { epic1: { title: 'Epic' } }, verdictOf);
    expect(summary.verdict).toBe('reverted');
    expect(summary.groupId).toBe('group:epic1:newest');
  });
});

describe('sliceChipMeta', () => {
  it('leaves a short title untruncated in the text and repeats it verbatim in the tip and aria-label', () => {
    const meta = sliceChipMeta('Ship the whole galaxy feature');
    expect(meta.text).toBe('slice of Ship the whole galaxy feature');
    expect(meta.tip).toBe('Part of a multi-firing task, still open: Ship the whole galaxy feature');
    expect(meta.ariaLabel).toBe('slice of Ship the whole galaxy feature');
  });

  it('truncates a title over 40 chars in the text but keeps the tip and aria-label untruncated', () => {
    const title = 'A very long task title that definitely exceeds forty characters';
    const meta = sliceChipMeta(title);
    expect(meta.text).toBe('slice of ' + title.slice(0, 40) + '…');
    expect(meta.tip).toBe('Part of a multi-firing task, still open: ' + title);
    expect(meta.ariaLabel).toBe('slice of ' + title);
  });

  it('leaves a title exactly 40 chars untruncated (boundary)', () => {
    const title = 'a'.repeat(40);
    const meta = sliceChipMeta(title);
    expect(meta.text).toBe('slice of ' + title);
  });

  it('truncates a title at 41 chars (boundary)', () => {
    const title = 'a'.repeat(41);
    const meta = sliceChipMeta(title);
    expect(meta.text).toBe('slice of ' + 'a'.repeat(40) + '…');
  });
});

describe('flightGroupHeadMeta', () => {
  const fmtAgo = (at: number): string => `${at}ms ago`;

  it("builds the dot tip/aria-label from the newest slice's verdict", () => {
    const meta = flightGroupHeadMeta(
      'shipped',
      3,
      'Epic',
      0.6,
      'Epic — 3 slices',
      1000,
      fmtCost,
      fmtAgo,
    );
    expect(meta.dotTip).toBe('Most recent slice ended: shipped');
    expect(meta.dotAriaLabel).toBe('verdict: shipped');
  });

  it('builds the item tip from the slice count, task title, and total cost, and the item aria-label from the headline', () => {
    const meta = flightGroupHeadMeta(
      'shipped',
      3,
      'Ship the galaxy',
      0.6,
      'Ship the galaxy — 3 slices',
      1000,
      fmtCost,
      fmtAgo,
    );
    expect(meta.itemTip).toBe('3 firings advanced "Ship the galaxy", still open — total $0.60');
    expect(meta.itemAriaLabel).toBe('Ship the galaxy — 3 slices');
  });

  it('builds the cost tip/aria-label from the slice count and total cost', () => {
    const meta = flightGroupHeadMeta(
      'shipped',
      3,
      'Epic',
      0.6,
      'Epic — 3 slices',
      1000,
      fmtCost,
      fmtAgo,
    );
    expect(meta.costTip).toBe('Total spend across all 3 slices');
    expect(meta.costAriaLabel).toBe('total cost: $0.60');
  });

  it("builds the ago tip/aria-label via the injected fmtAgo applied to the newest slice's timestamp", () => {
    const meta = flightGroupHeadMeta(
      'shipped',
      3,
      'Epic',
      0.6,
      'Epic — 3 slices',
      1000,
      fmtCost,
      fmtAgo,
    );
    expect(meta.agoTip).toBe('When the most recent slice happened');
    expect(meta.agoAriaLabel).toBe('happened 1000ms ago');
  });

  it('uses a singular slice count of 1 verbatim in both tips (no special-cased pluralization)', () => {
    const meta = flightGroupHeadMeta(
      'reverted',
      1,
      'Solo task',
      0.1,
      'Solo task — 1 slices',
      500,
      fmtCost,
      fmtAgo,
    );
    expect(meta.itemTip).toBe('1 firings advanced "Solo task", still open — total $0.10');
    expect(meta.costTip).toBe('Total spend across all 1 slices');
  });
});

describe('flightLogRowMeta', () => {
  it('builds the verdict-dot tip/aria-label and headline tip from the verdict and full headline', () => {
    const meta = flightLogRowMeta('Ship the whole galaxy feature', 'shipped', 'abc1234def');
    expect(meta.dotTip).toBe('How this firing ended: shipped');
    expect(meta.dotAriaLabel).toBe('verdict: shipped');
    expect(meta.itemTip).toBe('Ship the whole galaxy feature');
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): no itemAriaLabel
    // field — it used to duplicate itemTip verbatim. The caller rides itemTip
    // into an aria-describedby'd sr-only span instead of a second attribute.
    expect(meta).not.toHaveProperty('itemAriaLabel');
  });

  it('leaves a headline of 64 chars or fewer untruncated in itemText', () => {
    const headline = 'a'.repeat(64);
    const meta = flightLogRowMeta(headline, 'shipped', null);
    expect(meta.itemText).toBe(headline);
  });

  it('truncates a headline over 64 chars in itemText but keeps itemTip full', () => {
    const headline = 'a'.repeat(65);
    const meta = flightLogRowMeta(headline, 'shipped', null);
    expect(meta.itemText).toBe('a'.repeat(64) + '…');
    expect(meta.itemTip).toBe(headline);
  });

  it('derives the sha chip text/tip/aria-label from a 7-char prefix when a sha is present', () => {
    const meta = flightLogRowMeta('headline', 'shipped', 'abc1234def');
    expect(meta.shaText).toBe('abc1234');
    expect(meta.shaTip).toBe('Commit: abc1234def');
    expect(meta.shaAriaLabel).toBe('commit abc1234def');
  });

  it('leaves the sha fields null when no sha is present', () => {
    const meta = flightLogRowMeta('headline', 'shipped', null);
    expect(meta.shaText).toBeNull();
    expect(meta.shaTip).toBeNull();
    expect(meta.shaAriaLabel).toBeNull();
  });

  it('leaves the sha fields null when the sha is undefined', () => {
    const meta = flightLogRowMeta('headline', 'shipped', undefined);
    expect(meta.shaText).toBeNull();
    expect(meta.shaTip).toBeNull();
    expect(meta.shaAriaLabel).toBeNull();
  });
});

describe('flightCostAgoMeta', () => {
  const fmtAgo = (at: number): string => `${at}ms ago`;

  it('passes the caller-supplied tip text through verbatim', () => {
    const meta = flightCostAgoMeta(
      'Spend for this slice',
      'When this slice happened',
      0.5,
      1000,
      fmtCost,
      fmtAgo,
    );
    expect(meta.costTip).toBe('Spend for this slice');
    expect(meta.agoTip).toBe('When this slice happened');
  });

  it('builds the cost aria-label from the injected fmtCost applied to the cost', () => {
    const meta = flightCostAgoMeta('cost tip', 'ago tip', 0.5, 1000, fmtCost, fmtAgo);
    expect(meta.costAriaLabel).toBe('cost: $0.50');
  });

  it('builds the ago aria-label from the injected fmtAgo applied to the timestamp', () => {
    const meta = flightCostAgoMeta('cost tip', 'ago tip', 0.5, 1000, fmtCost, fmtAgo);
    expect(meta.agoAriaLabel).toBe('happened 1000ms ago');
  });

  it('gives the group-member and single-row call sites their own distinct tip wording', () => {
    const memberMeta = flightCostAgoMeta(
      'Spend for this slice',
      'When this slice happened',
      0.2,
      500,
      fmtCost,
      fmtAgo,
    );
    const singleMeta = flightCostAgoMeta(
      'Total spend for this firing',
      'When this firing happened',
      0.2,
      500,
      fmtCost,
      fmtAgo,
    );
    expect(memberMeta.costTip).not.toBe(singleMeta.costTip);
    expect(memberMeta.agoTip).not.toBe(singleMeta.agoTip);
    expect(memberMeta.costAriaLabel).toBe(singleMeta.costAriaLabel);
    expect(memberMeta.agoAriaLabel).toBe(singleMeta.agoAriaLabel);
  });

  it('leaves the real-cost chip null when realCostUsd is omitted', () => {
    const meta = flightCostAgoMeta('cost tip', 'ago tip', 0.5, 1000, fmtCost, fmtAgo);
    expect(meta.realCostText).toBeNull();
    expect(meta.realCostTip).toBeNull();
    expect(meta.realCostAriaLabel).toBeNull();
  });

  it('leaves the real-cost chip null when realCostUsd is explicitly null (unconfigured)', () => {
    const meta = flightCostAgoMeta('cost tip', 'ago tip', 0.5, 1000, fmtCost, fmtAgo, null);
    expect(meta.realCostText).toBeNull();
    expect(meta.realCostTip).toBeNull();
    expect(meta.realCostAriaLabel).toBeNull();
  });

  it('surfaces the real-cost chip NEXT TO, not instead of, the list-price cost', () => {
    const meta = flightCostAgoMeta('cost tip', 'ago tip', 0.5, 1000, fmtCost, fmtAgo, 0.12);
    expect(meta.costAriaLabel).toBe('cost: $0.50');
    expect(meta.realCostText).toBe('real $0.12');
    expect(meta.realCostAriaLabel).toBe('real cost: $0.12');
    expect(meta.realCostTip).toMatch(/subscription share/);
  });
});

describe('flightLogMoreMeta', () => {
  it('shows "Show all (N)" with the total count and a reveal tip when collapsed', () => {
    const meta = flightLogMoreMeta(false, 23, 8);
    expect(meta.text).toBe('Show all (23)');
    expect(meta.tip).toBe('Reveal all 23 locally-held firings, not just the most recent 8');
  });

  it('shows "Show fewer" with a collapse tip when already open', () => {
    const meta = flightLogMoreMeta(true, 23, 8);
    expect(meta.text).toBe('Show fewer');
    expect(meta.tip).toBe('Collapse back to the most recent 8 firings');
  });

  it('reflects a caller-supplied compactRows value in both open and closed tips', () => {
    expect(flightLogMoreMeta(false, 10, 3).tip).toBe(
      'Reveal all 10 locally-held firings, not just the most recent 3',
    );
    expect(flightLogMoreMeta(true, 10, 3).tip).toBe('Collapse back to the most recent 3 firings');
  });
});
