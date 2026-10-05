// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * GH READ CACHE — one short-lived cache for every `gh` read the dashboard
 * makes, at the exec seam everything shares (`realCliExec` in cli-probe.ts).
 *
 * On 2026-10-05 the dashboard's GitHub panels (collaboration groups, the
 * routing console, PR review, CI status, the pool) ran ~24 `gh` calls in 40
 * seconds — mostly the same four `gh issue list … --limit 1000 --json
 * …comments` reads from several panels and browser tabs — and drained the
 * operator's whole hourly GraphQL quota. The landing ritual's own
 * `gh pr create` then failed on "API rate limit already exceeded".
 *
 * The rules, each one tested:
 * - only a recognised READ of the `gh` binary is cached (list/view/status
 *   shapes, and `gh api` with no body and no non-GET method);
 * - identical reads within the TTL reach GitHub once; concurrent identical
 *   reads share one call;
 * - a failed read is never stored, so a rate-limited answer is retried;
 * - every other `gh` call, and `git push`, counts as a write: it passes
 *   straight through and clears the whole cache, and a read that was in
 *   flight across a write is neither stored nor joined — the dashboard never
 *   shows the before-state of its own action.
 */

import type { CliExec, CliRun } from './cli-probe.js';

/** `gh <noun> <verb>` pairs that only read. */
const READ_PAIRS = new Set([
  'issue list',
  'issue view',
  'issue status',
  'pr list',
  'pr view',
  'pr checks',
  'pr diff',
  'pr status',
  'run list',
  'run view',
  'workflow list',
  'workflow view',
  'repo view',
  'label list',
  'release list',
  'release view',
  'search issues',
  'search prs',
  'search repos',
  'search code',
  'search commits',
  'auth status',
]);

/** A `gh api` argument that gives the request a body (and so defaults it to POST). */
const BODY_ARG = /^(?:-f|-F|--field|--raw-field|--input)$|^--(?:raw-)?field=|^--input=/;

/** The executable's own name, lower-cased, whichever separator its path uses. */
function binName(bin: string): string {
  return bin.slice(Math.max(bin.lastIndexOf('/'), bin.lastIndexOf('\\')) + 1).toLowerCase();
}

function isGhBinary(bin: string): boolean {
  const name = binName(bin);
  return name === 'gh' || name === 'gh.exe';
}

/** True when a `gh api` argv names no method, or names GET. */
function namesOnlyGet(args: readonly string[]): boolean {
  for (const [i, arg] of args.entries()) {
    if (arg === '-X' || arg === '--method') return args[i + 1]?.toUpperCase() === 'GET';
    if (arg.startsWith('-X')) return arg.slice(2).toUpperCase() === 'GET';
    if (arg.startsWith('--method=')) return arg.slice('--method='.length).toUpperCase() === 'GET';
  }
  return true;
}

function isApiRead(args: readonly string[]): boolean {
  return args.length > 1 && !args.some((a) => BODY_ARG.test(a)) && namesOnlyGet(args);
}

/** True when this exec call only reads GitHub and may be served from cache. */
export function isGhRead(bin: string, args: readonly string[]): boolean {
  if (!isGhBinary(bin)) return false;
  if (args[0] === 'api') return isApiRead(args);
  return READ_PAIRS.has(args.slice(0, 2).join(' '));
}

/** True for a call that changes what GitHub would answer. */
function isWrite(bin: string, args: readonly string[]): boolean {
  if (isGhBinary(bin)) return !isGhRead(bin, args);
  const name = binName(bin);
  return (name === 'git' || name === 'git.exe') && args[0] === 'push';
}

export interface GhReadCacheOptions {
  /** How long a successful read is served from cache. 0 disables storing. */
  readonly ttlMs: number;
  /** Clock seam for tests. */
  readonly now?: () => number;
}

interface Entry {
  readonly at: number;
  readonly result: CliRun;
}

/** Wrap an exec so identical `gh` reads share one call within `ttlMs`. */
export function withGhReadCache(exec: CliExec, opts: GhReadCacheOptions): CliExec {
  const now = opts.now ?? Date.now;
  const done = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<CliRun>>();
  // Replaced by every write; a read started under an older epoch is returned
  // to its own caller but never stored, and nothing newer joins it.
  let epoch: object = {};

  return async (bin, args) => {
    if (isWrite(bin, args)) {
      epoch = {};
      done.clear();
      inFlight.clear();
      return exec(bin, args);
    }
    if (!isGhRead(bin, args)) return exec(bin, args);

    const key = JSON.stringify([bin, ...args]);
    const hit = done.get(key);
    if (hit !== undefined && now() - hit.at < opts.ttlMs) return hit.result;

    const pending = inFlight.get(key);
    if (pending !== undefined) return pending;

    const startedIn = epoch;
    const call = exec(bin, args).then((result) => {
      if (inFlight.get(key) === call) inFlight.delete(key);
      if (result.code === 0 && startedIn === epoch) done.set(key, { at: now(), result });
      return result;
    });
    inFlight.set(key, call);
    return call;
  };
}
