// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET INTENT CLAIMS (ADR-0006, BOARD web-mswo4x1u-kl2qsw) — the full
 * declare → render → retire → verify lifecycle for the fleet's pick-time
 * anti-duplication signal. A firing DECLARES its unit's primary file in a
 * git-ignored file before starting; sibling digests RENDER it as an
 * `intent:` claim (fleet-digest.ts); fly.ts RETIRES it when the unit ships
 * or is abandoned; and after every ship fly.ts VERIFIES the shipped commit
 * against all standing sibling claims. Extracted from fleet-digest.ts so
 * the claims lifecycle is one findable module.
 */

import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fenceTitle, parseWorktreeList, type GateResultKind } from '@autopilot/engine';

/**
 * The file a firing OVERWRITES at its worktree root to DECLARE its current
 * unit's primary-file intent — one line, "<primary file> — <goal>". Sibling
 * instances' fleet digests read it (see fleet-digest.ts's `buildFleetDigest`)
 * and render it as an `intent:` claim; git-ignored so it can never dirty the
 * gate or block a landing. The ACTIVE half of RESEARCH-LIBRARY's fleet
 * anti-duplication defense-stack item 2 (FLEET INTENT CLAIMS): `touching:`
 * and `unlanded:` observe work already underway with zero cooperation, this
 * declares work BEFORE it starts — closing the window where two siblings
 * pick the same unit at the same moment and neither signal exists yet.
 */
export const INTENT_FILE_NAME = '.autopilot-intent';

/** Cap on the declared-intent excerpt a sibling's digest line carries. */
const MAX_INTENT_CHARS = 200;

/** `git -C target worktree list --porcelain`, reduced to branch -> worktree path. */
export function listWorktreePaths(target: string): Map<string, string> {
  let out: string;
  try {
    out = execFileSync('git', ['-C', target, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch {
    return new Map(); // not a repo / git unavailable — degrades to branch-only awareness.
  }
  const byBranch = new Map<string, string>();
  for (const entry of parseWorktreeList(out)) {
    if (entry.branch !== undefined) byBranch.set(entry.branch, entry.path);
  }
  return byBranch;
}

/**
 * A sibling's DECLARED intent — the first non-empty line of its worktree's
 * {@link INTENT_FILE_NAME}, '' when absent/unreadable (the common case: no
 * drive-by unit in progress, or an agent that never declared one). The file
 * is free text ANY flying instance can overwrite with arbitrary content, so
 * the extracted line goes through `fenceTitle` (same untrusted-line sanitizer
 * as a board task title, prompt.ts) before this reaches a sibling's prompt:
 * `.split('\n')` alone only stops a literal LF from escaping the "line" — a
 * Unicode line-breaking character (NEL / LINE SEPARATOR / PARAGRAPH SEPARATOR)
 * survives it and would otherwise ride along into the fleet digest verbatim.
 */
export function declaredIntent(worktreePath: string): string {
  let raw: string;
  try {
    raw = readFileSync(join(worktreePath, INTENT_FILE_NAME), 'utf8');
  } catch {
    return ''; // no declared intent — not an error.
  }
  const line = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '');
  return line === undefined ? '' : fenceTitle(line).slice(0, MAX_INTENT_CHARS);
}

/**
 * Whether a finished firing's declared claim is still OWNED work. Only a
 * 'checkpointed' ending is (ADR-0006: the packed-up unit is resumed by the
 * next firing, which genuinely still owns the area). Every other no-ship
 * ending — a noop ('no-commit'), a 'reverted' unit, a gate crash — ABANDONS
 * the unit, and an abandoned claim must retire: left standing it walls
 * siblings out of ghost work nobody is doing, forever if the instance never
 * fires again. (A shipped unit retires through fly.ts's verify-then-clear
 * path instead.)
 */
export function claimSurvivesFiring(gateResult: GateResultKind): boolean {
  return gateResult === 'checkpointed';
}

/**
 * Retire a declared intent — called by fly.ts when a firing SHIPS its unit
 * (the claim is fulfilled, siblings may enter the area again) or ABANDONS it
 * (see {@link claimSurvivesFiring}). No-op when no intent was declared;
 * never throws (a stuck intent file must not fail the flight — the next
 * unit's declaration overwrites it anyway).
 */
export function clearDeclaredIntent(worktreePath: string): void {
  try {
    rmSync(join(worktreePath, INTENT_FILE_NAME), { force: true });
  } catch {
    // EPERM/lock oddities — stale-but-harmless beats a failed firing.
  }
}

/**
 * Best-effort primary-file guess straight off a board task's title — the
 * heuristic half of "auto-declare intent on board claim" (RESEARCH-LIBRARY's
 * slice-relay duplication fix direction 1): claiming a board task is a CODE
 * event (fly.ts's `claimTask` call), not an agent-initiated one, so the
 * doctrine's "declare before starting" prose never fired for it — the
 * triplicated-work incident's own task literally read "tasks_reorder in
 * packages/mcp/src/control.ts", a real primary-file token sitting unused in
 * plain text. Matches a `/`-separated, extension-terminated path token;
 * returns null when the title carries none (most don't — this is a bonus
 * signal, not a guarantee, so a miss must never block the claim itself).
 */
const TITLE_PATH_RE = /\b[\w.-]+(?:\/[\w.-]+)+\.[A-Za-z0-9]+\b/;

/** A path segment that carries its own dot+extension suffix — what every
 *  non-final segment of a REAL path never has (those are directory names),
 *  but what every segment of a slash-joined file ENUMERATION always has
 *  (e.g. a VERDICT title's "(a.ts/b.ts/c.ts, 125 passing tests)"). */
const SEGMENT_HAS_EXTENSION_RE = /\.[A-Za-z0-9]+$/;

export function likelyPrimaryPathFromTitle(title: string): string | null {
  const match = TITLE_PATH_RE.exec(title)?.[0] ?? null;
  if (match === null) return null;
  // Reject a match whose every non-final segment already looks like its own
  // file (own extension) — that's prose enumerating several touched files
  // joined by "/", not one hierarchical path, and auto-declaring it as this
  // firing's "primary file" would both mis-group the HUB partitioner (a
  // nonsense area key no real task shares) and silently defeat collision
  // detection (no shipped file can ever equal the bogus compound string).
  const nonFinalSegments = match.split('/').slice(0, -1);
  if (nonFinalSegments.every((segment) => SEGMENT_HAS_EXTENSION_RE.test(segment))) return null;
  return match;
}

/**
 * Declare an intent by CODE rather than by agent hand — write the one-line
 * "<primary file> — <goal>" {@link INTENT_FILE_NAME} the same declare/render
 * lifecycle already reads, so a board-task claim gives siblings awareness the
 * instant it's claimed instead of waiting on the agent's own self-declaration
 * (unreliable for board picks — RESEARCH-LIBRARY's slice-relay incident).
 * Best effort like {@link clearDeclaredIntent}: a write failure must never
 * fail the claim it is only advertising.
 */
export function writeDeclaredIntent(worktreePath: string, primaryFile: string, goal: string): void {
  try {
    writeFileSync(join(worktreePath, INTENT_FILE_NAME), `${primaryFile} — ${goal}\n`);
  } catch {
    // best-effort advertisement — a stuck/unwritable intent file must not fail a claim.
  }
}

/** A sibling's standing intent claim, resolved to a comparable primary-file path. */
export interface SiblingIntentClaim {
  readonly branch: string;
  readonly intent: string;
  readonly primaryFile: string;
}

/** A shipped file that lands on a sibling's standing intent claim. */
export interface IntentCollision {
  readonly file: string;
  readonly claim: SiblingIntentClaim;
}

/**
 * Comparable form of a file path across the agents that wrote it: git emits
 * forward slashes, an agent's declared intent may use either separator (or a
 * `./` prefix), and Windows paths compare case-insensitively.
 */
function comparablePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

/**
 * The primary-file half of a declared intent line — the doctrine's format is
 * "<primary file> — <goal>", but the dash an agent actually types varies, so
 * any whitespace-wrapped dash flavor splits. A line with no separator is
 * treated as all primary-file (a bare path is still a valid claim).
 */
export function parseIntentPrimaryFile(intentLine: string): string {
  const [file = ''] = intentLine.split(/\s+(?:—|–|--|-)\s+/);
  return file.trim();
}

/**
 * Every OTHER flight worktree's standing {@link INTENT_FILE_NAME} claim —
 * the data half of FLEET INTENT CLAIMS enforcement. The digest RENDERS these
 * for the prompt; this returns them structured so fly.ts can VERIFY a shipped
 * commit against them (the prompt-side hard rule alone was evaded — the
 * overnight duplicate modules shipped right past it). Own worktree is
 * excluded by path so a firing is never "colliding" with its own claim.
 */
/** Resolve symlink/8.3/aliased forms so an own-worktree comparison can never
 *  mistake this instance's claim for a sibling's (fleet-5's macOS CI-red fix,
 *  e725f3a: /var vs /private/var aliasing leaked the OWN claim as a sibling).
 *  Must be `realpathSync.native`, not the plain JS-fallback `realpathSync` —
 *  `adapters/worktree.ts`'s `canonicalize`/`canonicalWorktreePath` already
 *  documented why (CI-only field failure, three OS runners): GitHub Actions'
 *  Windows runners hand out 8.3-short-form tempdirs, and only the native
 *  binding expands them to the same true-case, symlink-resolved form git
 *  itself records at `worktree add` time. The plain JS realpath left this
 *  own-worktree comparison mismatched on the Windows runner (CI run
 *  32005559138: `readSiblingIntentClaims` returned the own claim as an
 *  extra "sibling") — the same failure class this module's own comment
 *  already named for macOS, ported to `.native` here too (c0f8f16). */
function canonicalIntentPath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

export function readSiblingIntentClaims(
  target: string,
  ownWorktreePath: string,
): SiblingIntentClaim[] {
  const own = comparablePath(canonicalIntentPath(ownWorktreePath));
  const claims: SiblingIntentClaim[] = [];
  for (const [ref, worktreePath] of listWorktreePaths(target)) {
    if (!ref.startsWith('refs/heads/autopilot/flight-worktree-')) continue;
    if (comparablePath(canonicalIntentPath(worktreePath)) === own) continue;
    const intent = declaredIntent(worktreePath);
    if (intent === '') continue;
    const primaryFile = parseIntentPrimaryFile(intent);
    if (primaryFile === '') continue;
    claims.push({ branch: ref.replace(/^refs\/heads\//, ''), intent, primaryFile });
  }
  return claims;
}

/**
 * Shipped files that land on a sibling's declared primary file — a hard-rule
 * violation the prompt forbade but nothing verified until now. Pure so the
 * matching (separator/case normalization) is unit-testable without git.
 */
export function detectIntentCollisions(
  shippedFiles: readonly string[],
  claims: readonly SiblingIntentClaim[],
): IntentCollision[] {
  const collisions: IntentCollision[] = [];
  for (const file of shippedFiles) {
    const hit = claims.find((c) => comparablePath(c.primaryFile) === comparablePath(file));
    if (hit !== undefined) collisions.push({ file, claim: hit });
  }
  return collisions;
}
