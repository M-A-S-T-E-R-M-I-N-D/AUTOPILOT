// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  toOtlpResourceSpans,
  OTLP_STATUS_OK,
  OTLP_STATUS_ERROR,
  OTLP_STATUS_UNSET,
  type OtlpSpan,
  type FiringRecord,
} from '@autopilot/engine';
import { spansToGraph } from '../../src/read/pipeline-graph.js';

const BASE_RECORD: FiringRecord = {
  ts: '2026-07-07T00:00:00.000Z',
  firing: 1,
  promptVersion: 'firing-v8.1',
  model: 'opus',
  retro: false,
  attempts: 1,
  quotaFallback: false,
  startedOn: 'primary',
  quotaStreak: 0,
  globalExhaust: false,
  exitCode: 0,
  isError: false,
  stopReason: 'end_turn',
  maxTurnsHit: false,
  numTurns: 12,
  durationMs: 4000,
  costUsd: 6.5,
  realCostUsd: null,
  tokensIn: 100,
  tokensOut: 200,
  cacheRead: 5000,
  cacheCreate: 50,
  iterMetrics: 'ok',
  item: 'AP-1',
  outcome: 'shipped',
  shipped: true,
  completion: 'complete',
  completionMissing: false,
  gateResult: 'passed',
  gateChecks: [{ label: 'typecheck', pass: true, durationMs: 10 }],
  guardDenials: 0,
  guardDenialDetails: [],
  resumed: null,
  sha: 'abc123',
  shaVerified: true,
  headAdvanced: true,
  headBefore: 'h0',
  headAfter: 'h1',
  testsBefore: 10,
  testsAfter: 13,
  testsDelta: 3,
  verifierUsed: null,
  kind: 'feat',
  area: null,
  deferredTo: null,
  testFirst: null,
  pickedRank: null,
  deviationReason: null,
  commitSubject: 'feat(engine): OTLP export for firing records',
};

/** Real, engine-shaped single-span traces — one per firing, as `toOtlpResourceSpans` produces today. */
function firingSpan(firing: number, sha: string): OtlpSpan {
  return toOtlpResourceSpans({ ...BASE_RECORD, firing, sha }).resourceSpans[0]!.scopeSpans[0]!
    .spans[0]!;
}

/** Hand-built span for the synthetic multi-span-per-trace cases the real exporter can't produce yet. */
function span(
  over: Partial<OtlpSpan> & { readonly traceId: string; readonly spanId: string },
): OtlpSpan {
  return {
    name: 'autopilot.firing',
    kind: 1,
    startTimeUnixNano: '1000000000',
    endTimeUnixNano: '2000000000',
    attributes: [],
    status: { code: OTLP_STATUS_OK },
    ...over,
  };
}

describe('spansToGraph', () => {
  it('returns an empty graph for no spans, in every lens/mode combination', () => {
    expect(spansToGraph([], { lens: 'fleet', mode: 'flat' })).toEqual({ nodes: [], edges: [] });
    expect(spansToGraph([], { lens: 'fleet', mode: 'grouped' })).toEqual({ nodes: [], edges: [] });
    expect(spansToGraph([], { lens: 'file', mode: 'flat' })).toEqual({ nodes: [], edges: [] });
  });

  describe("lens: 'file' — grouping over the `autopilot.files` wire attribute", () => {
    /** An `autopilot.files` attribute exactly as the engine's `filesValue` emits it. */
    function filesAttr(...paths: string[]) {
      return [{ key: 'autopilot.files', value: { stringValue: paths.join('\n') } }];
    }
    const touchAB = span({
      traceId: 't1',
      spanId: 's1',
      startTimeUnixNano: '1000000000',
      status: { code: OTLP_STATUS_OK },
      attributes: filesAttr('src/a.ts', 'src/b.ts'),
    });
    const touchB = span({
      traceId: 't2',
      spanId: 's2',
      startTimeUnixNano: '2000000000',
      status: { code: OTLP_STATUS_ERROR },
      attributes: filesAttr('src/b.ts'),
    });

    it('yields an empty graph when no span carries the attribute — today’s real wire shape', () => {
      const spans = [firingSpan(1, 'sha-a'), firingSpan(2, 'sha-b')];
      expect(spansToGraph(spans, { lens: 'file', mode: 'flat' })).toEqual({
        nodes: [],
        edges: [],
      });
      expect(spansToGraph(spans, { lens: 'file', mode: 'grouped' })).toEqual({
        nodes: [],
        edges: [],
      });
    });

    it('mode grouped: one node per file (touch count, worst status) plus a co-touch edge', () => {
      const graph = spansToGraph([touchB, touchAB], { lens: 'file', mode: 'grouped' });
      expect(graph).toEqual({
        nodes: [
          // Both files first touched at t=1 by s1 — tie broken by path; b.ts folds
          // both spans and takes the worst (ERROR) status and earliest traceId.
          {
            id: 'src/a.ts',
            traceId: 't1',
            label: 'src/a.ts',
            spanCount: 1,
            status: OTLP_STATUS_OK,
          },
          {
            id: 'src/b.ts',
            traceId: 't1',
            label: 'src/b.ts',
            spanCount: 2,
            status: OTLP_STATUS_ERROR,
          },
        ],
        // s1 changed a.ts and b.ts together — the one real co-touch pair.
        edges: [{ from: 'src/a.ts', to: 'src/b.ts' }],
      });
    });

    it('mode grouped: dedupes the co-touch edge when several spans change the same pair', () => {
      const again = span({
        traceId: 't3',
        spanId: 's3',
        startTimeUnixNano: '3000000000',
        attributes: filesAttr('src/a.ts', 'src/b.ts'),
      });
      const graph = spansToGraph([touchAB, again], { lens: 'file', mode: 'grouped' });
      expect(graph.edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts' }]);
    });

    it('mode flat: one node per file-carrying span, chained where a later span re-touches a file', () => {
      const bare = span({ traceId: 't0', spanId: 's0', startTimeUnixNano: '500000000' });
      const graph = spansToGraph([touchB, bare, touchAB], { lens: 'file', mode: 'flat' });
      expect(graph).toEqual({
        nodes: [
          // s0 carries no autopilot.files — outside this lens entirely.
          {
            id: 's1',
            traceId: 't1',
            label: 'autopilot.firing',
            spanCount: 1,
            status: OTLP_STATUS_OK,
          },
          {
            id: 's2',
            traceId: 't2',
            label: 'autopilot.firing',
            spanCount: 1,
            status: OTLP_STATUS_ERROR,
          },
        ],
        // s2 re-touched src/b.ts after s1 — the cross-firing collision trail.
        edges: [{ from: 's1', to: 's2' }],
      });
    });

    it('mode flat: two spans sharing several files still get a single deduped edge', () => {
      const retouchBoth = span({
        traceId: 't4',
        spanId: 's4',
        startTimeUnixNano: '4000000000',
        attributes: filesAttr('src/a.ts', 'src/b.ts'),
      });
      const graph = spansToGraph([touchAB, retouchBoth], { lens: 'file', mode: 'flat' });
      expect(graph.edges).toEqual([{ from: 's1', to: 's4' }]);
    });

    it('is order-independent: shuffled input produces the identical graph in both modes', () => {
      const grouped = spansToGraph([touchAB, touchB], { lens: 'file', mode: 'grouped' });
      expect(spansToGraph([touchB, touchAB], { lens: 'file', mode: 'grouped' })).toEqual(grouped);
      const flat = spansToGraph([touchAB, touchB], { lens: 'file', mode: 'flat' });
      expect(spansToGraph([touchB, touchAB], { lens: 'file', mode: 'flat' })).toEqual(flat);
    });

    it('round-trips the real exporter: FiringRecord.filesTouched → autopilot.files → file nodes', () => {
      const record: FiringRecord = {
        ...BASE_RECORD,
        filesTouched: ['src/x.ts', 'docs/y.md'],
      };
      const wireSpan = toOtlpResourceSpans(record).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
      const graph = spansToGraph([wireSpan], { lens: 'file', mode: 'grouped' });
      expect(graph.nodes.map((n) => n.id)).toEqual(['docs/y.md', 'src/x.ts']);
      expect(graph.edges).toEqual([{ from: 'docs/y.md', to: 'src/x.ts' }]);
      for (const node of graph.nodes) {
        expect(node.spanCount).toBe(1);
        expect(node.traceId).toBe(wireSpan.traceId);
      }
    });
  });

  describe("lens: 'fleet', mode: 'flat' — real single-span-per-trace exporter output", () => {
    it('projects one node per span with no edges, since every trace has exactly one span today', () => {
      const a = firingSpan(1, 'sha-a');
      const b = firingSpan(2, 'sha-b');
      const graph = spansToGraph([a, b], { lens: 'fleet', mode: 'flat' });
      expect(graph.edges).toEqual([]);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes.map((n) => n.id).sort()).toEqual([a.spanId, b.spanId].sort());
      for (const node of graph.nodes) {
        expect(node.spanCount).toBe(1);
        expect(node.label).toBe('autopilot.firing');
        expect(node.status).toBe(OTLP_STATUS_OK);
      }
    });

    it('carries firingOrdinal/firingSubject from the real wire attributes (board web-mtmpf1zc-6yzprb)', () => {
      const a = firingSpan(52, 'sha-a');
      const graph = spansToGraph([a], { lens: 'fleet', mode: 'flat' });
      expect(graph.nodes[0]!.firingOrdinal).toBe(52);
      expect(graph.nodes[0]!.firingSubject).toBe('feat(engine): OTLP export for firing records');
    });

    it('leaves firingOrdinal/firingSubject ABSENT (not undefined-valued) when no span carries them', () => {
      const bare = span({ traceId: 't1', spanId: 's1' });
      const graph = spansToGraph([bare], { lens: 'fleet', mode: 'flat' });
      expect('firingOrdinal' in graph.nodes[0]!).toBe(false);
      expect('firingSubject' in graph.nodes[0]!).toBe(false);
    });
  });

  describe("lens: 'fleet', mode: 'grouped' — real single-span-per-trace exporter output", () => {
    it('collapses each trace to one node and chains same-item firings with a continuation edge', () => {
      const a = firingSpan(1, 'sha-a');
      const b = firingSpan(2, 'sha-b');
      const graph = spansToGraph([a, b], { lens: 'fleet', mode: 'grouped' });
      // Both firings carry BASE_RECORD's `autopilot.item` ('AP-1') — the real wire signal
      // that one firing continued the other's board task — so the grouped fleet lens
      // chains their trace nodes with a continuation edge, in node (time/traceId) order.
      expect(graph.edges).toEqual([{ from: graph.nodes[0]!.id, to: graph.nodes[1]!.id }]);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes.map((n) => n.id).sort()).toEqual([a.traceId, b.traceId].sort());
      for (const node of graph.nodes) {
        expect(node.traceId).toBe(node.id);
        expect(node.spanCount).toBe(1);
        expect(node.label).toBe('autopilot.firing');
      }
    });

    it('carries firingOrdinal from the trace’s spans in grouped mode too', () => {
      const a = firingSpan(7, 'sha-a');
      const graph = spansToGraph([a], { lens: 'fleet', mode: 'grouped' });
      expect(graph.nodes[0]!.firingOrdinal).toBe(7);
    });
  });

  describe('a synthetic multi-span trace (the future shape once the engine emits sub-spans)', () => {
    // Deliberately out of chronological order and out of spanId order, to prove the graph
    // sorts by wall-clock time (not input order) and tie-breaks on spanId.
    const third = span({
      traceId: 't1',
      spanId: 's3',
      name: 'commit',
      startTimeUnixNano: '3000000000',
      status: { code: OTLP_STATUS_ERROR },
    });
    const first = span({
      traceId: 't1',
      spanId: 's1',
      name: 'plan',
      startTimeUnixNano: '1000000000',
      status: { code: OTLP_STATUS_OK },
    });
    const second = span({
      traceId: 't1',
      spanId: 's2',
      name: 'implement',
      startTimeUnixNano: '2000000000',
      status: { code: OTLP_STATUS_UNSET },
    });
    const spans = [third, first, second];

    it('mode flat: one node per span in time order, chained by consecutive edges', () => {
      const graph = spansToGraph(spans, { lens: 'fleet', mode: 'flat' });
      expect(graph).toEqual({
        nodes: [
          { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: OTLP_STATUS_OK },
          { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: OTLP_STATUS_UNSET },
          { id: 's3', traceId: 't1', label: 'commit', spanCount: 1, status: OTLP_STATUS_ERROR },
        ],
        edges: [
          { from: 's1', to: 's2' },
          { from: 's2', to: 's3' },
        ],
      });
    });

    it('mode grouped: one node for the whole trace, worst status wins, mixed names summarized by count', () => {
      const graph = spansToGraph(spans, { lens: 'fleet', mode: 'grouped' });
      expect(graph).toEqual({
        nodes: [
          { id: 't1', traceId: 't1', label: '3 spans', spanCount: 3, status: OTLP_STATUS_ERROR },
        ],
        edges: [],
      });
    });

    it('is order-independent: shuffled input produces the identical graph', () => {
      const inOrder = spansToGraph(spans, { lens: 'fleet', mode: 'flat' });
      const shuffled = spansToGraph([second, third, first], { lens: 'fleet', mode: 'flat' });
      expect(shuffled).toEqual(inOrder);
    });

    it('uses the shared span name as the grouped label when every span in the trace agrees', () => {
      const uniform = [
        span({ traceId: 't2', spanId: 'u1', name: 'retry', startTimeUnixNano: '1000000000' }),
        span({ traceId: 't2', spanId: 'u2', name: 'retry', startTimeUnixNano: '2000000000' }),
      ];
      const graph = spansToGraph(uniform, { lens: 'fleet', mode: 'grouped' });
      expect(graph.nodes).toEqual([
        { id: 't2', traceId: 't2', label: 'retry', spanCount: 2, status: OTLP_STATUS_OK },
      ]);
    });
  });

  describe('multiple traces mixed together', () => {
    it('sorts nodes by each trace’s earliest start time, independent of lens/mode grouping', () => {
      const later = span({ traceId: 'late', spanId: 'l1', startTimeUnixNano: '9000000000' });
      const earlier = span({ traceId: 'early', spanId: 'e1', startTimeUnixNano: '1000000000' });
      const graph = spansToGraph([later, earlier], { lens: 'fleet', mode: 'grouped' });
      expect(graph.nodes.map((n) => n.id)).toEqual(['early', 'late']);
    });
  });

  describe('cross-trace continuation edges (grouped) — the real `autopilot.item` wire signal', () => {
    /** An `autopilot.item` attribute exactly as the engine's `buildAttributes` emits it. */
    function itemAttr(item: string) {
      return [{ key: 'autopilot.item', value: { stringValue: item } }];
    }
    const fix1 = span({
      traceId: 'tA',
      spanId: 'a1',
      startTimeUnixNano: '1000000000',
      attributes: itemAttr('web-fix'),
    });
    const docs = span({
      traceId: 'tB',
      spanId: 'b1',
      startTimeUnixNano: '2000000000',
      attributes: itemAttr('web-docs'),
    });
    const fix2 = span({
      traceId: 'tC',
      spanId: 'c1',
      startTimeUnixNano: '3000000000',
      attributes: itemAttr('web-fix'),
    });

    it('chains traces that worked the same board item, in time order, skipping unrelated traces between them', () => {
      const graph = spansToGraph([fix1, docs, fix2], { lens: 'fleet', mode: 'grouped' });
      expect(graph.nodes.map((n) => n.id)).toEqual(['tA', 'tB', 'tC']);
      expect(graph.edges).toEqual([{ from: 'tA', to: 'tC' }]);
    });

    it('emits no edges when every trace worked a different item', () => {
      const graph = spansToGraph([fix1, docs], { lens: 'fleet', mode: 'grouped' });
      expect(graph.edges).toEqual([]);
    });

    it('emits no edges for spans that carry no autopilot.item attribute at all', () => {
      const bare = [
        span({ traceId: 't1', spanId: 's1', startTimeUnixNano: '1000000000' }),
        span({ traceId: 't2', spanId: 's2', startTimeUnixNano: '2000000000' }),
      ];
      expect(spansToGraph(bare, { lens: 'fleet', mode: 'grouped' }).edges).toEqual([]);
    });

    it('chains three same-item traces consecutively (A→C→D, never a skip-ahead A→D)', () => {
      const fix3 = span({
        traceId: 'tD',
        spanId: 'd1',
        startTimeUnixNano: '4000000000',
        attributes: itemAttr('web-fix'),
      });
      const graph = spansToGraph([fix2, fix3, fix1], { lens: 'fleet', mode: 'grouped' });
      expect(graph.edges).toEqual([
        { from: 'tA', to: 'tC' },
        { from: 'tC', to: 'tD' },
      ]);
    });

    it("leaves mode 'flat' edge-free across traces — continuation is a grouped/fleet-overview concept", () => {
      const graph = spansToGraph([fix1, fix2], { lens: 'fleet', mode: 'flat' });
      expect(graph.edges).toEqual([]);
    });
  });
});
