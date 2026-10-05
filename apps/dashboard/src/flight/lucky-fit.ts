// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * "I'M FEELING LUCKY" fit scorer — the WHAT-to-fly half of the Fly bar's 🍀
 * button (issue #44, gabibi555). `lucky-plan.ts` turns a machine probe into
 * HOW MUCH to fly and refuses when the board is empty, while the Pool and
 * Good-first panels one screen over list claimable work that only the
 * operator could match to themselves. This module is that matching turned
 * into arithmetic: claimable work in, a ranked shortlist out, one reasoning
 * line per issue so the operator can see why something was suggested and
 * overrule it.
 *
 * Deliberately PURE (candidates + operator in, shortlist out, no I/O): the
 * server assembles the candidates (pool issues, good-first issues, each
 * issue's prior firings from the board) and the client only paints. Like the
 * plan, the shortlist only ever SUGGESTS — claiming and flying stay the
 * operator's clicks.
 */

import { isMaintainerMarked, type PoolBrowseEntry } from './pool-client.js';

/** How much attention the operator says they have — the input #44 names as
 *  the one that matters most, and the one nothing else could infer. */
export type LuckyAttention = 'evening' | 'day' | 'week';
export const LUCKY_ATTENTIONS: readonly LuckyAttention[] = ['evening', 'day', 'week'];
export const LUCKY_DEFAULT_ATTENTION: LuckyAttention = 'evening';

/** Longest shortlist painted — past five the operator is browsing, not choosing. */
export const LUCKY_FIT_MAX = 5;

export type FitSource = 'pool' | 'people';

export interface FitCandidate {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  /** GitHub labels as KEEPER triage applied them (`area: i18n`, `epic`, ...);
   *  a good-first entry carries its tier as its one label. */
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  /** `'pool'` — an AUTOPILOT fleet can fly it; `'people'` — reserved for humans. */
  readonly source: FitSource;
  /** Prior firings that worked this issue's board task, when it was boarded.
   *  `unpriced` counts those whose run reported no price (epic 0036): `usd`
   *  holds none of their cost, so the average leaves them out. */
  readonly history?: {
    readonly firings: number;
    readonly usd: number;
    readonly unpriced?: number;
  };
}

export interface FitOperator {
  /** The dashboard's active locale (`document.documentElement.lang`). */
  readonly locale: string;
  readonly attention: LuckyAttention;
  /** Lanes the machine can carry right now (`LuckyPlan.lanes`; 0 on refusal). */
  readonly lanes: number;
  /** Firings this operator has flown so far — the experience signal. */
  readonly firingsFlown: number;
}

export interface FitLine {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly source: FitSource;
  /** 0–1, two decimals. */
  readonly fit: number;
  /** One line of `;`-joined signals, so the operator can audit the score. */
  readonly reasoning: string;
}

export interface LuckyFit {
  readonly attention: LuckyAttention;
  /** Candidates looked at, claimed ones included — so "3 of 7" is sayable. */
  readonly considered: number;
  readonly shortlist: readonly FitLine[];
}

/** Every score starts here; signals move it, the clamp keeps it 0–1. */
const BASELINE = 0.5;
/** Per-firing cost under which an issue's history reads as one surface. */
const CHEAP_FIRING_USD = 5;
/** Per-firing cost above which an evening will not carry it. */
const DEAR_FIRING_USD = 15;
/** Lanes from which the machine can carry an epic's fleet. */
const EPIC_LANES = 4;
/** Firings flown after which a pool issue is a routine handoff to one's pilot. */
const SEASONED_FIRINGS = 20;

const ATTENTION_PHRASE: Record<LuckyAttention, string> = {
  evening: 'one evening',
  day: 'a day',
  week: 'a week',
};

function hasLabel(labels: readonly string[], name: string): boolean {
  return labels.some((l) => l.trim().toLowerCase() === name);
}

/** `'he-IL'` → `'he'`; the language decides, the region does not. */
function language(locale: string): string {
  return locale.trim().toLowerCase().split('-')[0] ?? 'en';
}

/** Scores one candidate, or `undefined` when it is already someone else's or
 *  the maintainer has declined it or put it on hold. The pool client still
 *  lists such an issue and the pool claim skips it, so the roll must not offer
 *  it either (epic 0019 law 2: the maintainer's mark outranks a score). The
 *  mark is read through the claim's own {@link isMaintainerMarked}: any casing,
 *  a hyphen read as a space. */
export function luckyFitLine(c: FitCandidate, op: FitOperator): FitLine | undefined {
  if (c.assignees.length > 0) return undefined;
  if (isMaintainerMarked(c.labels)) return undefined;
  const signals: string[] = [];
  let score = BASELINE;
  const lang = language(op.locale);
  const attention = ATTENTION_PHRASE[op.attention];

  if (hasLabel(c.labels, 'area: i18n') && lang !== 'en') {
    score += 0.3;
    signals.push(`area: i18n matches your ${lang} locale`);
  }
  if (hasLabel(c.labels, 'area: flight-engine') && op.firingsFlown === 0) {
    score -= 0.2;
    signals.push('area: flight-engine, and you have not flown a firing yet');
  }
  if (hasLabel(c.labels, 'priority: high')) {
    score += 0.1;
    signals.push('priority: high');
  }

  if (hasLabel(c.labels, 'epic')) {
    if (op.attention === 'week') {
      score += 0.1;
      signals.push('epic; est. multi-day — a week can carry it');
    } else {
      score -= op.attention === 'day' ? 0.2 : 0.4;
      signals.push(`epic; est. multi-day; exceeds ${attention}`);
    }
    if (op.lanes >= EPIC_LANES) {
      score += 0.1;
      signals.push(`this machine can carry ${op.lanes} lanes`);
    } else if (op.lanes <= 1) {
      score -= 0.2;
      signals.push('one lane at most right now — an epic wants a fleet');
    }
  } else if (hasLabel(c.labels, 'good first issue')) {
    score += op.attention === 'evening' ? 0.2 : 0.1;
    signals.push('good first issue: one surface');
  }

  if (c.history && c.history.firings > 0) {
    // A Codex or Gemini run stores its unknown cost as 0, so averaged in it
    // would make the issue read cheap; with none priced, cost says nothing.
    const unpriced = Math.min(c.history.unpriced ?? 0, c.history.firings);
    const priced = c.history.firings - unpriced;
    const avg = priced > 0 ? c.history.usd / priced : 0;
    const spent =
      unpriced === 0
        ? `${c.history.firings} prior firing(s) averaged $${avg.toFixed(2)}`
        : `${priced} priced prior firing(s) averaged $${avg.toFixed(2)} (${unpriced} unpriced left out)`;
    if (priced === 0) {
      signals.push(`${c.history.firings} prior firing(s), unpriced — no price was reported`);
    } else if (avg <= CHEAP_FIRING_USD) {
      score += 0.1;
      signals.push(`${spent} — fits ${attention}`);
    } else if (avg > DEAR_FIRING_USD && op.attention === 'evening') {
      score -= 0.1;
      signals.push(`${spent} — dear for one evening`);
    } else {
      signals.push(spent);
    }
  }

  if (c.source === 'pool' && op.firingsFlown >= SEASONED_FIRINGS) {
    score += 0.05;
    signals.push(`you have flown ${op.firingsFlown} firings — your pilot can take it`);
  }

  const fit = Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
  return {
    number: c.number,
    title: c.title,
    url: c.url,
    source: c.source,
    fit,
    reasoning: signals.length > 0 ? signals.join('; ') : 'no strong signal either way',
  };
}

/** Ranks every unclaimed candidate, best fit first (ties: lower number first),
 *  capped at {@link LUCKY_FIT_MAX}. */
export function luckyFit(candidates: readonly FitCandidate[], op: FitOperator): LuckyFit {
  const shortlist = candidates
    .map((c) => luckyFitLine(c, op))
    .filter((line): line is FitLine => line !== undefined)
    .sort((a, b) => b.fit - a.fit || a.number - b.number)
    .slice(0, LUCKY_FIT_MAX);
  return { attention: op.attention, considered: candidates.length, shortlist };
}

/** One row of the Pool panel's browse read as a roll candidate. Its holders
 *  are its assignees plus every live claim in the claims ledger
 *  (claim-ledger.ts). An outside contributor's assign fails and only their
 *  claim comment lands (#27): the claim contests that issue and the Pool panel
 *  paints it held, so the roll must not offer it as free. A stale claim adds
 *  no holder: the next claim releases it. */
export function poolFitCandidate(entry: PoolBrowseEntry): FitCandidate {
  const liveClaims = entry.claims.filter((standing) => !standing.stale);
  return {
    number: entry.issue.number,
    title: entry.issue.title,
    url: entry.issue.url,
    labels: entry.issue.labels,
    assignees: [...new Set([...entry.issue.assignees, ...liveClaims.map((s) => s.claim.login)])],
    source: 'pool',
  };
}

/** One issue can sit in both lists (`pool: ux` + `help wanted`); the pool
 *  entry wins (a fleet can fly it) and gains the people entry's tier label. */
export function mergeFitCandidates(
  pool: readonly FitCandidate[],
  people: readonly FitCandidate[],
): readonly FitCandidate[] {
  const byNumber = new Map<number, FitCandidate>();
  for (const c of pool) byNumber.set(c.number, c);
  for (const c of people) {
    const prior = byNumber.get(c.number);
    byNumber.set(
      c.number,
      prior ? { ...prior, labels: [...new Set([...prior.labels, ...c.labels])] } : c,
    );
  }
  return [...byNumber.values()];
}

/** Query-string parsers for the ask — anything unrecognised is the default,
 *  never an error: a stale link must still roll. */
export function parseLuckyAttention(raw: unknown): LuckyAttention {
  return typeof raw === 'string' && (LUCKY_ATTENTIONS as readonly string[]).includes(raw)
    ? (raw as LuckyAttention)
    : LUCKY_DEFAULT_ATTENTION;
}

const LOCALE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
export function parseLuckyLocale(raw: unknown): string {
  return typeof raw === 'string' && LOCALE_TAG.test(raw) ? raw : 'en';
}
