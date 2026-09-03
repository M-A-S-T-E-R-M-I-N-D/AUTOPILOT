// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the activity feed's icon shape lookup
 * (`web/activity-icon.ts`) — extracted out of `fleetJs()`'s inline
 * `actIcon()` (epic 0002 "shell decomposition"), where the `ACT_ICON_SHAPES[kind]
 * || ACT_ICON_SHAPES.other` fallback had no direct test coverage before this.
 */

import { describe, it, expect } from 'vitest';
import { ACT_ICON_SHAPES, actIconShapes } from '../../src/web/activity-icon.js';

describe('actIconShapes', () => {
  it('resolves a known kind to its own dedicated shape list', () => {
    expect(actIconShapes('edit')).toBe(ACT_ICON_SHAPES['edit']);
    expect(actIconShapes('gate')).toBe(ACT_ICON_SHAPES['gate']);
  });

  it('falls back to the generic "other" glyph for an unknown kind', () => {
    expect(actIconShapes('nonexistent-kind')).toBe(ACT_ICON_SHAPES['other']);
  });

  it('falls back to "other" for an empty string kind', () => {
    expect(actIconShapes('')).toBe(ACT_ICON_SHAPES['other']);
  });
});

describe('ACT_ICON_SHAPES', () => {
  it('gives every shape a valid SVG tag name and at least one attribute', () => {
    for (const shapes of Object.values(ACT_ICON_SHAPES)) {
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of shapes) {
        expect(['path', 'rect', 'circle']).toContain(shape.t);
        expect(Object.keys(shape).length).toBeGreaterThan(1);
      }
    }
  });
});
