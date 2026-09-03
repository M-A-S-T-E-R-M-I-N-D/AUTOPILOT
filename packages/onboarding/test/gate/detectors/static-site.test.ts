// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the static-site gate detector
 * (`gate/detectors/static-site.ts`). `detect.test.ts` only exercises it
 * indirectly through `detectGate`'s ecosystem-selection pipeline; these tests
 * call `staticSiteDetector.detect` directly against a bare `FsSnapshot`.
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

  it('defers to another ecosystem when a package.json is present', () => {
    expect(staticSiteDetector.detect(snap(['package.json', 'index.html']))).toBeNull();
  });

  it('proposes html-validate as lint and linkinator as test', () => {
    const d = staticSiteDetector.detect(snap(['about.html', 'style.css']));
    expect(d).not.toBeNull();
    expect(d?.gate.lint).toEqual({
      bin: 'npx',
      args: ['--yes', 'html-validate', '**/*.html'],
      label: 'npx --yes html-validate **/*.html',
    });
    expect(d?.gate.test).toEqual({
      bin: 'npx',
      args: ['--yes', 'linkinator', '.', '--recurse'],
      label: 'npx --yes linkinator . --recurse',
    });
    expect(d?.gate.build).toBeUndefined();
    expect(d?.gate.typecheck).toBeUndefined();
  });

  it('matches via a bare .htm file too', () => {
    expect(staticSiteDetector.detect(snap(['legacy.htm']))).not.toBeNull();
  });

  it('records index.html as extra evidence and a score bonus when present', () => {
    const withIndex = staticSiteDetector.detect(snap(['index.html']));
    expect(withIndex?.evidence).toEqual(['*.html', 'html-validate', 'linkinator', 'index.html']);
    expect(withIndex?.score).toBe(3); // 2 gate commands + the index.html bonus.

    const withoutIndex = staticSiteDetector.detect(snap(['about.html']));
    expect(withoutIndex?.evidence).toEqual(['*.html', 'html-validate', 'linkinator']);
    expect(withoutIndex?.score).toBe(2); // 2 gate commands, no bonus.
  });
});
