// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure validation/formatting pieces of
 * scripts/ci/quarantine-report.mjs, wired into `pnpm run verify` and CI
 * (ci:quarantine-report) to catch owner-less/reason-less quarantine entries.
 * `main()` itself stays unimported — it reads the real config file and calls
 * `process.exit`, same stance apps/dashboard/test/tooling/run-all-mutation.test.ts
 * takes for its sibling script.
 */
import { describe, it, expect } from 'vitest';
import {
  validateQuarantineList,
  summarizeQuarantine,
} from '../../../../scripts/ci/quarantine-report.mjs';

describe('validateQuarantineList', () => {
  it('rejects non-array input', () => {
    const result = validateQuarantineList({ not: 'an array' });
    expect(result.errors).toEqual(['config/quarantine/flaky-tests.json: must be a JSON array']);
    expect(result.entries).toEqual([]);
  });

  it('accepts an empty array', () => {
    expect(validateQuarantineList([])).toEqual({ errors: [], entries: [] });
  });

  it('accepts entries with all four required fields present', () => {
    const entry = {
      testPath: 'apps/dashboard/test/foo.test.ts',
      owner: 'fleet-1',
      reason: 'flaky under load',
      addedDate: '2026-08-01',
    };
    expect(validateQuarantineList([entry])).toEqual({ errors: [], entries: [entry] });
  });

  it('reports one error per missing or empty required field', () => {
    const result = validateQuarantineList([
      { testPath: '', owner: 'fleet-1', reason: 'flaky', addedDate: '2026-08-01' },
    ]);
    expect(result.errors).toEqual([
      'config/quarantine/flaky-tests.json[0]: missing or empty "testPath"',
    ]);
    expect(result.entries).toEqual([]);
  });

  it('reports every missing field for a fully empty entry', () => {
    const result = validateQuarantineList([{}]);
    expect(result.errors).toEqual([
      'config/quarantine/flaky-tests.json[0]: missing or empty "testPath"',
      'config/quarantine/flaky-tests.json[0]: missing or empty "owner"',
      'config/quarantine/flaky-tests.json[0]: missing or empty "reason"',
      'config/quarantine/flaky-tests.json[0]: missing or empty "addedDate"',
    ]);
    expect(result.entries).toEqual([]);
  });

  it('indexes errors against their position among multiple entries', () => {
    const good = {
      testPath: 'a.test.ts',
      owner: 'fleet-1',
      reason: 'flaky',
      addedDate: '2026-08-01',
    };
    const bad = { testPath: 'b.test.ts', owner: '', reason: 'flaky', addedDate: '2026-08-01' };
    const result = validateQuarantineList([good, bad]);
    expect(result.errors).toEqual([
      'config/quarantine/flaky-tests.json[1]: missing or empty "owner"',
    ]);
    expect(result.entries).toEqual([good]);
  });

  it('rejects non-string field values', () => {
    const result = validateQuarantineList([
      { testPath: 'a.test.ts', owner: 42, reason: 'flaky', addedDate: '2026-08-01' },
    ]);
    expect(result.errors).toEqual([
      'config/quarantine/flaky-tests.json[0]: missing or empty "owner"',
    ]);
    expect(result.entries).toEqual([]);
  });
});

describe('summarizeQuarantine', () => {
  it('reports zero quarantined tests', () => {
    expect(summarizeQuarantine([])).toBe('quarantine-report: 0 test(s) quarantined');
  });

  it('formats a single entry with its owner and reason', () => {
    const entries = [
      {
        testPath: 'apps/dashboard/test/foo.test.ts',
        owner: 'fleet-1',
        reason: 'flaky under load',
        addedDate: '2026-08-01',
      },
    ];
    expect(summarizeQuarantine(entries)).toBe(
      'quarantine-report: 1 test(s) quarantined:\n' +
        '  - apps/dashboard/test/foo.test.ts (owner: fleet-1, reason: flaky under load)',
    );
  });

  it('formats multiple entries as one line each', () => {
    const entries = [
      { testPath: 'a.test.ts', owner: 'fleet-1', reason: 'flaky', addedDate: '2026-08-01' },
      { testPath: 'b.test.ts', owner: 'fleet-2', reason: 'timing', addedDate: '2026-08-02' },
    ];
    expect(summarizeQuarantine(entries)).toBe(
      'quarantine-report: 2 test(s) quarantined:\n' +
        '  - a.test.ts (owner: fleet-1, reason: flaky)\n' +
        '  - b.test.ts (owner: fleet-2, reason: timing)',
    );
  });
});
