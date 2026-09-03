// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, SVG-markup slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `renderPipelineSvg` turns the pure geometry `layoutCanvas` computes
 * (pixel rects + edge paths) and the shared `resolveSelection` state into the SVG markup string
 * the eventual pipeline panel will insert. Client-only (no server counterpart, unlike
 * `shared/*.ts`), so it lives in `web/` rather than `read/`, following the pattern
 * `sparkline.ts`/`gauge.ts` proved.
 *
 * Deliberately ONE self-contained exported function with inner helpers and type-only imports:
 * `web/shell.ts` embeds client-side modules into the generated `/app.js` text via `.toString()`
 * (see `sparkline.ts`'s header), and a runtime import or module-level helper would not survive
 * that extraction — self-containment keeps this renderer valid for either wiring path the panel
 * slice picks (server-rendered via real import, or client-spliced).
 *
 * The `<svg>` is `role="img"` with a summary `aria-label`: keyboard interaction and per-item
 * ARIA semantics belong to the tree sidebar (`role="tree"` per the epic; `moveTreeSelection`
 * already models its arrow keys), so the canvas is the VISUAL projection of the same shared
 * selection — one labelled image, per-node `<title>` hover tips, and `data-*` attributes
 * (`data-status`, `data-selected`, `data-connected`) as the styling/hit-test hooks. No style
 * values appear here at all — colors and strokes are the token-owning CSS slice's job, per the
 * epic's "no non-token values" constraint.
 *
 * An empty canvas renders as an empty string so the caller can gate to its own empty-state copy
 * instead of showing a 0×0 image — `gaugeSegments`' "return the aggregate, let the caller gate"
 * shape. `graph` and `canvas` must come from the same `spansToGraph` → `layoutCanvas` chain
 * (every canvas rect id has a matching graph node) — the same trust boundary
 * `pipeline-tree.ts` draws against its inputs.
 */

import type { SpanGraph } from '../read/pipeline-graph.js';
import type { CanvasLayout } from '../read/pipeline-canvas.js';
import type { SelectionState } from '../read/pipeline-selection.js';

/**
 * Renders `canvas`'s geometry as SVG markup, labelled from `graph`'s nodes and flagged from
 * `selection`. Status literals mirror `OTLP_STATUS_ERROR`(2)/`_OK`(1)/`_UNSET`(0) from
 * `packages/engine/src/otlp.ts` — kept inline so the function stays `.toString()`-splice-safe,
 * the same raw-code trust `pipeline-graph.ts`'s `worstStatus` takes.
 */
export function renderPipelineSvg(
  graph: SpanGraph,
  canvas: CanvasLayout,
  selection: SelectionState,
): string {
  if (canvas.nodes.length === 0) return '';
  const esc = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const statusName = (code: number): string => (code >= 2 ? 'error' : code === 1 ? 'ok' : 'unset');
  const flag = (name: string, on: boolean): string => (on ? ` data-${name}="true"` : '');
  const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  const edgeMarkup = canvas.edges
    .map((edge) => {
      const touchesSelection =
        edge.from === selection.selectedId || edge.to === selection.selectedId;
      const points = edge.points.map((p) => `${p.x},${p.y}`).join(' ');
      return `<polyline class="pipeline-edge" data-edge-from="${esc(edge.from)}" data-edge-to="${esc(edge.to)}"${flag('connected', touchesSelection)} points="${points}"/>`;
    })
    .join('');

  const nodeMarkup = canvas.nodes
    .map((rect) => {
      const node = nodeById.get(rect.id)!;
      const status = statusName(node.status);
      const title = `${node.label} — ${plural(node.spanCount, 'span')}, ${status}`;
      return (
        `<g class="pipeline-node" data-node-id="${esc(node.id)}" data-status="${status}"` +
        `${flag('selected', node.id === selection.selectedId)}` +
        `${flag('connected', selection.connectedIds.has(node.id))}>` +
        `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"/>` +
        `<title>${esc(title)}</title>` +
        `<text x="${rect.x + rect.width / 2}" y="${rect.y + rect.height / 2}">${esc(node.label)}</text></g>`
      );
    })
    .join('');

  const label = `Pipeline graph: ${plural(canvas.nodes.length, 'node')}, ${plural(canvas.edges.length, 'link')}`;
  return (
    `<svg class="pipeline-canvas" role="img" viewBox="0 0 ${canvas.width} ${canvas.height}" aria-label="${esc(label)}">` +
    `<g class="pipeline-edges">${edgeMarkup}</g><g class="pipeline-nodes">${nodeMarkup}</g></svg>`
  );
}
