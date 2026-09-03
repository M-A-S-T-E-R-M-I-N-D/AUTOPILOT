// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Rust gate detector (`gate/detectors/rust.ts`).
 * `detect.test.ts` only exercises it indirectly through `detectGate`'s
 * ecosystem-selection pipeline; these tests call `rustDetector.detect`
 * directly against a bare `FsSnapshot`.
 */

import { describe, it, expect } from 'vitest';
import { rustDetector } from '../../../src/gate/detectors/rust.js';
import { makeFsSnapshot } from '../../../src/gate/snapshot.js';

function snap(files: readonly string[], contents: Record<string, string> = {}) {
  return makeFsSnapshot({ files, contents });
}

describe('rustDetector', () => {
  it('returns null when there is no Cargo.toml', () => {
    expect(rustDetector.detect(snap(['package.json']))).toBeNull();
  });

  it('detects a plain (non-workspace) crate without a --workspace flag', () => {
    const d = rustDetector.detect(
      snap(['Cargo.toml'], { 'Cargo.toml': '[package]\nname = "x"\n' }),
    );
    expect(d).not.toBeNull();
    expect(d?.evidence).toEqual(['Cargo.toml']);
    expect(d?.gate.typecheck).toEqual({ bin: 'cargo', args: ['check'], label: 'cargo check' });
    expect(d?.gate.test).toEqual({ bin: 'cargo', args: ['test'], label: 'cargo test' });
    expect(d?.gate.build).toEqual({ bin: 'cargo', args: ['build'], label: 'cargo build' });
    expect(d?.gate.lint).toEqual({ bin: 'cargo', args: ['clippy'], label: 'cargo clippy' });
  });

  it('adds --workspace to every gate command for a [workspace] manifest', () => {
    const d = rustDetector.detect(
      snap(['Cargo.toml'], { 'Cargo.toml': '[workspace]\nmembers = ["a", "b"]\n' }),
    );
    expect(d?.evidence).toEqual(['Cargo.toml', 'workspace']);
    expect(d?.gate.typecheck).toEqual({
      bin: 'cargo',
      args: ['check', '--workspace'],
      label: 'cargo check --workspace',
    });
    expect(d?.gate.test?.args).toEqual(['test', '--workspace']);
    expect(d?.gate.build?.args).toEqual(['build', '--workspace']);
    expect(d?.gate.lint?.args).toEqual(['clippy', '--workspace']);
  });

  it('scores as detected-commands count plus the manifest bonus', () => {
    const d = rustDetector.detect(
      snap(['Cargo.toml'], { 'Cargo.toml': '[package]\nname = "x"\n' }),
    );
    // 4 gate commands (typecheck/test/build/lint) + 1 manifest bonus.
    expect(d?.score).toBe(5);
  });
});
