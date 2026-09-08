// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  isMechanicalDiffPath,
  evaluateDiffSize,
  DIFF_SIZE_THRESHOLD_LINES,
} from '../src/diff-size-gate.js';

describe('isMechanicalDiffPath', () => {
  it('exempts lockfiles', () => {
    expect(isMechanicalDiffPath('pnpm-lock.yaml')).toBe(true);
    expect(isMechanicalDiffPath('apps/dashboard/package-lock.json')).toBe(true);
    expect(isMechanicalDiffPath('yarn.lock')).toBe(true);
  });

  it('exempts generated snapshot and binary assets', () => {
    expect(isMechanicalDiffPath('docs/screens/fleet-dark.png')).toBe(true);
    expect(
      isMechanicalDiffPath('apps/dashboard/e2e/visual.spec.ts-snapshots/project-light-win32.png'),
    ).toBe(true);
    expect(isMechanicalDiffPath('apps/dashboard/src/__snapshots__/foo.test.ts.snap')).toBe(true);
  });

  it('recognises the Playwright baseline directory by its own shape, not by the .png inside it', () => {
    // Every pre-existing fixture for this rule ended in .png, so the BINARY
    // pattern matched them and the snapshot-DIRECTORY rule was never actually
    // under test. A non-image file leaves only the directory rule able to fire.
    expect(isMechanicalDiffPath('apps/dashboard/e2e/visual.spec.ts-snapshots/report.txt')).toBe(
      true,
    );
    expect(isMechanicalDiffPath('e2e/thing.test.js-snapshots/report.txt')).toBe(true);
    expect(isMechanicalDiffPath('e2e/thing.spec.tsx-snapshots/report.txt')).toBe(true);
  });

  it('anchors each rule at a path boundary, so a lookalike source file still counts as review burden', () => {
    // These pin ANCHORS, not happy paths. Drop a trailing `$` or a leading
    // path boundary and every one of them flips to true — a hand-authored file
    // would stop counting, which is the silent direction this module must not
    // fail in.
    expect(isMechanicalDiffPath('scripts/pnpm-lock.yaml.bak')).toBe(false);
    expect(isMechanicalDiffPath('apps/dashboard/src/png-loader.ts')).toBe(false);
    // A real extension that merely APPEARS mid-path — this is what pins the
    // trailing $ on the binary rule; png-loader.ts above has no dot before png
    // and so never exercised it.
    expect(isMechanicalDiffPath('apps/dashboard/src/logo.png.ts')).toBe(false);
    expect(isMechanicalDiffPath('packages/engine/src/x.snap.ts')).toBe(false);
    expect(isMechanicalDiffPath('packages/store/src/user-snapshots/handler.ts')).toBe(false);
    expect(isMechanicalDiffPath('docs/visual.spec.ts-snapshots-notes.md')).toBe(false);
    expect(isMechanicalDiffPath('packages/engine/src/dist-helper.ts')).toBe(false);
  });

  it('matches a mechanical path sitting at the repo root, not only one nested in a directory', () => {
    // The `(^|/)` branch: a mutant that drops `^` still passes every nested
    // fixture, and only a root-level path can catch it.
    expect(isMechanicalDiffPath('pnpm-lock.yaml')).toBe(true);
    expect(isMechanicalDiffPath('__snapshots__/report.txt')).toBe(true);
    expect(isMechanicalDiffPath('visual.spec.ts-snapshots/report.txt')).toBe(true);
    expect(isMechanicalDiffPath('dist/index.js')).toBe(true);
  });

  it('covers every alternation branch of the binary-asset rule', () => {
    for (const path of ['a.jpg', 'a.jpeg', 'a.woff', 'a.woff2', 'a.PNG', 'a.eot']) {
      expect(isMechanicalDiffPath(path), path).toBe(true);
    }
  });
  it('exempts build/vendor output', () => {
    expect(isMechanicalDiffPath('packages/engine/dist/index.js')).toBe(true);
    expect(isMechanicalDiffPath('coverage/lcov.info')).toBe(true);
  });

  it('does not exempt ordinary source files', () => {
    expect(isMechanicalDiffPath('packages/engine/src/firing.ts')).toBe(false);
    expect(isMechanicalDiffPath('docs/RUNBOOK.md')).toBe(false);
  });
});

describe('evaluateDiffSize', () => {
  it('passes an empty diff', () => {
    const verdict = evaluateDiffSize([]);
    expect(verdict).toMatchObject({ ok: true, reviewLines: 0, totalLines: 0 });
  });

  it('passes a diff exactly AT the threshold (not strictly greater)', () => {
    const verdict = evaluateDiffSize([
      { path: 'src/a.ts', insertions: DIFF_SIZE_THRESHOLD_LINES, deletions: 0 },
    ]);
    expect(verdict.ok).toBe(true);
    expect(verdict.reviewLines).toBe(DIFF_SIZE_THRESHOLD_LINES);
  });

  it('fails one line past the threshold', () => {
    const verdict = evaluateDiffSize([
      { path: 'src/a.ts', insertions: DIFF_SIZE_THRESHOLD_LINES + 1, deletions: 0 },
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.details).toContain('too large');
  });

  it('excludes mechanical paths from the review-burden total', () => {
    const verdict = evaluateDiffSize([
      { path: 'pnpm-lock.yaml', insertions: 5000, deletions: 4000 }, // mechanical
      { path: 'src/a.ts', insertions: 10, deletions: 5 }, // real
    ]);
    expect(verdict.ok).toBe(true);
    expect(verdict.reviewLines).toBe(15);
    expect(verdict.totalLines).toBe(9015);
    expect(verdict.details).toContain('mechanical, exempt');
  });

  it('a mechanical-looking path still counts toward review burden once it alone exceeds the cap', () => {
    const verdict = evaluateDiffSize([
      { path: 'src/a.ts', insertions: 300, deletions: 0 },
      { path: 'src/b.ts', insertions: 200, deletions: 0 },
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reviewLines).toBe(500);
  });

  it('reports the mechanical lines it excluded — and says nothing when there were none', () => {
    const mixed = evaluateDiffSize([
      { path: 'pnpm-lock.yaml', insertions: 90, deletions: 10 },
      { path: 'src/a.ts', insertions: 3, deletions: 1 },
    ]);

    expect(mixed.reviewLines).toBe(4);
    expect(mixed.totalLines).toBe(104);
    expect(mixed.details).toContain('(+100 mechanical, exempt)');

    const pure = evaluateDiffSize([{ path: 'src/a.ts', insertions: 3, deletions: 1 }]);

    // Pinned exactly, not by substring: the no-mechanical branch renders an
    // EMPTY suffix, and only an exact match can tell an empty suffix apart from
    // some other string that merely lacks the word 'mechanical'.
    expect(pure.details).toBe('diff size ok: 4 review line(s)');
  });

  it('names the overage and the cap in the failure text the reverted firing records', () => {
    // gateError is the only trace a reverted firing leaves of WHY, so the
    // numbers in it are load-bearing, not decoration.
    const verdict = evaluateDiffSize([{ path: 'src/a.ts', insertions: 401, deletions: 0 }]);

    expect(verdict.ok).toBe(false);
    expect(verdict.details).toContain('401 review line(s)');
    expect(verdict.details).toContain(`${DIFF_SIZE_THRESHOLD_LINES}-line cap`);
    expect(verdict.details).not.toContain('mechanical');
  });
  it('honors a custom threshold', () => {
    const verdict = evaluateDiffSize([{ path: 'src/a.ts', insertions: 50, deletions: 0 }], 10);
    expect(verdict.ok).toBe(false);
    expect(verdict.threshold).toBe(10);
  });
});
