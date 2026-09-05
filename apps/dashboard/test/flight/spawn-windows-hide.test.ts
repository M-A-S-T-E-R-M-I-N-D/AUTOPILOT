// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Windows console-window guard: every child process this repo's production
 * source spawns must pass `windowsHide: true`.
 *
 * Node defaults `windowsHide` to false, so on Windows a spawned console
 * program can flash up its own console window. The dashboard's rituals spawn
 * git constantly — `flight/doc-freshness.ts` runs one `git log` PER DOC PATH
 * — so a single freshness sweep produced a burst of windows appearing and
 * vanishing across the operator's screen, twice reported from the field as
 * "a ton of git cmd windows opening and closing". Nothing is broken by it,
 * which is exactly why it drifted: no test failed, no log line appeared, and
 * the flight it interrupted still shipped.
 *
 * The convention was already there — 27 of 35 call sites passed the flag, and
 * `adapters/claude-cli.test.ts` pins it for the CLI spawn specifically. What
 * was missing is a standing check, so new call sites keep inheriting it. Same
 * repo-wide tripwire shape as `source-encoding.test.ts`, and for the same
 * reason: a recurring class of drift that no feature test can see.
 *
 * Scope is production source — every `src` directory under `apps/` and
 * `packages/`. Test and script spawns are deliberately out: they run in a
 * terminal the operator already has open, and holding fixtures to a UX rule
 * would be noise, not signal.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

/** The `node:child_process` exports that accept a `windowsHide` option.
 *  `exec`/`execSync` are included even though they run through a shell — the
 *  shell is itself the console program that would show a window. */
const SPAWNERS = ['execFile', 'execFileSync', 'spawn', 'spawnSync', 'exec', 'execSync'];

/**
 * The local names in `file` that actually refer to a `node:child_process`
 * spawner, honouring `as` aliases.
 *
 * Matching on the bare name instead would be wrong in this repo specifically:
 * `exec` is also the name of the injected `CliExec` port that
 * `connection/cli-probe.ts` defines and a dozen modules take as a parameter
 * (`issue-triage.ts`, `gh-probe.ts`, `backlog.ts` …). Those calls dispatch to
 * an already-hardened implementation and have no options object at all, so
 * flagging them would be pure noise — the kind that gets a guard deleted.
 */
function spawnerNames(source: string): string[] {
  const names: string[] = [];
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]node:child_process['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    for (const clause of (m[1] ?? '').split(',')) {
      const parts = clause.trim().split(/\s+as\s+/);
      const imported = (parts[0] ?? '').trim();
      const local = (parts[1] ?? parts[0] ?? '').trim();
      if (SPAWNERS.includes(imported) && local !== '') names.push(local);
    }
  }
  return names;
}

/** Production sources only — see the module note on scope. */
function productionSourceFiles(): string[] {
  const out = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      'apps/*/src/*.ts',
      'apps/*/src/**/*.ts',
      'packages/*/src/*.ts',
      'packages/*/src/**/*.ts',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true },
  );
  return out.split('\0').filter((f) => f !== '');
}

/**
 * Blank out comments and string/template literals, preserving length and line
 * structure so reported offsets still map back to the real file. Without this
 * the scan trips over prose — `control/types.ts`'s "the built server entry to
 * spawn (a local file)" and `web/stat-tiles.ts`'s "instead of a cold spawn ("
 * both read as call sites to a naive regex.
 */
function blankNonCode(source: string): string {
  const out = source.split('');
  const BACKSLASH = String.fromCharCode(92);
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      blank(i, end);
      i = end;
      continue;
    }
    if (two === '/*') {
      let end = source.indexOf('*/', i + 2);
      end = end === -1 ? source.length : end + 2;
      blank(i, end);
      i = end;
      continue;
    }
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let k = i + 1;
      while (k < source.length) {
        if (source[k] === BACKSLASH) {
          k += 2;
          continue;
        }
        if (source[k] === ch) break;
        // An unterminated single/double quote is a line-scoped literal; bail
        // at the newline rather than blanking the rest of the file.
        if (ch !== '`' && source[k] === '\n') break;
        k += 1;
      }
      blank(i, Math.min(k + 1, source.length));
      i = Math.min(k + 1, source.length);
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** The source between a call's opening paren and its matching close, so the
 *  check reads the actual argument list rather than a fixed-size window that
 *  could spill into the next statement or stop short of a long options
 *  object. */
function callArguments(code: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(openParen + 1, i);
    }
  }
  return code.slice(openParen + 1);
}

/**
 * Local `const` names whose initializer sets `windowsHide`, so a call that
 * passes its options as a variable still counts as compliant.
 *
 * `adapters/claude-cli.ts` is exactly this shape: it builds an `execOpts`
 * object (which does set the flag, and `adapters/claude-cli.test.ts` asserts
 * it) and hands that to `execFile`, because the `detached` option needs a cast
 * the inline position cannot express. A guard that only reads inline literals
 * would call the repo's most carefully-hardened spawn a violation.
 */
function optionsBindingsWithWindowsHide(code: string): string[] {
  const names: string[] = [];
  const declRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(code)) !== null) {
    // The initializer's brace is the one the pattern itself matched — NOT the
    // first `{` after `const`, which for an annotated declaration belongs to
    // the type (`const execOpts: A & { detached: boolean } = { … }`).
    const brace = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = brace; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          if (code.slice(brace, i).includes('windowsHide')) names.push(m[1] ?? '');
          break;
        }
      }
    }
  }
  return names.filter((n) => n !== '');
}

interface Offender {
  readonly file: string;
  readonly line: number;
  readonly spawner: string;
}

function spawnsWithoutWindowsHide(file: string): Offender[] {
  const source = readFileSync(join(REPO_ROOT, file), 'utf8');
  const names = spawnerNames(source);
  if (names.length === 0) return [];

  const code = blankNonCode(source);
  const optionsBindings = optionsBindingsWithWindowsHide(code);
  const offenders: Offender[] = [];
  const pattern = new RegExp('\\b(' + names.join('|') + ')\\s*\\(', 'g');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(code)) !== null) {
    const openParen = code.indexOf('(', m.index);
    // A re-export or a type position (`typeof spawn`) never launches anything.
    const before = code.slice(Math.max(0, m.index - 12), m.index);
    if (/(?:function|typeof)\s+$/.test(before)) continue;
    const args = callArguments(code, openParen);
    if (args.includes('windowsHide')) continue;
    if (optionsBindings.some((n) => new RegExp('\\b' + n + '\\b').test(args))) continue;
    offenders.push({
      file,
      line: source.slice(0, m.index).split('\n').length,
      spawner: m[1] ?? '',
    });
  }
  return offenders;
}

describe('spawned children hide their Windows console', () => {
  it('every production spawn passes windowsHide', () => {
    const files = productionSourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap(spawnsWithoutWindowsHide);

    expect(
      offenders.map((o) => `${o.file}:${o.line} ${o.spawner}() is missing windowsHide: true`),
    ).toEqual([]);
  });

  it('the scan reads code, not prose — a spawner named in a comment or string is not a call site', () => {
    // Guards the guard: both shapes below are real, and both appear verbatim
    // in the tree (control/types.ts, web/stat-tiles.ts).
    const decoys = [
      '// The built server entry to spawn (a local file — never a remote).',
      "const tip = 'instead of a cold spawn (' + n + ' cold to compare)';",
      '/* execFileSync( in a block comment */',
    ].join('\n');
    const code = blankNonCode(decoys);

    expect(code).not.toContain('spawn (');
    expect(code).not.toContain('execFileSync(');
    expect(code).toHaveLength(decoys.length);
  });

  it('reads the whole argument list, so a windowsHide past a long options object still counts', () => {
    const code = 'execFile(bin, args, { cwd, env, maxBuffer: 64, timeout, windowsHide: true }, cb)';

    expect(callArguments(code, code.indexOf('('))).toContain('windowsHide');
  });
});
