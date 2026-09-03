// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the task board's reorder/focus/done/approve/delete buttons were the one
 * interactive cluster on the project page still missing the shape-morph
 * hover/active language every sibling toggle (`.phase`, `.flight-head`,
 * `.flight-more`, `.firing-toggle`, `.diff-toggle`) and the fly-bar CTAs
 * (`#fly-go`/`-stop`/`-pause`, `.fly-flight-actions button` — commit
 * `9fb7932`) already carry. Same pattern here: a short transition plus
 * `--shape-extra-small-hover`/`-pressed` corner-radius shift and an
 * elevation bump on hover, flattened again on press.
 *
 * That pass paired the shape-morph with `:hover` only, leaving these five
 * buttons the one cluster on the page whose hover rule has no
 * `:focus-visible` twin — every other interactive control here
 * (`.connect-test`, `.gh-issue-form button`, `.tour-actions button`,
 * `.browse-actions button`, `.soul-review-btn`, `.soul-editor-form button`)
 * fires the same shape-morph/elevation feedback on keyboard focus as on
 * mouse hover. A keyboard-only operator tabbing to Move/Focus/Done/Approve/
 * Delete got zero visual feedback landing on the control.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

// A selector may open its own rule (`sel {`) or sit in a shared selector
// list (`sel, other {`) — match either so combined hover/focus-visible
// rules resolve the same as standalone ones.
function ruleFor(css: string, selector: string): string {
  const braceIdx = css.indexOf(`${selector} {`);
  const commaIdx = css.indexOf(`${selector},`);
  const candidates = [braceIdx, commaIdx].filter((i) => i >= 0);
  const start = candidates.length > 0 ? Math.min(...candidates) : -1;
  expect(start, `rule containing "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

describe.each(['.task-move', '.task-focus-btn', '.task-done-btn', '.task-delete-btn'])(
  '%s shape morph',
  (selector) => {
    const css = layoutCss();

    it('transitions border-radius and box-shadow on the rest state', () => {
      const rule = ruleFor(css, selector);
      expect(rule).toContain('transition:');
      expect(rule).toContain('border-radius');
    });

    it('shifts to the MX hover radius, un-pressed only', () => {
      const rule = ruleFor(css, `${selector}:not(:disabled):hover`);
      expect(rule).toContain('var(--shape-extra-small-hover)');
    });

    it('pairs the hover feedback with :focus-visible for keyboard operators', () => {
      const rule = ruleFor(css, `${selector}:not(:disabled):hover`);
      expect(rule).toContain(`${selector}:not(:disabled):focus-visible`);
    });

    it('shifts to the MX pressed radius on :active, un-pressed only', () => {
      const rule = ruleFor(css, `${selector}:not(:disabled):active`);
      expect(rule).toContain('var(--shape-extra-small-pressed)');
    });
  },
);

describe('.task-approve-btn shape morph', () => {
  const css = layoutCss();

  it('inherits the shared .task-done-btn shape-morph transition (same element carries both classes)', () => {
    const rule = ruleFor(css, '.task-done-btn');
    expect(rule).toContain('transition:');
    expect(rule).toContain('border-radius');
  });

  it('keeps its own accent hover colors gated to the un-pressed state', () => {
    const rule = ruleFor(css, '.task-approve-btn:not(:disabled):hover');
    expect(rule).toContain('var(--color-accent)');
  });

  it('pairs the hover feedback with :focus-visible for keyboard operators', () => {
    const rule = ruleFor(css, '.task-approve-btn:not(:disabled):hover');
    expect(rule).toContain('.task-approve-btn:not(:disabled):focus-visible');
  });
});
