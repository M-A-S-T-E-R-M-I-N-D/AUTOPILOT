// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The tr() twin of shell-i18n.test.ts's data-i18n audit (board
 * web-msnsndki-dz3vn1): every `tr('<key>')` call in the generated client
 * bundle is a string literal inside generated JS text, so the typechecker
 * never sees it — a typo'd key compiles clean, passes both i18n scanners
 * (which only sweep literal markup), and silently renders `undefined` at
 * runtime. The browse modal's `browseDrives`/`browseUpParent` aria-labels
 * (the firing-204 slice) are exactly this shape: set imperatively in
 * `paintBrowse()`, invisible to every other guard. This test extracts each
 * key the bundle actually calls and resolves it against the English table,
 * so adding a tr() call without its STRINGS entry — or renaming an entry
 * out from under a call site — fails the suite instead of the reader.
 *
 * All three served chunks are swept, not just the core `/app.js` text: the
 * bundle diet (board ap-mtk2tgvh-0) moved whole modules into the deferred
 * `/panels.js` and `/project.js` chunks, and `tour.ts`'s and `connect.ts`'s
 * tr() calls ride the deferred one — a core-only sweep would have let a
 * typo'd key there render `undefined` unseen.
 *
 * `setTip(el, 'key')` (fly.ts's and connect.ts's data-i18n-tip helpers)
 * defers its `tr(key)` call to the helper body, so the key literal never sits
 * next to a `tr(` — it is swept by its own call shape, or every tooltip key
 * would be the one class of tr() key this audit could not see.
 *
 * Both quote styles are matched: the spliced `web/` helpers that take an
 * injected `tr` (`flightProgressOf`, the `connect-panel.ts` family) reach the
 * bundle as compiler output via `.toString()`, and the compiler's quote
 * choice — double under Vitest's transform, single under tsc — is not ours
 * to pin; a single-quote-only sweep would skip every key they read.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { clientJs } from '../../src/web/shell.js';
import { deferredFeatureModulesJs, projectFeatureModulesJs } from '../../src/web/chunks.js';

function trKeysIn(js: string): string[] {
  const direct = [...js.matchAll(/\btr\(["']([^"']+)["']/g)].map((m) => m[1] ?? '');
  const viaSetTip = [...js.matchAll(/\bsetTip\([^,()]+, '([^']+)'\)/g)].map((m) => m[1] ?? '');
  return [...direct, ...viaSetTip];
}

describe('every tr() key in the generated client bundle resolves in STRINGS', () => {
  const keys = trKeysIn(
    [clientJs(), projectFeatureModulesJs(), deferredFeatureModulesJs()].join('\n'),
  );

  it('extracts the known call sites (the regex is not silently matching nothing)', () => {
    expect(keys).toContain('browseDrives');
    expect(keys).toContain('browseUpParent');
    expect(keys).toContain('taskDeleteConfirm');
    expect(keys).toContain('githubPrConfirm');
    // setTip call sites — a core one and a deferred-chunk one, proving the
    // helper shape is swept and the sweep reaches /panels.js.
    expect(keys).toContain('flyGoTip');
    expect(keys).toContain('connectLoginTip');
    // Spliced-helper call sites — compiler-quoted, proving both quote styles
    // are swept: one core (flightProgressOf) and one deferred (connect-panel).
    expect(keys).toContain('flightProgressSpentOfTotal');
    expect(keys).toContain('connectStatusLine');
  });

  it('resolves every extracted key in the English table', () => {
    for (const key of keys) {
      expect(STRINGS.en, `tr('${key}') has no STRINGS entry`).toHaveProperty(key);
    }
  });
});
