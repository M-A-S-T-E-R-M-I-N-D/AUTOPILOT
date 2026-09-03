// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  taskShouldClose,
  verdictDeferTarget,
  verdictDeferTargets,
  verdictDeferTargetsForFiring,
  verdictBlockerCleared,
  verdictRequeueTargets,
} from '../../src/flight/completion.js';

describe('taskShouldClose', () => {
  it('closes on an explicit "complete" completion', () => {
    expect(taskShouldClose('complete')).toBe(true);
  });

  it('does NOT close on a "slice" completion (partial-slice claims stay open)', () => {
    expect(taskShouldClose('slice')).toBe(false);
  });

  it('closes on a null completion (every firing before this field existed)', () => {
    expect(taskShouldClose(null)).toBe(true);
  });
});

describe('verdictDeferTarget (NOOP→VERDICT follow-through)', () => {
  // Why: a verdict-carrying noop mints an approval-gated proposal about its
  // claimed task ("VERDICT close web-x: …") — but the task itself stayed
  // queued, so the next firing (or a sibling) re-picked it and paid to reach
  // the same verdict again: $8.39 measured across two tasks in one morning
  // (2026-08-21). Once the verdict names the claimed task, the OPERATOR owns
  // the decision — the task defers out of every pick queue until they rule.
  it('returns the claimed task id when a proposal title names it', () => {
    expect(
      verdictDeferTarget('web-abc123-x', [
        { title: 'VERDICT close web-abc123-x: epic already complete, verified' },
      ]),
    ).toBe('web-abc123-x');
  });

  it('returns null when no proposal mentions the claimed task (verdict about something else)', () => {
    expect(
      verdictDeferTarget('web-abc123-x', [{ title: 'guard-hook tests are missing for cd chains' }]),
    ).toBeNull();
  });

  it('returns null with no claim or no proposals at all', () => {
    expect(verdictDeferTarget(null, [{ title: 'VERDICT close web-abc123-x' }])).toBeNull();
    expect(verdictDeferTarget('web-abc123-x', undefined)).toBeNull();
    expect(verdictDeferTarget('web-abc123-x', [])).toBeNull();
  });

  // Bug found by inspection against verdictDeferTargets' own docstring
  // ("split/deprioritize verdicts leave workable content and defer nothing"):
  // this function matched on substring alone, with no verdict-kind check, so
  // a split/deprioritize verdict that happened to name the claimed task still
  // benched it — the exact case its sibling function was hardened against.
  it('does NOT defer on a split verdict naming the claimed task (leaves workable content)', () => {
    expect(
      verdictDeferTarget('web-abc123-x', [
        { title: 'VERDICT split web-abc123-x: needs three separate slices' },
      ]),
    ).toBeNull();
  });

  it('does NOT defer on a deprioritize verdict naming the claimed task', () => {
    expect(
      verdictDeferTarget('web-abc123-x', [
        { title: 'VERDICT deprioritize web-abc123-x: real but not worth it now' },
      ]),
    ).toBeNull();
  });
});

describe('verdictDeferTargets (generalized — investigation of 2026-08-21)', () => {
  // The narrow claimed-task-only version missed the live case the same day it
  // shipped: firing 1134's verdict named THREE tasks ("VERDICT close A",
  // "VERDICT close B", "VERDICT blocked C") while its claim pointed elsewhere
  // — zero defers fired and the re-pick class stayed open. A verdict that
  // NAMES a task hands that task to the operator regardless of who claimed
  // what; close AND blocked both mean "re-picking burns money for the same
  // answer". split/deprioritize verdicts leave workable content — untouched.
  it('extracts every task id from close/blocked verdict proposals', () => {
    expect(
      verdictDeferTargets([
        { title: 'VERDICT close web-aaa111-bbb222: epic already shipped' },
        { title: 'VERDICT blocked web-ccc333-ddd444: remainder is operator-only' },
        { title: 'VERDICT close web-eee555-fff666 and web-ggg777-hhh888: duplicates' },
      ]),
    ).toEqual(['web-aaa111-bbb222', 'web-ccc333-ddd444', 'web-eee555-fff666', 'web-ggg777-hhh888']);
  });

  it('ignores split/deprioritize verdicts and non-verdict proposals', () => {
    expect(
      verdictDeferTargets([
        { title: 'VERDICT split web-aaa111-bbb222 into three slices' },
        { title: 'VERDICT deprioritize web-ccc333-ddd444' },
        { title: 'guard-hook tests are missing for cd chains' },
      ]),
    ).toEqual([]);
  });

  it('extracts self-proposed (ap-), inbox- and github- task ids, not just web- ones', () => {
    // The board mints FOUR id shapes — web-<ts36>-<rand>, ap-<ts36>-<n>
    // (firing-hooks self-proposals), inbox-<slug> (inbox-triage) and
    // github-<issue#> (issue-triage) — but the extractor only matched web-
    // ids, so a verdict naming any other shape deferred nothing
    // (board web-mtettjx9-57a9i5, part b).
    expect(
      verdictDeferTargets([
        { title: 'VERDICT close ap-mt6qc9k3-0: the design firing already happened' },
        { title: 'VERDICT blocked inbox-extract-first-feature-now-md: needs the founder' },
        { title: 'VERDICT close github-42: upstream fixed it' },
      ]),
    ).toEqual(['ap-mt6qc9k3-0', 'inbox-extract-first-feature-now-md', 'github-42']);
  });

  it('dedupes repeated ids and handles undefined/empty input', () => {
    expect(
      verdictDeferTargets([
        { title: 'VERDICT close web-aaa111-bbb222' },
        { title: 'VERDICT blocked web-aaa111-bbb222 again' },
      ]),
    ).toEqual(['web-aaa111-bbb222']);
    expect(verdictDeferTargets(undefined)).toEqual([]);
    expect(verdictDeferTargets([])).toEqual([]);
  });
});

describe('verdictDeferTargetsForFiring (fixes a live starvation gap)', () => {
  // fly.ts previously only ran this merge inside its `noopClass ===
  // 'verdict-carrying'` branch, and classifyNoop (packages/engine/src/
  // telemetry.ts) returns null whenever gateResult !== 'no-commit' — so a
  // firing that SHIPPED unrelated work while ALSO filing "VERDICT blocked X"
  // about a different task never deferred X. X stayed queued and got
  // re-picked and re-verdicted every subsequent firing, the exact starvation
  // class EVALUATION-2026-08-27-silent-gate.md documents. This function takes
  // no noop/gate-result input at all, so fly.ts calling it unconditionally
  // (regardless of what else the firing did) can no longer regress this.
  it('merges the claimed-task defer with every named target, deduped', () => {
    expect(
      verdictDeferTargetsForFiring('web-abc123-x', [
        { title: 'VERDICT blocked web-abc123-x: still collides with a sibling claim' },
        { title: 'VERDICT close web-ddd444-y: epic already shipped' },
      ]),
    ).toEqual(['web-abc123-x', 'web-ddd444-y']);
  });

  it('defers a named task even though this firing shipped something else (claimedTaskId is unrelated)', () => {
    expect(
      verdictDeferTargetsForFiring('web-other-task', [
        { title: 'VERDICT blocked web-abc123-x: shell.ts claimed mid-firing by a sibling' },
      ]),
    ).toEqual(['web-abc123-x']);
  });

  it('returns nothing for a split/deprioritize verdict or no claim/proposals at all', () => {
    expect(
      verdictDeferTargetsForFiring('web-abc123-x', [
        { title: 'VERDICT split web-abc123-x: needs three separate slices' },
      ]),
    ).toEqual([]);
    expect(verdictDeferTargetsForFiring(null, undefined)).toEqual([]);
  });
});

describe('verdictBlockerCleared (VERDICT AUTO-RECONCILE part a, web-mtettjx9-57a9i5)', () => {
  // A "VERDICT blocked" defer benches a task until the operator rules — but
  // when the verdict named a MACHINE-CHECKABLE blocker (a sibling lane, a red
  // gate) and that blocker has since verifiably cleared, keeping the task
  // benched is pure waste. Everything else stays fail-closed: an unparseable
  // reason must not be read as "the reason is gone".
  const state = {
    liveLanes: ['autopilot/flight-worktree-fly-autopilot--fleet-3'],
    gateGreen: true,
  };

  it('never clears a close verdict — closing is the operator’s call, not a blocker check', () => {
    expect(verdictBlockerCleared('VERDICT close web-abc123-x: already shipped', state)).toBe(false);
  });

  it('never clears a blocked verdict naming no machine-checkable blocker', () => {
    expect(
      verdictBlockerCleared('VERDICT blocked web-abc123-x: needs the founder to decide', state),
    ).toBe(false);
  });

  it('stays blocked while the named lane is still flying', () => {
    expect(
      verdictBlockerCleared('VERDICT blocked web-abc123-x: fleet-3 owns pr-review.ts', state),
    ).toBe(false);
  });

  it('clears once the named lane is gone from the live fleet', () => {
    expect(
      verdictBlockerCleared('VERDICT blocked web-abc123-x: fleet-3 owns pr-review.ts', {
        liveLanes: [],
        gateGreen: false,
      }),
    ).toBe(true);
  });

  it('matches lanes by token, never substring — fleet-1 does not collide with a live fleet-10', () => {
    expect(
      verdictBlockerCleared('VERDICT blocked web-abc123-x: fleet-1 owns this file', {
        liveLanes: ['autopilot/flight-worktree-fly-autopilot--fleet-10'],
        gateGreen: true,
      }),
    ).toBe(true);
  });

  it('clears a gate-named blocker only when the gate is green now', () => {
    const title = 'VERDICT blocked web-abc123-x: gate is red on main, nothing can land';
    expect(verdictBlockerCleared(title, { liveLanes: [], gateGreen: false })).toBe(false);
    expect(verdictBlockerCleared(title, { liveLanes: [], gateGreen: true })).toBe(true);
  });

  it('requires BOTH to clear when a title names a lane and the gate', () => {
    const title = 'VERDICT blocked web-abc123-x: fleet-3 unlanded and the gate is red';
    expect(verdictBlockerCleared(title, { liveLanes: state.liveLanes, gateGreen: true })).toBe(
      false,
    );
    expect(verdictBlockerCleared(title, { liveLanes: [], gateGreen: false })).toBe(false);
    expect(verdictBlockerCleared(title, { liveLanes: [], gateGreen: true })).toBe(true);
  });
});

describe('verdictRequeueTargets', () => {
  it('returns exactly the cleared defers’ task ids, ordered and deduped', () => {
    expect(
      verdictRequeueTargets(
        [
          { taskId: 'web-aaa111-x', verdictTitle: 'VERDICT blocked web-aaa111-x: fleet-9 owns it' },
          { taskId: 'web-bbb222-y', verdictTitle: 'VERDICT blocked web-bbb222-y: needs a human' },
          { taskId: 'web-aaa111-x', verdictTitle: 'VERDICT blocked web-aaa111-x: fleet-9 again' },
        ],
        { liveLanes: [], gateGreen: true },
      ),
    ).toEqual(['web-aaa111-x']);
    expect(verdictRequeueTargets([], { liveLanes: [], gateGreen: true })).toEqual([]);
  });

  it('keeps a task benched while ANY of its verdicts still stands — one cleared row is not enough', () => {
    expect(
      verdictRequeueTargets(
        [
          { taskId: 'web-aaa111-x', verdictTitle: 'VERDICT blocked web-aaa111-x: fleet-9 owns it' },
          {
            taskId: 'web-aaa111-x',
            verdictTitle: 'VERDICT blocked web-aaa111-x: gate is red on main',
          },
          { taskId: 'web-bbb222-y', verdictTitle: 'VERDICT blocked web-bbb222-y: fleet-9 owns it' },
        ],
        { liveLanes: [], gateGreen: false },
      ),
    ).toEqual(['web-bbb222-y']);
  });
});
