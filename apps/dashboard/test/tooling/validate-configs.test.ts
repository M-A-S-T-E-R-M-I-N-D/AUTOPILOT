// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure helpers of scripts/ci/validate-configs.mjs:
 * findUnpinnedActions() (check #8, OpenSSF Scorecard "Pinned-Dependencies"),
 * the CI gate that fails a run if a `.github/workflows/*.yml` step floats on a
 * mutable tag/branch instead of a full commit SHA, and stripJsonComments()
 * (check #1's JSONC → JSON pass). `main()` itself stays unimported — it
 * shells out to `git ls-files` and reads the whole tree, same stance
 * apps/dashboard/test/tooling/secret-scan.test.ts takes for its sibling
 * script. Both helpers are mutation-tested
 * (config/mutation/stryker.ci-validate-configs.config.mjs).
 */
import { describe, it, expect } from 'vitest';
import {
  findUnpinnedActions,
  stripJsonComments,
} from '../../../../scripts/ci/validate-configs.mjs';

describe('findUnpinnedActions', () => {
  it('returns no findings for text with no uses: steps at all', () => {
    expect(findUnpinnedActions('name: CI\non:\n  push:\n')).toEqual([]);
  });

  it('accepts a full 40-hex commit SHA pin (legit shape, must NOT flag)', () => {
    const text = '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
    expect(findUnpinnedActions(text)).toEqual([]);
  });

  it('accepts an UPPERCASE 40-hex commit SHA pin (legit shape, must NOT flag)', () => {
    const text = '      - uses: actions/checkout@3D3C42E5AAC5BA805825DA76410C181273BA90B1';
    expect(findUnpinnedActions(text)).toEqual([]);
  });

  it('accepts a local action with no upstream ref to pin (legit shape, must NOT flag)', () => {
    expect(findUnpinnedActions('      - uses: ./.github/actions/my-local-action')).toEqual([]);
  });

  it('accepts a docker:// action with no upstream ref to pin (legit shape, must NOT flag)', () => {
    expect(findUnpinnedActions('      - uses: docker://alpine:3.18')).toEqual([]);
  });

  it('flags a floating version tag instead of a commit SHA', () => {
    const text = '      - uses: actions/checkout@v7';
    expect(findUnpinnedActions(text)).toEqual([
      { ref: 'actions/checkout@v7', reason: 'is not pinned to a full commit SHA (found "v7")' },
    ]);
  });

  it('flags a floating branch ref instead of a commit SHA', () => {
    const text = '      - uses: actions/checkout@main';
    expect(findUnpinnedActions(text)).toEqual([
      {
        ref: 'actions/checkout@main',
        reason: 'is not pinned to a full commit SHA (found "main")',
      },
    ]);
  });

  it('flags an action with no @ref at all', () => {
    const text = '      - uses: actions/checkout';
    expect(findUnpinnedActions(text)).toEqual([
      { ref: 'actions/checkout', reason: 'has no @ref — pin it to a full commit SHA' },
    ]);
  });

  it('flags a short/invalid hex string that is not a full 40-char SHA', () => {
    const text = '      - uses: actions/checkout@abc123';
    expect(findUnpinnedActions(text)).toEqual([
      {
        ref: 'actions/checkout@abc123',
        reason: 'is not pinned to a full commit SHA (found "abc123")',
      },
    ]);
  });

  it('collects one finding per unpinned step across multiple lines, carrying the matched ref as evidence', () => {
    const text = [
      '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      '      - uses: pnpm/action-setup@v6',
      '      - uses: ./.github/actions/local',
      '      - uses: actions/setup-node@main',
    ].join('\n');
    expect(findUnpinnedActions(text)).toEqual([
      { ref: 'pnpm/action-setup@v6', reason: 'is not pinned to a full commit SHA (found "v6")' },
      {
        ref: 'actions/setup-node@main',
        reason: 'is not pinned to a full commit SHA (found "main")',
      },
    ]);
  });

  // The boundary cases below each pin one piece of the `uses:` line regex;
  // every one was a surviving hand-planted mutant before it existed.

  it('flags a uses: line that follows the step\'s "- name:" line (the dash is optional)', () => {
    // The shape most of .github/workflows/ci.yml's own steps use — a checker
    // that required `- uses:` would skip every one of them.
    const text = ['      - name: Setup Node', '        uses: actions/setup-node@v7'].join('\n');
    expect(findUnpinnedActions(text)).toEqual([
      { ref: 'actions/setup-node@v7', reason: 'is not pinned to a full commit SHA (found "v7")' },
    ]);
  });

  it('does NOT flag a commented-out step (uses: must start the line)', () => {
    expect(findUnpinnedActions('      # - uses: actions/checkout@v7')).toEqual([]);
  });

  it('flags a bare, unindented uses: line (leading whitespace is optional)', () => {
    expect(findUnpinnedActions('uses: actions/checkout@v7')).toEqual([
      { ref: 'actions/checkout@v7', reason: 'is not pinned to a full commit SHA (found "v7")' },
    ]);
  });

  it('captures the ref past extra whitespace after uses:', () => {
    expect(findUnpinnedActions('      - uses:   actions/checkout@v7')).toEqual([
      { ref: 'actions/checkout@v7', reason: 'is not pinned to a full commit SHA (found "v7")' },
    ]);
  });

  it('still judges the ref after an @ at index 0 rather than calling it missing', () => {
    // `at < 0` is the exact boundary: an @ at position 0 IS an @ref.
    expect(findUnpinnedActions('      - uses: @main')).toEqual([
      { ref: '@main', reason: 'is not pinned to a full commit SHA (found "main")' },
    ]);
  });
});

describe('stripJsonComments', () => {
  it('returns comment-free JSON unchanged', () => {
    const src = '{\n  "a": [1, 2],\n  "b": { "c": true }\n}';
    expect(stripJsonComments(src)).toBe(src);
  });

  it('strips a multi-line block comment with spaces and text inside it', () => {
    expect(stripJsonComments('{/* first line\n   second line */"a": 1}')).toBe('{"a": 1}');
  });

  it('strips two block comments without swallowing the JSON between them', () => {
    expect(stripJsonComments('/* a */{"k": 1}/* b */')).toBe('{"k": 1}');
  });

  it('strips a trailing line comment to end of line, keeping the character before it', () => {
    expect(stripJsonComments('{\n  "a": 1 // note\n}')).toBe('{\n  "a": 1 \n}');
  });

  it('strips a line comment at the very start of the text', () => {
    expect(stripJsonComments('// header\n{"a": 1}')).toBe('\n{"a": 1}');
  });

  it('leaves a // inside a URL string value alone', () => {
    const src = '{"$schema": "https://json.schemastore.org/tsconfig"}';
    expect(stripJsonComments(src)).toBe(src);
  });

  it('drops trailing commas before } and ], with or without whitespace between', () => {
    expect(stripJsonComments('{"a": [1, 2,], "b": 1,\n}')).toBe('{"a": [1, 2], "b": 1\n}');
  });

  // Board ap-muhsnbbf-0: comment and trailing-comma syntax INSIDE a string is
  // data, not syntax. Every tsconfig in this repo carries "src/**/*.ts", whose
  // `/**/` the old regex pass silently stripped to "src*.ts".
  it('leaves a glob string holding /**/ intact (every tsconfig "include" in this repo)', () => {
    const src = '{"include": ["src/**/*.ts", "test/**/*.ts"]}';
    expect(stripJsonComments(src)).toBe(src);
  });

  it('does not open a block comment at a /* inside a string when a real comment follows', () => {
    const src = '{"paths": {"@x/*": ["./src/*"]}, /* note */ "a": 1}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ paths: { '@x/*': ['./src/*'] }, a: 1 });
  });

  it('leaves a // inside a string alone even when no : or quote precedes it', () => {
    const src = '{"pattern": "a//b", "c": 1}';
    expect(stripJsonComments(src)).toBe(src);
  });

  it('keeps a comma before } or ] that sits inside a string', () => {
    const src = '{"a": "x,]", "b": "y, }"}';
    expect(stripJsonComments(src)).toBe(src);
  });

  it('treats an escaped quote as part of the string, not its end', () => {
    const src = '{"a": "say \\"/*\\"\\n and \\\\", /* gone */ "b": "//"}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ a: 'say "/*"\n and \\', b: '//' });
  });

  it('leaves an unterminated string verbatim, comment syntax and all', () => {
    expect(stripJsonComments('{"a": "/* x */')).toBe('{"a": "/* x */');
  });

  it('drops a trailing comma that a comment separates from its closing bracket', () => {
    expect(stripJsonComments('[1, /* last */\n]')).toBe('[1 \n]');
    expect(stripJsonComments('{"a": 1, // last\n}')).toBe('{"a": 1 \n}');
  });

  it('keeps a comma that a comment separates from the next value', () => {
    expect(stripJsonComments('[1, /* next */ 2]')).toBe('[1,  2]');
  });

  it('leaves an unterminated block comment in place so JSON.parse reports it', () => {
    expect(stripJsonComments('{"a": 1} /* open')).toBe('{"a": 1} /* open');
  });

  it('strips a line comment ended by a CR, keeping the CR', () => {
    expect(stripJsonComments('{"a": 1 // note\r\n}')).toBe('{"a": 1 \r\n}');
  });

  it('keeps a lone / that opens no comment', () => {
    expect(stripJsonComments('{"a": 1} /')).toBe('{"a": 1} /');
  });

  it('turns a real tsconfig-style JSONC document into parseable JSON', () => {
    const src = [
      '{',
      '  // Shared compiler options.',
      '  "compilerOptions": {',
      '    "strict": true, /* never relax */',
      '    "outDir": "./dist",',
      '  },',
      '  "references": [{ "path": "./packages/a" },],',
      '}',
    ].join('\n');
    expect(JSON.parse(stripJsonComments(src))).toEqual({
      compilerOptions: { strict: true, outDir: './dist' },
      references: [{ path: './packages/a' }],
    });
  });
});
