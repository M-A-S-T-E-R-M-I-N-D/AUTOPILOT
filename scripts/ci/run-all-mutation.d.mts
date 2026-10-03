// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface DiscoveredMutationConfig {
  readonly file: string;
  readonly mutate: readonly string[];
  /** The repo-relative JSON report the config writes; null when it declares none. */
  readonly report: string | null;
}

export declare function discoverConfigs(dir?: string): DiscoveredMutationConfig[];
export declare function parseDiffRef(argv: readonly string[]): string | null;
export declare function selectConfigFiles(
  configs: readonly DiscoveredMutationConfig[],
  diffRef: string | null,
  touchedFiles: readonly string[],
): string[];

/** `--shard <i>/<n>` (1-based); null when absent; throws on a malformed value. */
export interface MutationShard {
  readonly index: number;
  readonly total: number;
}
export declare function parseShard(argv: readonly string[]): MutationShard | null;
export declare function shardConfigFiles(
  files: readonly string[],
  shard: MutationShard | null,
): readonly string[];

/** Whether a finished `stryker run` scored: its JSON report is on disk
 *  (always true for a config that declares none). */
export declare function wasScored(report: string | null, root?: string): boolean;

/** A `stryker run` that ended badly, told apart by HOW it ended: a signal
 *  (the process was killed, no score exists) reads differently from exit 1
 *  (a mutant survived), and an exit 1 that never `scored` (default true)
 *  reads as a config or setup error. */
export declare function mutationFailureReason(error: unknown, scored?: boolean): string;

export interface MutationFailure {
  readonly file: string;
  readonly reason: string;
}
export declare function formatFailureSummary(
  total: number,
  failures: readonly MutationFailure[],
): string[];
