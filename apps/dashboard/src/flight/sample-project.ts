// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ONBOARDING'S FIRST MICRO-TASK (epic 0032): one click that gives a new
 * operator a real project to fly, instead of asking them to find a folder
 * before they know what a flight is.
 *
 * It copies a bundled sample OUT of this repository into the operator's own
 * space and makes it a repository of its own. Copying is not a detail: the
 * samples live inside AUTOPILOT's git tree, and locking onto a path inside
 * another repository would back up and fly the wrong thing — the calculator
 * story had to copy by hand for exactly this reason
 * (`docs/CASE-STUDIES/calculator-five-firings.md`).
 *
 * Pure planning here (what to copy, where to, what to refuse); the caller
 * performs the copy, the `git init` and the store registration, so this stays
 * testable without a filesystem or a git binary.
 */

import { join } from 'node:path';

/** The samples a new operator may add in one click, in offer order. */
export const ONBOARDING_SAMPLES = ['calculator', 'calculator-materials'] as const;
export type OnboardingSample = (typeof ONBOARDING_SAMPLES)[number];

/** Where copies land: one folder per sample under the operator's home. */
export const SAMPLE_PARENT_DIR = 'AUTOPILOT-samples';

export function isOnboardingSample(value: unknown): value is OnboardingSample {
  return typeof value === 'string' && (ONBOARDING_SAMPLES as readonly string[]).includes(value);
}

/** A refusal carries the reason the operator will read, never a stack. */
export interface SamplePlanRefused {
  readonly ok: false;
  readonly reason: 'unknown-sample' | 'source-missing' | 'already-there';
  readonly details: string;
  /** Set for `already-there`: the copy that already exists, ready to fly. */
  readonly target?: string;
}

export interface SamplePlanReady {
  readonly ok: true;
  readonly sample: OnboardingSample;
  /** Absolute path of the bundled sample inside this repository. */
  readonly source: string;
  /** Absolute path the copy will live at, outside this repository. */
  readonly target: string;
  /** The first commit's subject — the operator sees it in their own log. */
  readonly commitSubject: string;
}

export type SamplePlan = SamplePlanReady | SamplePlanRefused;

/**
 * Plans the copy. `exists` answers for any absolute path, so a caller can
 * pass the real filesystem and a test can pass a set.
 */
export function planSampleProject(
  sample: string,
  engineRepo: string,
  home: string,
  exists: (path: string) => boolean,
): SamplePlan {
  if (!isOnboardingSample(sample)) {
    return {
      ok: false,
      reason: 'unknown-sample',
      details: `"${sample}" is not one of the bundled samples (${ONBOARDING_SAMPLES.join(', ')})`,
    };
  }
  const source = join(engineRepo, 'samples', sample);
  if (!exists(source)) {
    return {
      ok: false,
      reason: 'source-missing',
      details: `the bundled sample is not in this checkout (${source})`,
    };
  }
  const target = join(home, SAMPLE_PARENT_DIR, sample);
  if (exists(target)) {
    return {
      ok: false,
      reason: 'already-there',
      details: `a copy is already at ${target} — it is ready to fly`,
      target,
    };
  }
  return {
    ok: true,
    sample,
    source,
    target,
    commitSubject: `chore: the ${sample} sample, copied from AUTOPILOT to fly`,
  };
}
