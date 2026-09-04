// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view kickoff (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `spansToGraph` is the pure node-graph projection
 * the eventual tree sidebar/canvases will render; this slice ships the model
 * + a golden-file test only, no UI, per the epic's own phase order (D4 sits
 * behind D1-D3 in "EXECUTE").
 *
 * The epic states the graph "builds on the existing exporter" with "no new
 * schema" (`packages/engine/src/otlp.ts`'s `OtlpSpan`/`toOtlpResourceSpans`).
 * That exporter emits exactly one span per firing/trace today — no
 * `parentSpanId`, no lane/file attributes — so the ONLY relational signal
 * that genuinely exists in the current span shape is trace membership
 * (`traceId`) plus wall-clock order (`startTimeUnixNano`). Everything below
 * is built on that real signal alone:
 *
 * - `lens: 'fleet'` groups spans by `traceId` and chains same-trace spans in
 *   start-time order — a multi-span trace today would come from a future
 *   engine change (e.g. per-firing sub-spans), so against TODAY's exporter
 *   every trace has exactly one span and every chain is a single node with
 *   no edges. That is the correct, honest output for the current data, not
 *   a bug — this function is projecting the model for when richer traces
 *   land, not inventing data that isn't there.
 * - `lens: 'file'` groups by the `autopilot.files` span attribute the
 *   exporter now emits (newline-joined repo-relative paths, from
 *   `FiringRecord.filesTouched` — `packages/engine/src/otlp.ts`, the epic's
 *   "span-attribute task in the engine"). Spans WITHOUT the attribute are
 *   excluded from this lens entirely — the orchestrator populates
 *   `filesTouched` for gate-PASSED firings only (the net headBefore→headAfter
 *   diff, `packages/engine/src/firing.ts`), so pre-existing spans and
 *   non-shipped firings honestly stay outside the lens.
 *   `mode: 'grouped'` folds spans into one node per file (worst status,
 *   touch count) and draws a co-touch edge between files the same span
 *   changed together — the file-collision signal a fleet operator needs.
 *   `mode: 'flat'` keeps one node per file-carrying span and chains
 *   consecutive touches of the same file across spans — "this firing next
 *   modified a file that firing touched".
 *
 * `mode: 'flat'` is the acceptance criteria's "span projection" — one node
 * per span. `mode: 'grouped'` collapses each trace to a single node (count +
 * worst status), which is what a fleet-level overview needs once traces
 * carry more than one span, and chains traces that worked the same board
 * item with continuation edges: `autopilot.item` is emitted per firing by
 * the exporter's `buildAttributes` already, so "this firing resumed that
 * one's task" is the ONE inter-firing signal genuinely on the wire today.
 * Richer cross-trace signals (files touched, lanes) remain engine
 * span-attribute tasks per the epic's reconciliation table.
 */

import type { OtlpSpan } from '@autopilot/engine';

export type SpanGraphLens = 'fleet' | 'file';
export type SpanGraphMode = 'flat' | 'grouped';

export interface SpanGraphOptions {
  readonly lens: SpanGraphLens;
  readonly mode: SpanGraphMode;
}

export interface SpanGraphNode {
  /**
   * Always unique across `nodes`: `spanId` in `mode: 'flat'`; in `mode:
   * 'grouped'` the grouping key — `traceId` (fleet lens) or file path (file lens).
   */
  readonly id: string;
  readonly traceId: string;
  readonly label: string;
  /** Spans folded into this node — 1 in `mode: 'flat'`. */
  readonly spanCount: number;
  /** The worst (highest) OTLP status code among the folded spans. */
  readonly status: number;
  /**
   * The `autopilot.firing.number` attribute among the folded spans — ABSENT (not
   * present-but-undefined, matching `GateCommands`'s optional-key convention in
   * `packages/onboarding`) when no span carries it, e.g. pre-telemetry spans. A
   * human-meaningful lane identifier the pipeline tree sidebar uses in place of
   * the raw 32-hex trace id (board web-mtmpf1zc-6yzprb).
   */
  readonly firingOrdinal?: number;
  /** The `autopilot.commit_subject` attribute among the folded spans, paired with
   *  {@link firingOrdinal} as a lane's short label — ABSENT under the same rule. */
  readonly firingSubject?: string;
}

export interface SpanGraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface SpanGraph {
  readonly nodes: readonly SpanGraphNode[];
  readonly edges: readonly SpanGraphEdge[];
}

/** Compares two `startTimeUnixNano` decimal-string fields as magnitudes, not lexically. */
function compareStartTime(a: OtlpSpan, b: OtlpSpan): number {
  const diff = BigInt(a.startTimeUnixNano) - BigInt(b.startTimeUnixNano);
  if (diff !== 0n) return diff < 0n ? -1 : 1;
  return a.spanId < b.spanId ? -1 : a.spanId > b.spanId ? 1 : 0;
}

/** Groups spans by `traceId`, each group sorted by start time (spanId tie-break) for determinism. */
function groupByTrace(spans: readonly OtlpSpan[]): Map<string, OtlpSpan[]> {
  const groups = new Map<string, OtlpSpan[]>();
  for (const span of spans) {
    const group = groups.get(span.traceId);
    if (group) group.push(span);
    else groups.set(span.traceId, [span]);
  }
  for (const group of groups.values()) group.sort(compareStartTime);
  return groups;
}

/** The highest OTLP status code among a trace's spans (`OTLP_STATUS_ERROR` > `_OK` > `_UNSET`). */
function worstStatus(spans: readonly OtlpSpan[]): number {
  return spans.reduce((worst, span) => Math.max(worst, span.status.code), 0);
}

/** Orders trace groups deterministically: earliest first span, then `traceId`. */
function compareTraceGroups(
  a: readonly [string, OtlpSpan[]],
  b: readonly [string, OtlpSpan[]],
): number {
  const byStart = compareStartTime(a[1][0]!, b[1][0]!);
  if (byStart !== 0) return byStart;
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

function flatFleetGraph(spans: readonly OtlpSpan[]): SpanGraph {
  const traceGroups = [...groupByTrace(spans).entries()].sort(compareTraceGroups);
  const nodes: SpanGraphNode[] = [];
  const edges: SpanGraphEdge[] = [];
  for (const [traceId, traceSpans] of traceGroups) {
    for (const span of traceSpans) {
      nodes.push(
        withFiringMeta(
          { id: span.spanId, traceId, label: span.name, spanCount: 1, status: span.status.code },
          [span],
        ),
      );
    }
    for (let i = 0; i < traceSpans.length - 1; i++) {
      edges.push({ from: traceSpans[i]!.spanId, to: traceSpans[i + 1]!.spanId });
    }
  }
  return { nodes, edges };
}

/** The `autopilot.item` (board-task id) attribute among a trace's spans, or null when absent. */
function traceItem(spans: readonly OtlpSpan[]): string | null {
  for (const span of spans) {
    for (const kv of span.attributes) {
      if (kv.key === 'autopilot.item' && 'stringValue' in kv.value) return kv.value.stringValue;
    }
  }
  return null;
}

/** The `autopilot.firing.number` attribute among a group of spans, or null when absent. */
function traceFiringOrdinal(spans: readonly OtlpSpan[]): number | null {
  for (const span of spans) {
    for (const kv of span.attributes) {
      if (kv.key === 'autopilot.firing.number' && 'intValue' in kv.value) {
        return Number(kv.value.intValue);
      }
    }
  }
  return null;
}

/** The `autopilot.commit_subject` attribute among a group of spans, or null when absent — the
 *  human-readable one-line summary {@link traceFiringOrdinal} pairs with as a lane's short label. */
function traceCommitSubject(spans: readonly OtlpSpan[]): string | null {
  for (const span of spans) {
    for (const kv of span.attributes) {
      if (kv.key === 'autopilot.commit_subject' && 'stringValue' in kv.value) {
        return kv.value.stringValue;
      }
    }
  }
  return null;
}

/** Folds `firingOrdinal`/`firingSubject` into `base`, ABSENT (never present-but-undefined) when
 *  `spans` carries neither attribute — every `SpanGraphNode` builder below shares this so an
 *  old exact-shape fixture (no attributes) round-trips unchanged. */
function withFiringMeta<T extends object>(
  base: T,
  spans: readonly OtlpSpan[],
): T & Pick<SpanGraphNode, 'firingOrdinal' | 'firingSubject'> {
  const ordinal = traceFiringOrdinal(spans);
  const subject = traceCommitSubject(spans);
  return {
    ...base,
    ...(ordinal !== null ? { firingOrdinal: ordinal } : {}),
    ...(subject !== null ? { firingSubject: subject } : {}),
  };
}

function groupedFleetGraph(spans: readonly OtlpSpan[]): SpanGraph {
  const traceGroups = [...groupByTrace(spans).entries()].sort(compareTraceGroups);
  const nodes: SpanGraphNode[] = traceGroups.map(([traceId, traceSpans]) => {
    const names = new Set(traceSpans.map((s) => s.name));
    const label = names.size === 1 ? traceSpans[0]!.name : `${traceSpans.length} spans`;
    return withFiringMeta(
      {
        id: traceId,
        traceId,
        label,
        spanCount: traceSpans.length,
        status: worstStatus(traceSpans),
      },
      traceSpans,
    );
  });
  // The one cross-trace signal already on the wire is `autopilot.item` (the board-task id
  // the exporter emits per firing): consecutive traces that worked the same item chain with
  // a continuation edge, in the trace groups' own deterministic order. Traces without the
  // attribute stay unlinked — no other inter-lane signal exists yet.
  const edges: SpanGraphEdge[] = [];
  const lastTraceByItem = new Map<string, string>();
  for (const [traceId, traceSpans] of traceGroups) {
    const item = traceItem(traceSpans);
    if (item === null) continue;
    const prev = lastTraceByItem.get(item);
    if (prev !== undefined) edges.push({ from: prev, to: traceId });
    lastTraceByItem.set(item, traceId);
  }
  return { nodes, edges };
}

/**
 * The `autopilot.files` attribute split back into repo-relative paths — the exact inverse of
 * the exporter's newline join (`packages/engine/src/otlp.ts`'s `filesValue`). Empty when the
 * attribute is absent; deduped and blank-line-filtered so a pathological value can't yield
 * self-edges or phantom nodes.
 */
function spanFiles(span: OtlpSpan): readonly string[] {
  for (const kv of span.attributes) {
    if (kv.key === 'autopilot.files' && 'stringValue' in kv.value) {
      return [...new Set(kv.value.stringValue.split('\n').filter((path) => path.length > 0))];
    }
  }
  return [];
}

/** File-carrying spans with their parsed paths, in deterministic time (spanId tie-break) order. */
function fileCarryingSpans(
  spans: readonly OtlpSpan[],
): readonly { readonly span: OtlpSpan; readonly files: readonly string[] }[] {
  return spans
    .map((span) => ({ span, files: spanFiles(span) }))
    .filter((entry) => entry.files.length > 0)
    .sort((a, b) => compareStartTime(a.span, b.span));
}

/**
 * One node per distinct file (worst status, touch count), plus a deduped co-touch edge between
 * every pair of files the same span changed together — the file-collision signal. Edge `from`
 * is always the earlier node in graph order, so shuffled input yields the identical graph.
 */
function groupedFileGraph(spans: readonly OtlpSpan[]): SpanGraph {
  const entries = fileCarryingSpans(spans);
  const touches = new Map<string, OtlpSpan[]>();
  for (const { span, files } of entries) {
    for (const path of files) {
      const touching = touches.get(path);
      if (touching) touching.push(span);
      else touches.set(path, [span]);
    }
  }
  const ordered = [...touches.entries()].sort((a, b) => {
    const byFirstTouch = compareStartTime(a[1][0]!, b[1][0]!);
    if (byFirstTouch !== 0) return byFirstTouch;
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  const rank = new Map(ordered.map(([path], index) => [path, index]));
  const nodes: SpanGraphNode[] = ordered.map(([path, touching]) =>
    withFiringMeta(
      {
        id: path,
        traceId: touching[0]!.traceId,
        label: path,
        spanCount: touching.length,
        status: worstStatus(touching),
      },
      touching,
    ),
  );
  const edges: SpanGraphEdge[] = [];
  const seen = new Set<string>();
  for (const { files } of entries) {
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const [from, to] =
          rank.get(files[i]!)! < rank.get(files[j]!)!
            ? [files[i]!, files[j]!]
            : [files[j]!, files[i]!];
        const key = `${from}\n${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from, to });
      }
    }
  }
  return { nodes, edges };
}

/**
 * One node per file-carrying span (spans without `autopilot.files` are outside this lens), with
 * a deduped edge chaining consecutive touches of the same file — "this firing next modified a
 * file that firing touched", the cross-firing collision trail. Mirrors the grouped fleet lens's
 * `lastTraceByItem` chaining, keyed by file instead of board item.
 */
function flatFileGraph(spans: readonly OtlpSpan[]): SpanGraph {
  const entries = fileCarryingSpans(spans);
  const nodes: SpanGraphNode[] = entries.map(({ span }) =>
    withFiringMeta(
      {
        id: span.spanId,
        traceId: span.traceId,
        label: span.name,
        spanCount: 1,
        status: span.status.code,
      },
      [span],
    ),
  );
  const edges: SpanGraphEdge[] = [];
  const seen = new Set<string>();
  const lastSpanByFile = new Map<string, string>();
  for (const { span, files } of entries) {
    for (const path of files) {
      const prev = lastSpanByFile.get(path);
      if (prev !== undefined && prev !== span.spanId) {
        const key = `${prev}\n${span.spanId}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ from: prev, to: span.spanId });
        }
      }
      lastSpanByFile.set(path, span.spanId);
    }
  }
  return { nodes, edges };
}

/**
 * Projects real OTLP spans into the node-graph model the pipeline view will render. Pure and
 * side-effect-free — no rendering, no layout, no DOM.
 */
export function spansToGraph(spans: readonly OtlpSpan[], options: SpanGraphOptions): SpanGraph {
  if (options.lens === 'file') {
    return options.mode === 'flat' ? flatFileGraph(spans) : groupedFileGraph(spans);
  }
  return options.mode === 'flat' ? flatFleetGraph(spans) : groupedFleetGraph(spans);
}
