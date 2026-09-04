// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, tree-sidebar markup slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `renderPipelineTreeHtml` turns `buildPipelineTree`'s lane → item
 * hierarchy and the shared `resolveSelection` state into the sidebar markup string the eventual
 * pipeline panel will insert: the interaction-owning twin of `renderPipelineSvg`'s `role="img"`
 * canvas, per that file's own split (canvas = visual projection, sidebar = keyboard + per-item
 * ARIA). Client-only, so it lives in `web/` (the `sparkline.ts` pattern), and deliberately ONE
 * self-contained exported function with inner helpers and type-only imports so it survives
 * `shell.ts`'s `.toString()` splice — the same constraint `pipeline-svg.ts` documents.
 *
 * ARIA mapping: ONE `role="tree"` wraps the sidebar; each lane is a `role="group"` child
 * (`group` is a permitted child of `tree`) rather than a parent `treeitem`, because lanes are
 * structure, not selection targets — `resolveSelection`/`moveTreeSelection` model node ids
 * only, and a `treeitem` that never takes focus would break the roving-tabindex contract.
 * Items are the `role="treeitem"`s, each with explicit `aria-selected`; the selected item (or
 * the first item when nothing is selected — `moveTreeSelection`'s own "start somewhere sane"
 * rule for a fresh Tab) is the single `tabindex="0"` stop, everything else `-1`, per the
 * WAI-ARIA tree pattern. Accessible names extend the visible label (`label — N spans, status`,
 * the exact string shape the canvas puts in `<title>`) so SC 2.5.3 label-in-name holds, and
 * status reaches screen readers as text, not colour alone.
 *
 * No style values appear here — only class and `data-*` hooks (`data-status`,
 * `data-connected`, `data-trace-id`, `data-node-id`, mirroring the canvas's hooks so the
 * token-owning CSS slice styles both views with one vocabulary). An empty `lanes` renders as
 * an empty string so the caller gates to its own empty-state copy, and `lanes`/`selection`
 * must come from the same `spansToGraph` chain (a dense, layered-mode tree) — the trust
 * boundary every module in this cluster draws.
 *
 * The visible lane label (board web-mtmpf1zc-6yzprb) prefers `Firing #<ordinal>` — optionally
 * followed by a truncated `autopilot.commit_subject` — over the raw 32-hex trace id, reading
 * off the lane's first item (every item in a lane shares one trace, so one firing) via
 * `TreeItem.firingOrdinal`/`firingSubject`. Falls back to an 8-char trace-id prefix when
 * neither attribute is on the wire (pre-telemetry spans) — still short, never the raw 32 hex
 * chars. `data-trace-id` keeps carrying the FULL trace id regardless, since that hook is a
 * programmatic lookup key, not the human-facing label.
 */

import type { TreeLane } from '../read/pipeline-tree.js';
import type { SelectionState } from '../read/pipeline-selection.js';

/**
 * Renders `lanes` (`buildPipelineTree`'s output) as the ARIA tree sidebar markup, flagged from
 * `selection`. Status literals mirror `OTLP_STATUS_ERROR`(2)/`_OK`(1)/`_UNSET`(0) from
 * `packages/engine/src/otlp.ts` — kept inline so the function stays `.toString()`-splice-safe,
 * the same raw-code trust `pipeline-svg.ts` takes.
 */
export function renderPipelineTreeHtml(
  lanes: readonly TreeLane[],
  selection: SelectionState,
): string {
  if (lanes.length === 0) return '';
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
  const truncate = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;
  const SHORT_TRACE_ID_LENGTH = 8;
  const SHORT_SUBJECT_LENGTH = 48;
  const laneShortLabel = (lane: TreeLane): string => {
    const ordinal = lane.items[0]?.firingOrdinal;
    if (ordinal === undefined) return lane.traceId.slice(0, SHORT_TRACE_ID_LENGTH);
    const subject = lane.items[0]?.firingSubject;
    return subject ? `#${ordinal} — ${truncate(subject, SHORT_SUBJECT_LENGTH)}` : `#${ordinal}`;
  };

  const focusId = selection.selectedId ?? lanes[0]!.items[0]!.id;

  const laneMarkup = lanes
    .map((lane) => {
      const itemMarkup = lane.items
        .map((item) => {
          const status = statusName(item.status);
          const name = `${item.label} — ${plural(item.spanCount, 'span')}, ${status}`;
          return (
            `<div class="pipeline-item" role="treeitem" aria-selected="${item.id === selection.selectedId}"` +
            ` tabindex="${item.id === focusId ? 0 : -1}" aria-label="${esc(name)}"` +
            ` data-node-id="${esc(item.id)}" data-status="${status}"` +
            `${flag('connected', selection.connectedIds.has(item.id))}>${esc(item.label)}</div>`
          );
        })
        .join('');
      const shortLabel = laneShortLabel(lane);
      const laneName = `Lane ${shortLabel} — ${plural(lane.items.length, 'node')}`;
      return (
        `<div class="pipeline-lane" role="group" aria-label="${esc(laneName)}"` +
        ` data-trace-id="${esc(lane.traceId)}">` +
        `<span class="pipeline-lane-label" aria-hidden="true">${esc(shortLabel)}</span>` +
        `${itemMarkup}</div>`
      );
    })
    .join('');

  const total = lanes.reduce((sum, lane) => sum + lane.items.length, 0);
  const label = `Pipeline lanes: ${plural(lanes.length, 'lane')}, ${plural(total, 'node')}`;
  // Concatenation, not one bare template-literal return: a single top-level template return is
  // exactly the assembler shape `discoverFeatureModules` flags, and shell.ts must stay src/web's
  // sole discovered module (the splice-manifest regression guard) — same shape as
  // `renderPipelineSvg`'s final return.
  return (
    `<div class="pipeline-tree" role="tree" aria-label="${esc(label)}">` + `${laneMarkup}</div>`
  );
}
