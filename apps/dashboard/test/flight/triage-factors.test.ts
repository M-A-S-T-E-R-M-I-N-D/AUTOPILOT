// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  taskEconomicsFromRows,
  isRunaway,
  factorSuffix,
  composeTriageOrder,
  applyOperatorPins,
  commitSubjectFamily,
  familyEconomicsFromRows,
  RUNAWAY_SPEND_USD,
  RUNAWAY_FIRINGS,
  type EconomicsRow,
  type FamilyEconomicsRow,
} from '../../src/flight/triage-factors.js';

describe('taskEconomicsFromRows', () => {
  it('accumulates spend and firing count per task, ignoring itemless rows', () => {
    const econ = taskEconomicsFromRows([
      { item: 'a', costUsd: 2, completion: 'slice' },
      { item: null, costUsd: 9, completion: null },
      { item: 'a', costUsd: 3, completion: 'slice' },
      { item: 'b', costUsd: 1, completion: 'complete' },
    ]);
    expect(econ.size).toBe(2); // the itemless row never became a bogus third entry
    expect(econ.get('a')).toEqual({ spendUsd: 5, firings: 2, sliceStreak: 2, streakSpendUsd: 5 });
    expect(econ.get('b')).toEqual({ spendUsd: 1, firings: 1, sliceStreak: 0, streakSpendUsd: 0 });
  });

  it('a completion (or untagged ship) RESETS the trailing slice streak AND its spend', () => {
    const econ = taskEconomicsFromRows([
      { item: 'a', costUsd: 1, completion: 'slice' },
      { item: 'a', costUsd: 1, completion: 'slice' },
      { item: 'a', costUsd: 1, completion: 'complete' },
      { item: 'a', costUsd: 1, completion: 'slice' },
    ]);
    expect(econ.get('a')).toEqual({ spendUsd: 4, firings: 4, sliceStreak: 1, streakSpendUsd: 1 });
  });
});

describe('isRunaway', () => {
  it('requires BOTH trailing thresholds crossed', () => {
    expect(isRunaway({ spendUsd: 51, firings: 11, sliceStreak: 11, streakSpendUsd: 51 })).toBe(
      true,
    );
  });

  it('exactly at the thresholds is NOT a runaway (strict >)', () => {
    expect(
      isRunaway({ spendUsd: 51, firings: 11, sliceStreak: 11, streakSpendUsd: RUNAWAY_SPEND_USD }),
    ).toBe(false);
    expect(
      isRunaway({ spendUsd: 51, firings: 11, sliceStreak: RUNAWAY_FIRINGS, streakSpendUsd: 51 }),
    ).toBe(false);
  });

  it('a short trailing streak (something completed recently) is NOT a runaway, even with high lifetime spend', () => {
    // 11 lifetime firings but the trailing streak is shorter — something completed along the way.
    expect(isRunaway({ spendUsd: 99, firings: 11, sliceStreak: 4, streakSpendUsd: 40 })).toBe(
      false,
    );
  });

  it('a task that completed once, then reopened and burned past both thresholds again, IS a runaway — one old completion must not buy permanent immunity (the "attribution to a CLOSED task" evasion, TASK ECONOMICS v2)', () => {
    const rows: EconomicsRow[] = [{ item: 'a', costUsd: 1, completion: 'complete' }];
    for (let i = 0; i < RUNAWAY_FIRINGS + 1; i++) {
      rows.push({ item: 'a', costUsd: RUNAWAY_SPEND_USD, completion: 'slice' });
    }
    const econ = taskEconomicsFromRows(rows).get('a');
    expect(econ && isRunaway(econ)).toBe(true);
  });
});

describe('factorSuffix', () => {
  it('renders severity, age, spend/firings, and a long slice streak', () => {
    expect(
      factorSuffix(
        { spendUsd: 240, firings: 76, sliceStreak: 76, streakSpendUsd: 240 },
        3.9,
        'high',
      ),
    ).toBe(' (sev:high · age:3d · $240/76f · slice-streak:76)');
  });

  it('stays empty for a fresh, never-worked, severity-less task', () => {
    expect(factorSuffix(undefined, 0.2, null)).toBe('');
  });

  it('omits a short slice streak (noise below 3)', () => {
    expect(
      factorSuffix({ spendUsd: 5, firings: 2, sliceStreak: 2, streakSpendUsd: 5 }, 0, null),
    ).toBe(' ($5/2f)');
  });

  it('includes age at exactly 1 day (boundary is >=, not >)', () => {
    expect(factorSuffix(undefined, 1, null)).toBe(' (age:1d)');
  });

  it('omits spend/firings when econ is present but firings is exactly 0', () => {
    expect(
      factorSuffix({ spendUsd: 5, firings: 0, sliceStreak: 0, streakSpendUsd: 0 }, 0, null),
    ).toBe('');
  });

  it('includes the slice streak at exactly 3 (boundary is >=, not >)', () => {
    expect(
      factorSuffix({ spendUsd: 5, firings: 1, sliceStreak: 3, streakSpendUsd: 5 }, 0, null),
    ).toBe(' ($5/1f · slice-streak:3)');
  });
});

describe('commitSubjectFamily', () => {
  it('collapses two different real commits (different scope, file, and id) into the SAME family', () => {
    const a = commitSubjectFamily(
      'feat(engine): mutation testing widens to telemetry.ts (web-msnswvcq-viays2)',
    );
    const b = commitSubjectFamily('feat(tokens): mutation testing widens to tokens/css.ts');
    const c = commitSubjectFamily('feat(engine): mutation testing widens to adapters/gate.ts');
    expect(a).toBe('mutation testing widens to *');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('collapses a multi-file subject to one wildcard per file token', () => {
    expect(
      commitSubjectFamily(
        'test(onboarding): wire mutation testing for guard.ts + refs.ts (100% score)',
      ),
    ).toBe('wire mutation testing for * + *');
  });

  it('does not merge unrelated subjects that share no path-like tokens', () => {
    const a = commitSubjectFamily('fix(ci): verify diet, actually delivered');
    const b = commitSubjectFamily('docs(flight): operator doc for MODEL ROUTING v1');
    expect(a).not.toBe(b);
  });

  it('does not treat an ordinary sentence-terminal period as a path-like token', () => {
    // A bare word ending in "." (end of sentence) has nothing AFTER the dot,
    // unlike a real extension ("telemetry.ts") or path ("tokens/css.ts") —
    // wildcarding it collapsed unrelated subjects into the same bogus family
    // purely because each happened to end a sentence.
    const a = commitSubjectFamily('fix(ci): resolve the flaky test.');
    const b = commitSubjectFamily('fix(ci): resolve the flaky server.');
    expect(a).toBe('resolve the flaky test.');
    expect(b).toBe('resolve the flaky server.');
    expect(a).not.toBe(b);
  });

  it('leaves a subject with no conventional-commit prefix untouched (besides case/whitespace)', () => {
    expect(commitSubjectFamily('Merge branch release into main')).toBe(
      'merge branch release into main',
    );
  });

  it('does NOT strip a colon-prefix pattern that appears mid-string, only at the true start', () => {
    // The prefix regex is anchored (^) — "feat:" here isn't at position 0, so
    // an unanchored mutant would wrongly strip it from the middle instead.
    expect(commitSubjectFamily('See feat: foo')).toBe('see feat: foo');
  });

  it('strips a conventional prefix with no scope and no space after the colon', () => {
    // No parens (exercises the optional scope group) and zero whitespace
    // after ":" (exercises the \s* — not a mandatory \s — after the colon).
    expect(commitSubjectFamily('feat:hello world')).toBe('hello world');
  });

  it('strips a trailing parenthetical with no space before it', () => {
    // The leading \s* before the trailing "(" must tolerate ZERO whitespace,
    // not require exactly one.
    expect(commitSubjectFamily('cleanup(note)')).toBe('cleanup');
  });

  it('leaves a NON-trailing parenthetical alone — only a trailing one strips', () => {
    // The trailing-paren regex is anchored to the end ($) — a paren in the
    // middle of the subject must survive untouched.
    expect(commitSubjectFamily('foo (mid) bar')).toBe('foo (mid) bar');
  });

  it('strips a trailing parenthetical even with trailing whitespace after it', () => {
    expect(commitSubjectFamily('message (note) ')).toBe('message');
  });

  it('trims leading whitespace the earlier regexes never touch', () => {
    expect(commitSubjectFamily(' feat: hello')).toBe('feat: hello');
  });

  it('collapses a run of MULTIPLE spaces (not just one) between wildcarded tokens', () => {
    expect(commitSubjectFamily('touches a.ts  b.ts')).toBe('touches * *');
  });
});

describe('familyEconomicsFromRows', () => {
  it('aggregates spend/firings across DIFFERENT item-attributed commits sharing one family', () => {
    const rows: FamilyEconomicsRow[] = [
      {
        commitSubject: 'feat(engine): mutation testing widens to telemetry.ts (id-1)',
        costUsd: 5,
        completion: 'slice',
      },
      {
        commitSubject: 'feat(tokens): mutation testing widens to tokens/css.ts (id-2)',
        costUsd: 5,
        completion: 'slice',
      },
      { commitSubject: null, costUsd: 999, completion: null },
    ];
    const econ = familyEconomicsFromRows(rows);
    expect(econ.size).toBe(1); // the commitSubject-less row never became a bogus second entry
    expect(econ.get('mutation testing widens to *')).toEqual({
      spendUsd: 10,
      firings: 2,
      sliceStreak: 2,
      streakSpendUsd: 10,
    });
  });

  it('skips a row whose subject normalizes to an EMPTY family — prefix + trailing note only, so no "" key ever accumulates economics', () => {
    const rows: FamilyEconomicsRow[] = [
      { commitSubject: 'chore: (tidy)', costUsd: 7, completion: 'slice' },
    ];
    expect(familyEconomicsFromRows(rows).size).toBe(0);
  });

  it('catches the "fresh per-module ids" evasion: many small per-item spends, none individually over threshold, sum to a family runaway', () => {
    const rows: FamilyEconomicsRow[] = [];
    for (let i = 0; i < RUNAWAY_FIRINGS + 1; i++) {
      // Each commit gets its OWN id and touches its OWN file — no single item
      // id ever repeats, so a per-item guard would never see more than one
      // firing on any of them.
      rows.push({
        commitSubject: `feat(engine): mutation testing widens to module-${i}.ts (id-${i})`,
        costUsd: 6,
        completion: 'slice',
      });
    }
    const econ = familyEconomicsFromRows(rows).get('mutation testing widens to *');
    expect(econ && isRunaway(econ)).toBe(true);
  });
});

describe('composeTriageOrder', () => {
  it('sinks runaways to the tail while preserving relative order of both groups', () => {
    const order = composeTriageOrder(['r1', 'a', 'r2', 'b'], new Set(['r1', 'r2']));
    expect(order).toEqual(['a', 'b', 'r1', 'r2']);
  });

  it('is the identity when nothing is flagged', () => {
    expect(composeTriageOrder(['a', 'b'], new Set())).toEqual(['a', 'b']);
  });
});

describe('applyOperatorPins', () => {
  it('keeps operator-pinned tasks in their current order at the FRONT, unmoved by the model ranking (web-mt1bwkrf-v5pnx2)', () => {
    // The operator explicitly ordered p1/p2 — the model would rather run p2
    // first, but a pin means the operator's call stands.
    const order = applyOperatorPins(['p1', 'p2'], ['p2', 'a', 'p1', 'b'], new Set());
    expect(order).toEqual(['p1', 'p2', 'a', 'b']);
  });

  it('is the identity when nothing is pinned', () => {
    expect(applyOperatorPins([], ['a', 'b'], new Set())).toEqual(['a', 'b']);
  });

  it('still sinks an UNPINNED runaway to the tail, but a PINNED runaway stays exactly where the operator put it', () => {
    const order = applyOperatorPins(['p1'], ['r1', 'a', 'r2'], new Set(['p1', 'r1', 'r2']));
    expect(order).toEqual(['p1', 'a', 'r1', 'r2']);
  });
});
