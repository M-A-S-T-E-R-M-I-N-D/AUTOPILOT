// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `demo-scene.mjs`, so
 * `apps/dashboard/test/tooling/demo-scene.test.ts` typechecks — the same
 * sibling-`.d.mts` pattern `record-demo-frames.d.mts` and
 * `scripts/docs/check-links.d.mts` use. Only the payloads a unit test can
 * read without a browser are declared; `open()`/`settle()` take Playwright
 * objects and stay out of every test import graph.
 */

export const BASE: string;
export const NOW: number;
export const MINUTE: number;
export const FOLDER: string;
export const FLYING_PROJECT_ID: string;
export const STILL_VIEWPORT: { readonly width: number; readonly height: number };
export const RETURNING_OPERATOR: Readonly<Record<string, string>>;

export interface StagedFlight {
  readonly running: boolean;
  readonly folder: string | null;
  readonly firings: number | null;
  readonly totalBudgetUsd: number | null;
  readonly startedAt: number | null;
  readonly pid: number | null;
  readonly paused: boolean;
  readonly queued: boolean;
  readonly maxTurnsPerFiring: number;
  readonly flights: readonly Record<string, unknown>[];
}

export interface StagedFiring {
  readonly id: string;
  readonly item: string;
  readonly kind: string;
  readonly sha: string;
  readonly shipped: boolean;
  readonly gateResult: string;
  readonly cost: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly turns: number;
  readonly commitSubject: string;
  readonly completion: string;
  readonly failedCheck: string | null;
  readonly died: string | null;
  readonly at: number;
  readonly durationMs: number;
}

export const idleFlight: StagedFlight;
export const runningFlight: StagedFlight & { readonly startedAt: number; readonly firings: number };
export const shippedFiring: StagedFiring;
export const luckyRoll: Readonly<Record<string, unknown>>;
