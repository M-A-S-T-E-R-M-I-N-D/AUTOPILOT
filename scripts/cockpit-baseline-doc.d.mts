// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/** One cockpit-metrics run's measurements, as `scripts/cockpit-metrics.mjs` gathers them.
 *  Loosely typed: the measuring script owns each axis's exact shape. */
export interface CockpitRunResults {
  axes: readonly Record<string, unknown>[];
  axeAxes: readonly Record<string, unknown>[];
  tabAxes: readonly Record<string, unknown>[];
  attrAxes: readonly Record<string, unknown>[];
  dupAxes: readonly Record<string, unknown>[];
  longestTaskAxes: readonly Record<string, unknown>[];
  cssCensus: Record<string, unknown>;
  specificity: Record<string, unknown>;
  contrast: readonly Record<string, unknown>[];
  alarmIndex: Record<string, readonly string[]>;
  alarmAxes: readonly Record<string, unknown>[];
  i18nAxes: readonly Record<string, unknown>[];
  tokenColorCensus: Record<string, unknown>;
  interactionAxes: readonly Record<string, unknown>[];
}

export interface BaselineBlocks {
  trends: Record<string, string[]>;
  current: Record<string, string>;
}

export declare const BASELINE_DOC: string;
export declare const AXE_IMPACTS: readonly string[];
export declare const NOISY_BLOCKS: ReadonlySet<string>;
export declare function readBlock(text: string, name: string): string | null;
export declare function tableCells(line: string): string[];
export declare function upsertTrendRows(table: string, rows: readonly string[]): string;
export declare function updateBaseline(text: string, fresh: BaselineBlocks): string;
export declare function staleBlocks(text: string, fresh: BaselineBlocks): string[];
export declare function renderBaselineBlocks(
  date: string,
  results: CockpitRunResults,
): BaselineBlocks;
