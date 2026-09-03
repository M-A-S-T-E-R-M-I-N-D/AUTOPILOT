// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * `.pool-client-fly` — the Pool panel's post-claim "Fly" button
 * (`features/pool-client.ts` appends it to the `.pool-client-item` after a
 * successful claim that queued a local board task, and disables it for the
 * `/api/fly` round-trip) — had NO stylesheet rule at all. It rendered as a
 * raw UA-default `<button>` (UA font, UA radius, UA borders, stretched to the
 * item column's full width, zero hover/focus/active/disabled feedback)
 * directly under the success line, in the exact spot the fully-styled
 * `.pool-client-execute` Claim CTA it replaces had just vacated.
 *
 * It escaped the prior rule-less-control cross-reference because its
 * `className` is assigned two statements after its `createElement` — a
 * grep-adjacent audit saw an anonymous button. This audit walked every
 * `createElement('button')` to its className instead.
 *
 * Fix: it IS a panel execute CTA (a filled-accent button that fires a POST
 * and disables during the round-trip), so it shares `.pool-client-execute`'s
 * rules outright — the same rest / `:disabled` rule via selector list, and a
 * seat in the combined execute-CTA family block (transition at rest,
 * shape-morph + `--elevation-level-1` lift on hover/focus-visible behind the
 * `:not(:disabled)` guard, pressed-flat `:active`). Sharing the rule, not
 * copying its body, is what makes drift impossible. Its one own declaration
 * pins it to the item column's end, where the Claim row's `flex-end`
 * actions row sat.
 *
 * The rule parser here is deliberately list-aware: a selector that lives
 * only inside shared selector lists has no `sel {` of its own for the
 * `indexOf`-based helpers in sibling suites to find.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

interface CssRule {
  readonly selectors: readonly string[];
  readonly body: string;
}

// Innermost `prelude { body }` pairs only — nested @media blocks contribute
// their inner rules, never the at-rule prelude. Comments are stripped first
// so a rule's explanatory comment cannot leak into the previous prelude.
function parseRules(css: string): CssRule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: CssRule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const prelude = m[1] ?? '';
    const body = m[2] ?? '';
    const selectors = prelude
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    out.push({ selectors, body: body.trim() });
  }
  return out;
}

function rulesFor(rules: readonly CssRule[], selector: string): CssRule[] {
  return rules.filter((r) => r.selectors.includes(selector));
}

function bodiesFor(rules: readonly CssRule[], selector: string): string[] {
  return rulesFor(rules, selector).map((r) => r.body);
}

const rules = parseRules(layoutCss());
const fly = '.pool-client-fly';
const claim = '.pool-client-execute';

describe('pool-client Fly button designed states (COCKPIT 6/6)', () => {
  it('the parser can go red: an unknown selector matches no rule', () => {
    expect(rulesFor(rules, '.no-such-selector-ever')).toHaveLength(0);
  });

  it('leaves the UA default behind: rests on the Claim CTA rule (font, filled accent, extra-small shape)', () => {
    const rest = bodiesFor(rules, fly).join('\n');
    expect(rest).toContain('font: inherit');
    expect(rest).toContain('cursor: pointer');
    expect(rest).toContain('border: 1px solid var(--color-accent)');
    expect(rest).toContain('background: var(--color-accent)');
    expect(rest).toContain('color: var(--color-accent-text)');
    expect(rest).toContain('border-radius: var(--shape-extra-small)');
    expect(rest).toContain(
      'transition: border-radius var(--duration-short2) var(--easing-standard), box-shadow var(--duration-short2) var(--easing-standard)',
    );
  });

  it('shares every rest rule the Claim CTA carries, so the pair cannot drift', () => {
    const claimRest = bodiesFor(rules, claim);
    expect(claimRest.length).toBeGreaterThan(0);
    expect(bodiesFor(rules, fly)).toEqual(expect.arrayContaining(claimRest));
  });

  it('pins itself to the item column end, where the Claim row it replaces sat', () => {
    // .pool-client-item is a column flexbox; an unstyled child stretches to
    // its full width. .pool-client-actions justified its row flex-end.
    expect(bodiesFor(rules, fly).join('\n')).toContain('align-self: flex-end');
  });

  it('morphs + lifts on hover/focus-visible behind the :not(:disabled) guard', () => {
    const hover = rulesFor(rules, `${fly}:not(:disabled):hover`);
    expect(hover).toHaveLength(1);
    expect(hover[0]?.selectors).toContain(`${fly}:not(:disabled):focus-visible`);
    expect(hover[0]?.body).toContain('border-radius: var(--shape-extra-small-hover)');
    expect(hover[0]?.body).toContain('box-shadow: var(--elevation-level-1)');
    expect(hover[0]?.selectors).toContain(`${claim}:not(:disabled):hover`);
  });

  it('flattens pressed on :active in the same rule as the Claim CTA', () => {
    const active = rulesFor(rules, `${fly}:not(:disabled):active`);
    expect(active).toHaveLength(1);
    expect(active[0]?.body).toContain('border-radius: var(--shape-extra-small-pressed)');
    expect(active[0]?.body).toContain('box-shadow: none');
    expect(active[0]?.selectors).toContain(`${claim}:not(:disabled):active`);
  });

  // features/pool-client.ts sets flyBtn.disabled = true for the /api/fly
  // round-trip; the disabled phase must read like the Claim CTA's, not the UA's.
  it('carries the :disabled phase in the same rule as the Claim CTA', () => {
    const disabled = rulesFor(rules, `${fly}:disabled`);
    expect(disabled).toHaveLength(1);
    expect(disabled[0]?.body).toContain('cursor: default');
    expect(disabled[0]?.body).toContain('opacity: 0.6');
    expect(disabled[0]?.selectors).toContain(`${claim}:disabled`);
  });
});
