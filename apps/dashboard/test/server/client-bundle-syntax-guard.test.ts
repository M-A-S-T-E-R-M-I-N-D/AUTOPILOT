// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { Linter } from 'eslint';
import globals from 'globals';
import { describe, it, expect } from 'vitest';
import { clientJs } from '../../src/web/shell.js';

/**
 * `clientJs()` assembles the served /app.js from many modules' `.toString()`d
 * source spliced into one template string (see docs/epics/0002-shell-decomposition.md).
 * A single misplaced brace or a TS-only construct that survives typecheck but
 * doesn't survive `.toString()` extraction breaks the FULL bundle — every
 * jsdom test that does `new Function(clientJs())()` then fails at once, with
 * the real cause (a syntax error) buried under hundreds of unrelated-looking
 * DOM failures. This test parses the assembled bundle on its own, without a
 * DOM, so a broken bundle fails fast with one clear syntax error instead of a
 * wall of jsdom noise.
 */
describe('clientJs bundle syntax guard', () => {
  it('parses the full assembled bundle as valid JavaScript', () => {
    const bundle = clientJs();

    expect(bundle.length).toBeGreaterThan(0);
    expect(() => new Function(bundle)).not.toThrow();
  });

  // BUNDLE FREE-VARIABLE CHECK (EVAL 08-27, board web-mtb8ib31-q48qyd): the
  // live `minutesOf` ReferenceError (docs/EVALUATION-2026-08-27-silent-gate.md
  // §3.4) survived every existing guard because `new Function(bundle)` above
  // only proves the bundle PARSES — a syntax check never resolves a single
  // identifier, so a helper a splice forgot to embed (a `.toString()`d
  // closure whose free variables live outside its own body) sails through
  // silently. It also survived hundreds of jsdom tests that DO execute the
  // bundle, because each only exercises the one feature it targets — none of
  // them is a bundle-WIDE guard.
  //
  // `no-undef` performs real scope analysis over the WHOLE bundle text
  // without executing a single line, so it catches a dangling free variable
  // on ANY code path, not just the ones a test happens to call.
  it('flags free variables — a reference that resolves to nothing anywhere in the bundle', () => {
    const bundle = clientJs();
    const linter = new Linter();

    const messages = linter.verify(bundle, {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
        globals: { ...globals.browser },
      },
      rules: { 'no-undef': 'error' },
    });

    expect(messages).toEqual([]);
  });
});
