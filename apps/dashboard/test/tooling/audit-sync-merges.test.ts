// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure classifyOverlap() decision of
 * scripts/audit-sync-merges.mjs — the merge-integrity audit that is the
 * standing proof no fleet lane's work is ever silently dropped by a
 * sync-back merge (docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md).
 * `main()` itself stays unimported — it shells out to `git log`/`git diff`
 * over the live repo and calls `process.exitCode`, same stance
 * apps/dashboard/test/tooling/detect-flaky.test.ts takes for its sibling
 * script.
 */
import { describe, it, expect } from 'vitest';
import { classifyOverlap } from '../../../../scripts/audit-sync-merges.mjs';

describe('classifyOverlap', () => {
  it('reports LANE-WON when the merged blob equals the lane (p2) side', () => {
    expect(classifyOverlap('merged-sha', 'target-sha', 'merged-sha')).toBe('LANE-WON');
  });

  it('reports TARGET-WON — the silent-loss signature — when the merged blob equals only the target (p1) side', () => {
    expect(classifyOverlap('target-sha', 'target-sha', 'lane-sha')).toBe('TARGET-WON');
  });

  it('reports COMBINED when the merged blob matches neither parent (3-way/union/rerere/manual)', () => {
    expect(classifyOverlap('combined-sha', 'target-sha', 'lane-sha')).toBe('COMBINED');
  });

  it('reports LANE-WON, not TARGET-WON, when both sides converged on identical content', () => {
    // Tie-break pinned to the original inline `if (merged === lane) ... else
    // if (merged === target)` order: nothing was lost either way, but a
    // future refactor that flipped the check order would silently relabel
    // every convergent-edit case as a false TARGET-WON alarm.
    expect(classifyOverlap('same-sha', 'same-sha', 'same-sha')).toBe('LANE-WON');
  });

  it('reports COMBINED when the file was deleted on the merge result but existed on both parents', () => {
    expect(classifyOverlap(null, 'target-sha', 'lane-sha')).toBe('COMBINED');
  });
});
