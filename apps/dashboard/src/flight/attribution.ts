// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ATTRIBUTION.md §3's "conversations" channel, enforced: when a pilot
 * speaks in a thread — an issue/PR comment or a PR review body — the
 * message carries a compact signature naming the tool and the operator
 * it speaks for, once per message.
 *
 * A wrapper, matching `withAntiFlood`'s own shape (its docstring names
 * this exact composition as the wiring map's prescription): {@link
 * withAttribution} decorates any `CliExec` and inspects every
 * `gh issue|pr comment` / `gh pr review --body` argv before it runs,
 * appending the signature to the `--body` value. Everything else —
 * labels, edits, `gh issue|pr create` (ATTRIBUTION.md §2's filing
 * channel, still unwired — a separate slice), git calls — passes through
 * untouched.
 *
 * Composed INSIDE `withAntiFlood` in `gh-exec.ts`
 * (`withAntiFlood(withAttribution(realCliExec))`): the flood guard's own
 * `gh api user` / thread-read / PATCH-fold calls all use the `api` verb,
 * which this parser never matches, so they reach the real exec unsigned
 * and un-doubled — an already-signed tail message folding in an Update
 * block does not need a second signature stapled on.
 *
 * Fails open like every other guard here: if the operator's own login
 * cannot be resolved (`gh api user` errors, no network, no `gh`), the
 * message posts unsigned rather than being swallowed — a lost signature
 * is a smaller failure than a lost reply.
 *
 * `AUTOPILOT_ATTRIBUTION=off` (ATTRIBUTION.md's "one opt-out lever covers
 * all four channels") disables the signature entirely — checked BEFORE the
 * identity lookup, so opting out costs no extra `gh api user` call either.
 * Channel 2's identity-law disclosure is a separate, non-optional doctrine
 * (CONTRIBUTOR-STANDING.md) folded into the same footer text and is left
 * alone; this lever only ever covers the credit portion.
 */

import type { CliExec, CliRun } from '../connection/cli-probe.js';

/** Canonical repo the signature and every credit line points at. */
export const AUTOPILOT_REPO_URL = 'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT';

/** False only when the operator has explicitly opted out via
 *  `AUTOPILOT_ATTRIBUTION=off` — every other value, including unset, keeps
 *  attribution on (ATTRIBUTION.md: "respected credit spreads, forced credit
 *  sours" — on by default). */
function attributionEnabled(): boolean {
  return process.env['AUTOPILOT_ATTRIBUTION'] !== 'off';
}

/** The compact signature ATTRIBUTION.md §3 prescribes for a conversational
 *  post — a comment or a review, once per message. */
export function conversationSignature(operatorHandle: string): string {
  return (
    `— ✈️ AUTOPILOT agent, on behalf of @${operatorHandle} · ` +
    `[what is this?](${AUTOPILOT_REPO_URL})`
  );
}

/** One outgoing conversational post — the argv shapes §3 covers. */
export interface OutgoingConversation {
  /** Index of the body inside the original argv, so the signed copy can rewrite it. */
  readonly bodyIndex: number;
  readonly body: string;
}

/** `gh issue comment N --body X`, `gh pr comment N --body X`, and
 *  `gh pr review N --approve|--request-changes|--comment --body X` — every
 *  argv shape the fleet's executors build for a thread it already
 *  participates in. Returns null for anything else, including
 *  `gh issue|pr create` (ATTRIBUTION.md §2, a different channel), labels,
 *  and git. */
export function parseConversationPost(
  bin: string,
  args: readonly string[],
): OutgoingConversation | null {
  if (bin !== 'gh') return null;
  if (args[0] !== 'issue' && args[0] !== 'pr') return null;
  if (args[1] !== 'comment' && args[1] !== 'review') return null;
  const bodyIndex = args.indexOf('--body');
  if (bodyIndex === -1 || bodyIndex + 1 >= args.length) return null;
  const body = args[bodyIndex + 1];
  if (body === undefined) return null;
  return { bodyIndex, body };
}

/** Options {@link withAttribution} takes — matches `withAntiFlood`'s own
 *  shape for the same injectability reasons. */
export interface AttributionOptions {
  /** Called with a one-line note whenever signing is skipped because the
   *  operator's identity could not be resolved, so a run's log says why a
   *  post went out unsigned. */
  readonly onVerdict?: (note: string) => void;
}

async function resolveOperatorHandle(exec: CliExec): Promise<string | undefined> {
  const { code, stdout } = await exec('gh', ['api', 'user']);
  if (code !== 0) return undefined;
  try {
    const login = (JSON.parse(stdout) as { login?: unknown } | null)?.login;
    return typeof login === 'string' && login !== '' ? login : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Decorates a `CliExec` so every conversational post it runs carries the
 * signature, appended once. A body that already ends with a signature
 * (a caller re-running an unchanged plan) is left alone rather than
 * signed twice.
 */
export function withAttribution(exec: CliExec, options: AttributionOptions = {}): CliExec {
  const note = options.onVerdict ?? (() => {});

  return async (bin: string, args: readonly string[]): Promise<CliRun> => {
    const post = parseConversationPost(bin, args);
    if (!post) return exec(bin, args);
    if (!attributionEnabled()) return exec(bin, args);
    if (post.body.includes('— ✈️')) return exec(bin, args);

    const operatorHandle = await resolveOperatorHandle(exec);
    if (!operatorHandle) {
      note('attribution: operator identity unresolved — posting unsigned');
      return exec(bin, args);
    }

    const signedArgs = args.slice();
    signedArgs[post.bodyIndex + 1] = `${post.body}\n\n${conversationSignature(operatorHandle)}`;
    return exec(bin, signedArgs);
  };
}
