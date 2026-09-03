// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { FsSnapshot } from './snapshot.js';

/** The four verification dimensions the engine gate can run (ENGINE-RESEARCH G5). */
export const GATE_KINDS = ['typecheck', 'test', 'build', 'lint'] as const;
export type GateKind = (typeof GATE_KINDS)[number];

/** Built-in ecosystem ids; the registry is open so any string is a valid id. */
export const KNOWN_ECOSYSTEMS = ['js', 'python', 'go', 'rust'] as const;
export type EcosystemId = string;

/** The no-match sentinel. */
export const UNKNOWN_ECOSYSTEM: EcosystemId = 'unknown';

/**
 * One runnable gate command as an argv array — never a shell string, so there is
 * no injection surface (same discipline as `engine/src/adapters/git.ts`).
 */
export interface GateCommand {
  readonly bin: string;
  readonly args: readonly string[];
  readonly label: string;
}

/** The detected commands for a single ecosystem. Optional keys are ABSENT when
 *  undetected (exactOptionalPropertyTypes: never present-but-undefined). */
export interface GateCommands {
  readonly typecheck?: GateCommand;
  readonly test?: GateCommand;
  readonly build?: GateCommand;
  readonly lint?: GateCommand;
  /** Format check (e.g. prettier --check) — drift here fails full gates too. */
  readonly format?: GateCommand;
  /** Scoped test run limited to files affected by the current diff (e.g. a
   *  `test:impacted` npm script wrapping `vitest run --changed`) — the fast
   *  path for `test` when a firing's gate schedules impacted-only over a full
   *  run (BACKLOG web-msnt26tn-jvyihy "PARALLEL GATE + test-impact"). */
  readonly testImpacted?: GateCommand;
}

/** Mutable builder for the incremental construction of {@link GateCommands}. */
export type MutableGateCommands = { -readonly [K in keyof GateCommands]: GateCommands[K] };

/** The headline output: a GateSpec {typecheck?, test?, build?, lint?, ecosystem}. */
export interface GateSpec extends GateCommands {
  readonly ecosystem: EcosystemId;
}

export const CONFIDENCE_TIERS = ['high', 'medium', 'low'] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

/** What a detector returns when it recognises a repo (null when it does not). */
export interface EcosystemDetection {
  readonly gate: GateCommands;
  readonly score: number;
  readonly evidence: readonly string[];
}

/** One resolved candidate in the final detection. */
export interface GateCandidate {
  readonly spec: GateSpec;
  readonly score: number;
  readonly tier: ConfidenceTier;
  readonly evidence: readonly string[];
}

export const AMBIGUITIES = ['single', 'multi', 'none'] as const;
export type Ambiguity = (typeof AMBIGUITIES)[number];

/** The full result: `spec` is the primary (drives the engine GatePort);
 *  `candidates` exposes every ecosystem for the multi-stack / approval path. */
export interface GateDetection {
  readonly spec: GateSpec;
  readonly candidates: readonly GateCandidate[];
  readonly ambiguity: Ambiguity;
}

/** A registry entry. Pure: consumes only the snapshot, never node:fs. */
export interface EcosystemDetector {
  readonly id: EcosystemId;
  detect(snap: FsSnapshot): EcosystemDetection | null;
}
