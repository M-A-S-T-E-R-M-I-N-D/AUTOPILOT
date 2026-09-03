// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  FONT_ROUTES,
  PRELOAD_FONT_PATHS,
  fontFaceCss,
  interWoff2,
  robotoWoff2,
} from '../../src/assets/fonts.js';

const WOFF2_MAGIC = Buffer.from('wOF2', 'ascii');

describe('interWoff2 / robotoWoff2', () => {
  it('decodes a real woff2 (magic bytes), memoized across calls', () => {
    const a = interWoff2();
    const b = interWoff2();
    expect(a.subarray(0, 4)).toEqual(WOFF2_MAGIC);
    expect(a).toBe(b); // memoized, not just equal

    const roboto = robotoWoff2();
    expect(roboto.subarray(0, 4)).toEqual(WOFF2_MAGIC);
  });

  it('vendors two distinct font files', () => {
    expect(interWoff2().equals(robotoWoff2())).toBe(false);
  });
});

describe('FONT_ROUTES', () => {
  it('maps every preload path to a woff2 renderer', () => {
    for (const path of PRELOAD_FONT_PATHS) {
      expect(FONT_ROUTES[path]).toBeDefined();
      expect(FONT_ROUTES[path]!().subarray(0, 4)).toEqual(WOFF2_MAGIC);
    }
  });
});

describe('fontFaceCss', () => {
  it('declares Inter at every vendored weight, pointing at the self-hosted path', () => {
    const css = fontFaceCss();
    for (const weight of [400, 500, 600, 700]) {
      expect(css).toContain(
        `font-family: 'Inter';\n  font-style: normal;\n  font-weight: ${weight};`,
      );
    }
    expect(css).toContain('src: url(/fonts/inter.woff2)');
  });

  it('declares Roboto at every vendored weight with font-stretch, pointing at the self-hosted path', () => {
    const css = fontFaceCss();
    for (const weight of [400, 500, 700]) {
      expect(css).toContain(
        `font-family: 'Roboto';\n  font-style: normal;\n  font-weight: ${weight};\n  font-stretch: 100%;`,
      );
    }
    expect(css).toContain('src: url(/fonts/roboto.woff2)');
  });

  it('never references an external Google Fonts host (same-origin only)', () => {
    const css = fontFaceCss();
    expect(css).not.toContain('fonts.gstatic.com');
    expect(css).not.toContain('fonts.googleapis.com');
  });
});
