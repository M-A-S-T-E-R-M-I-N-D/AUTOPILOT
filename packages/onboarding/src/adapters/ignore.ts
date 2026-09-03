// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Directories never worth walking for gate detection or indexing. Includes
 * AUTOPILOT's own working dirs (`.autopilot`, `.autopilot-run`) — flying the
 * tool on itself must never index the live SQLite DB or `connection.json` (which
 * holds auth secrets in key/token mode) into the search index. Also skips other
 * VCS/editor/build dirs so the index stays cheap and clean.
 *
 * `reports` (EVAL 08-27 §3.8, lever 8): generated Stryker mutation HTML output
 * was missing here, so it got walked and indexed like source — 64 reports
 * (11 MB) multiplied 4.36x by trigram FTS tokenization into 82 MB of the
 * onboarding DB's 137 MB, root-caused and verified against a live index.
 */
export const IGNORE_DIRS: ReadonlySet<string> = new Set([
  '.git',
  '.hg',
  '.svn',
  '.autopilot',
  '.autopilot-run',
  'node_modules',
  'dist',
  'coverage',
  'reports',
  '.next',
  'target',
  'build',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);
