// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const NUL = String.fromCharCode(0);

/**
 * Filenames that are almost always a private key or credential file, caught
 * even when the content is binary/encrypted and would never match a content
 * pattern below.
 */
const SECRET_FILENAME_PATTERNS: readonly RegExp[] = [
  /^id_(rsa|dsa|ecdsa|ed25519)$/,
  /\.(pem|pfx|p12|ppk|key)$/i,
  /^\.env(\..+)?$/,
  /^credentials\.json$/i,
  /(^|[._-])service[._-]account.*\.json$/i,
];

/**
 * High-confidence secret content patterns — format-based, mirrors
 * scripts/ci/secret-scan.mjs, to keep false positives near zero.
 */
const SECRET_CONTENT_PATTERNS: readonly RegExp[] = [
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[posru]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bsk_live_[0-9a-zA-Z]{24,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{48}\b/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/,
  /:\/\/[^/\s:@]+:[^/\s:@]+@/,
];

// Not gitignore-aware: a fresh onboarding target may have no .gitignore at
// all (the exact case this guard exists for), so these two are hardcoded
// rather than deferred to ignore rules that might not exist yet.
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules']);

// Secrets are always tiny; skip larger files rather than slurp them whole.
const MAX_SCANNED_FILE_BYTES = 1024 * 1024;

function looksLikeSecretFilename(name: string): boolean {
  return SECRET_FILENAME_PATTERNS.some((re) => re.test(name));
}

function looksLikeSecretContent(text: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((re) => re.test(text));
}

function readSmallFileSafely(path: string): string | null {
  // prettier-ignore
  try {
    // Stryker disable next-line StringLiteral: an empty encoding makes
    // readFileSync return a Buffer instead of a string, but `.includes()`
    // and every regex `.test()` downstream implicitly coerce via
    // `Buffer.prototype.toString()` (default 'utf8') to the exact same
    // text — no observable behavior differs from decoding here directly.
    const text = readFileSync(path, 'utf8');
    return text.includes(NUL) ? null : text; // NUL byte -> binary, not text
  }
  // Stryker disable next-line BlockStatement: an empty catch returns
  // `undefined` instead of `null`, but the only caller's guard is `text
  // !== null` (see the matching disable comment in walk() below) — so
  // `undefined` takes the exact same "proceed to scan" branch, then
  // `looksLikeSecretContent(undefined)` coerces to the literal string
  // "undefined", which none of SECRET_CONTENT_PATTERNS can match. Both
  // values are unreachable dead ends with no test-observable difference.
  catch {
    return null; // unreadable/unindexable: device file, permission error, race, ...
  }
}

function walk(root: string, dir: string, flagged: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // dir vanished, permission denied, or never existed — nothing to scan
  }

  for (const entry of entries) {
    // Never follow symlinks: skips dangling targets cleanly and keeps the walk
    // inside root instead of wandering wherever a link points.
    if (entry.isSymbolicLink()) continue;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) walk(root, full, flagged);
      continue;
    }
    if (!entry.isFile()) continue; // device/socket/fifo/etc. — not indexable content

    const rel = relative(root, full).split(sep).join('/');

    if (looksLikeSecretFilename(entry.name)) {
      flagged.push(rel);
      continue;
    }

    let size: number;
    try {
      size = lstatSync(full).size;
    } catch {
      continue;
    }
    if (size > MAX_SCANNED_FILE_BYTES) continue;

    const text = readSmallFileSafely(full);
    // Stryker disable next-line ConditionalExpression: dropping the `text
    // !== null` guard only changes behavior when `text` is `null`
    // (unreadable/binary), and `looksLikeSecretContent(null)` coerces to
    // the literal string "null" — unmatchable by any SECRET_CONTENT_PATTERNS
    // entry, so the outcome (never flagged) is identical either way.
    if (text !== null && looksLikeSecretContent(text)) flagged.push(rel);
  }
}

/**
 * Walks a directory tree for files that are almost certainly a credential or
 * private key, so the baseline ritual can refuse to stage them (a
 * gitignore-less onboarding target has nothing else standing between `git add
 * -A` and a secret entering history). Every filesystem op is defensive: any
 * entry this process can't safely stat/read is silently skipped rather than
 * aborting the whole scan.
 *
 * @returns repo-relative, forward-slash, sorted paths of flagged files.
 */
export function scanForSecrets(root: string): string[] {
  const flagged: string[] = [];
  walk(root, root, flagged);
  return flagged.sort();
}
