// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `#fly-lucky` — the fly bar's 🍀 "I'm feeling lucky" button (`shell.ts`,
 * driven by `features/fly.ts`, which disables it for the `/api/lucky`
 * round-trip) — was the ONLY fly-bar control with no stylesheet rule at all.
 * It rendered as a raw UA-default `<button>` (UA font, UA radius, UA
 * borders, zero hover/focus/active/disabled feedback) wedged between the
 * Lanes field and the fully-styled `#fly-go` / `#fly-browse-btn` siblings.
 * It escaped every prior slice-6 audit precisely because each walked
 * EXISTING rules — the `cursor: pointer` census, the `:hover`-rule walk —
 * and a control with no rule has nothing to find. This audit cross-
 * referenced the interactive tags in the markup sources against the
 * stylesheet's state selectors instead.
 *
 * It now shares `#fly-browse-btn`'s outline-chip idiom (shape-morph +
 * `--elevation-level-1` lift on hover/focus-visible, pressed-flat active,
 * the radius/shadow transition at rest) and, because it can be disabled,
 * `#fly-go`'s `:disabled` phase with the `:not(:disabled)` guards.
 * Same assertion idiom as `outline-chip-designed-states.test.ts`.
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

function body(rule: string): string {
  return rule.slice(rule.indexOf('{'));
}

const css = layoutCss();
const selector = '#fly-lucky';

describe('fly-bar lucky button designed states (COCKPIT 6/6)', () => {
  it('leaves the UA default behind: inherits the font, rests on the extra-small shape token with the transition', () => {
    const rest = ruleFor(css, selector);
    expect(rest).toContain('font: inherit');
    expect(rest).toContain('cursor: pointer');
    // Success-voiced, not the plain border token: the clover button speaks
    // "advisory roll" in --color-success beside the accent "spend" CTA
    // (f861d7dc — verified ≥4.5:1 on every theme's surfaces), and the SVG
    // inherits it via currentColor.
    expect(rest).toContain('border: 1px solid var(--color-success)');
    expect(rest).toContain('color: var(--color-success)');
    expect(rest).toContain('border-radius: var(--shape-extra-small)');
    expect(rest).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('morphs + lifts on hover/focus-visible behind the :not(:disabled) guard', () => {
    const hover = ruleFor(css, `${selector}:not(:disabled):hover`);
    expect(hover).toContain(`${selector}:not(:disabled):focus-visible`);
    expect(hover).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover).toContain('box-shadow: var(--elevation-level-1)');
  });

  it('flattens pressed on active with the body its Browse… sibling carries', () => {
    const active = ruleFor(css, `${selector}:not(:disabled):active`);
    expect(active).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active).toContain('box-shadow: none');

    // Byte-identical to #fly-browse-btn:active — the outline-chip twin two
    // controls to its left — so the pair cannot drift.
    expect(body(active)).toBe(body(ruleFor(css, '#fly-browse-btn:active')));
  });

  // features/fly.ts sets luckyEl.disabled = true for the /api/lucky
  // round-trip; the disabled phase must read like #fly-go's, not the UA's.
  it('carries the fly-bar :disabled phase, byte-identical to #fly-go:disabled', () => {
    const disabled = ruleFor(css, `${selector}:disabled`);
    expect(disabled).toContain('cursor: default');
    expect(body(disabled)).toBe(body(ruleFor(css, '#fly-go:disabled')));
  });
});
