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
    expect(css).toContain('inset-inline-start: -9999px;');
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
