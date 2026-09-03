// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n untagged-string inventory (board web-mt5aikql-j69e6i, "unblocks the
 * sweep tail" of the i18n foundation board web-msnsndki-dz3vn1): a
 * report-only scan of the served dashboard shell
 * (`apps/dashboard/src/web/**‍/*.ts`, the client-rendered HTML this app
 * ships — masthead chrome plus the much larger fleet-card surface) for
 * static, human-readable strings that look translatable but carry none of
 * the three markers `features/locale.ts`'s `translateDom()` sweeps —
 * `data-i18n` (text content), `data-i18n-aria` (`aria-label`), or
 * `data-i18n-placeholder` (`placeholder`). Each i18n slice so far has found
 * its next targets by hand-grepping a 5000+ line file; this script turns
 * that rediscovery into one `pnpm i18n:untagged` call.
 *
 * Detection is a regex tag scanner, not a real HTML/JS parser — deliberately
 * matching the CI-script conventions already in `scripts/ci/` (plain
 * `node:fs`, exported pure functions, a thin `main()`). It flags:
 *   - `aria-label="…"` / `placeholder="…"` attributes with a literal value
 *     (no `${…}` interpolation) whose tag lacks the matching
 *     `data-i18n-aria=` / `data-i18n-placeholder=` marker;
 *   - inner text of a small allowlist of tags that only ever hold
 *     short, static UI labels in this codebase (button/summary/heading/
 *     label/dt/dd/option/caption/legend) whose tag lacks `data-i18n=`.
 * It is deliberately conservative — text spanning multiple lines, starting
 * with a backtick, or containing `${…}` is skipped, since those patterns
 * match doc-comment prose (` * the \`<h4>\` class…`) and dynamic markup far
 * more often than a real untagged UI string. That trades recall for a
 * report a human can act on directly instead of re-filtering by hand;
 * `data-tip` hover text is out of scope by design (STRINGS.ts documents it
 * as staying English-only, same as the per-project fleet-card hover text).
 * Report-only: unlike `scripts/ci/*`, this never exits non-zero — it is not
 * wired into `pnpm verify`, just a standalone discovery aid for planning the
 * next i18n slice.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = 'apps/dashboard/src/web';

/** Tags whose direct inner text is, in this codebase, always a short static
 *  UI label rather than markup/prose — safe to flag when untagged. */
const STATIC_TEXT_TAGS = new Set([
  'button',
  'summary',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'label',
  'dt',
  'dd',
  'option',
  'caption',
  'legend',
]);

const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^<>]|\n)*?)(\/?)>([^<]*)/g;
const ARIA_LABEL_RE = /\baria-label="([^"$]*)"/;
const PLACEHOLDER_RE = /\bplaceholder="([^"$]*)"/;

const LETTER_RE = new RegExp('[A-Za-z\\u0590-\\u05FF]');

/** @param {string} text @returns {boolean} */
function looksTranslatable(text) {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  if (trimmed.includes('\n')) return false;
  if (trimmed.startsWith('`')) return false;
  if (trimmed.includes('${')) return false;
  return LETTER_RE.test(trimmed);
}

/** @param {string} source @param {number} index @returns {number} */
function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * @param {string} source
 * @param {string} file
 * @returns {Array<{ file: string, line: number, kind: 'text' | 'aria-label' | 'placeholder', tag: string, text: string }>}
 */
export function scanSource(source, file) {
  /** @type {Array<{ file: string, line: number, kind: 'text' | 'aria-label' | 'placeholder', tag: string, text: string }>} */
  const findings = [];
  for (const match of source.matchAll(TAG_RE)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const trailingText = match[4];
    const line = lineOf(source, match.index);

    const ariaLabelMatch = ARIA_LABEL_RE.exec(attrs);
    if (
      ariaLabelMatch &&
      !attrs.includes('data-i18n-aria=') &&
      looksTranslatable(ariaLabelMatch[1])
    ) {
      findings.push({ file, line, kind: 'aria-label', tag, text: ariaLabelMatch[1].trim() });
    }

    const placeholderMatch = PLACEHOLDER_RE.exec(attrs);
    if (
      placeholderMatch &&
      !attrs.includes('data-i18n-placeholder=') &&
      looksTranslatable(placeholderMatch[1])
    ) {
      findings.push({ file, line, kind: 'placeholder', tag, text: placeholderMatch[1].trim() });
    }

    if (
      STATIC_TEXT_TAGS.has(tag) &&
      !attrs.includes('data-i18n=') &&
      looksTranslatable(trailingText)
    ) {
      findings.push({ file, line, kind: 'text', tag, text: trailingText.trim() });
    }
  }
  return findings;
}

/** @param {string} dir @returns {string[]} */
function listTsFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * @param {string} root
 * @returns {Array<{ file: string, line: number, kind: 'text' | 'aria-label' | 'placeholder', tag: string, text: string }>}
 */
export function scanRoot(root) {
  return listTsFiles(root)
    .sort()
    .flatMap((file) => scanSource(readFileSync(file, 'utf8'), relative(root, file)));
}

/**
 * @param {ReturnType<typeof scanRoot>} findings
 * @param {string} root
 */
export function formatReport(findings, root) {
  if (findings.length === 0) {
    return `i18n:untagged: 0 untagged string(s) found under ${root}`;
  }
  const lines = findings.map((f) => `  - ${f.file}:${f.line} [${f.kind}] <${f.tag}> "${f.text}"`);
  return [
    `i18n:untagged: ${findings.length} untagged string(s) found under ${root}:`,
    ...lines,
    '',
    'Report-only — not a gate. Tag with data-i18n / data-i18n-aria / data-i18n-placeholder',
    "and add the key to packages/tokens/src/strings.ts's STRINGS table to close a finding.",
  ].join('\n');
}

function main() {
  const root = process.argv[2] ?? DEFAULT_ROOT;
  const findings = scanRoot(root);
  console.log(formatReport(findings, root));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
