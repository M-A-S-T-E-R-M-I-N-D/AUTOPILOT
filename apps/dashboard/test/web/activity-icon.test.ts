// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the activity feed's icon lookup
 * (`web/activity-icon.ts`) — extracted out of `fleetJs()`'s inline
 * `actIcon()` (epic 0002 "shell decomposition"), where the fallback had no
 * direct test coverage before this. Epic 0025 law 1: the feed's icons were a
 * hand-authored 16-unit set beside the vendored one; each kind now names a
 * Lucide icon from `icons.ts`, and the phase kinds draw the live phase pill's
 * shapes.
 */

import { describe, it, expect } from 'vitest';
import { ACT_ICONS, actIconName } from '../../src/web/activity-icon.js';
import { ICON_NAMES } from '../../src/web/icons.js';

describe('actIconName', () => {
  it('resolves each narrator kind to its own vendored icon', () => {
    expect(actIconName('edit')).toBe('pencil');
    expect(actIconName('read')).toBe('file-text');
    expect(actIconName('search')).toBe('search');
    expect(actIconName('command')).toBe('square-terminal');
  });

  it('draws the live phase pill’s shapes for the phase kinds', () => {
    // web/shell.ts's LIVE_PHASE_ICONS: the pill, the office map and the feed
    // draw a phase with one shape.
    expect(actIconName('orient')).toBe('compass');
    expect(actIconName('gate')).toBe('shield-check');
    expect(actIconName('commit')).toBe('git-commit-horizontal');
  });

  it('falls back to the plain dot for an unknown kind', () => {
    expect(actIconName('nonexistent-kind')).toBe('dot');
    expect(actIconName('other')).toBe('dot');
  });

  it('falls back to the plain dot for an empty string kind', () => {
    expect(actIconName('')).toBe('dot');
  });
});

describe('ACT_ICONS', () => {
  it('names only vendored icons, never shapes of its own (epic 0025 law 1)', () => {
    for (const [kind, name] of Object.entries(ACT_ICONS)) {
      expect(typeof name, kind).toBe('string');
      expect(ICON_NAMES, kind).toContain(name);
    }
  });
});
