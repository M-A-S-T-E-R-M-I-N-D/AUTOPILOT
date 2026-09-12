// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  planStepKinds,
  planApiUrl,
  planDraftKey,
  parseCommandLine,
  planStepsFromSpec,
  planSpecFromSteps,
} from '../../src/web/plan-editor.js';
import { validateGateSpec } from '../../src/plan-guard.js';

const SPEC = {
  ecosystem: 'js',
  typecheck: { bin: 'pnpm', args: ['run', 'typecheck'], label: 'pnpm run typecheck' },
  test: { bin: 'pnpm', args: ['run', 'test'], label: 'tests' },
  ciExtras: [{ bin: 'node', args: ['scripts/ci/x.mjs'], label: 'x' }],
};

describe('the flight plan editor — pure half', () => {
  it('draws the chain in the order the gate runs it', () => {
    expect(planStepKinds()).toEqual(['typecheck', 'lint', 'format', 'test', 'build']);
    expect(planApiUrl('a b')).toBe('/api/plan?project=a%20b');
    expect(planDraftKey('p1')).toBe('ap-plan-draft:p1');
  });

  it('splits a command line on whitespace, never through a shell', () => {
    expect(parseCommandLine('  pnpm   run test -- --coverage ')).toEqual({
      bin: 'pnpm',
      args: ['run', 'test', '--', '--coverage'],
    });
    expect(parseCommandLine('')).toEqual({ bin: '', args: [] });
  });

  it('turns a spec into steps — enabled ones with their command, the rest off', () => {
    const steps = planStepsFromSpec(SPEC);
    expect(steps.map((s) => [s.kind, s.enabled])).toEqual([
      ['typecheck', true],
      ['lint', false],
      ['format', false],
      ['test', true],
      ['build', false],
    ]);
    expect(steps[0]).toEqual({
      kind: 'typecheck',
      enabled: true,
      command: 'pnpm run typecheck',
      label: 'pnpm run typecheck',
    });
    expect(steps[3]!.label).toBe('tests');
    expect(planStepsFromSpec(null).every((s) => !s.enabled)).toBe(true);
  });

  it('turns steps back into a spec, keeping what is not a step and dropping what is off', () => {
    const steps = planStepsFromSpec(SPEC).map((s) =>
      s.kind === 'lint'
        ? { ...s, enabled: true, command: 'pnpm run lint', label: '' }
        : s.kind === 'test'
          ? { ...s, enabled: false }
          : s,
    );
    const spec = planSpecFromSteps(steps, SPEC);
    expect(spec).toEqual({
      ecosystem: 'js',
      ciExtras: SPEC.ciExtras,
      typecheck: SPEC.typecheck,
      lint: { bin: 'pnpm', args: ['run', 'lint'], label: 'pnpm run lint' },
    });
    // The round trip is the identity for an unedited plan.
    expect(planSpecFromSteps(planStepsFromSpec(SPEC), SPEC)).toEqual(SPEC);
  });

  it('what the editor publishes is what the server accepts', () => {
    const spec = planSpecFromSteps(planStepsFromSpec(SPEC), SPEC);
    const verdict = validateGateSpec(spec);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.spec).toEqual(SPEC);
  });
});

describe('validateGateSpec — the publish gate', () => {
  it('refuses a non-object, an empty bin, a non-list args, and a plan with no step', () => {
    expect(validateGateSpec(null).ok).toBe(false);
    expect(validateGateSpec([]).ok).toBe(false);
    expect(validateGateSpec({ ecosystem: 'js', test: { bin: ' ', args: [] } })).toEqual({
      ok: false,
      error: 'test: bin is required',
    });
    expect(validateGateSpec({ test: { bin: 'pnpm', args: 'test' } })).toEqual({
      ok: false,
      error: 'test: args must be a list',
    });
    expect(validateGateSpec({ ecosystem: 'js' })).toEqual({
      ok: false,
      error: 'a plan needs at least one enabled step',
    });
  });

  it('bounds sizes and refuses a multi-line bin', () => {
    expect(validateGateSpec({ test: { bin: 'x'.repeat(201), args: [] } }).ok).toBe(false);
    expect(validateGateSpec({ test: { bin: 'pnpm\nrm', args: [] } }).ok).toBe(false);
    expect(validateGateSpec({ test: { bin: 'pnpm', args: new Array(33).fill('a') } }).ok).toBe(
      false,
    );
    expect(validateGateSpec({ test: { bin: 'pnpm', args: [] }, ciExtras: 'no' }).ok).toBe(false);
  });

  it('normalises: trims bin, fills a missing label, defaults the ecosystem, drops unknown keys', () => {
    const verdict = validateGateSpec({
      test: { bin: ' pnpm ', args: ['run', 'test'] },
      ciExtras: [{ bin: 'node', args: ['x.mjs'], label: '' }],
      surprise: true,
    });
    expect(verdict).toEqual({
      ok: true,
      spec: {
        ecosystem: 'unknown',
        test: { bin: 'pnpm', args: ['run', 'test'], label: 'pnpm run test' },
        ciExtras: [{ bin: 'node', args: ['x.mjs'], label: 'node x.mjs' }],
      },
    });
  });
});
