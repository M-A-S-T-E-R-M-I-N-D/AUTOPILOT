// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * validate-no-personal-paths — fail CI if a tracked file leaks a personal
 * identifier (a user-home directory carrying a username, or a personal-provider
 * email address). Mandate: no private data, ever (MASTER-PLAN §9).
 *
 * Scope note: bare project drive-paths in the research docs (e.g. reference
 * implementations named on disk) are NOT flagged — they carry no username/PII.
 * We flag home directories and personal emails, which is where PII actually
 * leaks. The scanner directory is excluded (it contains these patterns).
 *
 * `windows-drive-path` is deliberately broad (see below) since an escaped
 * double-backslash Windows path in TS/JS source — `'C:\\Users\\realname'` —
 * does NOT match `windows-user-home`'s single-`[\\/]` separator, so the
 * drive-path catch-all is the only thing that still sees it. That breadth
 * means it also catches genuinely safe uses the browse-folder feature (FLY-BAR
 * folder picker) legitimately needs to write literally: a bare drive root
 * (`C:\`, `Z:\`, …, exactly what `browse-folder.ts`'s `listWindowsDrives`
 * enumerates) and this repo's own placeholder home directory
 * (`C:\Users\operator`) used in its fixtures/docs — neither carries any real
 * machine or personal info. `SAFE_WINDOWS_DRIVE_PATH` exempts exactly those
 * two shapes; anything with a real segment beyond them still fails.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUL = String.fromCharCode(0);

// A bare drive root (`C:\`, `Z:/`, …, optionally doubled by JS-string escaping)
// or this repo's own neutral placeholder home (`C:\Users`, `C:\Users\operator`,
// `C:\Users\operator\repo`, …) — never a real username, so a path rooted at it
// is fully anchored end-to-end: anything with MORE content (a real name) fails.
const SAFE_WINDOWS_DRIVE_PATH =
  /^[A-Za-z]:[\\/]{1,2}(?:Users(?:[\\/]{1,2}operator(?:[\\/]{1,2}[A-Za-z0-9._-]*)*)?)?[\\/]{0,2}$/i;

/** @type {{ id: string, re: RegExp, isSafe?: (match: string) => boolean }[]} */
const RULES = [
  // Windows user home with a username segment: C:\Users\<name> or C:/Users/<name>
  { id: 'windows-user-home', re: /[A-Za-z]:[\\/]Users[\\/][A-Za-z0-9._-]+/ },
  // macOS user home: /Users/<name>
  { id: 'macos-user-home', re: /(?<![A-Za-z0-9])\/Users\/[A-Za-z0-9._-]+/ },
  // Linux user home: /home/<name>
  { id: 'linux-user-home', re: /(?<![A-Za-z0-9])\/home\/[A-Za-z0-9._-]+/ },
  // WSL (/mnt/c/Users/<name>) or Git-Bash/MSYS (/c/Users/<name>) mounted Windows home
  { id: 'wsl-user-home', re: /\/(?:mnt\/)?[a-z]\/Users\/[A-Za-z0-9._-]+/i },
  // Any Windows/DOS drive-absolute path (C:\…, z:/…) leaks the local machine
  // layout. The lookbehind excludes URL schemes (https://, file://, ssh://, …)
  // AND a preceding backslash: a real path is never directly preceded by a raw
  // backslash, but a regex/string escape sequence (`\s:`, `\d:`, …) is — e.g.
  // `/\s:\S/` in guard.ts reads as "s:\S" without this exclusion, a false
  // positive on the `\s` escape's letter, not a drive letter at all.
  // The match is extended to the full contiguous path so isSafe can tell a
  // bare/placeholder root from a real leaked path (see module docstring).
  {
    id: 'windows-drive-path',
    re: /(?<![A-Za-z\\])[A-Za-z]:[\\/](?:[\\/A-Za-z0-9._-])*/,
    isSafe: (match) => SAFE_WINDOWS_DRIVE_PATH.test(match),
  },
  // Personal-provider email addresses (PII)
  {
    id: 'personal-email',
    re: /[A-Za-z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo|icloud|protonmail|proton|live|aol)\.[A-Za-z.]{2,}/i,
  },
  // The founder's unreleased predecessor product must never be named in this
  // public repo (operator directive 2026-08-28; scrubbed the same day —
  // 24 mentions across 10 docs replaced with "the internal predecessor").
  { id: 'unreleased-product-name', re: /SOLSAY/i },
];

// Exclude only the hand-audited scanner files by exact path (they contain these
// patterns as detection rules). A prefix exclusion would silently exempt any
// future file dropped under scripts/ci/ — an allow-list scans new files by default.
const EXCLUDED_FILES = new Set([
  'scripts/ci/secret-scan.mjs',
  'scripts/ci/validate-no-personal-paths.mjs',
  'scripts/ci/validate-configs.mjs',
  'scripts/ci/validate-spdx-headers.mjs',
]);
const BINARY_EXT = /\.(png|jpe?g|gif|ico|woff2?|ttf|eot|pdf|zip|gz|tgz|db|wasm|node)$/i;

/** @returns {string[]} */
function listTrackedFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out.split(NUL).filter(Boolean);
}

/**
 * Scan one file's text for personal-identifier patterns. Pure — no fs/git
 * access — so it can be unit-tested directly against fixture strings, same
 * shape as secret-scan.mjs's findSecrets().
 * @param {string} text
 * @returns {{ line: number, rule: string, match: string }[]}
 */
export function findPersonalPaths(text) {
  /** @type {{ line: number, rule: string, match: string }[]} */
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (m && !(rule.isSafe?.(m[0]) ?? false)) {
        findings.push({ line: i + 1, rule: rule.id, match: m[0] });
      }
    }
  }
  return findings;
}

function main() {
  const files = listTrackedFiles();
  /** @type {{ file: string, line: number, rule: string, match: string }[]} */
  const findings = [];

  for (const file of files) {
    if (EXCLUDED_FILES.has(file)) continue;
    if (BINARY_EXT.test(file)) continue;

    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes(NUL)) continue;

    for (const finding of findPersonalPaths(text)) {
      findings.push({ file, ...finding });
    }
  }

  if (findings.length > 0) {
    console.error(`no-personal-paths FAILED: ${findings.length} personal identifier(s) found:`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.match}`);
    }
    console.error('\nReplace with a neutral placeholder — this repo carries zero private data.');
    process.exit(1);
  }

  console.log(`no-personal-paths OK: clean (${files.length} tracked files scanned)`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
