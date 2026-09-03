// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the deferred locale-data chunk
 * (`web/features/locale-data.ts`) — the non-English half of `STRINGS` board
 * ap-mtk2tgvh-0 split out of the render-blocking core chunk.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { localeDataJs } from '../../../src/web/features/locale-data.js';

describe('localeDataJs', () => {
  it('embeds every non-English locale table', () => {
    const nonEnglish = Object.fromEntries(
      Object.entries(STRINGS).filter(([locale]) => locale !== 'en'),
    );
    expect(localeDataJs()).toContain(`Object.assign(STRINGS, ${JSON.stringify(nonEnglish)});`);
  });

  it('excludes the English table — that ships in core (features/locale.ts)', () => {
    expect(localeDataJs()).not.toContain(JSON.stringify(STRINGS.en));
  });

  it('re-sweeps the DOM in the current document language once the data lands', () => {
    expect(localeDataJs()).toContain("translateDom(document.documentElement.lang || 'en');");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = localeDataJs();
    expect(out).toBe(out.trim());
  });
});
