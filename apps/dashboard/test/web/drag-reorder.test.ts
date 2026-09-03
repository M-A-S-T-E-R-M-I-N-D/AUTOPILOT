// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the task list's pointer drag-reorder drop-target
 * math (`web/drag-reorder.ts`) — extracted out of `fleetJs()`'s inline
 * `dragover` handler (epic 0002 "shell decomposition"). jsdom's default
 * `getBoundingClientRect()` returns an all-zero rect for every element, so
 * exercising the handler itself through a rendered DOM can never distinguish
 * "insert before row N" from "append at the end" — only a direct unit test
 * with real rects can.
 */

import { describe, it, expect } from 'vitest';
import { dragBeforeIndex } from '../../src/web/drag-reorder.js';

describe('dragBeforeIndex', () => {
  it('picks the first row whose midpoint sits below the pointer', () => {
    const boxes = [
      { top: 0, height: 20 }, // midpoint 10
      { top: 20, height: 20 }, // midpoint 30
      { top: 40, height: 20 }, // midpoint 50
    ];
    expect(dragBeforeIndex(boxes, 25)).toBe(1);
  });

  it('returns null when the pointer is below every row midpoint (append at the end)', () => {
    const boxes = [
      { top: 0, height: 20 }, // midpoint 10
      { top: 20, height: 20 }, // midpoint 30
    ];
    expect(dragBeforeIndex(boxes, 35)).toBeNull();
  });

  it('picks the first row when the pointer is above every row midpoint', () => {
    const boxes = [
      { top: 0, height: 20 }, // midpoint 10
      { top: 20, height: 20 }, // midpoint 30
    ];
    expect(dragBeforeIndex(boxes, -5)).toBe(0);
  });

  it('returns null for an empty row list', () => {
    expect(dragBeforeIndex([], 100)).toBeNull();
  });

  it('picks the single row when it sits below the pointer', () => {
    const boxes = [{ top: 50, height: 20 }]; // midpoint 60
    expect(dragBeforeIndex(boxes, 40)).toBe(0);
  });
});
