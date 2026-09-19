// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * epic 0025 icon system (finishing stranded firing 117's intent,
 * ap-mu82lius-strand): the fly bar's "Work that fits you" disclosure head
 * (`#fly-fit .fly-fit-head`) baked a literal 🍀 glyph into the `luckyFitTitle`
 * string, the last spot in `shell.ts` still doing that. icons.ts's `sparkles`
 * shape was already vendored (used by the self-proposed task chip) but never
 * wired to this caller. Swaps the glyph for `iconSvg('sparkles')`, the same
 * `${iconSvg(name)}<span data-i18n="...">` idiom `#ob-title` and the "More"
 * menu items already use for a raw-template heading.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell } from '../../src/web/shell.js';

describe('the fly-fit disclosure head drops its emoji for the vendored sparkles icon', () => {
  it('renders the icon beside the translated title, with no emoji glyph left in the string', () => {
    document.open();
    document.write(renderShell());
    document.close();

    const title = document.querySelector('.fly-fit-head-title');
    expect(title).not.toBeNull();
    expect(title?.querySelector('svg.icon-sparkles')).not.toBeNull();

    const label = title?.querySelector('[data-i18n="luckyFitTitle"]');
    expect(label?.tagName).toBe('SPAN');
    expect(label?.textContent).toBe(STRINGS.en.luckyFitTitle);
    expect(STRINGS.en.luckyFitTitle).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(STRINGS.he.luckyFitTitle).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
