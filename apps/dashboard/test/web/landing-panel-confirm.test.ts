// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the LANDING EXECUTE button's `window.confirm()`
 * message math (`web/landing-panel.ts`), mirroring `release-panel-confirm.test.ts`.
 * BOARD web-msw5zxfi-oa2olf: the overlap warning row (fleet anti-duplication,
 * defense-stack item 3) rendered above the EXECUTE button, but the confirm
 * dialog it gated on said nothing about it — an operator who scrolled past
 * the warning got the exact same "Land this branch?" prompt as one flying
 * solo, so a same-file collision with a sibling's unlanded work was one
 * click of blind faith away from landing anyway. `landingExecuteConfirmMessage`
 * folds the overlapping sibling branch names into the prompt so the confirm
 * dialog itself is the flag, not just a easily-missed list above it.
 */

import { describe, it, expect } from 'vitest';
import { landingExecuteConfirmMessage } from '../../src/web/landing-panel.js';

describe('landingExecuteConfirmMessage', () => {
  it('is the plain landing warning when nothing overlaps', () => {
    expect(landingExecuteConfirmMessage([])).toBe(
      'Land this branch?\n\nThis runs the full verification gate, then (only if it passes) a real git merge into the base branch. This cannot be undone by this dashboard.',
    );
  });

  it('names the single sibling branch and urges consolidation over a blind merge', () => {
    const msg = landingExecuteConfirmMessage(['autopilot/flight-worktree-p1--fleet-2']);
    expect(msg).toContain('autopilot/flight-worktree-p1--fleet-2');
    expect(msg).toContain('unlanded work touching the same file');
    expect(msg).toContain('lead consolidation');
    expect(msg).toContain('has unlanded');
    // Still carries the base warning, appended after the overlap clause.
    expect(msg).toContain(
      'This runs the full verification gate, then (only if it passes) a real git merge into the base branch. This cannot be undone by this dashboard.',
    );
  });

  it('pluralizes correctly across multiple overlapping sibling branches', () => {
    const msg = landingExecuteConfirmMessage(['branch-a', 'branch-b']);
    expect(msg).toContain('branch-a, branch-b');
    expect(msg).toContain('have unlanded');
    expect(msg).toContain('they land');
  });
});
