// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  SELF_STUDY_PATHS,
  selfStudyInvocation,
  commitSelfStudyIfDirty,
  SELF_STUDY_COMMIT_MESSAGE,
} from '../../src/flight/self-study.js';

describe('selfStudyInvocation', () => {
  it('skips (returns null) when the flight shipped zero firings', () => {
    expect(selfStudyInvocation('/node', '/gen.mjs', {}, 0, 0)).toBeNull();
  });

  it('skips when firings is negative (defensive — should never happen)', () => {
    expect(selfStudyInvocation('/node', '/gen.mjs', {}, -1, 0)).toBeNull();
  });

  it('builds an invocation running the generator script with the current node binary', () => {
    const invocation = selfStudyInvocation(
      '/usr/bin/node',
      '/repo/scripts/self-study/generate-data.mjs',
      {},
      3,
      2,
    );
    expect(invocation).not.toBeNull();
    expect(invocation?.command).toBe('/usr/bin/node');
    expect(invocation?.args).toEqual(['/repo/scripts/self-study/generate-data.mjs']);
  });

  it("passes this flight's firing/shipped counts as env vars for generate-data.mjs to read", () => {
    const invocation = selfStudyInvocation('/node', '/gen.mjs', {}, 5, 4);
    expect(invocation?.env['SELF_STUDY_FLIGHT_FIRINGS']).toBe('5');
    expect(invocation?.env['SELF_STUDY_FLIGHT_SHIPPED']).toBe('4');
  });

  it('clamps a negative shipped count to 0 (shipped can never exceed firings, but stay defensive)', () => {
    const invocation = selfStudyInvocation('/node', '/gen.mjs', {}, 3, -1);
    expect(invocation?.env['SELF_STUDY_FLIGHT_SHIPPED']).toBe('0');
  });

  it('preserves the rest of the inherited environment untouched', () => {
    const invocation = selfStudyInvocation(
      '/node',
      '/gen.mjs',
      { AUTOPILOT_DB: '/store.db' },
      1,
      1,
    );
    expect(invocation?.env['AUTOPILOT_DB']).toBe('/store.db');
  });
});

describe('commitSelfStudyIfDirty', () => {
  // Reproduces the bug named in commit 6e33f20: the self-study regen writes
  // docs/SELF-STUDY/PAPER.md but nothing owned committing it, so the dirty
  // tree silently blocked self-landing (GitVcs.land refuses when isDirty()).
  it('does NOT commit when the regen left the tree clean (no-op run)', async () => {
    const isDirty = vi.fn(async () => false);
    const commitPaths = vi.fn(async () => true);
    const committed = await commitSelfStudyIfDirty({ isDirty, commitPaths });
    expect(committed).toBe(false);
    expect(commitPaths).not.toHaveBeenCalled();
  });

  it('commits ONLY the self-study paths when the tree is dirty (ritual-sweep fix)', async () => {
    const isDirty = vi.fn(async () => true);
    const commitPaths = vi.fn(async () => true);
    const committed = await commitSelfStudyIfDirty({ isDirty, commitPaths });
    expect(committed).toBe(true);
    expect(commitPaths).toHaveBeenCalledOnce();
    expect(commitPaths).toHaveBeenCalledWith(SELF_STUDY_PATHS, SELF_STUDY_COMMIT_MESSAGE);
  });

  it('reports no commit when the dirty state was entirely OUTSIDE the self-study paths', async () => {
    const isDirty = vi.fn(async () => true);
    const commitPaths = vi.fn(async () => false); // scoped add staged nothing
    const committed = await commitSelfStudyIfDirty({ isDirty, commitPaths });
    expect(committed).toBe(false);
  });

  // Asserted against the literal, not just cross-checked against the
  // exported constant: comparing two reads of the same (possibly mutated)
  // constant is tautological and can't catch the constant itself going
  // wrong (e.g. Stryker's StringLiteral mutant emptying it to "").
  it('uses the documented flight-end self-study commit message', () => {
    expect(SELF_STUDY_COMMIT_MESSAGE).toBe('docs(self-study): flight-end automated data refresh');
  });

  // Same literal-not-tautology guard as the message above, applied to the
  // paths constant: the scoping test proves commitPaths was called WITH
  // SELF_STUDY_PATHS, but reads the same (possibly mutated) constant on both
  // sides — an ArrayDeclaration mutant emptying it to [] survives there. This
  // pins the crux of the RITUAL SWEEP fix: the ritual commits exactly
  // docs/SELF-STUDY, never a wider scope that would sweep in unrelated WIP.
  it('scopes the ritual to exactly the docs/SELF-STUDY tree (literal)', () => {
    expect(SELF_STUDY_PATHS).toEqual(['docs/SELF-STUDY']);
  });
});
