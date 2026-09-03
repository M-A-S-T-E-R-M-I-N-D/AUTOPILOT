// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import type { GateSpec } from '@autopilot/onboarding';
import { gateCommands, PARALLEL_GATE_KINDS } from '../src/gate-commands.js';

function spec(overrides: Partial<GateSpec>): GateSpec {
  return { ecosystem: 'js', ...overrides };
}

describe('gateCommands', () => {
  it('returns an empty list for a spec with no commands', () => {
    expect(gateCommands(spec({}))).toEqual([]);
  });

  it('maps configured kinds in gate order: typecheck, lint, format, test, build', () => {
    const result = gateCommands(
      spec({
        build: { bin: 'node', args: ['build.js'], label: 'build' },
        typecheck: { bin: 'tsc', args: ['--noEmit'], label: 'typecheck' },
        test: { bin: 'vitest', args: ['run'], label: 'test' },
      }),
    );
    expect(result.map((c) => c.label)).toEqual(['typecheck', 'test', 'build']);
  });

  it('marks typecheck/lint/format as parallel and leaves test/build sequential', () => {
    const result = gateCommands(
      spec({
        typecheck: { bin: 'tsc', args: [], label: 'typecheck' },
        lint: { bin: 'eslint', args: [], label: 'lint' },
        format: { bin: 'prettier', args: [], label: 'format' },
        test: { bin: 'vitest', args: [], label: 'test' },
        build: { bin: 'node', args: [], label: 'build' },
      }),
    );
    const parallelLabels = result.filter((c) => c.parallel).map((c) => c.label);
    const sequentialLabels = result.filter((c) => !c.parallel).map((c) => c.label);
    expect(parallelLabels).toEqual(['typecheck', 'lint', 'format']);
    expect(sequentialLabels).toEqual(['test', 'build']);
  });

  it('skips a configured kind whose command has no bin', () => {
    const result = gateCommands(
      spec({
        lint: { bin: '', args: [], label: 'lint' },
        test: { bin: 'vitest', args: ['run'], label: 'test' },
      }),
    );
    expect(result.map((c) => c.label)).toEqual(['test']);
  });

  it('copies args into a new array rather than aliasing the spec', () => {
    const args = ['run'];
    const result = gateCommands(spec({ test: { bin: 'vitest', args, label: 'test' } }));
    args.push('mutated');
    expect(result[0]?.args).toEqual(['run']);
  });

  it('exposes exactly typecheck/lint/format as the parallel-safe kinds', () => {
    expect([...PARALLEL_GATE_KINDS].sort()).toEqual(['format', 'lint', 'typecheck']);
  });
});
