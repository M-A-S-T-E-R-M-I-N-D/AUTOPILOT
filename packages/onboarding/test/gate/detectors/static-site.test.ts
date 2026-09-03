// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the static-site gate detector
 * (`gate/detectors/static-site.ts`). `detect.test.ts` only exercises it
 * indirectly through `detectGate`'s ecosystem-selection pipeline; these
 * tests call `staticSiteDetector.detect` directly against a bare
 * `FsSnapshot`.
 */

import { describe, it, expect } from 'vitest';
import { staticSiteDetector } from '../../../src/gate/detectors/static-site.js';
import { makeFsSnapshot } from '../../../src/gate/snapshot.js';

function snap(files: readonly string[], contents: Record<string, string> = {}) {
  return makeFsSnapshot({ files, contents });
}

describe('staticSiteDetector', () => {
  it('returns null when there are no .html/.htm files', () => {
    expect(staticSiteDetector.detect(snap(['README.md', 'style.css']))).toBeNull();
  });

  it('detects a bare HTML page with no manifest and proposes html-validate + linkinator', () => {
    const d = staticSiteDetector.detect(snap(['index.html', 'style.css', 'app.js']));
    expect(d).not.toBeNull();
    expect(d?.evidence).toEqual(['*.html', 'html-validate', 'linkinator']);
    expect(d?.gate.lint).toEqual({
      bin: 'npx',
      args: ['--yes', 'html-validate', '.'],
      label: 'npx --yes html-validate .',
    });
    expect(d?.gate.test).toEqual({
      bin: 'npx',
      args: ['--yes', 'linkinator', '.', '--recurse'],
      label: 'npx --yes linkinator . --recurse',
    });
    expect(d?.score).toBe(2);
  });

  it('detects via .htm suffix too', () => {
    const d = staticSiteDetector.detect(snap(['page.htm']));
    expect(d).not.toBeNull();
  });

  it('defers to the JS detector territory when package.json is present', () => {
    expect(staticSiteDetector.detect(snap(['index.html', 'package.json']))).toBeNull();
  });

  it('defers to the Python detector territory when pyproject.toml is present', () => {
    expect(staticSiteDetector.detect(snap(['index.html', 'pyproject.toml']))).toBeNull();
  });

  it('defers to the Go detector territory when go.mod is present', () => {
    expect(staticSiteDetector.detect(snap(['index.html', 'go.mod']))).toBeNull();
  });

  it('defers to the Rust detector territory when Cargo.toml is present', () => {
    expect(staticSiteDetector.detect(snap(['index.html', 'Cargo.toml']))).toBeNull();
  });
});
