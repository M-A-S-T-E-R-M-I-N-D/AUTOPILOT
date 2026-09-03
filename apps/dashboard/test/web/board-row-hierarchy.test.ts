// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * the epic's hierarchy contract wants each surface's content stronger than its
 * chrome, VERIFIED per surface. On the board, a task row's content is its
 * title, and the chrome around it — status pill, metadata chips, the drag
 * handle — is explicitly quiet (`--color-text-muted`). But `.task-title`
 * carried no color of its own: the pair held only because body's
 * `--color-text` happened to inherit through, one future ancestor rule away
 * from going hierarchy-flat the way the flight log's firing rows did
 * (`flightlog-row-hierarchy.test.ts`). The cockpit reading is explicit on
 * both sides: title at full text strength, chrome muted. Same assertion
 * idiom as that test: find the rule in the emitted stylesheet, pin its tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

/**
 * The flightlog-row idiom, hardened for selectors that also appear as the
 * TAIL of a grouped rule (`.firing-headline, …, .task-title { … }` at the
 * stylesheet top would shadow a bare indexOf): anchor the match to a rule
 * whose prelude starts at a line boundary with exactly this selector.
 */
function ruleFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped} \\{[^}]*\\}`, 'm').exec(css);
  expect(match, `rule "${selector}" exists`).not.toBeNull();
  return (match as RegExpExecArray)[0];
}

const css = layoutCss();

describe('board row hierarchy (COCKPIT 4/6)', () => {
  it('the task title reads as content, explicitly at full text strength', () => {
    const rule = ruleFor(css, '.task-title');
    expect(rule).toContain('color: var(--color-text)');
  });

  it('the row chrome around it stays quiet, keeping the contrast pair', () => {
    for (const selector of ['.pill', '.chip', '.task-drag-handle']) {
      expect(ruleFor(css, selector)).toContain('color: var(--color-text-muted)');
    }
  });
});
