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
  planStepOutcome,
  planStepMove,
  gateRunTally,
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

  // Epic 0024 (board web-mtywp7wk-tkdwhi): the chain is a tablist; these are its keys.
  it('moves the selected step by the tabs-pattern keys, wrapping, mirrored right-to-left', () => {
    const kinds = planStepKinds();
    expect(planStepMove(kinds, 'typecheck', 'ArrowRight', false)).toBe('lint');
    expect(planStepMove(kinds, 'lint', 'ArrowLeft', false)).toBe('typecheck');
    expect(planStepMove(kinds, 'build', 'ArrowRight', false)).toBe('typecheck');
    expect(planStepMove(kinds, 'typecheck', 'ArrowLeft', false)).toBe('build');
    expect(planStepMove(kinds, 'test', 'Home', false)).toBe('typecheck');
    expect(planStepMove(kinds, 'test', 'End', false)).toBe('build');
    // Under dir=rtl the chain draws right to left, so the arrows swap; Home/End do not.
    expect(planStepMove(kinds, 'typecheck', 'ArrowLeft', true)).toBe('lint');
    expect(planStepMove(kinds, 'typecheck', 'ArrowRight', true)).toBe('build');
    expect(planStepMove(kinds, 'test', 'Home', true)).toBe('typecheck');
    // Any other key, or a step the chain does not hold, moves nothing.
    expect(planStepMove(kinds, 'test', 'ArrowDown', false)).toBeNull();
    expect(planStepMove(kinds, 'test', 'Enter', false)).toBeNull();
    expect(planStepMove(kinds, 'deploy', 'ArrowRight', false)).toBeNull();
    expect(planStepMove([], 'test', 'Home', false)).toBeNull();
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

// Epic 0024 (board web-mtywp7wk-tkdwhi): "the gate as a readable plan with outcomes" — each
// step shows what the last recorded gate run said about it.
describe('the flight plan editor — outcomes from the last gate run', () => {
  const pass = (label: string, durationMs = 1000) => ({ label, pass: true, durationMs });
  const fail = (label: string, durationMs = 1000) => ({ label, pass: false, durationMs });

  it('matches a step to the check the gate recorded under its label', () => {
    const steps = planStepsFromSpec(SPEC);
    const checks = [pass('pnpm run typecheck', 4200), fail('tests', 9000)];
    expect(planStepOutcome(steps[0]!, checks)).toEqual(pass('pnpm run typecheck', 4200));
    expect(planStepOutcome(steps[3]!, checks)).toEqual(fail('tests', 9000));
  });

  it('has no outcome for a step that is off, or one the run never recorded', () => {
    const steps = planStepsFromSpec(SPEC);
    const checks = [pass('pnpm run lint')];
    // lint is off in this plan: a check under the same label is not its outcome.
    expect(planStepOutcome(steps[1]!, checks)).toBeNull();
    // a draft that renames typecheck's command has not run yet.
    expect(planStepOutcome({ ...steps[0]!, label: 'tsc -b' }, [pass('pnpm run typecheck')])).toBe(
      null,
    );
    expect(planStepOutcome(steps[0]!, [])).toBeNull();
  });

  it('gives a draft step no outcome once it differs from the published step', () => {
    const published = planStepsFromSpec(SPEC)[0]!;
    const checks = [pass('pnpm run typecheck')];
    expect(planStepOutcome(published, checks, published)).toEqual(pass('pnpm run typecheck'));
    // Same label, new command: the gate ran the old one.
    const edited = { ...published, command: 'tsc -b' };
    expect(planStepOutcome(edited, checks, published)).toBeNull();
    // Turned on in the draft only: never ran.
    const lint = planStepsFromSpec(SPEC)[1]!;
    const lintOn = { ...lint, enabled: true, command: 'pnpm run lint', label: 'pnpm run lint' };
    expect(planStepOutcome(lintOn, [pass('pnpm run lint')], lint)).toBeNull();
  });

  it('takes the last verdict when a remediated gate re-ran a label', () => {
    const steps = planStepsFromSpec(SPEC);
    const checks = [fail('tests', 3000), pass('pnpm run typecheck'), pass('tests', 8000)];
    expect(planStepOutcome(steps[3]!, checks)).toEqual(pass('tests', 8000));
  });

  it('tallies the run by final verdict per label and names what failed, in order', () => {
    expect(gateRunTally([])).toEqual({ total: 0, passed: 0, failed: [] });
    expect(
      gateRunTally([
        fail('pnpm run format'),
        pass('pnpm run typecheck'),
        pass('pnpm run format'),
        fail('ci:doc-links'),
        fail('ci:spdx'),
      ]),
    ).toEqual({ total: 4, passed: 2, failed: ['ci:doc-links', 'ci:spdx'] });
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
