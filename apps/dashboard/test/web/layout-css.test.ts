// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * RTL-correctness guard for `web/layout-css.ts` (board web-msnsndki-dz3vn1,
 * i18n foundation slice 2: layout audit) — the locale switcher already flips
 * `<html dir>` to `rtl` for Hebrew (`web/features/locale.ts`), so any
 * physical-direction CSS left in this stylesheet (`left`/`right`,
 * `margin-left`/`-right`, `padding-left`/`-right`, `border-left`/`-right`,
 * `text-align: left|right`) renders backwards under `dir=rtl` instead of
 * mirroring. This test fails the build the moment a physical-direction
 * declaration creeps back in, so the whole stylesheet stays logical-property
 * clean without a manual audit every time.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

describe('layoutCss', () => {
  const css = layoutCss();

  it('has no physical-direction margin/padding/border declarations', () => {
    expect(css).not.toMatch(/margin-left|margin-right/);
    expect(css).not.toMatch(/padding-left|padding-right/);
    expect(css).not.toMatch(/border-left|border-right/);
  });

  it('has no physical left/right positioning or text-align', () => {
    expect(css).not.toMatch(/\bleft:/);
    expect(css).not.toMatch(/\bright:/);
    expect(css).not.toMatch(/text-align:\s*(left|right)\b/);
  });

  it('uses logical inline/block properties for direction-sensitive rules', () => {
    expect(css).toContain('inset-inline-end: 0;');
    expect(css).toContain('margin-inline-end: 6px;');
    expect(css).toContain('padding-inline-start: var(--space-5);');
    expect(css).toContain('text-align: start;');
    expect(css).toContain('text-align: end;');
    expect(css).toContain('border-inline-start: 3px solid var(--color-accent);');
    expect(css).toContain('margin-inline-start: auto;');
    // The skip link's visible position is logical; it hides by clipping, never by a
    // physical off-screen offset (RTL audit 2026-09-12: -9999px inline-start
    // landed 10,000px to the right of a Hebrew page).
    expect(css).toContain(
      '.skip-link {\n  position: absolute; inset-inline-start: var(--space-3);',
    );
    expect(css).not.toContain('-9999px');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    expect(css).toBe(css.trim());
  });
});

/**
 * D4 pipeline-view canvas/tree styling (epic 0015, board web-mtdc6wq3-5wuc6i) — bug fix.
 * `pipeline-svg.ts`/`pipeline-tree-html.ts` emit `data-status`/`data-selected`/`data-connected`
 * hooks and explicitly defer all color to this token-owning stylesheet ("no style values appear
 * here at all" — pipeline-svg.ts's own header), but no rule ever targeted them: every
 * `.pipeline-node rect`/`.pipeline-edge` rendered with SVG's unstyled defaults (solid black
 * fill, invisible black-filled edges, unreadable black text), and neither the tree items nor the
 * canvas showed any visual state for hover, focus, selection, or the connected-neighbour
 * highlight `web/features/pipeline.ts`'s selection JS computes and flags but that never painted.
 */
describe('layoutCss — pipeline canvas/tree status and selection styling', () => {
  const css = layoutCss();

  it('gives pipeline tree items a pointer affordance and a visible focus ring', () => {
    expect(css).toMatch(/\.pipeline-item\s*\{[^}]*cursor:\s*pointer/);
    expect(css).toMatch(/\.pipeline-item:hover,\s*\.pipeline-item:focus-visible\s*\{/);
  });

  it('highlights connected tree items — the data-connected hook the selection JS sets', () => {
    expect(css).toMatch(/\.pipeline-item\[data-connected='true'\]\s*\{/);
  });

  it('really hides a collapsed lane — .pipeline-lane display:flex would beat the UA [hidden] rule', () => {
    expect(css).toMatch(/\.pipeline-lane\s*\{[^}]*display:\s*flex/);
    expect(css).toContain('.pipeline-lane[hidden] { display: none; }');
  });

  it('styles the drill-in toggle with a designed hover/focus and open state (epic 0024)', () => {
    expect(css).toMatch(/\.pipeline-lanes-toggle:hover, \.pipeline-lanes-toggle:focus-visible \{/);
    expect(css).toMatch(
      /\.pipeline-lanes-toggle\[aria-expanded="true"\] \{[^}]*var\(--color-accent\)/,
    );
  });

  it('gives canvas nodes a real fill/stroke instead of SVG rect defaults', () => {
    expect(css).toMatch(/\.pipeline-node rect\s*\{[^}]*fill:\s*var\(--color-/);
    expect(css).toMatch(/\.pipeline-node rect\s*\{[^}]*stroke:\s*var\(--color-/);
  });

  it('maps each OTLP status to the same tokens the spark chart already uses for it', () => {
    expect(css).toMatch(/\.pipeline-node\[data-status='ok'\][^{]*\{[^}]*var\(--color-success\)/);
    expect(css).toMatch(
      /\.pipeline-node\[data-status='error'\][^{]*\{[^}]*var\(--color-sev-high\)/,
    );
  });

  it('gives selected and connected canvas nodes distinct accent treatment', () => {
    expect(css).toMatch(/\.pipeline-node\[data-selected='true'\][^{]*\{[^}]*var\(--color-accent\)/);
    expect(css).toMatch(
      /\.pipeline-node\[data-connected='true'\][^{]*\{[^}]*var\(--color-accent\)/,
    );
  });

  it('renders node labels legibly, centered on their rect', () => {
    expect(css).toMatch(/\.pipeline-node text\s*\{[^}]*fill:\s*var\(--color-text\)/);
    expect(css).toMatch(/\.pipeline-node text\s*\{[^}]*text-anchor:\s*middle/);
  });

  it('strokes edges instead of leaving them SVG-default-filled (invisible black polygons)', () => {
    expect(css).toMatch(/\.pipeline-edge\s*\{[^}]*fill:\s*none/);
    expect(css).toMatch(/\.pipeline-edge\s*\{[^}]*stroke:\s*var\(--color-/);
    expect(css).toMatch(/\.pipeline-edge\[data-connected='true'\]\s*\{[^}]*var\(--color-accent\)/);
  });
});

/**
 * EPIC 0018 "calm cockpit" slice 1 (docs/epics/0018-calm-cockpit.md), LAYOUT
 * STABILITY LAW: "a panel never resizes the page — every live-updating
 * region owns a fixed-height (or max-height) scroll container; growth
 * scrolls INSIDE it." The docs-viewer body and phase-acts drill-down already
 * carry a max-height/overflow-y pair; this is the scroll-container-audit
 * follow-up on the two remaining unbounded live regions the operator's pain
 * report names — the tool-call activity feed and the per-firing trace list —
 * both of which render one entry per item with no cap, so a long-running
 * flight (or a firing with many tool calls) grows the region without bound
 * and reflows the whole page under it.
 */
describe('layoutCss — EPIC 0018 slice 1: scroll-container audit for unbounded live regions', () => {
  const css = layoutCss();

  it('bounds the live tool-call activity feed to a scrolling container', () => {
    expect(css).toMatch(/\.activity\s*\{[^}]*max-height:/);
    expect(css).toMatch(/\.activity\s*\{[^}]*overflow-y:\s*auto/);
  });

  it('bounds the per-firing trace list to a scrolling container', () => {
    expect(css).toMatch(/\.firing-timeline\s*\{[^}]*max-height:/);
    expect(css).toMatch(/\.firing-timeline\s*\{[^}]*overflow-y:\s*auto/);
  });

  // shell.ts's flightLog() caps `.flightlog` at FLIGHTLOG_COMPACT_ROWS (8) by
  // default, but its own "Show all" toggle (openFlightLogAll[c.id]) renders
  // every row a project has ever flown with no cap — a long-lived project's
  // expanded flight log grows the region without bound and reflows the whole
  // page under it, the exact same unbounded-live-region shape the two tests
  // above already fixed for the activity feed and trace list.
  it('bounds the flight log to a scrolling container so "Show all" cannot grow the page', () => {
    expect(css).toMatch(/\.flightlog\s*\{[^}]*max-height:/);
    expect(css).toMatch(/\.flightlog\s*\{[^}]*overflow-y:\s*auto/);
  });
});

/**
 * Bug report (report-element-79ilap): "Tooltip text overflows panel
 * boundaries in flight map visualization." The flight map's per-node tip
 * (`fnodeTip()` in web/flight-map.ts) renders a full file path through the
 * shared `.spark-tip` bubble, which sets `max-width: 240px` but never told
 * the browser where it may break a long unbroken run of characters (a deep
 * path segment or long filename with no space/hyphen/slash to wrap at) —
 * the same class of bug `.task-title`/`.flight-summary-headline`/
 * `.browse-path` already carry `overflow-wrap: anywhere` for. Without it,
 * default text wrapping refuses to break the word and the rendered text
 * spills past the bubble's own 240px box instead of staying inside it.
 */
describe('layoutCss — spark-tip tooltip text stays inside its own box (report-element-79ilap)', () => {
  const css = layoutCss();

  it('lets the shared tooltip bubble break long unbroken text instead of overflowing its max-width', () => {
    expect(css).toMatch(/\.spark-tip\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});

/**
 * THE RULE THAT WAS WRITTEN TWICE (operator, 2026-09-14: the Hebrew fly bar
 * "still looks really weird").
 *
 * `#fly-lucky` carried two complete rule sets. The later one — written when
 * the clover had no styling at all — silently overrode the designed
 * green-outline treatment the earlier one gives it, so the control rendered
 * as a third unrelated grey chip beside Fire. Nothing caught it: both rules
 * were valid, both were reachable, and a selector census that only asks
 * "does this control have a rule?" answers yes twice.
 *
 * This census asks the harder question. A bare `#id { … }` written twice in
 * one stylesheet means one of them is dead, and which one is dead depends on
 * source order — which is exactly the kind of fact nobody re-derives while
 * reading a diff.
 */
describe('layoutCss — no id is styled twice by a bare selector', () => {
  const css = layoutCss();

  it('declares each bare #id rule exactly once, so no designed treatment is silently overridden', () => {
    const counts = new Map<string, number>();
    // The id must be the ENTIRE selector of the rule. A stateful or
    // descendant selector (`#fly-go:hover`, `#a #b`) is a deliberate second
    // rule, and so is a grouped one (`#a, #b { … }`) — those share one
    // declaration block on purpose. Only `#id { … }` twice is a bug.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of withoutComments.matchAll(/(?:^|\})\s*([^{}]+)\{/g)) {
      const selector = (match[1] as string).trim();
      if (!/^#[a-z][a-z0-9-]*$/i.test(selector)) continue;
      counts.set(selector, (counts.get(selector) ?? 0) + 1);
    }
    const duplicated = [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([id, n]) => `${id} (${n} bare rules)`)
      .sort();
    expect(duplicated, 'one of each pair is dead — merge them').toEqual([]);
  });
});

/**
 * THE FLY BAR'S OWN ROW (same report). Three controls sat beside a
 * full-height input at three different heights, each sized by its own
 * padding, and a long status sentence shared their row and stretched it.
 */
describe('layoutCss — the fly bar reads as one row of one height', () => {
  const css = layoutCss();

  it('gives every fly-bar control and the folder input the same block size', () => {
    expect(css).toMatch(
      /#fly-lucky,\s*#fly-go,\s*\.fly-options-toggle[^{]*\{[^}]*min-block-size:\s*2\.25rem/,
    );
    expect(css).toMatch(/#fly-folder\s*\{[^}]*min-block-size:\s*2\.25rem/);
  });

  it('puts the status on its own line, and takes no space at all when it is empty', () => {
    expect(css).toMatch(/\.fly-status\s*\{[^}]*flex-basis:\s*100%/);
    expect(css).toMatch(/\.fly-status:empty\s*\{[^}]*display:\s*none/);
  });
});

/**
 * Bug report (report-element-1twh12p): "Hebrew back-to-fleet arrow sits on
 * the wrong side; report capture is too thin and clips text at short
 * viewport heights." Fixed in the same commit (2026-09-14) that added
 * `stat-tiles.test.ts`'s "the back link carries only words" test — that test
 * covers the STRINGS side (no arrow character in the translated sentence);
 * these cover the CSS side the string test cannot reach: the icon actually
 * mirrors under `dir=rtl`, and the dialog actually shrinks instead of
 * clipping in a short window.
 */
describe('layoutCss — back-link icon mirrors under RTL, report dialog survives a short viewport (report-element-1twh12p)', () => {
  const css = layoutCss();

  it('flips the back link icon under dir=rtl, and only under dir=rtl', () => {
    expect(css).toMatch(/\[dir='rtl'\]\s*\.back \.icon\s*\{[^}]*transform:\s*scaleX\(-1\)/);
    // The un-mirrored (ltr) rule must not itself carry a transform — only
    // the [dir='rtl'] override may flip it.
    const ltrRule = css.match(/(?<!\[dir='rtl'\]\s*)\.back \.icon\s*\{[^}]*\}/);
    expect(ltrRule?.[0]).not.toMatch(/transform:/);
  });

  it('sizes the report dialog by min(85vh, 85dvh) so mobile browser chrome counts, and lets it shrink', () => {
    expect(css).toMatch(/\.report-dialog\s*\{[^}]*max-block-size:\s*min\(85vh,\s*85dvh\)/);
    expect(css).toMatch(/\.report-dialog\s*\{[^}]*min-block-size:\s*0/);
  });

  it('lets the capture block shrink and yield space first, instead of pushing the rest of the dialog off-screen', () => {
    expect(css).toMatch(/\.report-dialog-capture\s*\{[^}]*min-block-size:\s*0/);
    expect(css).toMatch(/\.report-dialog-capture\s*\{[^}]*flex:\s*0 1 auto/);
  });

  it('tightens the dialog padding under a short (<640px) viewport instead of clipping its content', () => {
    expect(css).toMatch(
      /@media \(max-height:\s*640px\)\s*\{\s*\.report-dialog\s*\{[^}]*padding:\s*var\(--space-3\)/,
    );
  });
});
