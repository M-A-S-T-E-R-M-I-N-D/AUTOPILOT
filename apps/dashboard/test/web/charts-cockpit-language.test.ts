// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 5, `docs/epics/0005-cockpit-redesign.md`):
 * "Charts and stat tiles follow the same language (tabular numerals, semantic
 * color, ...) — dataviz is part of the system, not an afterthought." The
 * semantic-color pass mapped every sparkline verdict fill and heatmap cell
 * onto the semantic tokens (green = shipped, red = died, amber = attention,
 * border-gray = no data) and the tile numerals onto tabular figures, but
 * nothing pinned those mappings — a refactor could silently hand a chart a
 * decorative or borrowed color again. Same assertion idiom as
 * `worker-card-tabular-numerals.test.ts`: find the rule in the emitted
 * stylesheet, pin its tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

describe('chart semantic color (COCKPIT 5/6)', () => {
  it('sparkline verdict fills carry only semantic tokens', () => {
    expect(ruleFor(css, '.spark-shipped')).toContain('var(--color-success)');
    expect(
      ruleFor(css, '.spark-reverted, .spark-turn-capped, .spark-timed-out, .spark-errored'),
    ).toContain('var(--color-sev-high)');
    expect(ruleFor(css, '.spark-unverified, .spark-checkpointed')).toContain(
      'var(--color-sev-medium)',
    );
    expect(ruleFor(css, '.spark-verdict-carrying')).toContain('var(--color-accent)');
  });

  it('a no-data spark bar reads neutral, never colored', () => {
    expect(ruleFor(css, '.spark-no')).toContain('var(--color-border)');
  });

  it('heatmap cells map ship/death/other/empty onto the semantic tokens', () => {
    expect(ruleFor(css, '.heat-death')).toContain('var(--color-sev-high)');
    expect(ruleFor(css, '.heat-other')).toContain('var(--color-sev-medium)');
    expect(ruleFor(css, '.heat-empty')).toContain('var(--color-border)');
    for (const tier of [1, 2, 3, 4]) {
      expect(ruleFor(css, `.heat-ship-${tier}`)).toContain('var(--color-success)');
    }
  });

  it('a verdict-free trend week reads border-neutral, never SVG-default black', () => {
    // shell.ts's evaluationTrendPanel renders verdict-free weeks as a 2px
    // baseline <rect class="eval-trend-empty"> "mirroring the heatmap's
    // heat-empty convention" — but the stylesheet shipped no rule for it,
    // so the marker painted in the SVG default fill (black) in BOTH themes.
    expect(ruleFor(css, '.eval-trend-empty')).toContain('var(--color-border)');
  });

  it('the focusable verdict-free marker carries the designed focus ring', () => {
    // The empty marker is tabindex="0" with an aria-label/tooltip like its
    // bar siblings, but only .eval-trend-bar had a :focus-visible rule.
    expect(ruleFor(css, '.eval-trend-empty:focus-visible')).toContain('var(--color-accent)');
  });

  it('severity-gauge tiers map critical/high/medium/low onto the sev tokens', () => {
    // The fleet card's findings gauge (`gaugeBar` in shell.ts) is dataviz too:
    // each `.seg-*` tier is a segment whose color must stay semantic, never
    // borrowed. `.seg-low` in particular is a genuine non-success severity —
    // the semantic-color pass deliberately left it on `--color-sev-low` rather
    // than folding it into `--color-success` the way the ship/shipped greens
    // moved — so this pin guards against a well-meaning "low = all-good green"
    // regression that would collide with green's reserved shipped/flying role.
    expect(ruleFor(css, '.seg-critical')).toContain('var(--color-sev-critical)');
    expect(ruleFor(css, '.seg-high')).toContain('var(--color-sev-high)');
    expect(ruleFor(css, '.seg-medium')).toContain('var(--color-sev-medium)');
    expect(ruleFor(css, '.seg-low')).toContain('var(--color-sev-low)');
  });

  it("the gauge's all-clear state reads border-neutral, never a decorative green", () => {
    // `gaugeBar` renders a single `.seg-clear` segment when there are no open
    // findings — the severity gauge's empty state. "No open findings" reads as
    // good news, so a decorative green is the tempting-but-wrong choice; the
    // shared no-data neutral (`.heat-empty`/`.spark-no`/`.eval-trend-empty`
    // convention) is the designed one, keeping green reserved for shipped.
    expect(ruleFor(css, '.seg-clear')).toContain('var(--color-border)');
  });

  it('heatmap ship intensity is one success hue at rising opacity', () => {
    const opacities = [1, 2, 3, 4].map((tier) => {
      const rule = ruleFor(css, `.heat-ship-${tier}`);
      const m = /opacity:\s*([\d.]+)/.exec(rule);
      expect(m, `.heat-ship-${tier} sets an opacity`).not.toBeNull();
      return Number(m![1]);
    });
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i], `tier ${i + 1} reads denser than tier ${i}`).toBeGreaterThan(
        opacities[i - 1]!,
      );
    }
    expect(opacities[3]).toBe(1);
  });
});

describe('stat-tile tabular numerals (COCKPIT 5/6)', () => {
  it.each(['.total-n', '.stat-tile-n', '.stat-n'])('%s keeps instrument-panel figures', (sel) => {
    expect(ruleFor(css, sel)).toContain('font-variant-numeric: tabular-nums');
  });

  it('the severity gauge label keeps its counts from jittering the row', () => {
    expect(ruleFor(css, '.gauge-label')).toContain('font-variant-numeric: tabular-nums');
  });
});
