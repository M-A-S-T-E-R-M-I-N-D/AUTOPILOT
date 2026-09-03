// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * BUNDLE DIET (board ap-mtk2tgvh-0): the non-English half of
 * `@autopilot/tokens`' `STRINGS` table, split out of the render-blocking
 * core chunk (`features/locale.ts`, which keeps only `STRINGS.en` — the
 * table `tr()`/`translateDom()` need synchronously for confirm-dialog text
 * and the default English paint) into its own deferred module, riding
 * `/panels.js` on every page.
 *
 * Widens core's `let STRINGS` in place (`Object.assign`, not reassignment —
 * `applyLocale()`/`translateDom()` closures already captured the object
 * identity) then re-sweeps the DOM, so a saved non-English locale — which
 * read English via `translateDom`'s `STRINGS[l] || STRINGS.en` fallback for
 * the brief window before this chunk executed — settles into its real
 * translation. `translateDom` is core's hoisted top-level `function`, so
 * this deferred script (which always runs after core, non-deferred /app.js
 * having already executed in full) can call it unguarded, the same
 * direction `pr-review.ts`/`pool-client.ts` already call it from.
 */
import { STRINGS } from '@autopilot/tokens';

/** Every locale's table except English, which core already carries. */
export function localeDataJs(): string {
  const nonEnglish = Object.fromEntries(
    Object.entries(STRINGS).filter(([locale]) => locale !== 'en'),
  );
  const json = JSON.stringify(nonEnglish);
  return `
Object.assign(STRINGS, ${json});
translateDom(document.documentElement.lang || 'en');
`.trim();
}
