// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * "Motion clarifies: micro-transitions on state changes (compositor-friendly
 * `transform`/`opacity` only)". The per-firing live-progress bar and the fly
 * bar's whole-flight progress bar were the last transitions animating a
 * LAYOUT-BOUND property — `transition: width` re-lays-out and repaints on
 * every frame of the ~300ms ease, on bars that move every poll tick. They now
 * ride a `scaleX()` transform (the `.brb-progress` keyframes' precedent),
 * anchored at the inline-start edge in BOTH directions via a `:dir(rtl)`
 * origin override — a width-based fill got RTL growth for free, a transform
 * must keep it deliberately.
 *
 * The sweep test pins the whole contract, not just these two bars: every
 * `transition:` in the emitted stylesheet must name only non-layout
 * properties, so the next `transition: width` goes red instead of shipping.
 * Same assertion idiom as `worker-card-tabular-numerals.test.ts`: find the
 * rule in the emitted stylesheet, pin its tokens; plus the emitted client
 * JS (`fleetJs()`/`flyJs()`) pinned to the transform setter so the motion
 * keeps actually firing.
 *
 * `@keyframes` bodies are pinned separately, and STRICTER: transitions are
 * one-shot micro-state changes, so paint-bound properties (border-radius,
 * box-shadow, color) are acceptable there, but every keyframe animation in
 * this stylesheet loops infinitely (`live-pulse`, `brb-bob`, `brb-progress`)
 * — a paint-bound property in one repaints EVERY frame FOREVER. So keyframe
 * steps may declare only the compositor-composited pair transform/opacity
 * (plus the non-animated step meta-property `animation-timing-function`).
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';
import { fleetJs } from '../../src/web/shell.js';
import { flyJs } from '../../src/web/features/fly.js';

/** Properties whose animation forces layout — banned from transitions by the
 *  epic's motion contract. Prefix-matched so `margin-inline-start`,
 *  `border-left-width`, `inset-block`, … are all caught. */
const LAYOUT_BOUND_PREFIXES = [
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'top',
  'left',
  'right',
  'bottom',
  'inset',
  'margin',
  'padding',
  'font-size',
  'flex-basis',
  'gap',
  'grid-template',
];

function isLayoutBound(property: string): boolean {
  if (/^border(-.+)?-width$/.test(property)) return true;
  return LAYOUT_BOUND_PREFIXES.some((p) => property === p || property.startsWith(`${p}-`));
}

/** Every property name transitioned anywhere in the stylesheet. Parenthesized
 *  groups (`var(--ease)`, `cubic-bezier(…)`) are collapsed first so their
 *  commas don't split a single transition segment in two. */
function transitionedProperties(css: string): string[] {
  const decls = [...css.matchAll(/transition:([^;]*);/g)].map((m) => m[1] ?? '');
  return decls.flatMap((decl) =>
    decl
      .replace(/\([^)]*\)/g, '()')
      .split(',')
      .map((segment) => segment.trim().split(/\s+/)[0] ?? '')
      .filter((token) => /^[a-z][a-z-]*$/.test(token)),
  );
}

/** Properties keyframe steps may declare — the two the compositor animates
 *  without repainting, plus the per-step timing meta-property (which selects
 *  an easing, it never animates). */
const KEYFRAME_SAFE_PROPERTIES = new Set(['transform', 'opacity', 'animation-timing-function']);

/** Every property name declared inside any `@keyframes` block — the set of
 *  properties the stylesheet's animations actually drive. Brace-walked (not
 *  one regex over the whole block) so nested step blocks close correctly. */
function keyframeProperties(cssText: string): string[] {
  const props: string[] = [];
  for (const match of cssText.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let i = start;
    while (i < cssText.length && depth > 0) {
      if (cssText[i] === '{') depth += 1;
      else if (cssText[i] === '}') depth -= 1;
      i += 1;
    }
    const body = cssText.slice(start, i - 1);
    for (const decl of body.matchAll(/([a-z][a-z-]*)\s*:/g)) {
      props.push(decl[1] ?? '');
    }
  }
  return props;
}

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

describe('compositor-only transitions (COCKPIT 6/6)', () => {
  it('no transition in the stylesheet animates a layout-bound property', () => {
    const hazards = transitionedProperties(css).filter(isLayoutBound);
    expect(hazards).toEqual([]);
  });

  it('progress fills ride a transform, anchored inline-start in both directions', () => {
    const rule = ruleFor(css, '.live-progress-fill, .fly-progress-fill');
    expect(rule).toContain('transition: transform');
    expect(rule).toContain('transform-origin: left');
    const rtl = ruleFor(css, '.live-progress-fill:dir(rtl), .fly-progress-fill:dir(rtl)');
    expect(rtl).toContain('transform-origin: right');
  });

  it('every @keyframes step declares compositor-composited properties only', () => {
    const props = keyframeProperties(css);
    expect(props.length, 'the parser found the live-pulse/brb animations').toBeGreaterThan(0);
    const hazards = props.filter((p) => !KEYFRAME_SAFE_PROPERTIES.has(p));
    expect(hazards).toEqual([]);
  });

  it('the keyframe parser would catch a layout-bound animation (red-capable proof)', () => {
    const bad = '@keyframes grow { from { width: 0; } to { width: 100%; opacity: 1; } }';
    expect(keyframeProperties(bad)).toEqual(['width', 'width', 'opacity']);
  });

  it('the emitted client JS drives both fills through transform, not width', () => {
    const shellJs = fleetJs();
    expect(shellJs).toContain('progressFill.style.transform');
    expect(shellJs).not.toContain('progressFill.style.width');
    const fly = flyJs();
    expect(fly).toContain('progressFillEl.style.transform');
    expect(fly).not.toContain('progressFillEl.style.width');
  });
});
