// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gogglesMarkSvg } from '../../src/assets/goggles-mark.js';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const README = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
const SPDX_HEADER = `<!-- SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
`;

/**
 * Epic 0008 slice 2's remaining piece: a *portable* wordmark asset for the
 * README header. `gogglesMarkInlineSvg()` only works live in the dashboard
 * (CSS custom-property colors) — GitHub renders README images as static
 * files, so the header uses `gogglesMarkSvg()`'s fixed-hex output instead,
 * committed once under docs/brand/ rather than generated per-request.
 */
describe('README brand header', () => {
  it.each([
    ['dark', 'goggles-mark-dark.svg'],
    ['light', 'goggles-mark-light.svg'],
  ] as const)('docs/brand/%s asset matches the live gogglesMarkSvg() output', (theme, filename) => {
    const onDisk = readFileSync(join(REPO_ROOT, 'docs/brand', filename), 'utf8');
    const expected = SPDX_HEADER + gogglesMarkSvg({ theme, variant: 'crafted', background: false });
    expect(onDisk).toBe(expected);
  });

  it('embeds the mark via a theme-aware <picture> so it stays legible in GitHub dark and light mode', () => {
    expect(README).toContain('docs/brand/goggles-mark-dark.svg');
    expect(README).toContain('docs/brand/goggles-mark-light.svg');
    expect(README).toContain('prefers-color-scheme: dark');
  });

  it('gives the mark image real alt text, not decorative-only markup', () => {
    expect(README).toContain('alt="AUTOPILOT — aviator goggles mark"');
  });

  it('keeps "AUTOPILOT" as a real heading, not text baked into the image', () => {
    expect(README).toMatch(/^# AUTOPILOT$/m);
  });
});
