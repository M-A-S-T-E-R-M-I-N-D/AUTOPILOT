// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure tally/formatting pieces of scripts/ci/detect-flaky.mjs,
 * the operator-run repeat-sampler for a suspected flaky test file. `main()`
 * itself stays unimported — it shells out to `vitest run` N times and calls
 * `process.exit`, same stance apps/dashboard/test/tooling/run-all-mutation.test.ts
 * takes for its sibling script.
 */
import { describe, it, expect } from 'vitest';
import { summarizeRuns, formatVerdict } from '../../../../scripts/ci/detect-flaky.mjs';

describe('summarizeRuns', () => {
  it('reports a stable pass when every run passed', () => {
    expect(summarizeRuns([true, true, true])).toEqual({
      runs: 3,
      passCount: 3,
      failCount: 0,
      flaky: false,
    });
  });

  it('reports a stable fail when every run failed', () => {
    expect(summarizeRuns([false, false])).toEqual({
      runs: 2,
      passCount: 0,
      failCount: 2,
      flaky: false,
    });
  });

  it('flags flaky when results are mixed', () => {
    expect(summarizeRuns([true, false, true, true, false])).toEqual({
      runs: 5,
      passCount: 3,
      failCount: 2,
      flaky: true,
    });
  });

  it('treats a single-run tally as stable', () => {
    expect(summarizeRuns([true])).toEqual({ runs: 1, passCount: 1, failCount: 0, flaky: false });
  });
});

describe('formatVerdict', () => {
  it('formats a stable-pass verdict', () => {
    const summary = summarizeRuns([true, true, true]);
    expect(formatVerdict(summary, 'apps/dashboard/test/foo.test.ts')).toBe(
      'detect-flaky: stable — apps/dashboard/test/foo.test.ts (3 passed / 0 failed of 3 run(s))',
    );
  });

  it('formats a stable-fail verdict', () => {
    const summary = summarizeRuns([false, false]);
    expect(formatVerdict(summary, 'a.test.ts')).toBe(
      'detect-flaky: stable — a.test.ts (0 passed / 2 failed of 2 run(s))',
    );
  });

  it('formats a flaky verdict', () => {
    const summary = summarizeRuns([true, false, true]);
    expect(formatVerdict(summary, 'a.test.ts')).toBe(
      'detect-flaky: FLAKY — a.test.ts (2 passed / 1 failed of 3 run(s))',
    );
  });
});
