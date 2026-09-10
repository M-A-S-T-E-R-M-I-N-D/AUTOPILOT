// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * KEEPER review panel, awaiting-approval affordance (board web-mto1tya3-57v8ig):
 * `.pr-review-approve-link` — the "🔓 Review & approve on GitHub" anchor an
 * awaiting-approval card renders in its actions row (`features/pr-review.ts`,
 * href from `awaitingApprovalChecksUrl`). It sits beside the
 * `.pr-review-human-merge` button and must read as that button's structural
 * twin: same needs-you outline shell, same hover/focus-visible wash. An
 * anchor gets its pointer cursor from the UA and never declares one in CSS —
 * the same blind spot that let `.publicity-link-live` and `.card-link` escape
 * the earlier stylesheet audits — so this pins the rule explicitly.
 *
 * Same assertion idiom as `publicity-link-designed-states.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

// A selector may open its own rule (`sel {`) or sit in a shared selector
// list (`sel, other {`) — match either, like hover-focus-visible-pairing's.
function ruleFor(css: string, selector: string): string {
  const braceIdx = css.indexOf(`${selector} {`);
  const commaIdx = css.indexOf(`${selector},`);
  const candidates = [braceIdx, commaIdx].filter((i) => i >= 0);
  const start = candidates.length > 0 ? Math.min(...candidates) : -1;
  expect(start, `rule containing "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();
const selector = '.pr-review-approve-link';
const twin = '.pr-review-human-merge';

describe('pr-review approve link designed states (board web-mto1tya3-57v8ig)', () => {
  it("wears the human-merge button's needs-you outline shell, sized like a button", () => {
    const rest = ruleFor(css, selector);
    expect(rest).toContain('display: inline-flex');
    expect(rest).toContain('align-items: center');
    expect(rest).toContain('text-decoration: none');
    expect(rest).toContain('border: 1px solid var(--color-needs-you)');
    expect(rest).toContain('color: var(--color-needs-you)');
    expect(rest).toContain('background: transparent');
    expect(rest).toContain('border-radius: var(--shape-extra-small)');
    expect(rest).toContain('padding: var(--space-1) var(--space-3)');
    expect(rest).toContain('font-size: var(--text-sm)');
  });

  it('pairs hover with focus-visible on one selector list', () => {
    const hover = ruleFor(css, `${selector}:hover`);
    expect(hover).toContain(`${selector}:focus-visible`);
    expect(hover).toContain(
      'background: color-mix(in oklab, var(--color-needs-you) 14%, transparent)',
    );
  });

  it('shares the hover body byte-for-byte with its button twin so the pair cannot drift', () => {
    const hover = ruleFor(css, `${selector}:hover`);
    const twinHover = ruleFor(css, `${twin}:hover:not(:disabled)`);
    expect(hover.slice(hover.indexOf('{'))).toBe(twinHover.slice(twinHover.indexOf('{')));
  });

  // An anchor is never :disabled — a disabled-state rule on it would promise
  // a state the element cannot enter.
  it('carries no :disabled rule', () => {
    expect(css).not.toContain(`${selector}:disabled`);
  });
});
