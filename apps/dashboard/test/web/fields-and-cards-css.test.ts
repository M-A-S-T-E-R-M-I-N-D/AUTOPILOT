// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Two operator findings of 2026-09-13, pinned in the stylesheet:
 * - every textarea's old diagonal resize grip is gone — fields size to their
 *   content between a floor and a ceiling, and only a browser without
 *   `field-sizing` falls back to a manual vertical resize;
 * - a board column card is a card, not a row: the title takes its own full
 *   line under the control strip, and nothing is justified across the card.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

const css = layoutCss();

describe('text fields size to their content — no grip', () => {
  it('one global rule: field-sizing, a floor, a ceiling, no resize handle', () => {
    expect(css).toContain(
      'textarea { field-sizing: content; min-block-size: 3lh; max-block-size: 40vh; resize: none; }',
    );
  });

  it('a browser without field-sizing keeps a manual vertical resize instead of a fixed box', () => {
    expect(css).toContain(
      '@supports not (field-sizing: content) { textarea { resize: vertical; } }',
    );
  });

  it('no per-form rule re-draws the grip', () => {
    const outsideFallback = css.replace(
      '@supports not (field-sizing: content) { textarea { resize: vertical; } }',
      '',
    );
    expect(outsideFallback).not.toContain('resize: vertical');
    expect(outsideFallback).not.toContain('resize: both');
  });
});

describe('a board column card is a card, not a row', () => {
  it('the title takes its own full line and the strip is start-aligned', () => {
    expect(css).toContain('[data-board-view="columns"] .task-title { flex: 1 1 100%; }');
    expect(css).toMatch(
      /\[data-board-view="columns"\] \.task \{[^}]*align-items: center;[^}]*justify-content: flex-start;[^}]*row-gap: var\(--space-1\);/,
    );
  });

  it('the list layout keeps the growing 16rem title basis (a long title wraps as text)', () => {
    expect(css).toContain('.task-title { flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere;');
  });
});
