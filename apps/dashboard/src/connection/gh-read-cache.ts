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
 *   shapes, and `gh api` without a body or a non-GET method);
 * - identical reads within the TTL reach GitHub once; concurrent identical
 *   reads share one call;
 * - a failed read is never stored, so a rate-limited answer is retried;
 * - every other `gh` call, and `git push`, counts as a write: it passes
 *   straight through and clears the whole cache, and a read that was in
 *   flight across a write is not stored — the dashboard never shows the
 *   before-state of its own action.
 */

import type { CliExec, CliRun } from './cli-probe.js';

/** `gh <noun> <verb>` pairs that only read. */
const READ_VERBS: Readonly<Record<string, readonly string[]>> = {
  issue: ['list', 'view', 'status'],
  pr: ['list', 'view', 'checks', 'diff', 'status'],
  run: ['list', 'view'],
  workflow: ['list', 'view'],
  repo: ['view'],
  label: ['list'],
  release: ['list', 'view'],
  search: ['issues', 'prs', 'repos', 'code', 'commits'],
  auth: ['status'],
};

/** `gh api` flags that give the request a body (and so default it to POST). */
const BODY_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);

function isGhBinary(bin: string): boolean {
  const base = bin.replace(/\\/g, '/').split('/').pop() ?? '';
  return base.toLowerCase() === 'gh' || base.toLowerCase() === 'gh.exe';
}

/** The method a `gh api` argv asks for, or null when none is named. */
function apiMethod(args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '-X' || a === '--method') return (args[i + 1] ?? '').toUpperCase();
    if (a.startsWith('-X') && a.length > 2) return a.slice(2).toUpperCase();
    if (a.startsWith('--method=')) return a.slice('--method='.length).toUpperCase();
  }
  return null;
}

function isApiRead(args: readonly string[]): boolean {
  if (args.length < 2) return false;
  if (args.some((a) => BODY_FLAGS.has(a) || /^--(raw-)?field=|^--input=/.test(a))) return false;
  const method = apiMethod(args);
  return method === null || method === 'GET';
}

/** True when this exec call only reads GitHub and may be served from cache. */
export function isGhRead(bin: string, args: readonly string[]): boolean {
  if (!isGhBinary(bin)) return false;
  const [noun, verb] = args;
  if (noun === undefined) return false;
  if (noun === 'api') return isApiRead(args);
  const verbs = READ_VERBS[noun];
  return verbs !== undefined && verb !== undefined && verbs.includes(verb);
}

/** True for a call that changes what GitHub would answer. */
function isWrite(bin: string, args: readonly string[]): boolean {
  if (isGhBinary(bin)) return !isGhRead(bin, args);
  const base = bin.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  return (base === 'git' || base === 'git.exe') && args[0] === 'push';
}

export interface GhReadCacheOptions {
  /** How long a successful read is served from cache. 0 disables caching. */
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
  // Bumped by every write; a read started under an older generation is
  // returned to its caller but never stored.
  let generation = 0;

  return async (bin, args) => {
    if (isWrite(bin, args)) {
      generation += 1;
      done.clear();
      inFlight.clear();
      return exec(bin, args);
    }
    if (opts.ttlMs <= 0 || !isGhRead(bin, args)) return exec(bin, args);

    const key = JSON.stringify([bin, ...args]);
    const hit = done.get(key);
    if (hit !== undefined && now() - hit.at < opts.ttlMs) return hit.result;

    const pending = inFlight.get(key);
    if (pending !== undefined) return pending;

    const startedIn = generation;
    const call = exec(bin, args).then((result) => {
      if (inFlight.get(key) === call) inFlight.delete(key);
      if (result.code === 0 && startedIn === generation) {
        done.set(key, { at: now(), result });
      }
      return result;
    });
    inFlight.set(key, call);
    return call;
  };
}
