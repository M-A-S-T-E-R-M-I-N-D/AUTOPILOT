// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Go gate detector (`gate/detectors/go.ts`).
 * `detect.test.ts` only exercises it indirectly through `detectGate`'s
 * ecosystem-selection pipeline; these tests call `goDetector.detect`
 * directly against a bare `FsSnapshot`.
 */

import { describe, it, expect } from 'vitest';
import { goDetector } from '../../../src/gate/detectors/go.js';
import { makeFsSnapshot } from '../../../src/gate/snapshot.js';

function snap(files: readonly string[], contents: Record<string, string> = {}) {
  return makeFsSnapshot({ files, contents });
}

describe('goDetector', () => {
  it('returns null when there is no go.mod', () => {
    expect(goDetector.detect(snap(['package.json']))).toBeNull();
  });

  it('falls back to go vet as the default lint when no golangci config is present', () => {
    const d = goDetector.detect(snap(['go.mod']));
    expect(d).not.toBeNull();
    expect(d?.evidence).toEqual(['go.mod', 'go vet']);
    expect(d?.gate.test).toEqual({ bin: 'go', args: ['test', './...'], label: 'go test ./...' });
    expect(d?.gate.build).toEqual({
      bin: 'go',
      args: ['build', './...'],
      label: 'go build ./...',
    });
    expect(d?.gate.lint).toEqual({ bin: 'go', args: ['vet', './...'], label: 'go vet ./...' });
  });

  it('prefers golangci-lint over go vet when a .golangci config file is present', () => {
    const d = goDetector.detect(snap(['go.mod', '.golangci.yml']));
    expect(d?.evidence).toEqual(['go.mod', 'golangci-lint']);
    expect(d?.gate.lint).toEqual({
      bin: 'golangci-lint',
      args: ['run'],
      label: 'golangci-lint run',
    });
    // test/build stay direct `go` invocations regardless of the lint choice.
    expect(d?.gate.test).toEqual({ bin: 'go', args: ['test', './...'], label: 'go test ./...' });
    expect(d?.gate.build).toEqual({
      bin: 'go',
      args: ['build', './...'],
      label: 'go build ./...',
    });
  });

  it('scores as detected-commands count (test/build/lint) plus the manifest bonus', () => {
    const d = goDetector.detect(snap(['go.mod']));
    // 3 gate commands (test/build/lint — Go has no dedicated typecheck step) + 1 manifest bonus.
    expect(d?.score).toBe(4);
  });
});
