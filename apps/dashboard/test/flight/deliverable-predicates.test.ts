// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseDeliverablePredicates,
  countLines,
  evaluateDeliverablePredicates,
  type DeliverablePredicate,
  type PredicateVcs,
} from '../../src/flight/deliverable-predicates.js';

/** In-memory PredicateVcs over a committed-files map (path → content). */
function fakeVcs(files: Record<string, string>): PredicateVcs {
  return {
    fileExists: async (path) => path in files,
    showFile: async (path) => files[path] ?? '',
    lsFiles: async (patterns) => {
      const paths = Object.keys(files);
      return patterns.flatMap((p) =>
        p.startsWith('*/')
          ? paths.filter((f) => f.endsWith(`/${p.slice(2)}`))
          : paths.filter((f) => f === p),
      );
    },
  };
}

describe('parseDeliverablePredicates', () => {
  it('parses the wc -l form with a full repo-relative path (the UNLOCK A2 clause)', () => {
    const parsed = parseDeliverablePredicates('wc -l apps/dashboard/src/web/shell.ts under 300');
    expect(parsed).toEqual([
      { kind: 'max-lines', file: 'apps/dashboard/src/web/shell.ts', max: 300, strict: true },
    ]);
  });

  it('parses the bare-basename "under N lines" form (the original UNLOCK A specimen)', () => {
    const parsed = parseDeliverablePredicates('shell.ts under 300 lines, output identical');
    expect(parsed).toEqual([{ kind: 'max-lines', file: 'shell.ts', max: 300, strict: true }]);
  });

  it.each([
    ['under', true],
    ['below', true],
    ['fewer than', true],
    ['<', true],
    ['at most', false],
    ['no more than', false],
    ['<=', false],
  ])('parses the "%s N lines" comparator with strict=%s', (cmp, strict) => {
    const parsed = parseDeliverablePredicates(`keep util.ts ${cmp} 800 lines`);
    expect(parsed).toEqual([{ kind: 'max-lines', file: 'util.ts', max: 800, strict }]);
  });

  it('parses a "prints under N" wc form', () => {
    const parsed = parseDeliverablePredicates('wc -l src/big.ts prints under 500');
    expect(parsed).toEqual([{ kind: 'max-lines', file: 'src/big.ts', max: 500, strict: true }]);
  });

  it('parses a file-exists predicate', () => {
    const parsed = parseDeliverablePredicates('docs/epics/0009-brand.md exists with slices');
    expect(parsed).toEqual([{ kind: 'file-exists', file: 'docs/epics/0009-brand.md' }]);
  });

  it('parses multiple predicates from one clause, in order', () => {
    const parsed = parseDeliverablePredicates('src/a.ts under 100 lines and docs/spec.md exists');
    expect(parsed).toEqual([
      { kind: 'max-lines', file: 'src/a.ts', max: 100, strict: true },
      { kind: 'file-exists', file: 'docs/spec.md' },
    ]);
  });

  it('dedupes a file claimed by both the wc form and the lines form (wc form wins)', () => {
    const parsed = parseDeliverablePredicates('wc -l src/a.ts under 300; src/a.ts under 300 lines');
    expect(parsed).toEqual([{ kind: 'max-lines', file: 'src/a.ts', max: 300, strict: true }]);
  });

  it('keeps the FIRST claim when the same file is re-claimed with a different limit', () => {
    const parsed = parseDeliverablePredicates('wc -l src/a.ts under 300; src/a.ts under 400 lines');
    expect(parsed).toEqual([{ kind: 'max-lines', file: 'src/a.ts', max: 300, strict: true }]);
  });

  it('normalizes doubled whitespace inside a word comparator', () => {
    const parsed = parseDeliverablePredicates('keep util.ts at  most 800 lines');
    expect(parsed).toEqual([{ kind: 'max-lines', file: 'util.ts', max: 800, strict: false }]);
  });

  it('rejects an implausible bare name in the wc form too', () => {
    expect(parseDeliverablePredicates('wc -l notes.org under 300')).toEqual([]);
  });

  it('rejects an implausible bare name in the exists form too', () => {
    expect(parseDeliverablePredicates('confirm setup.org exists')).toEqual([]);
  });

  it('does NOT parse a size claim without a lines unit (kb is not lines)', () => {
    expect(parseDeliverablePredicates('app.js under 150 kb gzipped')).toEqual([]);
  });

  it('does NOT parse a bare "under N" with no lines unit and no wc -l', () => {
    expect(parseDeliverablePredicates('keep the bundle under 300')).toEqual([]);
  });

  it('does NOT parse prose clauses with no measurable claim', () => {
    expect(parseDeliverablePredicates('visible task chips in the dashboard UI')).toEqual([]);
  });

  it('does NOT treat version numbers as files', () => {
    expect(parseDeliverablePredicates('bump to v13.0.3, keep migration under 50 lines')).toEqual(
      [],
    );
  });

  it('does NOT parse a bare basename with a non-code extension (domains are not files)', () => {
    expect(parseDeliverablePredicates('per arxiv.org keep functions under 50 lines')).toEqual([]);
  });

  it.each([
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'md',
    'json',
    'yml',
    'yaml',
    'css',
    'html',
    'py',
    'go',
    'rs',
    'java',
    'sh',
  ])('accepts a bare basename with the known code extension .%s', (ext) => {
    const parsed = parseDeliverablePredicates(`keep big.${ext} under 40 lines`);
    expect(parsed).toEqual([{ kind: 'max-lines', file: `big.${ext}`, max: 40, strict: true }]);
  });

  it('accepts ANY extension when the token is a real path (contains a slash)', () => {
    const parsed = parseDeliverablePredicates('keep config/app.zzz under 40 lines');
    expect(parsed).toEqual([{ kind: 'max-lines', file: 'config/app.zzz', max: 40, strict: true }]);
  });

  it('does NOT let a comparator word match inside another word', () => {
    expect(parseDeliverablePredicates('big.ts thunder 300 lines')).toEqual([]);
  });

  it('does NOT cross a sentence/segment boundary between file and comparator', () => {
    expect(
      parseDeliverablePredicates('refactor big.ts fully, keep every function under 50 lines'),
    ).toEqual([]);
  });
});

describe('countLines', () => {
  it.each([
    ['', 0],
    ['a', 1],
    ['a\n', 1],
    ['a\nb', 2],
    ['a\nb\n', 2],
    ['\n', 1],
  ])('counts %j as %i lines (wc -l semantics, no phantom trailing line)', (content, lines) => {
    expect(countLines(content)).toBe(lines);
  });
});

describe('evaluateDeliverablePredicates', () => {
  const max300 = (file: string, strict = true): DeliverablePredicate => ({
    kind: 'max-lines',
    file,
    max: 300,
    strict,
  });

  it('returns null when every predicate passes', async () => {
    const vcs = fakeVcs({ 'src/a.ts': 'x\n'.repeat(299) });
    expect(await evaluateDeliverablePredicates([max300('src/a.ts')], vcs)).toBeNull();
  });

  it('returns null for an empty predicate list', async () => {
    expect(await evaluateDeliverablePredicates([], fakeVcs({}))).toBeNull();
  });

  it('fails a strict max-lines predicate at exactly the limit', async () => {
    const vcs = fakeVcs({ 'src/a.ts': 'x\n'.repeat(300) });
    const failure = await evaluateDeliverablePredicates([max300('src/a.ts')], vcs);
    expect(failure).toContain('src/a.ts');
    expect(failure).toContain('300 lines at HEAD');
    expect(failure).toContain('under 300');
  });

  it('passes a non-strict max-lines predicate at exactly the limit', async () => {
    const vcs = fakeVcs({ 'src/a.ts': 'x\n'.repeat(300) });
    expect(await evaluateDeliverablePredicates([max300('src/a.ts', false)], vcs)).toBeNull();
  });

  it('fails a non-strict max-lines predicate one past the limit', async () => {
    const vcs = fakeVcs({ 'src/a.ts': 'x\n'.repeat(301) });
    const failure = await evaluateDeliverablePredicates([max300('src/a.ts', false)], vcs);
    expect(failure).toContain('at most 300');
  });

  it('fails when a pathful file is not committed at HEAD', async () => {
    const failure = await evaluateDeliverablePredicates([max300('src/gone.ts')], fakeVcs({}));
    expect(failure).toContain('src/gone.ts');
    expect(failure).toContain('not committed at HEAD');
  });

  it('resolves a pathful token by unique suffix when not committed as written', async () => {
    // The real false-demotion loop: the seed's clause said
    // "flight/intent-claims.ts exists" while the committed path is nested
    // deeper — unambiguous, so it must resolve, not fail.
    const vcs = fakeVcs({ 'apps/dashboard/src/flight/intent-claims.ts': 'x\n' });
    expect(
      await evaluateDeliverablePredicates(
        [{ kind: 'file-exists', file: 'flight/intent-claims.ts' }],
        vcs,
      ),
    ).toBeNull();
  });

  it('reads the SUFFIX-resolved path, not the unresolved token, for a max-lines predicate', async () => {
    // Same unique-suffix resolution as above, but through 'max-lines' this
    // time — that predicate kind is the only caller that actually reads
    // resolveFile's returned `path` (a 'file-exists' predicate never does),
    // so this is the one case that can tell a real resolved path apart from
    // a broken/empty resolution.
    const vcs = fakeVcs({ 'apps/dashboard/src/flight/intent-claims.ts': 'x\n'.repeat(301) });
    const failure = await evaluateDeliverablePredicates([max300('flight/intent-claims.ts')], vcs);
    expect(failure).toContain('apps/dashboard/src/flight/intent-claims.ts');
    expect(failure).toContain('301 lines at HEAD');
  });

  it('fails a pathful token whose suffix matches several committed files', async () => {
    const vcs = fakeVcs({ 'a/flight/x.ts': 'x', 'b/flight/x.ts': 'x' });
    const failure = await evaluateDeliverablePredicates(
      [{ kind: 'file-exists', file: 'flight/x.ts' }],
      vcs,
    );
    expect(failure).toContain('2 committed files');
    expect(failure).toContain('full repo-relative path');
  });

  it('resolves a bare basename to its unique committed path', async () => {
    const vcs = fakeVcs({ 'apps/web/shell.ts': 'x\n'.repeat(4956) });
    const failure = await evaluateDeliverablePredicates([max300('shell.ts')], vcs);
    expect(failure).toContain('apps/web/shell.ts');
    expect(failure).toContain('4956 lines at HEAD');
  });

  it('resolves a bare basename committed at the repo root', async () => {
    const vcs = fakeVcs({ 'shell.ts': 'x\n'.repeat(10) });
    expect(await evaluateDeliverablePredicates([max300('shell.ts')], vcs)).toBeNull();
  });

  it('fails when a bare basename matches no committed file', async () => {
    const failure = await evaluateDeliverablePredicates([max300('shell.ts')], fakeVcs({}));
    expect(failure).toContain('shell.ts');
    expect(failure).toContain('matches no committed file');
  });

  it('fails when a bare basename is ambiguous, telling the seeder to use a full path', async () => {
    const vcs = fakeVcs({ 'a/shell.ts': 'x', 'b/shell.ts': 'x' });
    const failure = await evaluateDeliverablePredicates([max300('shell.ts')], vcs);
    expect(failure).toContain('2 committed files');
    expect(failure).toContain('full repo-relative path');
  });

  it('passes a file-exists predicate for a committed file', async () => {
    const vcs = fakeVcs({ 'docs/spec.md': '# spec' });
    expect(
      await evaluateDeliverablePredicates([{ kind: 'file-exists', file: 'docs/spec.md' }], vcs),
    ).toBeNull();
  });

  it('fails a file-exists predicate for a missing file', async () => {
    const failure = await evaluateDeliverablePredicates(
      [{ kind: 'file-exists', file: 'docs/spec.md' }],
      fakeVcs({}),
    );
    expect(failure).toContain('docs/spec.md');
    expect(failure).toContain('not committed at HEAD');
  });

  it('returns the FIRST failure when several predicates fail', async () => {
    const vcs = fakeVcs({});
    const failure = await evaluateDeliverablePredicates(
      [max300('src/a.ts'), { kind: 'file-exists', file: 'docs/b.md' }],
      vcs,
    );
    expect(failure).toContain('src/a.ts');
  });
});
