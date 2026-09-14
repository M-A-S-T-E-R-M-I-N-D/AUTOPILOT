// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ONBOARDING'S FIRST MICRO-TASK (epic 0032): the plan behind "add the
 * sample" — what is copied, where to, and every refusal that has to read as a
 * sentence rather than a stack.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  ONBOARDING_SAMPLES,
  SAMPLE_PARENT_DIR,
  isOnboardingSample,
  planSampleProject,
} from '../../src/flight/sample-project.js';

const ENGINE = join('/repos', 'AUTOPILOT');
const HOME = join('/home', 'pilot');
const present = (...paths: readonly string[]) => {
  const set = new Set(paths);
  return (p: string): boolean => set.has(p);
};

describe('planSampleProject', () => {
  it('offers only the bundled samples', () => {
    expect(ONBOARDING_SAMPLES).toEqual(['calculator', 'calculator-materials']);
    for (const s of ONBOARDING_SAMPLES) expect(isOnboardingSample(s)).toBe(true);
    for (const bad of ['../../etc', '', 'Calculator', 42, null])
      expect(isOnboardingSample(bad)).toBe(false);
  });

  it('copies OUT of this repository, into the operator’s own space', () => {
    const source = join(ENGINE, 'samples', 'calculator');
    const plan = planSampleProject('calculator', ENGINE, HOME, present(source));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.source).toBe(source);
    expect(plan.target).toBe(join(HOME, SAMPLE_PARENT_DIR, 'calculator'));
    // Never a path inside the engine's own tree: locking onto one would back
    // up and fly AUTOPILOT itself (the calculator case study's own lesson).
    expect(plan.target.startsWith(ENGINE)).toBe(false);
    expect(plan.commitSubject).toContain('calculator');
  });

  it('refuses an unknown sample without touching a path', () => {
    const plan = planSampleProject('../../../etc/passwd', ENGINE, HOME, () => true);
    expect(plan).toMatchObject({ ok: false, reason: 'unknown-sample' });
    if (plan.ok) return;
    expect(plan.details).toContain('bundled samples');
  });

  it('refuses when the checkout has no such sample, naming the path it looked at', () => {
    const plan = planSampleProject('calculator', ENGINE, HOME, () => false);
    expect(plan).toMatchObject({ ok: false, reason: 'source-missing' });
    if (plan.ok) return;
    expect(plan.details).toContain(join(ENGINE, 'samples', 'calculator'));
  });

  it('never overwrites a copy that is already there — it points at it instead', () => {
    const source = join(ENGINE, 'samples', 'calculator');
    const target = join(HOME, SAMPLE_PARENT_DIR, 'calculator');
    const plan = planSampleProject('calculator', ENGINE, HOME, present(source, target));
    expect(plan).toMatchObject({ ok: false, reason: 'already-there', target });
    if (plan.ok) return;
    expect(plan.details).toContain('ready to fly');
  });
});
