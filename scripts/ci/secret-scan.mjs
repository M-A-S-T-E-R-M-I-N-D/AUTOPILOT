// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * secret-scan — fail CI if a high-confidence credential pattern appears in a
 * tracked file. Deliberately format-based (not entropy/keyword heuristics) to
 * keep false positives near zero on our own source (PATTERNS-AND-STANDARDS §2).
 *
 * The scanner directory itself is excluded because it *contains* these patterns
 * as detection rules; those files are hand-audited.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUL = String.fromCharCode(0);

/** @type {{ id: string, re: RegExp }[]} */
const RULES = [
  { id: 'private-key-block', re: /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/ },
  { id: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\bgh[posru]_[A-Za-z0-9]{36,}\b/ },
  { id: 'github-fine-grained-pat', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'stripe-secret-key', re: /\bsk_live_[0-9a-zA-Z]{24,}\b/ },
  { id: 'anthropic-api-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'openai-api-key', re: /\bsk-[A-Za-z0-9]{48}\b/ },
  { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  {
    id: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    id: 'slack-webhook',
    re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/,
  },
  {
    id: 'url-embedded-credentials',
    re: /:\/\/[^/\s:@]+:[^/\s:@]+@/,
  },
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

/** @returns {string[]} repo-relative tracked file paths */
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
 * Scan one file's text for credential patterns. Pure — no fs/git access — so
 * it can be unit-tested directly against fixture strings.
 * @param {string} text
 * @returns {{ line: number, rule: string }[]}
 */
export function findSecrets(text) {
  /** @type {{ line: number, rule: string }[]} */
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        findings.push({ line: i + 1, rule: rule.id });
      }
    }
  }
  return findings;
}

function main() {
  const files = listTrackedFiles();
  /** @type {{ file: string, line: number, rule: string }[]} */
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
    if (text.includes(NUL)) continue; // skip binary files

    for (const finding of findSecrets(text)) {
      findings.push({ file, ...finding });
    }
  }

  if (findings.length > 0) {
    console.error(`secret-scan FAILED: ${findings.length} potential secret(s) found:`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
    }
    console.error('\nRemove the secret, rotate it, and use the user keychain / env vars instead.');
    process.exit(1);
  }

  console.log(`secret-scan OK: clean (${files.length} tracked files scanned)`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
