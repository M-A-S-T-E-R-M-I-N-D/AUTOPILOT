// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { deriveWorktreePlan } from '../../src/flight/worktree.js';

describe('deriveWorktreePlan', () => {
  it('places the worktree as a SIBLING of target, never nested inside it', () => {
    const target = join('Z:', 'repos', 'my-app');
    const plan = deriveWorktreePlan(target, 'fly-my-app');

    expect(plan.path.startsWith(target)).toBe(false);
    // plan.path === dirname(target)/.autopilot-worktrees/<projectId> — two
    // levels up from the leaf lands back on target's own parent, never target.
    expect(dirname(dirname(plan.path))).toBe(dirname(target));
  });

  it('is deterministic for the same target + project id', () => {
    const target = join('Z:', 'repos', 'widget');
    expect(deriveWorktreePlan(target, 'fly-widget')).toEqual(
      deriveWorktreePlan(target, 'fly-widget'),
    );
  });

  it('derives a DIFFERENT path and branch for a different project id (no cross-project collision)', () => {
    const target = join('Z:', 'repos', 'widget');
    const a = deriveWorktreePlan(target, 'fly-widget-a');
    const b = deriveWorktreePlan(target, 'fly-widget-b');

    expect(a.path).not.toBe(b.path);
    expect(a.branch).not.toBe(b.branch);
  });

  it('derives a DIFFERENT path for targets under different parents, even with the SAME project id', () => {
    const a = deriveWorktreePlan(join('Z:', 'repos-a', 'app'), 'fly-app');
    const b = deriveWorktreePlan(join('Z:', 'repos-b', 'app'), 'fly-app');

    expect(a.path).not.toBe(b.path);
  });

  describe('instanceId (PARALLEL UNLOCK C — N-way same-folder spawn)', () => {
    it('omitting instanceId is byte-for-byte the single-instance plan (backward compatible)', () => {
      const target = join('Z:', 'repos', 'widget');
      expect(deriveWorktreePlan(target, 'fly-widget', undefined)).toEqual(
        deriveWorktreePlan(target, 'fly-widget'),
      );
    });

    it('derives a DIFFERENT path and branch for two instances of the SAME project id (no collision)', () => {
      const target = join('Z:', 'repos', 'widget');
      const a = deriveWorktreePlan(target, 'fly-widget', '1');
      const b = deriveWorktreePlan(target, 'fly-widget', '2');

      expect(a.path).not.toBe(b.path);
      expect(a.branch).not.toBe(b.branch);
    });

    it('is deterministic for the same target + project id + instance id', () => {
      const target = join('Z:', 'repos', 'widget');
      expect(deriveWorktreePlan(target, 'fly-widget', 'a')).toEqual(
        deriveWorktreePlan(target, 'fly-widget', 'a'),
      );
    });

    it('an instance-scoped plan still lands as a SIBLING of target, never nested inside it', () => {
      const target = join('Z:', 'repos', 'my-app');
      const plan = deriveWorktreePlan(target, 'fly-my-app', '3');

      expect(plan.path.startsWith(target)).toBe(false);
      expect(dirname(dirname(plan.path))).toBe(dirname(target));
    });

    it('sanitizes a path-traversal instance id instead of letting it escape .autopilot-worktrees', () => {
      const target = join('Z:', 'repos', 'my-app');
      const plan = deriveWorktreePlan(target, 'fly-my-app', '../../etc/passwd');

      expect(plan.path).not.toContain('..');
      expect(dirname(dirname(plan.path))).toBe(dirname(target));
    });
  });
});
