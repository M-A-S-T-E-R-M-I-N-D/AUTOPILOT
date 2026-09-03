// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, panel-composition slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `renderPipelinePanel` is "the eventual pipeline panel" every prior
 * slice's header pointed at: it runs the whole pure chain (`layoutGraph` → `buildPipelineTree`
 * + `layoutCanvas` → `resolveSelection` → both renderers) and wraps the tree sidebar and SVG
 * canvas in ONE labelled `<section>` region, or the panel's own empty-state copy when the graph
 * has no nodes — the gate both renderers delegate to their caller by returning `''`.
 *
 * This slice PICKS the wiring path the renderer headers left open: real runtime imports, which
 * serve BOTH paths. Server-rendered wiring imports this module directly; the `.toString()`
 * splice path also survives, because tsc compiles imported-binding call sites to bare names
 * (`renderPipelineSvg(...)`), which resolve as long as `shell.ts` splices the callees' sources
 * into the same `/app.js` scope under their own names — the exact multi-function pattern its
 * `shared*` splices already use.
 *
 * The sidebar ALWAYS gets a layered layout regardless of `options.layout`: `buildPipelineTree`
 * assigns one lane per `traceId` and documents the dense, layered-mode trust boundary
 * `renderPipelineTreeHtml` restates — a compact layout merges continuation-connected traces
 * into one lane index, which would collapse tree groups that must stay distinct for the
 * `role="group"`-per-trace ARIA contract. `options.layout` is therefore a CANVAS visual mode
 * only; the section's `data-layout` hook exposes it to the token-owning CSS slice alongside
 * the `data-*` vocabulary both renderers already emit.
 *
 * `PIPELINE_PANEL_CELL` owns the default canvas geometry — viewBox units the CSS slice scales,
 * not style values, so the epic's "no non-token values" constraint stays intact. `graph` must
 * come from `spansToGraph` — the same trust boundary every module in this cluster draws.
 *
 * The section's own `aria-label` is now tagged `data-i18n-aria="pipelineView"` (i18n foundation,
 * board web-msnsndki-dz3vn1) — `scripts/i18n/find-untagged-strings.mjs` flagged it since this
 * markup is server-rendered HTML, unlike `features/pipeline.ts`'s `pipelineJs()` client control
 * surface (switch labels, loading/empty copy), which is plain JS `el()` calls the tag scanner
 * cannot see and stays untranslated for now — a separate follow-up slice, same as the "Contribute
 * upstream" form `project-page-i18n.test.ts`'s header describes.
 */

import type { SpanGraph, SpanGraphLens } from '../read/pipeline-graph.js';
import type { GraphLayoutMode } from '../read/pipeline-layout.js';
import type { CanvasCellSize } from '../read/pipeline-canvas.js';
import { layoutGraph } from '../read/pipeline-layout.js';
import { layoutCanvas } from '../read/pipeline-canvas.js';
import { buildPipelineTree } from '../read/pipeline-tree.js';
import { resolveSelection } from '../read/pipeline-selection.js';
import { renderPipelineSvg } from './pipeline-svg.js';
import { renderPipelineTreeHtml } from './pipeline-tree-html.js';

/** Default canvas cell geometry, in viewBox units — the CSS slice scales the rendered SVG. */
export const PIPELINE_PANEL_CELL: CanvasCellSize = {
  width: 120,
  height: 40,
  columnGap: 20,
  rowGap: 10,
};

/**
 * Builds the panel's fetch URL for one project — shared with the client via a
 * `.toString()` splice (`web/features/pipeline.ts`), so the endpoint path can
 * never drift between the server route and the panel that calls it. Compiled
 * body stays ES5-clean (string concat, no arrows) for the client bundle.
 */
export function pipelineApiUrl(projectId: string): string {
  return '/api/pipeline?project=' + encodeURIComponent(projectId);
}

export interface PipelinePanelOptions {
  /** Canvas visual mode only — the tree sidebar is always layered (see module header). */
  readonly layout?: GraphLayoutMode;
  readonly selectedId?: string | null;
  readonly cell?: CanvasCellSize;
  /**
   * Which lens produced `graph` — copy-only. An empty FILE-lens graph does not
   * mean no spans exist: traces recorded before the engine's `autopilot.files`
   * attribute (and non-gate-passed firings) honestly sit outside that lens, so
   * the fleet copy "no pipeline spans recorded" would be false there.
   */
  readonly lens?: SpanGraphLens;
}

/** Empty-state copy per lens — static strings, nothing store-derived rides them. */
const PIPELINE_EMPTY_COPY: Record<SpanGraphLens, string> = {
  fleet: 'No pipeline spans recorded for this project yet.',
  file:
    'No file activity recorded for this project yet — the Files lens shows only ' +
    'files captured from gate-passed firings.',
};

/**
 * Composes the full pipeline panel markup from `graph` (`spansToGraph`'s output): a labelled
 * `<section>` wrapping the ARIA tree sidebar and the SVG canvas, or empty-state copy when the
 * graph has no nodes.
 */
export function renderPipelinePanel(graph: SpanGraph, options: PipelinePanelOptions = {}): string {
  const layoutMode = options.layout ?? 'layered';
  const open = `<section class="pipeline-panel" aria-label="Pipeline view" data-i18n-aria="pipelineView" data-layout="${layoutMode}">`;
  if (graph.nodes.length === 0) {
    return `${open}<p class="pipeline-empty">${PIPELINE_EMPTY_COPY[options.lens ?? 'fleet']}</p></section>`;
  }

  const selection = resolveSelection(graph, options.selectedId ?? null);
  const treeLayout = layoutGraph(graph);
  const canvasLayout =
    layoutMode === 'layered' ? treeLayout : layoutGraph(graph, { mode: layoutMode });
  const cell = options.cell ?? PIPELINE_PANEL_CELL;

  const sidebar = renderPipelineTreeHtml(buildPipelineTree(graph, treeLayout), selection);
  const canvas = renderPipelineSvg(graph, layoutCanvas(graph, canvasLayout, cell), selection);
  return `${open}${sidebar}${canvas}</section>`;
}
