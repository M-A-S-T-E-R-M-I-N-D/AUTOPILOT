// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * self-study/generate-data — regenerates the DATA:SUMMARY, DATA:CHART, and
 * DATA:SERIES blocks in docs/SELF-STUDY/PAPER.md from the local telemetry store.
 *
 * `.autopilot/autopilot.db` is git-ignored local runtime state
 * (FLIGHT-CONTAINMENT.md) — it never leaves the machine that flew it. So the
 * Results section it feeds is not a live query: it is a periodically
 * regenerated, COMMITTED snapshot. Run this and commit the diff to refresh it.
 *
 * `apps/dashboard/src/fly.ts` also runs this automatically at the end of any
 * flight that shipped ≥1 firing (the "SELF-STUDY updater" slice), passing
 * `SELF_STUDY_FLIGHT_FIRINGS`/`SELF_STUDY_FLIGHT_SHIPPED` env vars — when set,
 * this run ALSO appends one dated §8 Evidence Log entry (see `flightTrigger`
 * below). A plain `pnpm self-study:update` run by hand leaves those unset, so
 * it only ever refreshes §4, exactly as before.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  openStore,
  listProjects,
  firingStats,
  firingSeries,
  evalRegressionByPromptVersion,
  evalRegressionOverPinnedSuite,
  evalRegressionByPickSource,
  evaluationLabelSummary,
  testFirstCompliance,
  pickDisciplineAudit,
  boardDiversityAudit,
  gateParallelSavings,
  warmSessionSavings,
  extendedFiringSavings,
} from '../../packages/store/dist/index.js';

const DB_ENV_VAR = 'AUTOPILOT_DB';
const PAPER_PATH = join(process.cwd(), 'docs', 'SELF-STUDY', 'PAPER.md');
const SUITE_PATH = join(process.cwd(), 'docs', 'SELF-STUDY', 'eval-suite.json');
const MARKER_START = '<!-- DATA:SUMMARY:START -->';
const MARKER_END = '<!-- DATA:SUMMARY:END -->';
const SERIES_MARKER_START = '<!-- DATA:SERIES:START -->';
const SERIES_MARKER_END = '<!-- DATA:SERIES:END -->';
const CHART_MARKER_START = '<!-- DATA:CHART:START -->';
const CHART_MARKER_END = '<!-- DATA:CHART:END -->';
const EVIDENCE_HEADING = '## 8. Evidence Log';

/** The pinned eval suite (`scripts/self-study/pin-eval-suite.mjs`), or `null`
 *  when nothing has been pinned yet — degrades silently, not an error: most
 *  of this repo's history predates the pinned suite existing at all. */
function readPinnedSuite() {
  if (!existsSync(SUITE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SUITE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Mirrors apps/dashboard/src/read/config.ts's resolution (kept local — this
 *  script does not depend on the dashboard app). */
function resolveDbPath(env = process.env, cwd = process.cwd()) {
  const override = env[DB_ENV_VAR];
  return override && override.length > 0 ? override : join(cwd, '.autopilot', 'autopilot.db');
}

function pct(n, total) {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : 'n/a';
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatDistribution(rows, total, labelForNull) {
  return rows.map((r) => `${r.key ?? labelForNull} ${r.n} (${pct(r.n, total)})`).join(' · ');
}

function kindDistribution(db, projectId) {
  return db
    .prepare(
      'SELECT kind AS key, COUNT(*) AS n FROM metrics WHERE project_id = ? GROUP BY kind ORDER BY n DESC',
    )
    .all(projectId);
}

function completionDistribution(db, projectId) {
  return db
    .prepare(
      'SELECT completion AS key, COUNT(*) AS n FROM metrics WHERE project_id = ? GROUP BY completion ORDER BY n DESC',
    )
    .all(projectId);
}

function gateResultDistribution(db, projectId) {
  return db
    .prepare(
      'SELECT gate_result AS key, COUNT(*) AS n FROM metrics WHERE project_id = ? GROUP BY gate_result ORDER BY n DESC',
    )
    .all(projectId);
}

function dateRange(db, projectId) {
  return db
    .prepare(
      'SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM metrics WHERE project_id = ?',
    )
    .get(projectId);
}

/** SHAs of firings the harness independently confirmed shipped (not self-report). */
function shippedShas(db, projectId) {
  return db
    .prepare('SELECT sha FROM metrics WHERE project_id = ? AND shipped = 1 AND sha IS NOT NULL')
    .all(projectId)
    .map((r) => r.sha);
}

/**
 * Firing-Prompt-Version isn't a metrics column — it only exists as a commit
 * trailer (SOUL.md's COMMIT step). Read it straight from git history instead
 * of guessing: one `git log` call, keyed by full SHA (resolveVersion below
 * matches it against the short SHA metrics stores). Degrades to an empty map
 * (every SHA reported as unknown) if git is unavailable — this must never
 * abort the rest of the regeneration.
 */
function promptVersionBySha() {
  const map = new Map();
  let out;
  try {
    out = execFileSync(
      'git',
      ['log', '--format=%H%x1f%(trailers:key=Firing-Prompt-Version,valueonly)'],
      { encoding: 'utf8', cwd: process.cwd() },
    );
  } catch {
    return map;
  }
  for (const line of out.split('\n')) {
    const sep = line.indexOf('\x1f');
    if (sep === -1) continue;
    map.set(line.slice(0, sep), line.slice(sep + 1).trim());
  }
  return map;
}

/** metrics.sha is the short SHA the firing self-reported (git's default abbrev,
 *  7 chars in this repo); git log's %H is always full-length. Resolve by prefix
 *  instead of assuming a fixed abbreviation width. */
function resolveVersion(shortSha, versionMap) {
  for (const [fullSha, version] of versionMap) {
    if (fullSha.startsWith(shortSha)) return version;
  }
  return undefined;
}

function promptVersionDistribution(shas, versionMap) {
  const counts = new Map();
  for (const sha of shas) {
    const version = resolveVersion(sha, versionMap);
    const key = version && version.length > 0 ? version : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

function money(n) {
  return n === null ? 'n/a' : `$${n.toFixed(2)}`;
}

function renderEvalRegression(rows) {
  if (rows.length === 0) return [];
  const lines = [
    '',
    '**Eval regression by prompt version (SOTA-MAP H3).** One row per `Firing-Prompt-Version` value recorded' +
      " in the engine's own telemetry at firing time (`events.payload.promptVersion`), so every firing counts —" +
      ' not only the shipped commits the row above resolves via git trailers. Pass rate = shipped ÷ firings;' +
      ' cost variance is the population variance of `costUsd` across every firing in that version (a consistency' +
      ' signal, not the same thing as the median); cost/solved = total cost across every firing in that version' +
      ' ÷ number shipped. A prompt-version bump should be gated on these four numbers moving together, not on' +
      ' pass rate alone (H3: "optimizing pass rate alone selects for expensive, high-variance configurations").',
    '',
    '| Prompt version | Firings | Pass rate | Median turns | Cost variance | Cost / solved task |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.promptVersion} | ${r.firings} | ${pct(r.shipped, r.firings)} | ` +
        `${r.medianTurns ?? 'n/a'} | ${r.costVariance === null ? 'n/a' : r.costVariance.toFixed(2)} | ` +
        `${money(r.costPerSolved)} |`,
    );
  }
  return lines;
}

function renderPinnedEvalRegression(suite, rows) {
  if (!suite) return [];
  const lines = [
    '',
    `**Eval regression over the pinned suite (pre-registered, SOTA-MAP: "20-50 real tasks from your own` +
      ` repository with known-good outcomes").** ${suite.tasks.length} firing(s) pinned` +
      ` ${isoDate(Date.parse(suite.pinnedAt))} (\`docs/SELF-STUDY/eval-suite.json\`) — each independently` +
      ' verified shipped by the harness (gate passed, SHA confirmed, HEAD advanced), not self-reported.' +
      ' Unlike the ad hoc table above, this population is fixed: re-running this script next month against' +
      ' the same pinned ids reproduces the same numbers below, because the pinned set cannot grow.',
    '',
    '| Prompt version | Firings (of the pinned set) | Pass rate | Median turns | Cost variance | Cost / solved task |',
    '|---|---|---|---|---|---|',
  ];
  if (rows.length === 0) {
    lines.push('| _(no pinned firing has a resolvable prompt version yet)_ | | | | | |');
    return lines;
  }
  for (const r of rows) {
    lines.push(
      `| ${r.promptVersion} | ${r.firings} | ${pct(r.shipped, r.firings)} | ` +
        `${r.medianTurns ?? 'n/a'} | ${r.costVariance === null ? 'n/a' : r.costVariance.toFixed(2)} | ` +
        `${money(r.costPerSolved)} |`,
    );
  }
  return lines;
}

function renderPickSourceEval(rows) {
  if (rows.length === 0) return [];
  const lines = [
    '',
    '**Outcomes by task pick source (human-vs-agent, backlog web-msniol15-foo6oi).** The same four SOTA-MAP' +
      ' H3 numbers as the table above, but grouped by WHO picked the task instead of which prompt ran it:' +
      ' `operator-assigned` = a human typed the task into the dashboard board; `self-proposed` = AUTOPILOT' +
      ' mined the proposal itself (still operator-approved into `queued` before any firing could work it);' +
      ' `free-pick` = the firing worked no linked task at all; `untracked-item` = the firing named a task id' +
      ' that resolves to no tracked row (pre-board-era firings, or a since-deleted task). This is only the' +
      ' "compare operator-assigned vs self-picked outcomes" half of the human-vs-agent slice — the' +
      ' approve/reject-capture half is the table below it.',
    '',
    '| Pick source | Firings | Pass rate | Median turns | Cost variance | Cost / solved task |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.pickSource} | ${r.firings} | ${pct(r.shipped, r.firings)} | ` +
        `${r.medianTurns ?? 'n/a'} | ${r.costVariance === null ? 'n/a' : r.costVariance.toFixed(2)} | ` +
        `${money(r.costPerSolved)} |`,
    );
  }
  return lines;
}

function renderEvaluationLabelSummary(s) {
  if (s.total === 0) return [];
  const rate = s.approvalRate === null ? 'n/a' : `${(s.approvalRate * 100).toFixed(1)}%`;
  return [
    '',
    '**Evaluation labels: operator verdicts on self-proposed tasks (human-vs-agent, backlog' +
      " web-msniol15-foo6oi).** The other half of the slice above: `mutate.ts`'s `setTaskStatus`/`deleteTask`" +
      " record an `'approved'`/`'rejected'` event whenever the operator approves a `source: 'self'`" +
      " proposal into `queued`, or deletes one outright. This is a real fitness signal on the agent's OWN" +
      ' proposals — not yet on edits or corrections to operator-assigned or already-approved tasks, which' +
      ' still record no verdict (see §6).',
    '',
    '| Verdicts recorded | Approved | Rejected | Approval rate |',
    '|---|---|---|---|',
    `| ${s.total} | ${s.approved} | ${s.rejected} | ${rate} |`,
  ];
}

function renderTestFirstCompliance(c) {
  if (c.fixFirings === 0) return [];
  const rate = c.complianceRate === null ? 'n/a' : `${(c.complianceRate * 100).toFixed(1)}%`;
  return [
    '',
    '**TDD-first compliance on fix tasks (backlog web-msnsxuep-ytwucr).** The firing prompt requires a' +
      ' FAILING test reproducing the bug BEFORE the fix on every `kind:"fix"` firing; the agent self-reports' +
      ' whether it followed that order (`METRICS.testFirst` → `metrics.test_first`). Self-reported, not (yet)' +
      ' independently verified by re-running the named test against the pre-fix commit — see the limitations' +
      ' this shares with `completion` in `docs/MODEL-CARD.md` §5.',
    '',
    '| Fix firings | Self-reported | Compliant | Compliance rate |',
    '|---|---|---|---|',
    `| ${c.fixFirings} | ${c.reported} | ${c.compliant} | ${rate} |`,
  ];
}

function renderPickDisciplineAudit(a) {
  if (a.rankedFirings === 0) return [];
  const rate = a.violationRate === null ? 'n/a' : `${(a.violationRate * 100).toFixed(1)}%`;
  return [
    '',
    '**PICK DISCIPLINE — Goodhart audit on triage order (backlog web-msu755l7-mhyvuy).** The firing prompt' +
      ' requires each firing to either work the triage-TOP board task or record an explicit' +
      ' `deviation_reason` for working a lower-ranked one; the agent self-reports which rank it picked' +
      ' (`METRICS.picked_rank` → `metrics.picked_rank`) and, on a deviation, why. An unjustified deviation —' +
      ' a lower-ranked pick with no recorded reason — is the comfort-grinding failure mode this audit exists' +
      ' to surface: silently evading triage order in favor of an easier task. Self-reported, not (yet)' +
      " independently verified against the board's actual rendered order at pick time — the same limitation" +
      ' `testFirst` compliance above shares (`docs/MODEL-CARD.md` §5).',
    '',
    '| Ranked firings | Top picked | Justified deviations | Unjustified deviations | Violation rate |',
    '|---|---|---|---|---|',
    `| ${a.rankedFirings} | ${a.topPicked} | ${a.justifiedDeviations} | ${a.unjustifiedDeviations} | ${rate} |`,
  ];
}

function renderBoardDiversityAudit(d) {
  if (d.deviatedFirings === 0) return [];
  return [
    '',
    '**BOARD DIVERSITY audit (backlog web-mtb8i2s3-wd3rod).** `pickDisciplineAudit` above only checks that a' +
      ' deviation from the triage-TOP task carried SOME `deviation_reason` — a firing can honestly supply a' +
      ' fresh-reading reason on every one of many consecutive firings and still be comfort-picking the same' +
      ' easy item over and over, invisible to a justified/unjustified split. This measures that instead:' +
      ' among firings that deviated and named the item they worked, how many distinct items those deviations' +
      ' actually cover, and the longest run of consecutive deviations that named the identical item.',
    '',
    '| Deviated firings | Distinct items | Longest same-item streak | Most-repeated item |',
    '|---|---|---|---|',
    `| ${d.deviatedFirings} | ${d.distinctItems} | ${d.longestSameItemStreak} | ${d.mostRepeatedItem ?? 'n/a'} |`,
  ];
}

function renderGateParallelSavings(s) {
  if (s.sampledFirings === 0) return [];
  const pct = s.savedPct === null ? 'n/a' : `${(s.savedPct * 100).toFixed(1)}%`;
  return [
    '',
    '**Gate parallelization savings (backlog web-msnt26tn-jvyihy, "PARALLEL GATE + test-impact").**' +
      " `fly.ts` runs the gate's typecheck/lint/format steps concurrently instead of one after another" +
      ' (each still timed independently by `GateRunner`). Sequential = the sum of those durations per' +
      ' firing (the counterfactual cost if they had run one after another); observed = the max per firing' +
      ' (the real wall-clock a concurrent batch takes, bounded by its slowest member) — both derived from' +
      ' already-collected telemetry, not a live re-run.',
    '',
    '| Sampled firings | Sequential (sum) | Observed (max) | Saved | Saved % |',
    '|---|---|---|---|---|',
    `| ${s.sampledFirings} | ${(s.sequentialMs / 1000).toFixed(1)}s | ${(s.observedMs / 1000).toFixed(1)}s | ${(s.savedMs / 1000).toFixed(1)}s | ${pct} |`,
  ];
}

function renderWarmSessionSavings(w) {
  if (w.resumed.firings === 0 && w.coldFallback.firings === 0) return [];
  const fmt = (n, digits) => (n === null ? 'n/a' : n.toFixed(digits));
  const row = (label, g) =>
    `| ${label} | ${g.firings} | ${fmt(g.avgFreshInputTokens, 0)} | ${fmt(g.avgCacheReadTokens, 0)} | $${fmt(g.avgCostUsd, 2)} | ${fmt(g.avgTurns, 1)} | $${fmt(g.avgCostPerTurn, 3)} |`;
  const freshDelta =
    w.freshInputDeltaPerFiring === null ? 'n/a' : w.freshInputDeltaPerFiring.toFixed(0);
  const costDelta = w.costDeltaPerFiring === null ? 'n/a' : `$${w.costDeltaPerFiring.toFixed(2)}`;
  const costPerTurnDelta =
    w.costPerTurnDeltaPerFiring === null ? 'n/a' : `$${w.costPerTurnDeltaPerFiring.toFixed(3)}`;
  return [
    '',
    '**Warm-session savings (epic `docs/epics/0009-warm-sessions.md`, board web-msnt26so-0c6tje).**' +
      " A firing within a flight can resume the prior firing's CLI session (`--resume <session_id>`)" +
      ' instead of cold-spawning a fresh one — grouped here by `metrics.resumed` disposition: a real' +
      ' resume, a resume attempt that fell back to cold at the CLI level, and an ordinary cold spawn' +
      ' (including all pre-warm-sessions history). Deltas compare `resumed` against `cold` only, and' +
      ' stay `n/a` until both groups have at least one firing. Avg cost/turn is the mean of each' +
      " firing's OWN cost-divided-by-turns ratio, not group-total cost over group-total turns — the" +
      ' confound-controlled view: resumed and cold firings run very different average turn counts, so' +
      ' the raw per-firing cost delta can disagree with the per-turn one.',
    '',
    '| Group | Firings | Avg fresh input tokens | Avg cache-read tokens | Avg cost | Avg turns | Avg cost/turn |',
    '|---|---|---|---|---|---|---|',
    row('Resumed', w.resumed),
    row('Cold fallback (resume attempted, failed)', w.coldFallback),
    row('Cold (no resume requested)', w.cold),
    '',
    `Fresh-input tokens saved per resumed firing vs. cold: ${freshDelta}. Cost saved per resumed firing vs. cold: ${costDelta}. Cost saved per turn, resumed vs. cold: ${costPerTurnDelta}.`,
  ];
}

/**
 * FINISH-LINE EXTENSION correlation (epic 0009's remaining open item): resume
 * narrowed to a bounded self-resume of a firing's OWN session after the
 * resumed-vs-cold verdict came back negative, and the verdict on THAT
 * mechanism can only be read once extended firings accumulate under migration
 * v17's `metrics.extended`. While the extended group is empty this renders a
 * one-line pending status — the observable trigger for the epic's deferred
 * tile/table, not an always-empty table — and the full comparison table the
 * moment the group is non-empty.
 */
function renderExtendedFiringSavings(x) {
  const heading =
    '**Finish-line extension savings (epic `docs/epics/0009-warm-sessions.md`, board web-msnt26so-0c6tje).**';
  if (x.extended.firings === 0) {
    return [
      '',
      heading +
        ' The measured resumed-vs-cold verdict above was negative, so resume narrowed to a bounded' +
        " FINISH-LINE EXTENSION self-resume of the same firing's session (`firing.ts`), queryable" +
        ' since migration v17 (`metrics.extended`). No extended firing recorded yet' +
        ` (baseline: ${x.ordinary.firings} ordinary firing(s)) — the extension-vs-checkpoint verdict` +
        ' stays pending until this group is non-empty.',
    ];
  }
  const fmt = (n, digits) => (n === null ? 'n/a' : n.toFixed(digits));
  const row = (label, g) =>
    `| ${label} | ${g.firings} | ${fmt(g.avgFreshInputTokens, 0)} | ${fmt(g.avgCacheReadTokens, 0)} | $${fmt(g.avgCostUsd, 2)} | ${fmt(g.avgTurns, 1)} | $${fmt(g.avgCostPerTurn, 3)} |`;
  const costDelta = x.costDeltaPerFiring === null ? 'n/a' : `$${x.costDeltaPerFiring.toFixed(2)}`;
  const costPerTurnDelta =
    x.costPerTurnDeltaPerFiring === null ? 'n/a' : `$${x.costPerTurnDeltaPerFiring.toFixed(3)}`;
  return [
    '',
    heading +
      ' A firing that hits its turn cap mid-unit gets one bounded resume of its OWN session' +
      ' (`firing.ts`) before any checkpoint hand-off — grouped here by `metrics.extended`' +
      ' (migration v17). Positive deltas mean an extended firing costs less than an ordinary one;' +
      " avg cost/turn is the mean of each firing's OWN cost-divided-by-turns ratio, the same" +
      ' confound control as the warm-session table above (an extension adds turns to an' +
      ' already-long firing, so the raw per-firing delta can mislead).',
    '',
    '| Group | Firings | Avg fresh input tokens | Avg cache-read tokens | Avg cost | Avg turns | Avg cost/turn |',
    '|---|---|---|---|---|---|---|',
    row('Extended (finish-line self-resume)', x.extended),
    row('Ordinary', x.ordinary),
    '',
    `Cost saved per extended firing vs. ordinary: ${costDelta}. Cost saved per turn, extended vs. ordinary: ${costPerTurnDelta}.`,
  ];
}

function renderSummary(
  project,
  stats,
  gate,
  completion,
  kind,
  promptVersion,
  shippedCount,
  range,
  evalRows,
  pinnedSuite,
  pinnedEvalRows,
  pickSourceRows,
  evaluationLabels,
  testFirst,
  pickDiscipline,
  boardDiversity,
  parallelSavings,
  warmSessions,
  extendedFirings,
) {
  const generatedAt = new Date().toISOString();
  const lines = [
    MARKER_START,
    `_Generated ${generatedAt} by \`pnpm self-study:update\` from the local telemetry store` +
      ` (project \`${project.slug}\`, ${stats.firings} recorded firing(s))._`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Firings recorded | ${stats.firings} |`,
    `| Firings shipped (gate-verified commit landed) | ${stats.shipped} (${pct(stats.shipped, stats.firings)}) |`,
    `| Gate result | ${formatDistribution(gate, stats.firings, 'unknown')} |`,
    `| Completion (self-reported) | ${formatDistribution(completion, stats.firings, 'untagged')} |`,
    `| Commit kind | ${formatDistribution(kind, stats.firings, 'untagged')} |`,
    `| Firing-Prompt-Version (shipped commits, from git trailers) | ${formatDistribution(promptVersion, shippedCount, 'pre-trailer')} |`,
    `| Total cost (USD, self-reported) | $${stats.cost.toFixed(2)} |`,
    `| Total tokens, in / out | ${stats.tokensIn.toLocaleString('en-US')} / ${stats.tokensOut.toLocaleString('en-US')} |`,
    `| Cache read / write tokens | ${stats.cacheReadTokens.toLocaleString('en-US')} / ${stats.cacheWriteTokens.toLocaleString('en-US')} |`,
    `| Total turns | ${stats.turns.toLocaleString('en-US')} |`,
    `| Firing date range | ${range.first ? isoDate(range.first) : 'n/a'} — ${range.last ? isoDate(range.last) : 'n/a'} |`,
    ...renderEvalRegression(evalRows),
    ...renderPinnedEvalRegression(pinnedSuite, pinnedEvalRows),
    ...renderPickSourceEval(pickSourceRows),
    ...renderEvaluationLabelSummary(evaluationLabels),
    ...renderTestFirstCompliance(testFirst),
    ...renderPickDisciplineAudit(pickDiscipline),
    ...renderBoardDiversityAudit(boardDiversity),
    ...renderGateParallelSavings(parallelSavings),
    ...renderWarmSessionSavings(warmSessions),
    ...renderExtendedFiringSavings(extendedFirings),
    MARKER_END,
  ];
  return lines.join('\n');
}

function replaceBlock(source, block, markerStart = MARKER_START, markerEnd = MARKER_END) {
  const start = source.indexOf(markerStart);
  const end = source.indexOf(markerEnd);
  if (start === -1 || end === -1) {
    throw new Error(
      `generate-data: markers not found in ${PAPER_PATH} — expected ${markerStart} / ${markerEnd}`,
    );
  }
  return source.slice(0, start) + block + source.slice(end + markerEnd.length);
}

// Trailing window (in calendar days) the "rolling ship rate" chart smooths
// over — see `rollingShipRate` below. 3 days balances "still reads as
// day-to-day" against "damps the noise a single low-firing day introduces".
const ROLLING_SHIP_RATE_WINDOW_DAYS = 3;

/** One calendar day's totals across `series` — the per-day rollup of the
 *  per-firing rows, computed in JS rather than a second SQL query since the
 *  full series is already in hand. */
function perDayAggregates(series) {
  const byDay = new Map();
  for (const p of series) {
    const day = byDay.get(p.day) ?? { day: p.day, firings: 0, shipped: 0, costUsd: 0, turns: 0 };
    day.firings += 1;
    day.shipped += p.shipped;
    day.costUsd += p.costUsd;
    day.turns += p.turns;
    byDay.set(p.day, day);
  }
  return [...byDay.values()]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .map((d) => ({ ...d, costUsd: Number(d.costUsd.toFixed(4)) }));
}

/** Trailing `windowDays`-day ship rate at each `perDay` entry: shipped ÷
 *  firings, summed over that entry and the `windowDays - 1` days before it
 *  (fewer at the start of the series, never a full window's worth). Smooths
 *  the per-day chart's day-to-day noise without losing daily granularity
 *  entirely — unlike `perDay` itself, every window has ≥1 firing by
 *  construction (each `perDay` entry already does), so the division is
 *  never by zero. Returns one rate per `perDay` entry, same order. */
function rollingShipRate(perDay, windowDays = ROLLING_SHIP_RATE_WINDOW_DAYS) {
  return perDay.map((_, i) => {
    const window = perDay.slice(Math.max(0, i - windowDays + 1), i + 1);
    const firings = window.reduce((sum, d) => sum + d.firings, 0);
    const shipped = window.reduce((sum, d) => sum + d.shipped, 0);
    return Number((shipped / firings).toFixed(4));
  });
}

// Bucket width (in turns) for the turns-histogram chart — see `turnsHistogram`
// below. 10 keeps the bucket count in the 8-12 range across this project's
// observed turn counts (13-121) without needing per-run tuning.
const TURNS_HISTOGRAM_BUCKET_SIZE = 10;

/** Buckets `series`' per-firing turn counts into fixed-width bins, split into
 *  shipped/not-shipped like the other stacked-bar charts — the "turns
 *  histogram" slice of backlog web-msnshaur-n40j8o. Bucket range starts at
 *  the data's own floor (not 0) so a project whose firings never dip below,
 *  say, 13 turns doesn't render a dead leading "0-9" bucket. Returns `[]` for
 *  an empty series (nothing to bucket, same convention as `perDayAggregates`
 *  on an empty input). */
function turnsHistogram(series, bucketSize = TURNS_HISTOGRAM_BUCKET_SIZE) {
  if (series.length === 0) return [];
  const turnValues = series.map((p) => p.turns);
  const startBucket = Math.floor(Math.min(...turnValues) / bucketSize);
  const endBucket = Math.floor(Math.max(...turnValues) / bucketSize);
  const buckets = [];
  for (let b = startBucket; b <= endBucket; b++) {
    buckets.push({ bucketStart: b * bucketSize, firings: 0, shipped: 0 });
  }
  for (const p of series) {
    const idx = Math.floor(p.turns / bucketSize) - startBucket;
    buckets[idx].firings += 1;
    if (p.shipped === 1) buckets[idx].shipped += 1;
  }
  return buckets;
}

/** `{bucketStart: 10}` (bucket size 10) → `"10-19"` — the histogram's x-axis
 *  label for one bucket. */
function bucketLabel(bucketStart, bucketSize) {
  return `${bucketStart}-${bucketStart + bucketSize - 1}`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `"2026-08-07"` → `"08-07"` — the year is constant across this project's
 *  short history so far, so it's redundant weight on every axis label. */
function shortDay(day) {
  return day.slice(5);
}

/** `"firing-v8.4"` → `"v8.4"` — drops the constant `firing-` prefix so the
 *  per-version chart's x-axis reads as compactly as the per-day chart's does.
 *  Falls back to the raw string unchanged when the prefix isn't present (a
 *  differently-shaped Firing-Prompt-Version value should still be visible on
 *  the axis, not silently blanked). */
function shortVersion(v) {
  return v.startsWith('firing-') ? v.slice('firing-'.length) : v;
}

/**
 * `evalRows` (from `evalRegressionByPromptVersion`) sorts by firing COUNT —
 * the right order for the §4 regression table, but not for a chart meant to
 * read as "how the harness evolved over time". Reorders it into chronological
 * first-appearance order instead, derived from `series` (already oldest-first
 * — see `firingSeries`'s `ORDER BY created_at ASC`) rather than parsing the
 * version string itself: `Firing-Prompt-Version` values aren't guaranteed to
 * sort correctly as text (`firing-v8.10` < `firing-v8.2` lexicographically)
 * or even to share one naming scheme forever, but "the order firings actually
 * happened in" is always well-defined. A row whose version never appears in
 * `series` (shouldn't happen — both derive it from the same `events.payload`
 * — but never silently drop data) sorts after every dated row, in its
 * original relative order (`Array#sort` is stable).
 */
function orderEraChronologically(series, evalRows) {
  const firstSeenAt = new Map();
  for (const p of series) {
    if (p.promptVersion && !firstSeenAt.has(p.promptVersion)) {
      firstSeenAt.set(p.promptVersion, firstSeenAt.size);
    }
  }
  return [...evalRows].sort(
    (a, b) =>
      (firstSeenAt.get(a.promptVersion) ?? Infinity) -
      (firstSeenAt.get(b.promptVersion) ?? Infinity),
  );
}

// Okabe–Ito colorblind-safe qualitative palette (Okabe & Ito, 2008 — the
// standard CVD-safe reference set for scientific/data visualization):
// bluish green for the "good" status (shipped) paired with a neutral slate
// gray for "not shipped" (checkpointed/no-commit — not a failure state, so
// it gets neutral ink rather than a red/warning color).
const COLOR_SHIPPED = '#009E73';
const COLOR_UNSHIPPED = '#64748B';
const COLOR_AXIS = '#CBD5E1';
const COLOR_INK = '#1F2937';
// Same Okabe–Ito palette, the "blue" swatch — cost is a distinct semantic
// from the shipped/not-shipped split above, so it gets its own color rather
// than reusing COLOR_SHIPPED (which would visually imply "good").
const COLOR_COST = '#0072B2';

/**
 * A static, accessible stacked-bar SVG — the DATA:SERIES chart data plane's
 * first consumer (backlog web-msnsgcvf-zgmo7i: "no chart consumes it yet").
 * One bar per day, `shipped` stacked under `firings - shipped` ("not
 * shipped": checkpointed or no-commit outcomes), so the bar height reads as
 * total activity and the split reads as shipped rate — both in one measure
 * (a firing count), never a dual-axis chart. Embedded as inline markup
 * (GitHub renders raw `<svg>` inside a Markdown file) rather than a
 * generated asset file, so the chart travels with the document in one diff.
 * A hand-drawn hover/tooltip layer is skipped: GitHub strips `<script>` from
 * rendered Markdown, so a static document can't host real interactivity —
 * the adjacent `DATA:SERIES` JSON block already serves as the exact-value
 * "table view" a reader or screen reader can consult instead.
 */
function renderPerDayChartSvg(perDay) {
  const width = 640;
  const height = 260;
  const marginLeft = 44;
  const marginRight = 16;
  const marginTop = 52;
  const marginBottom = 34;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const plotBottom = marginTop + plotHeight;

  const yMax = Math.max(1, ...perDay.map((d) => d.firings));
  const scaleY = (n) => (n / yMax) * plotHeight;

  const groupWidth = plotWidth / perDay.length;
  const barWidth = Math.min(48, groupWidth * 0.55);
  const gapPx = 2; // the mark spec's 2px surface gap between stacked fills

  const bars = perDay
    .map((d, i) => {
      const unshipped = d.firings - d.shipped;
      const x = marginLeft + i * groupWidth + (groupWidth - barWidth) / 2;
      const shippedH = Math.max(0, scaleY(d.shipped) - (unshipped > 0 ? gapPx / 2 : 0));
      const unshippedH = Math.max(0, scaleY(unshipped) - (d.shipped > 0 ? gapPx / 2 : 0));
      const shippedY = plotBottom - shippedH;
      const unshippedY = shippedY - gapPx - unshippedH;
      const labelX = x + barWidth / 2;
      const parts = [];
      if (d.shipped > 0) {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${shippedY.toFixed(1)}" width="${barWidth.toFixed(1)}"` +
            ` height="${shippedH.toFixed(1)}" rx="3" fill="${COLOR_SHIPPED}">` +
            `<title>${escapeXml(d.day)}: ${d.shipped} shipped</title></rect>`,
        );
      }
      if (unshipped > 0) {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${unshippedY.toFixed(1)}" width="${barWidth.toFixed(1)}"` +
            ` height="${unshippedH.toFixed(1)}" rx="3" fill="${COLOR_UNSHIPPED}">` +
            `<title>${escapeXml(d.day)}: ${unshipped} not shipped</title></rect>`,
        );
      }
      parts.push(
        `<text x="${labelX.toFixed(1)}" y="${(plotBottom + 16).toFixed(1)}"` +
          ` text-anchor="middle" font-size="11" fill="${COLOR_INK}">${escapeXml(shortDay(d.day))}</text>`,
      );
      return parts.join('');
    })
    .join('');

  const legendY = 22;
  const legend =
    `<rect x="${marginLeft}" y="${legendY - 9}" width="10" height="10" rx="2" fill="${COLOR_SHIPPED}"/>` +
    `<text x="${marginLeft + 16}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Shipped</text>` +
    `<rect x="${marginLeft + 84}" y="${legendY - 9}" width="10" height="10" rx="2" fill="${COLOR_UNSHIPPED}"/>` +
    `<text x="${marginLeft + 100}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Not shipped</text>`;

  const axis =
    `<line x1="${marginLeft}" y1="${plotBottom}" x2="${width - marginRight}" y2="${plotBottom}" stroke="${COLOR_AXIS}" stroke-width="1"/>` +
    `<text x="${marginLeft - 8}" y="${marginTop + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">${yMax}</text>` +
    `<text x="${marginLeft - 8}" y="${plotBottom + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">0</text>`;

  const first = perDay[0]?.day ?? '';
  const last = perDay[perDay.length - 1]?.day ?? '';
  const title = 'Firings per day, split into shipped vs. not shipped';
  const desc =
    `Stacked bar chart, ${perDay.length} day(s) from ${first} to ${last}. ` +
    perDay.map((d) => `${d.day}: ${d.shipped} shipped of ${d.firings} firing(s)`).join('; ') +
    '. Exact values are also in the DATA:SERIES JSON block below.';

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none"/>` +
    legend +
    axis +
    bars +
    '</svg>'
  );
}

/**
 * The same stacked-bar grammar as {@link renderPerDayChartSvg} (shipped
 * stacked under not-shipped, so bar height reads as total activity and the
 * split reads as shipped rate), one bar per `Firing-Prompt-Version` instead
 * of per calendar day — the "per-version bars" half of backlog
 * web-msnshaur-n40j8o ("PAPER interactive charts"). `perEra` must already be
 * in the chronological order {@link orderEraChronologically} produces; this
 * function only renders.
 */
function renderPerEraChartSvg(perEra) {
  const width = 640;
  const height = 260;
  const marginLeft = 44;
  const marginRight = 16;
  const marginTop = 52;
  const marginBottom = 34;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const plotBottom = marginTop + plotHeight;

  const yMax = Math.max(1, ...perEra.map((d) => d.firings));
  const scaleY = (n) => (n / yMax) * plotHeight;

  const groupWidth = plotWidth / perEra.length;
  const barWidth = Math.min(48, groupWidth * 0.55);
  const gapPx = 2; // the mark spec's 2px surface gap between stacked fills

  const bars = perEra
    .map((d, i) => {
      const unshipped = d.firings - d.shipped;
      const x = marginLeft + i * groupWidth + (groupWidth - barWidth) / 2;
      const shippedH = Math.max(0, scaleY(d.shipped) - (unshipped > 0 ? gapPx / 2 : 0));
      const unshippedH = Math.max(0, scaleY(unshipped) - (d.shipped > 0 ? gapPx / 2 : 0));
      const shippedY = plotBottom - shippedH;
      const unshippedY = shippedY - gapPx - unshippedH;
      const labelX = x + barWidth / 2;
      const parts = [];
      if (d.shipped > 0) {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${shippedY.toFixed(1)}" width="${barWidth.toFixed(1)}"` +
            ` height="${shippedH.toFixed(1)}" rx="3" fill="${COLOR_SHIPPED}">` +
            `<title>${escapeXml(d.promptVersion)}: ${d.shipped} shipped</title></rect>`,
        );
      }
      if (unshipped > 0) {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${unshippedY.toFixed(1)}" width="${barWidth.toFixed(1)}"` +
            ` height="${unshippedH.toFixed(1)}" rx="3" fill="${COLOR_UNSHIPPED}">` +
            `<title>${escapeXml(d.promptVersion)}: ${unshipped} not shipped</title></rect>`,
        );
      }
      parts.push(
        `<text x="${labelX.toFixed(1)}" y="${(plotBottom + 16).toFixed(1)}"` +
          ` text-anchor="middle" font-size="11" fill="${COLOR_INK}">${escapeXml(shortVersion(d.promptVersion))}</text>`,
      );
      return parts.join('');
    })
    .join('');

  const legendY = 22;
  const legend =
    `<rect x="${marginLeft}" y="${legendY - 9}" width="10" height="10" rx="2" fill="${COLOR_SHIPPED}"/>` +
    `<text x="${marginLeft + 16}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Shipped</text>` +
    `<rect x="${marginLeft + 84}" y="${legendY - 9}" width="10" height="10" rx="2" fill="${COLOR_UNSHIPPED}"/>` +
    `<text x="${marginLeft + 100}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Not shipped</text>`;

  const axis =
    `<line x1="${marginLeft}" y1="${plotBottom}" x2="${width - marginRight}" y2="${plotBottom}" stroke="${COLOR_AXIS}" stroke-width="1"/>` +
    `<text x="${marginLeft - 8}" y="${marginTop + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">${yMax}</text>` +
    `<text x="${marginLeft - 8}" y="${plotBottom + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">0</text>`;

  const first = perEra[0]?.promptVersion ?? '';
  const last = perEra[perEra.length - 1]?.promptVersion ?? '';
  const title = 'Firings per prompt version, split into shipped vs. not shipped';
  const desc =
    `Stacked bar chart, ${perEra.length} prompt version(s), chronologically from ${first} to ${last}. ` +
    perEra
      .map((d) => `${d.promptVersion}: ${d.shipped} shipped of ${d.firings} firing(s)`)
      .join('; ') +
    '. Exact values are also in the DATA:SERIES JSON block below (`perEra`).';

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none"/>` +
    legend +
    axis +
    bars +
    '</svg>'
  );
}

/**
 * A static, accessible line-chart SVG of `costUsd` per day — the "cost
 * timeline" chart from backlog web-msnshaur-n40j8o's original scope, the
 * third consumer of the DATA:SERIES chart data plane after the per-day and
 * per-version stacked bars above. Single series (no shipped/not-shipped
 * split — cost is incurred regardless of outcome), so it gets its own color
 * (`COLOR_COST`) rather than the shipped/unshipped pair. Same x-axis slot
 * centering as {@link renderPerDayChartSvg} so the two charts' day columns
 * line up when read side by side. A flat/zero series (`yMax` would be 0)
 * still renders a valid baseline rather than dividing by zero.
 */
function renderCostTimelineChartSvg(perDay) {
  const width = 640;
  const height = 260;
  const marginLeft = 44;
  const marginRight = 16;
  const marginTop = 52;
  const marginBottom = 34;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const plotBottom = marginTop + plotHeight;

  const yMax = Math.max(0.01, ...perDay.map((d) => d.costUsd));
  const scaleY = (n) => (n / yMax) * plotHeight;

  const groupWidth = plotWidth / perDay.length;
  const points = perDay.map((d, i) => ({
    x: marginLeft + i * groupWidth + groupWidth / 2,
    y: plotBottom - scaleY(d.costUsd),
    d,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const dots = points
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${COLOR_COST}">` +
        `<title>${escapeXml(p.d.day)}: ${escapeXml(money(p.d.costUsd))}</title></circle>`,
    )
    .join('');

  const labels = points
    .map(
      (p) =>
        `<text x="${p.x.toFixed(1)}" y="${(plotBottom + 16).toFixed(1)}"` +
        ` text-anchor="middle" font-size="11" fill="${COLOR_INK}">${escapeXml(shortDay(p.d.day))}</text>`,
    )
    .join('');

  const legendY = 22;
  const legend =
    `<line x1="${marginLeft}" y1="${legendY - 4}" x2="${marginLeft + 10}" y2="${legendY - 4}" stroke="${COLOR_COST}" stroke-width="2"/>` +
    `<text x="${marginLeft + 16}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Cost (USD)</text>`;

  const axis =
    `<line x1="${marginLeft}" y1="${plotBottom}" x2="${width - marginRight}" y2="${plotBottom}" stroke="${COLOR_AXIS}" stroke-width="1"/>` +
    `<text x="${marginLeft - 8}" y="${marginTop + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">${escapeXml(money(yMax))}</text>` +
    `<text x="${marginLeft - 8}" y="${plotBottom + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">$0</text>`;

  const first = perDay[0]?.day ?? '';
  const last = perDay[perDay.length - 1]?.day ?? '';
  const title = 'Cost per day (USD)';
  const desc =
    `Line chart, ${perDay.length} day(s) from ${first} to ${last}. ` +
    perDay.map((d) => `${d.day}: ${money(d.costUsd)}`).join('; ') +
    '. Exact values are also in the DATA:SERIES JSON block below.';

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none"/>` +
    legend +
    axis +
    `<path d="${linePath}" fill="none" stroke="${COLOR_COST}" stroke-width="2"/>` +
    dots +
    labels +
    '</svg>'
  );
}

/**
 * A static, accessible line-chart SVG of the {@link rollingShipRate} series —
 * the "rolling ship-rate" chart from backlog web-msnshaur-n40j8o's original
 * scope (per-version bars and cost timeline already shipped; turns histogram
 * is the one still outstanding). Y-axis is a fixed 0–100% (a rate, unlike the
 * open-ended day/version bar charts), so `yMax` is never data-dependent and
 * never zero. Uses `COLOR_SHIPPED` (green) rather than `COLOR_COST`: this is
 * a "how healthy is shipping" signal, the same semantic the per-day chart's
 * green segment already carries, not a new one. Same x-axis slot centering
 * as {@link renderPerDayChartSvg} / {@link renderCostTimelineChartSvg} so all
 * three per-day charts' day columns line up when read side by side.
 */
function renderRollingShipRateChartSvg(
  perDay,
  rolling,
  windowDays = ROLLING_SHIP_RATE_WINDOW_DAYS,
) {
  const width = 640;
  const height = 260;
  const marginLeft = 44;
  const marginRight = 16;
  const marginTop = 52;
  const marginBottom = 34;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const plotBottom = marginTop + plotHeight;

  const scaleY = (rate) => rate * plotHeight;

  const groupWidth = plotWidth / perDay.length;
  const points = perDay.map((d, i) => ({
    x: marginLeft + i * groupWidth + groupWidth / 2,
    y: plotBottom - scaleY(rolling[i]),
    day: d.day,
    rate: rolling[i],
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const dots = points
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${COLOR_SHIPPED}">` +
        `<title>${escapeXml(p.day)}: ${(p.rate * 100).toFixed(1)}%</title></circle>`,
    )
    .join('');

  const labels = points
    .map(
      (p) =>
        `<text x="${p.x.toFixed(1)}" y="${(plotBottom + 16).toFixed(1)}"` +
        ` text-anchor="middle" font-size="11" fill="${COLOR_INK}">${escapeXml(shortDay(p.day))}</text>`,
    )
    .join('');

  const legendY = 22;
  const legend =
    `<line x1="${marginLeft}" y1="${legendY - 4}" x2="${marginLeft + 10}" y2="${legendY - 4}" stroke="${COLOR_SHIPPED}" stroke-width="2"/>` +
    `<text x="${marginLeft + 16}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Ship rate (${windowDays}d rolling)</text>`;

  const axis =
    `<line x1="${marginLeft}" y1="${plotBottom}" x2="${width - marginRight}" y2="${plotBottom}" stroke="${COLOR_AXIS}" stroke-width="1"/>` +
    `<text x="${marginLeft - 8}" y="${marginTop + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">100%</text>` +
    `<text x="${marginLeft - 8}" y="${plotBottom + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">0%</text>`;

  const first = perDay[0]?.day ?? '';
  const last = perDay[perDay.length - 1]?.day ?? '';
  const title = `Ship rate (%), ${windowDays}-day rolling`;
  const desc =
    `Line chart, ${perDay.length} day(s) from ${first} to ${last}. ` +
    points.map((p) => `${p.day}: ${(p.rate * 100).toFixed(1)}%`).join('; ') +
    '. Exact values are also in the DATA:SERIES JSON block below.';

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none"/>` +
    legend +
    axis +
    `<path d="${linePath}" fill="none" stroke="${COLOR_SHIPPED}" stroke-width="2"/>` +
    dots +
    labels +
    '</svg>'
  );
}

/**
 * The same stacked-bar grammar as {@link renderPerDayChartSvg} /
 * {@link renderPerEraChartSvg}, one bar per turn-count bucket instead of per
 * day/version — the "turns histogram" slice of backlog web-msnshaur-n40j8o
 * ("PAPER interactive charts"; per-version bars, cost timeline, and rolling
 * ship-rate already shipped). Unlike those two, the x-axis here is a
 * distribution (turn-count ranges), not a timeline — bars read as "how many
 * firings took roughly this many turns", split shipped/not-shipped so the
 * same "how healthy is shipping" signal carries across bucket ranges too.
 */
function renderTurnsHistogramChartSvg(histogram, bucketSize = TURNS_HISTOGRAM_BUCKET_SIZE) {
  const width = 640;
  const height = 260;
  const marginLeft = 44;
  const marginRight = 16;
  const marginTop = 52;
  const marginBottom = 34;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const plotBottom = marginTop + plotHeight;

  const yMax = Math.max(1, ...histogram.map((d) => d.firings));
  const scaleY = (n) => (n / yMax) * plotHeight;

  const groupWidth = plotWidth / histogram.length;
  const barWidth = Math.min(48, groupWidth * 0.55);
  const gapPx = 2; // the mark spec's 2px surface gap between stacked fills

  const bars = histogram
    .map((d, i) => {
      const label = bucketLabel(d.bucketStart, bucketSize);
      const unshipped = d.firings - d.shipped;
      const x = marginLeft + i * groupWidth + (groupWidth - barWidth) / 2;
      const shippedH = Math.max(0, scaleY(d.shipped) - (unshipped > 0 ? gapPx / 2 : 0));
      const unshippedH = Math.max(0, scaleY(unshipped) - (d.shipped > 0 ? gapPx / 2 : 0));
      const shippedY = plotBottom - shippedH;
      const unshippedY = shippedY - gapPx - unshippedH;
      const labelX = x + barWidth / 2;
      const parts = [];
      if (d.shipped > 0) {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${shippedY.toFixed(1)}" width="${barWidth.toFixed(1)}"` +
            ` height="${shippedH.toFixed(1)}" rx="3" fill="${COLOR_SHIPPED}">` +
            `<title>${escapeXml(label)} turns: ${d.shipped} shipped</title></rect>`,
        );
      }
      if (unshipped > 0) {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${unshippedY.toFixed(1)}" width="${barWidth.toFixed(1)}"` +
            ` height="${unshippedH.toFixed(1)}" rx="3" fill="${COLOR_UNSHIPPED}">` +
            `<title>${escapeXml(label)} turns: ${unshipped} not shipped</title></rect>`,
        );
      }
      parts.push(
        `<text x="${labelX.toFixed(1)}" y="${(plotBottom + 16).toFixed(1)}"` +
          ` text-anchor="middle" font-size="11" fill="${COLOR_INK}">${escapeXml(label)}</text>`,
      );
      return parts.join('');
    })
    .join('');

  const legendY = 22;
  const legend =
    `<rect x="${marginLeft}" y="${legendY - 9}" width="10" height="10" rx="2" fill="${COLOR_SHIPPED}"/>` +
    `<text x="${marginLeft + 16}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Shipped</text>` +
    `<rect x="${marginLeft + 84}" y="${legendY - 9}" width="10" height="10" rx="2" fill="${COLOR_UNSHIPPED}"/>` +
    `<text x="${marginLeft + 100}" y="${legendY}" font-size="12" fill="${COLOR_INK}">Not shipped</text>`;

  const axis =
    `<line x1="${marginLeft}" y1="${plotBottom}" x2="${width - marginRight}" y2="${plotBottom}" stroke="${COLOR_AXIS}" stroke-width="1"/>` +
    `<text x="${marginLeft - 8}" y="${marginTop + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">${yMax}</text>` +
    `<text x="${marginLeft - 8}" y="${plotBottom + 4}" text-anchor="end" font-size="11" fill="${COLOR_INK}">0</text>`;

  const first = histogram[0] ? bucketLabel(histogram[0].bucketStart, bucketSize) : '';
  const last = histogram[histogram.length - 1]
    ? bucketLabel(histogram[histogram.length - 1].bucketStart, bucketSize)
    : '';
  const title = 'Firings by turn count, split into shipped vs. not shipped';
  const desc =
    `Stacked bar chart, ${histogram.length} bucket(s) of ${bucketSize} turns each, from ${first} to ${last}. ` +
    histogram
      .map(
        (d) =>
          `${bucketLabel(d.bucketStart, bucketSize)} turns: ${d.shipped} shipped of ${d.firings} firing(s)`,
      )
      .join('; ') +
    '. Exact values are also in the DATA:SERIES JSON block below (`turnsHistogram`).';

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none"/>` +
    legend +
    axis +
    bars +
    '</svg>'
  );
}

/** The `DATA:CHART` block: the per-day/per-version/turns-bucket stacked-bar
 *  SVGs and the cost-timeline/ship-rate line charts, each independently
 *  omitted when there is nothing of that kind to chart yet, wrapped in the
 *  same generated-provenance line every other §4 block carries. */
function renderChart(perDay, perEra, histogram) {
  const generatedAt = new Date().toISOString();
  if (perDay.length === 0 && perEra.length === 0) {
    return [
      CHART_MARKER_START,
      `_Generated ${generatedAt} by \`pnpm self-study:update\` — no firings recorded yet, nothing to chart._`,
      CHART_MARKER_END,
    ].join('\n');
  }
  const lines = [
    CHART_MARKER_START,
    `_Generated ${generatedAt} by \`pnpm self-study:update\` — the \`DATA:SERIES\` block's \`perDay\`/\`perEra\`/` +
      '`turnsHistogram` rollups, charted (backlog web-msnsgcvf-zgmo7i, web-msnshaur-n40j8o). Colorblind-safe (Okabe–Ito);' +
      ' exact values are in the JSON block below.',
  ];
  if (perDay.length > 0) {
    lines.push('', '**Firings per day**', '', renderPerDayChartSvg(perDay));
    lines.push('', '**Cost per day**', '', renderCostTimelineChartSvg(perDay));
    lines.push(
      '',
      `**Ship rate (${ROLLING_SHIP_RATE_WINDOW_DAYS}-day rolling)**`,
      '',
      renderRollingShipRateChartSvg(perDay, rollingShipRate(perDay)),
    );
  }
  if (perEra.length > 0) {
    lines.push('', '**Firings per prompt version**', '', renderPerEraChartSvg(perEra));
  }
  if (histogram.length > 0) {
    lines.push('', '**Firings by turn count**', '', renderTurnsHistogramChartSvg(histogram));
  }
  lines.push(CHART_MARKER_END);
  return lines.join('\n');
}

/**
 * The `DATA:SERIES` block (backlog web-msnsgcvf-zgmo7i, "the chart data
 * plane"): per-firing rows (oldest first), per-day aggregates, per-era
 * (`Firing-Prompt-Version`) comparison, and a turn-count histogram — a
 * machine-readable JSON payload backing every §4 chart, sitting alongside the
 * human-readable `DATA:SUMMARY` tables rather than replacing them. `evalRows`
 * is the same `evalRegressionByPromptVersion` result §4's "Eval regression by
 * prompt version" table already renders — reused here as the per-era rollup
 * instead of a second aggregation over the same data.
 */
function renderSeries(project, series, evalRows) {
  const generatedAt = new Date().toISOString();
  const perDay = perDayAggregates(series);
  const rolling = rollingShipRate(perDay);
  const payload = {
    generatedAt,
    project: project.slug,
    perFiring: series.map((p) => ({
      firingId: p.firingId,
      day: p.day,
      sha: p.sha,
      kind: p.kind,
      shipped: p.shipped === 1,
      completion: p.completion,
      outcome: p.outcome,
      promptVersion: p.promptVersion,
      costUsd: p.costUsd,
      turns: p.turns,
    })),
    perDay: perDay.map((d, i) => ({ ...d, rollingShipRate: rolling[i] })),
    perEra: evalRows.map((r) => ({
      promptVersion: r.promptVersion,
      firings: r.firings,
      shipped: r.shipped,
      passRate: Number(r.passRate.toFixed(4)),
      medianTurns: r.medianTurns,
      costVariance: r.costVariance,
      costPerSolved: r.costPerSolved,
    })),
    turnsHistogram: turnsHistogram(series).map((d) => ({
      ...d,
      bucketLabel: bucketLabel(d.bucketStart, TURNS_HISTOGRAM_BUCKET_SIZE),
    })),
  };
  return [
    SERIES_MARKER_START,
    `_Generated ${generatedAt} by \`pnpm self-study:update\` — the chart data plane behind §4` +
      ' (backlog web-msnsgcvf-zgmo7i). Per-firing rows (oldest first), per-day aggregates, and' +
      ' per-era (`Firing-Prompt-Version`) comparison, derived from the same telemetry the tables' +
      ' above summarize. Machine-readable, not meant for hand-reading; never hand-edit._',
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    SERIES_MARKER_END,
  ].join('\n');
}

/**
 * This flight's own firing/shipped counts, passed by fly.ts as env vars — the
 * "defined update trigger" (JMIR living-synthesis model) for an automated §8
 * entry. Unset or non-positive (e.g. a plain `pnpm self-study:update` run by
 * hand) means "no entry": a flight, or a manual run, that shipped nothing is
 * not new evidence.
 */
function flightTrigger(env = process.env) {
  const firings = Number(env.SELF_STUDY_FLIGHT_FIRINGS ?? '');
  if (!Number.isFinite(firings) || firings <= 0) return null;
  const shipped = Number(env.SELF_STUDY_FLIGHT_SHIPPED ?? '');
  return { firings, shipped: Number.isFinite(shipped) ? shipped : 0 };
}

/** The cumulative totals a PRIOR run's `DATA:SERIES` block reported, parsed
 *  from `source` before this run overwrites it — `null` when the block is
 *  missing (pre-dates web-msnsgcvf-zgmo7i) or unparseable, so the caller can
 *  degrade to "no delta" rather than throw. */
function previousSeriesSnapshot(source) {
  const start = source.indexOf(SERIES_MARKER_START);
  const end = source.indexOf(SERIES_MARKER_END);
  if (start === -1 || end === -1) return null;
  const block = source.slice(start, end);
  const fenceStart = block.indexOf('```json');
  const fenceEnd = block.lastIndexOf('```');
  if (fenceStart === -1 || fenceEnd <= fenceStart) return null;
  try {
    return JSON.parse(block.slice(fenceStart + '```json'.length, fenceEnd));
  } catch {
    return null;
  }
}

/** Reduces a parsed `DATA:SERIES` snapshot to the three cumulative numbers §8's
 *  delta chips compare against — the same fields `firingStats` reports, derived
 *  here from `perFiring` instead of a second store query. */
function summarizeSnapshot(snapshot) {
  const rows = snapshot.perFiring ?? [];
  return {
    firings: rows.length,
    shipped: rows.filter((r) => r.shipped).length,
    costUsd: rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
  };
}

/** The short SHA of the commit that last touched PAPER_PATH BEFORE this run's
 *  write — i.e. "the previous version" a reader can diff against once this
 *  run's own change lands. `null` when git is unavailable or the file has no
 *  history yet (degrades silently, same convention as `promptVersionBySha`). */
function previousPaperSha() {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%h', '--', 'docs/SELF-STUDY/PAPER.md'],
      { encoding: 'utf8', cwd: process.cwd() },
    ).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** The `origin` remote's browsable GitHub base (`https://github.com/OWNER/REPO`),
 *  or `null` when there is no such remote, git is unavailable, or the remote
 *  isn't github.com — a non-GitHub host's blob URL scheme differs, so this
 *  stays conservative rather than emit a link that resolves nowhere. Accepts
 *  both the `https://github.com/OWNER/REPO(.git)` and `git@github.com:OWNER/
 *  REPO(.git)` remote forms. */
function githubRemoteBase() {
  let url;
  try {
    url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      cwd: process.cwd(),
    }).trim();
  } catch {
    return null;
  }
  const m =
    url.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(\.git)?$/) ??
    url.match(/^git@github\.com:([^/]+)\/(.+?)(\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

/** The previous PAPER version's browsable GitHub blob URL for `sha` — the
 *  clickable half of "view what changed" (`git diff` above is the exact
 *  half). `null` when {@link githubRemoteBase} can't resolve a GitHub
 *  origin, degrading silently like `previousPaperSha` — the very first
 *  automated entry, or a non-GitHub clone, simply omits the link. */
function previousPaperBlobUrl(sha) {
  const base = githubRemoteBase();
  return base ? `${base}/blob/${sha}/docs/SELF-STUDY/PAPER.md` : null;
}

/** `"prev → curr (chip)"` for a whole-number metric — `chip` is `+N ↑` / `N ↓` /
 *  `no change`, always spelled out in words alongside the arrow (not color-only,
 *  so it reads fine without the arrow glyph too). */
function fmtIntDelta(prev, curr) {
  const diff = curr - prev;
  const chip = diff > 0 ? `+${diff} ↑` : diff < 0 ? `${diff} ↓` : 'no change';
  return `${prev} → ${curr} (${chip})`;
}

/** Same shape as {@link fmtIntDelta} for a USD amount. */
function fmtCostDelta(prev, curr) {
  const diff = curr - prev;
  const abs = `$${Math.abs(diff).toFixed(2)}`;
  const chip = diff > 0 ? `+${abs} ↑` : diff < 0 ? `-${abs} ↓` : 'no change';
  return `$${prev.toFixed(2)} → $${curr.toFixed(2)} (${chip})`;
}

/**
 * Appends one dated, machine-generated bullet to §8 Evidence Log (append-only,
 * newest last — see the section's own stated convention). A no-op (returns
 * `source` unchanged) if the heading is somehow missing rather than throwing —
 * must never abort the §4 refresh that already succeeded by this point.
 *
 * `delta` (backlog web-msnsgcyq-36jf4u, "PAPER change visibility") is optional
 * context so the reader always sees WHAT changed since the last update: DELTA
 * chips comparing this run's `stats` against the PREVIOUS run's `DATA:SERIES`
 * snapshot, a `git diff` hint against the commit that last touched this file,
 * and — when the origin remote is GitHub — a clickable link to that prior
 * commit's version of the file. All three are omitted (not blanked) when
 * there is no prior snapshot or no git history — the very first automated
 * entry has nothing to diff against.
 */
function appendEvidenceEntry(source, dateStr, totalFirings, trigger, delta) {
  if (!source.includes(EVIDENCE_HEADING)) return source;
  const body = source.endsWith('\n') ? source : `${source}\n`;
  const lines = [
    `- **${dateStr}** — Automated flight update: ${trigger.firings} firing(s) this flight` +
      ` (${trigger.shipped} shipped), ${totalFirings} total recorded.`,
  ];
  if (delta?.prevTotals) {
    const { prevTotals, stats } = delta;
    lines.push(
      `  - Since the previous update: firings ${fmtIntDelta(prevTotals.firings, stats.firings)}` +
        `, shipped ${fmtIntDelta(prevTotals.shipped, stats.shipped)}` +
        `, total cost ${fmtCostDelta(prevTotals.costUsd, stats.cost)}.`,
    );
  }
  if (delta?.prevSha) {
    lines.push(
      `  - View what changed: \`git diff ${delta.prevSha} -- docs/SELF-STUDY/PAPER.md\`` +
        ' (this document as of the previous update, vs. now).',
    );
    if (delta.prevBlobUrl) {
      lines.push(`  - [View the previous version on GitHub](${delta.prevBlobUrl})`);
    }
  }
  return body + lines.join('\n') + '\n';
}

function main() {
  const dbPath = resolveDbPath();
  const store = openStore(dbPath, { readonly: true });
  try {
    const projects = listProjects(store.db);
    if (projects.length === 0) {
      console.log('generate-data: no projects recorded yet — nothing to summarize.');
      return;
    }
    // Single-subject study (MASTER-PLAN §18.1): AUTOPILOT flying its own repo
    // is the one project this store tracks in practice; summarize the first.
    const project = projects[0];
    const stats = firingStats(store.db, project.id);
    const gate = gateResultDistribution(store.db, project.id);
    const completion = completionDistribution(store.db, project.id);
    const kind = kindDistribution(store.db, project.id);
    const shas = shippedShas(store.db, project.id);
    const promptVersion = promptVersionDistribution(shas, promptVersionBySha());
    const range = dateRange(store.db, project.id);
    const evalRows = evalRegressionByPromptVersion(store.db, project.id);
    const pinnedSuite = readPinnedSuite();
    const pinnedEvalRows = pinnedSuite
      ? evalRegressionOverPinnedSuite(
          store.db,
          project.id,
          pinnedSuite.tasks.map((t) => t.firingId),
        )
      : [];
    const pickSourceRows = evalRegressionByPickSource(store.db, project.id);
    const evaluationLabels = evaluationLabelSummary(store.db, project.id);
    const testFirst = testFirstCompliance(store.db, project.id);
    const pickDiscipline = pickDisciplineAudit(store.db, project.id);
    const boardDiversity = boardDiversityAudit(store.db, project.id);
    const parallelSavings = gateParallelSavings(store.db, project.id);
    const warmSessions = warmSessionSavings(store.db, project.id);
    const extendedFirings = extendedFiringSavings(store.db, project.id);
    const series = firingSeries(store.db, project.id);

    const block = renderSummary(
      project,
      stats,
      gate,
      completion,
      kind,
      promptVersion,
      shas.length,
      range,
      evalRows,
      pinnedSuite,
      pinnedEvalRows,
      pickSourceRows,
      evaluationLabels,
      testFirst,
      pickDiscipline,
      boardDiversity,
      parallelSavings,
      warmSessions,
      extendedFirings,
    );
    const seriesBlock = renderSeries(project, series, evalRows);
    const chartBlock = renderChart(
      perDayAggregates(series),
      orderEraChronologically(series, evalRows),
      turnsHistogram(series),
    );
    const source = readFileSync(PAPER_PATH, 'utf8');
    const prevSnapshot = previousSeriesSnapshot(source);
    const prevSha = previousPaperSha();
    const prevBlobUrl = prevSha ? previousPaperBlobUrl(prevSha) : null;
    let next = replaceBlock(source, block);
    next = replaceBlock(next, chartBlock, CHART_MARKER_START, CHART_MARKER_END);
    next = replaceBlock(next, seriesBlock, SERIES_MARKER_START, SERIES_MARKER_END);
    const trigger = flightTrigger();
    if (trigger) {
      next = appendEvidenceEntry(next, isoDate(Date.now()), stats.firings, trigger, {
        prevTotals: prevSnapshot ? summarizeSnapshot(prevSnapshot) : null,
        prevSha,
        prevBlobUrl,
        stats,
      });
    }
    writeFileSync(PAPER_PATH, next);
    console.log(
      `generate-data: DATA:SUMMARY + DATA:CHART + DATA:SERIES refreshed in ${PAPER_PATH} (${stats.firings} firings).` +
        (trigger ? ' Evidence log entry appended.' : ''),
    );
  } finally {
    store.close();
  }
}

main();
