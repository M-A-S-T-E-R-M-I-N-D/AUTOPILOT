// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  extractDeliverable,
  deliverableKeywords,
  verifyDeliverable,
  promisesUxExpression,
  verifyUxExpression,
} from '../../src/flight/deliverable.js';

// Mirrors deliverable.ts's own STOPWORDS list — kept here only to drive
// per-word coverage, not re-exported from the source module.
const ALL_STOPWORDS = [
  'that',
  'this',
  'with',
  'from',
  'into',
  'onto',
  'over',
  'under',
  'live',
  'real',
  'after',
  'before',
  'both',
  'each',
  'when',
  'what',
  'then',
  'than',
  'have',
  'been',
  'also',
  'only',
  'some',
  'more',
  'most',
  'such',
  'same',
  'very',
  'just',
  'does',
  'doing',
  'itself',
  'their',
  'there',
  'these',
  'those',
  'across',
  'about',
  'every',
];

// Mirrors deliverable.ts's own UX_SIGNAL_WORDS list — same reasoning.
const ALL_UX_SIGNAL_WORDS = [
  'ui',
  'ux',
  'panel',
  'panels',
  'chip',
  'chips',
  'button',
  'buttons',
  'tooltip',
  'tooltips',
  'docs',
  'doc',
  'visible',
  'visibly',
  'renders',
  'rendered',
  'render',
  'keyboard',
  'aria',
  'accessible',
  'accessibility',
  'axe',
  'card',
  'cards',
  'view',
  'element',
  'widget',
  'dashboard',
  'page',
  'screen',
  'toggle',
  'menu',
  'dialog',
  'modal',
];

describe('extractDeliverable', () => {
  it('extracts the trailing clause after the DELIVERABLE: marker', () => {
    expect(
      extractDeliverable('SELF-STUDY updater: ... DELIVERABLE: doc visibly updates after a flight'),
    ).toBe('doc visibly updates after a flight');
  });

  it('returns null when the title has no DELIVERABLE clause', () => {
    expect(extractDeliverable('Fix the flaky test in runner.test.ts')).toBeNull();
  });

  it('returns null when the marker is present but the clause is blank', () => {
    expect(extractDeliverable('Some task DELIVERABLE:   ')).toBeNull();
  });
});

describe('deliverableKeywords', () => {
  it('lowercases, dedupes, and drops short/stopword filler', () => {
    expect(deliverableKeywords('tooltips live on all panels')).toEqual(['tooltips', 'panels']);
  });

  it('dedupes repeated keywords', () => {
    expect(deliverableKeywords('renders renders in the docs panel')).toEqual([
      'renders',
      'docs',
      'panel',
    ]);
  });

  it.each(ALL_STOPWORDS)('filters out the stopword "%s" on its own', (word) => {
    expect(deliverableKeywords(word)).toEqual([]);
  });
});

describe('verifyDeliverable', () => {
  it('passes when the patch mentions a DELIVERABLE keyword', () => {
    const patch = 'diff --git a/src/tooltip.ts b/src/tooltip.ts\n+export function tooltip() {}';
    expect(verifyDeliverable('tooltips live on all panels', patch)).toBe(true);
  });

  it('fails when the patch shares no vocabulary with the DELIVERABLE clause', () => {
    const patch = 'diff --git a/README.md b/README.md\n+fix a typo';
    expect(verifyDeliverable('one click lands and refreshes the app end to end', patch)).toBe(
      false,
    );
  });

  it('passes a clause with no checkable keywords rather than blocking on it', () => {
    expect(verifyDeliverable('that this with from', 'anything at all')).toBe(true);
  });

  it('is case-insensitive', () => {
    const patch = 'Added a new TOOLTIP component';
    expect(verifyDeliverable('tooltips live on all panels', patch)).toBe(true);
  });

  it('tolerates a plural clause keyword matching a singular patch mention', () => {
    const patch = 'diff --git a/src/tooltip.ts b/src/tooltip.ts\n+export function tooltip() {}';
    expect(verifyDeliverable('tooltips live on all panels', patch)).toBe(true);
  });

  it('matches a keyword that appears literally in the patch without needing the plural fallback', () => {
    const patch = 'diff --git a/src/widget.ts b/src/widget.ts\n+export function widget() {}';
    expect(verifyDeliverable('widget', patch)).toBe(true);
  });

  it('does not strip a trailing letter off a clause word that is not actually a plural', () => {
    // "chart" doesn't end in "s", so it must never fall back to matching
    // "char" — only a real "chart" (or the true plural "charts") should count.
    const patch = 'diff --git a/src/char.ts b/src/char.ts\n+export const char = 1;';
    expect(verifyDeliverable('chart', patch)).toBe(false);
  });

  it('rejects a plural whose stripped singular is too short to trust', () => {
    // "tags" strips to "tag" (3 chars) — below the 4-char floor — so a bare
    // "tag" mention in the patch must not count as a match.
    const patch = 'diff --git a/src/tag.ts b/src/tag.ts\n+export const tag = 1;';
    expect(verifyDeliverable('tags', patch)).toBe(false);
  });

  it('accepts a plural whose stripped singular sits exactly at the 4-char floor', () => {
    const patch = 'diff --git a/src/flag.ts b/src/flag.ts\n+export const flag = 1;';
    expect(verifyDeliverable('flags', patch)).toBe(true);
  });
});

describe('promisesUxExpression', () => {
  it('is true when the clause uses a UX signal word', () => {
    expect(promisesUxExpression('tooltips live on all panels')).toBe(true);
    expect(promisesUxExpression('a doctor panel in UI')).toBe(true);
  });

  it('is false for a backend/infra clause with no UX signal words', () => {
    expect(promisesUxExpression('one command boots the server and applies migrations')).toBe(false);
  });

  it.each(ALL_UX_SIGNAL_WORDS)('recognizes "%s" on its own as a UX signal word', (word) => {
    expect(promisesUxExpression(word)).toBe(true);
  });
});

describe('verifyUxExpression (UX-EXPRESSION DOCTRINE)', () => {
  it('passes a UX-promising clause when the patch touches the web/ layer', () => {
    const patch =
      'diff --git a/apps/dashboard/src/web/shell.ts b/apps/dashboard/src/web/shell.ts\n+<button>Add</button>';
    expect(verifyUxExpression('tooltips live on all panels', patch)).toBe(true);
  });

  it('passes a UX-promising clause when the patch touches a docs/*.md entry', () => {
    const patch =
      'diff --git a/docs/MODEL-CARD.md b/docs/MODEL-CARD.md\n+visible in the docs panel';
    expect(verifyUxExpression('renders as a docs panel entry', patch)).toBe(true);
  });

  it('fails a UX-promising clause backed only by backend/engine files', () => {
    const patch =
      'diff --git a/packages/engine/src/prompt.ts b/packages/engine/src/prompt.ts\n+doctrine text';
    expect(verifyUxExpression('a visible chip renders on the panel', patch)).toBe(false);
  });

  it('passes a clause with no UX signal words regardless of what the patch touches', () => {
    const patch =
      'diff --git a/packages/engine/src/prompt.ts b/packages/engine/src/prompt.ts\n+doctrine text';
    expect(verifyUxExpression('doctrine in prompt and test', patch)).toBe(true);
  });

  it('ignores a "diff --git" occurrence that is not at the start of a line', () => {
    const patch =
      'not a header diff --git a/apps/dashboard/src/web/shell.ts b/apps/dashboard/src/web/shell.ts\n+plus content';
    expect(verifyUxExpression('a visible chip renders', patch)).toBe(false);
  });

  it('fails a UX-promising clause when the patch has no diff header at all', () => {
    expect(verifyUxExpression('a visible chip renders', 'not a real patch, just prose')).toBe(
      false,
    );
  });

  it('does not count a top-level markdown file outside docs/ as a docs surface', () => {
    const patch = 'diff --git a/CHANGELOG.md b/CHANGELOG.md\n+visible chip added';
    expect(verifyUxExpression('a visible chip renders', patch)).toBe(false);
  });

  it('does not count a non-markdown file inside docs/ as a docs surface', () => {
    const patch = 'diff --git a/docs/notes.txt b/docs/notes.txt\n+visible chip added';
    expect(verifyUxExpression('a visible chip renders', patch)).toBe(false);
  });

  it('counts a file renamed into the web/ layer even though the diff header keeps the old a/ path', () => {
    const patch =
      'diff --git a/apps/dashboard/src/utils.ts b/apps/dashboard/src/web/utils.ts\n' +
      'similarity index 100%\n' +
      'rename from apps/dashboard/src/utils.ts\n' +
      'rename to apps/dashboard/src/web/utils.ts';
    expect(verifyUxExpression('a visible chip renders', patch)).toBe(true);
  });

  it('does not count a file renamed OUT of the web/ layer as still touching it', () => {
    const patch =
      'diff --git a/apps/dashboard/src/web/utils.ts b/apps/dashboard/src/utils.ts\n' +
      'similarity index 100%\n' +
      'rename from apps/dashboard/src/web/utils.ts\n' +
      'rename to apps/dashboard/src/utils.ts';
    expect(verifyUxExpression('a visible chip renders', patch)).toBe(false);
  });

  it('counts a web/ file whose diff header git quotes (e.g. a non-ASCII filename)', () => {
    // Git wraps both sides in double quotes and octal-escapes non-ASCII
    // bytes whenever a path isn't plain ASCII — the "a/" prefix ends up
    // INSIDE the quotes, so the plain `a\/\S+` pattern never matches.
    const patch =
      'diff --git "a/apps/dashboard/src/web/caf\\303\\251.ts" "b/apps/dashboard/src/web/caf\\303\\251.ts"\n' +
      'index d95f3ad..637f034 100644\n' +
      '--- "a/apps/dashboard/src/web/caf\\303\\251.ts"\n' +
      '+++ "b/apps/dashboard/src/web/caf\\303\\251.ts"';
    expect(verifyUxExpression('a visible chip renders', patch)).toBe(true);
  });
});
