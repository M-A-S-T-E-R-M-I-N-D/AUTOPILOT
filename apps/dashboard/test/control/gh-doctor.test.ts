// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The optional gh doctor check (epic 0006 slice 1, board web-mss4lpw9-ktpcoh):
 * three states, always ok (an OPTIONAL dependency can never fail the doctor),
 * the detail line carries the state + the unlock hint, and the probes stay
 * strictly read-only.
 */

import { describe, it, expect } from 'vitest';
import { ghDoctorCheck } from '../../src/control/gh-doctor.js';

describe('ghDoctorCheck', () => {
  it('degrades to a hint when gh is not installed — an optional dep never fails the doctor', () => {
    const check = ghDoctorCheck(() => {
      throw new Error('spawn gh ENOENT');
    });
    expect(check.ok).toBe(true);
    expect(check.name).toBe('gh (optional)');
    expect(check.detail).toContain('not installed');
    expect(check.detail).toContain('gh auth login');
  });

  it('reports installed-but-unauthenticated with the exact unlock command', () => {
    const check = ghDoctorCheck((args) => {
      if (args[0] === '--version') return 'gh version 2.62.0 (2026-01-10)';
      throw new Error('exit status 1');
    });
    expect(check.ok).toBe(true);
    expect(check.detail).toContain('not authenticated');
    expect(check.detail).toContain('gh auth login');
  });

  it('reports the authenticated identity parsed from gh auth status', () => {
    const check = ghDoctorCheck((args) =>
      args[0] === '--version'
        ? 'gh version 2.62.0 (2026-01-10)'
        : '✓ Logged in to github.com account octocat (keyring)',
    );
    expect(check).toEqual({ name: 'gh (optional)', ok: true, detail: 'authenticated as octocat' });
  });

  it('still reports authenticated when no account line is captured (older gh prints to stderr)', () => {
    const check = ghDoctorCheck((args) => (args[0] === '--version' ? 'gh version 2.4.0' : ''));
    expect(check.ok).toBe(true);
    expect(check.detail).toBe('authenticated');
  });

  it('runs read-only probes ONLY — never gh auth login or any mutating command', () => {
    const calls: string[][] = [];
    ghDoctorCheck((args) => {
      calls.push([...args]);
      return 'account octocat';
    });
    expect(calls).toEqual([['--version'], ['auth', 'status']]);
  });
});
