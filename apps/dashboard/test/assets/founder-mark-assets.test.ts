// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gogglesMarkSvg } from '../../src/assets/goggles-mark.js';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SPDX_HEADER = `<!-- SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
`;

/**
 * Epic 0008 slice 4: the founder's-mark edition (blue-white lens gradient +
 * six-point glint) — the signature variant for the founder's own
 * profile/release signature, never the default repo face. Committed once
 * as a static file (same reasoning as the README's `goggles-mark-{dark,light}.svg`
 * exports — a profile-picture upload needs a real file, not a live endpoint)
 * and drift-guarded against the live `gogglesMarkSvg()` source.
 */
describe('founder-mark static export', () => {
  it('docs/brand/goggles-mark-founder.svg matches the live gogglesMarkSvg({ edition: "founder" }) output', () => {
    const onDisk = readFileSync(join(REPO_ROOT, 'docs/brand/goggles-mark-founder.svg'), 'utf8');
    const expected =
      SPDX_HEADER +
      gogglesMarkSvg({ theme: 'dark', edition: 'founder', variant: 'plain', background: true });
    expect(onDisk).toBe(expected);
  });

  it('is never the default repo face — favicon/manifest stay on the universal edition', () => {
    const onDisk = readFileSync(join(REPO_ROOT, 'docs/brand/goggles-mark-founder.svg'), 'utf8');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    const manifestSource = readFileSync(
      join(REPO_ROOT, 'apps/dashboard/src/assets/brandmark.ts'),
      'utf8',
    );
    expect(readme).not.toContain('goggles-mark-founder.svg');
    expect(manifestSource).not.toContain("edition: 'founder'");
    expect(manifestSource).not.toContain('founder-lens-gradient');
    expect(onDisk).toContain('founder signature edition');
  });
});
