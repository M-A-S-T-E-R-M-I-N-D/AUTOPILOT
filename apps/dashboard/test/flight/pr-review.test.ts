// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  touchesSecuritySensitivePath,
  planPrReview,
  planPrReviewCommands,
  planPrReviewBatch,
  resolvePrReviewAutoMergePolicy,
  prHasHoldLabel,
  HOLD_LABEL_MARKERS,
  MAX_AUTO_MERGE_CHANGED_LINES,
  MAX_PR_LIST_CANDIDATES,
  fetchOpenPrCandidates,
  fetchOpenPrCandidateReport,
  assessPrAlreadyApplied,
  assessPrDiff,
  annotateAlreadyApplied,
  annotateReviewThreads,
  fetchUnresolvedReviewThreadCounts,
  parseGitApplyConflictPaths,
  parseDiffRenameSources,
  executePrReviewCommands,
  remediateDanglingApproval,
  isRitualPolicyGreenApprovalBody,
} from '../../src/flight/pr-review.js';
import type { CliExec } from '../../src/connection/cli-probe.js';
import type { PrReviewCandidate } from '../../src/flight/pr-review.js';

const ENGINE_ADAPTERS_DIR = fileURLToPath(
  new URL('../../../../packages/engine/src/adapters', import.meta.url),
);

const ENGINE_SRC_DIR = fileURLToPath(new URL('../../../../packages/engine/src', import.meta.url));

const MCP_SRC_DIR = fileURLToPath(new URL('../../../../packages/mcp/src', import.meta.url));

const STORE_SRC_DIR = fileURLToPath(new URL('../../../../packages/store/src', import.meta.url));

const ONBOARDING_BACKUP_SRC_DIR = fileURLToPath(
  new URL('../../../../packages/onboarding/src/backup', import.meta.url),
);

const ONBOARDING_ADAPTERS_SRC_DIR = fileURLToPath(
  new URL('../../../../packages/onboarding/src/adapters', import.meta.url),
);

const ONBOARDING_GATE_SRC_DIR = fileURLToPath(
  new URL('../../../../packages/onboarding/src/gate', import.meta.url),
);

const ONBOARDING_GATE_DETECTORS_SRC_DIR = fileURLToPath(
  new URL('../../../../packages/onboarding/src/gate/detectors', import.meta.url),
);

const ONBOARDING_ONBOARD_SRC_DIR = fileURLToPath(
  new URL('../../../../packages/onboarding/src/onboard', import.meta.url),
);

const ONBOARDING_INDEX_SRC_DIR = fileURLToPath(
  new URL('../../../../packages/onboarding/src/index', import.meta.url),
);

const ONBOARDING_SRC_DIR = fileURLToPath(
  new URL('../../../../packages/onboarding/src', import.meta.url),
);

const FLIGHT_SRC_DIR = fileURLToPath(new URL('../../src/flight', import.meta.url));

const DASHBOARD_SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));

const ASK_SRC_DIR = fileURLToPath(new URL('../../src/ask', import.meta.url));

const READ_SRC_DIR = fileURLToPath(new URL('../../src/read', import.meta.url));

const SHARED_SRC_DIR = fileURLToPath(new URL('../../src/shared', import.meta.url));

const ASSETS_SRC_DIR = fileURLToPath(new URL('../../src/assets', import.meta.url));

const CONNECTION_SRC_DIR = fileURLToPath(new URL('../../src/connection', import.meta.url));

const CONTROL_SRC_DIR = fileURLToPath(new URL('../../src/control', import.meta.url));

const GITHUB_SRC_DIR = fileURLToPath(new URL('../../src/github', import.meta.url));

const LANDING_SRC_DIR = fileURLToPath(new URL('../../src/landing', import.meta.url));

const RELEASE_SRC_DIR = fileURLToPath(new URL('../../src/release', import.meta.url));

const SERVER_SRC_DIR = fileURLToPath(new URL('../../src/server', import.meta.url));

const INBOX_SRC_DIR = fileURLToPath(new URL('../../src/inbox', import.meta.url));

const WEB_SRC_DIR = fileURLToPath(new URL('../../src/web', import.meta.url));

const WEB_FEATURES_SRC_DIR = fileURLToPath(new URL('../../src/web/features', import.meta.url));

const TOKENS_SRC_DIR = fileURLToPath(new URL('../../../../packages/tokens/src', import.meta.url));

const SCRIPTS_DIR = fileURLToPath(new URL('../../../../scripts', import.meta.url));

/** `flight/*-execute.ts` files with no write/decide power of their own —
 *  deliberately empty: the `-execute.ts` suffix is this codebase's naming
 *  convention for the wiring that actually APPLIES a ritual's decision
 *  (gh merge/comment, store writes, process control), which is
 *  definitionally a write surface. A future entry here needs a written
 *  reason it genuinely carries none. */
const BENIGN_FLIGHT_EXECUTE = new Set<string>([]);

/** `flight/` files with no write/decide power of their own, so the full
 *  flight-directory census below leaves them unflagged: pure parsing,
 *  formatting, read-only detection, or proposal-only mining whose writes go
 *  through already-flagged wiring (post-flight-sweeps.ts, fly.ts) and the
 *  operator's approval gate. `guard-verify.ts` needs no entry — the broad
 *  `guard` substring marker already flags it. */
const BENIGN_FLIGHT = new Set([
  // Read-only `gh repo view --json nameWithOwner,url,isPrivate` plus a pure
  // decision about which watch/star/discussion affordances to SHOW (epic
  // 0007 slice 7). It resolves identity and renders; it never writes to
  // GitHub, so widening it changes what the operator sees, not what the
  // repo does — the pool client's own claim wiring is the flagged half.
  'publicity.ts',
  // Pure probe→plan arithmetic (the Fly bar's 🍀 calibrator): no I/O at
  // all — the server assembles the probe, this only sizes lanes/firings.
  // Its plan FILLS the Fly bar; the launch (and its spend) stays behind
  // the operator's own already-guarded Fly click.
  'lucky-plan.ts',
  // Pure bullet-title parser feeding proposal dedupe — weakening it causes
  // repeat proposals (operator-gated spam), not a safety bypass.
  'backlog.ts',
  // Read-only re-check of closed tasks against the current tree (verified:
  // no store writes) — detection quality, its findings are proposals.
  'closed-task-audit.ts',
  // Pure sequencing over INJECTED dependencies (run an injected GatePort,
  // report via an injected `out`/`recordRed`) — it decides neither which
  // gate commands run nor what gets persisted; both live in fly.ts's
  // already-flagged wiring that constructs and passes those deps in.
  'convergence-gate.ts',
  // Read-only git-timestamp drift detection; proposing doc-update tasks is
  // the same advisory class the scripts/architecture --check scripts are
  // deliberately left unflagged for.
  'doc-freshness.ts',
  // Builds the FLEET prompt digest from read-only git status/log — advisory
  // prompt text, same class as the benign engine prompt.ts.
  'fleet-digest.ts',
  // Cross-project marker counting that PROPOSES fleet-wide wisdom — the
  // write is operator-approval-gated in flagged wiring.
  'fleet-wisdom-mining.ts',
  // Pure log-line formatting of an already-computed flight summary.
  'flight-summary.ts',
  // Claim-ordering / focus-forwarding coordination policy — duplicate-work
  // quality, no write of its own.
  'focus.ts',
  // Pure filename filter for the operator's INBOX folder (the task-minting
  // write lives in inbox-triage.ts, flagged).
  'inbox.ts',
  // Writes/retires only the git-ignored .autopilot-intent coordination
  // signal and read-only-verifies ships against sibling claims —
  // anti-duplication quality, not a safety mechanism.
  'intent-claims.ts',
  // Classifies a task into a model tier — spend stays bounded by the
  // flagged budget/runner caps either way.
  'model-routing.ts',
  // Read-only resolver: given touched file paths, finds which Stryker
  // mutation config(s) under config/mutation/ target them (a static regex
  // read of each config's `mutate` array, never imported/executed). It
  // answers "which config maps to this file", not "run it" — no gate
  // execution, no decision about what ships, wired nowhere yet.
  'mutation-scope.ts',
  // Aggregates and surfaces near-miss safety SIGNALS — detection-only, its
  // output is a debrief line and recurrence flag, not an enforcement.
  'near-miss.ts',
  // Pure regex extraction of the b/-side file paths a git-show/git-diff
  // patch touches — no filesystem, no process, no decision. Shared by
  // deliverable.ts's UX-EXPRESSION check and mutation-scope.ts's
  // patch-scoped resolver, both already unflagged/benign in their own
  // right.
  'patch-files.ts',
  // Read-only pool-issue browse (PLATFORM 6/7): fetchPoolIssues only lists
  // via `gh issue list`, and poolDimension/isPoolIssue/isClaimedPoolIssue
  // are pure label/assignee classifiers — no assign, label, or comment
  // write exists yet; the claim action is a follow-up slice that will need
  // its own marker once it ships one.
  'pool-client.ts',
  // Cohesion partitioning of board tasks across the fleet — coordination
  // quality, no write of its own.
  'scope-partition.ts',
  // Pure mining decision whose proposeSoulAmendment write is
  // operator-ratification-gated in flagged wiring.
  'soul-mining.ts',
  // Parses dated verify-by headings and PROPOSES which are due — never
  // rewrites the doc.
  'verify-by.ts',
]);

/** Adapter files with no write/decide power of their own, so the coverage
 *  guard below leaves them unflagged rather than demanding every adapter
 *  carry a marker: `index.ts` is a pure re-export barrel, `clock.ts` is an
 *  injected system-clock reader, and `pacer.ts` only computes an advisory
 *  cadence suggestion (SELECT-only, no write) that `fly.ts` — already
 *  flagged — is free to use or ignore; the actual budget enforcement lives
 *  in the already-flagged flight-orchestration wiring, not here. */
const BENIGN_ADAPTERS = new Set(['index.ts', 'clock.ts', 'pacer.ts']);

/** Flat `engine/src` files with no write/decide power of their own: static
 *  descriptors and config constants (`info.ts`, `config.ts`), a pure
 *  re-export barrel (`index.ts`), formatting over already-read/computed
 *  data (`inbox.ts`, `repo-map.ts`, `telemetry.ts`), pure arithmetic or
 *  lookup tables (`pace.ts`, `routing.ts`, `resilience.ts`), advisory-only
 *  audits and prompt text with no enforcement power (`prompt-position-audit.ts`,
 *  `ask.ts`, `prompt.ts`), pure NDJSON parsing (`stream.ts`), type/interface
 *  definitions only (`ports.ts`), and pure control-flow orchestration over
 *  already-flagged injected ports — the actual gate/revert/hibernate
 *  decisions live in `firing.ts` and `resilience.ts`, not here (`loop.ts`).
 *  `guard.ts`, `guard-hook.ts`, `auth.ts`, and `containment.ts` need no
 *  entry here either — they're already caught by the broad `guard`/`auth`/
 *  `containment` substring markers above. */
const BENIGN_ENGINE_SRC = new Set([
  // usage-pool.ts: PURE list-price parser over caller-supplied strings — no
  // filesystem, no process, no decision surface; its impure sibling
  // (adapters/usage-pool-scan.ts, which READS the operator's private
  // transcripts) is flagged in SECURITY_SENSITIVE_PATH_MARKERS instead.
  'usage-pool.ts',
  // lts-check.ts: PURE version-compare policy for the CONNECT popover's LTS
  // chip — no I/O, no command decisions; the real `gh api releases/latest`
  // call lives in apps/dashboard/src/connection/gh-lts.ts (dashboard side),
  // and alignment stays an operator action by epic-0006 design.
  'lts-check.ts',
  'info.ts',
  'index.ts',
  'inbox.ts',
  'pace.ts',
  'prompt-position-audit.ts',
  'repo-map.ts',
  'routing.ts',
  'config.ts',
  'ask.ts',
  'ports.ts',
  'loop.ts',
  'resilience.ts',
  'stream.ts',
  'prompt.ts',
  'telemetry.ts',
]);

/** `packages/mcp/src` files with no write/decide power of their own:
 *  `index.ts` is a pure re-export barrel and `info.ts` is a static
 *  capability descriptor (`mcpInfo()` returns a hardcoded `readOnly: true`
 *  record, no live transport). `control.ts` — the actual write/destructive
 *  MCP tool handlers — already carries its own `'mcp/src/control.ts'`
 *  marker above, so this census's only role is catching a FUTURE file in
 *  this directory. */
const BENIGN_MCP = new Set(['index.ts', 'info.ts']);

/** `packages/store/src` files with no write/decide power of their own (or
 *  write power too narrow/reversible to earn the destructive/decide class
 *  the five flagged files above it get): `index.ts` (pure re-export barrel),
 *  `types.ts` (type-only), `read.ts` / `read-events.ts` / `stats.ts` /
 *  `rank.ts` / `orient.ts` / `dora.ts` / `warm-sessions.ts` / `eval-gate.ts`
 *  (SELECT-only query/aggregation surfaces — `evaluatePromptVersionGate` is
 *  read-only analysis with no live caller wiring it into an automated
 *  decision yet). `maintenance.ts` (`vacuumStore`) and `search.ts` /
 *  `vector.ts` (index/deindex a project's own FTS5 search cache and vector
 *  table) do write, but the write is scoped to one project's own rebuildable
 *  cache with no destructive or cross-project effect — not the
 *  merge/delete-with-cascade/credential/process class this ritual targets. */
const BENIGN_STORE = new Set([
  'index.ts',
  'types.ts',
  'read.ts',
  'read-events.ts',
  'stats.ts',
  'rank.ts',
  'orient.ts',
  'dora.ts',
  'warm-sessions.ts',
  'eval-gate.ts',
  'maintenance.ts',
  'search.ts',
  'vector.ts',
]);

/** `packages/onboarding/src/backup` files with no write/decide power of
 *  their own: `guard.ts`, `secret-guard.ts`, and `size-guard.ts` already
 *  match the bare `'guard'` marker above so need no explicit allow-listing
 *  here, but are listed anyway for a reader's clarity on why the census
 *  passes without them. `refs.ts` is tag-name constants plus the read-only
 *  `isBackedUp` check (never mutates); `errors.ts` is thrown-error classes;
 *  `types.ts` is interfaces only. `ritual.ts` — the actual folder-lock
 *  write/decide sequence — already carries its own
 *  `'onboarding/src/backup/ritual.ts'` marker above. */
const BENIGN_ONBOARDING_BACKUP = new Set(['refs.ts', 'errors.ts', 'types.ts']);

/** `packages/onboarding/src/adapters` files with no write/decide power of
 *  their own: `fs-file-source.ts` and `fs-snapshot.ts` are both explicitly
 *  read-only (their own header comments state it) walks of the target tree
 *  feeding the index and gate detectors respectively; `ignore.ts` is a pure
 *  constant Set of directory names to skip; `sqlite-index-store.ts` writes
 *  SQLite too, but — like `store/src/search.ts`/`vector.ts` — the write is a
 *  rebuildable content-hash-keyed cache scoped to one project, not the
 *  destructive/decide class `git-backup.ts` and `sqlite-project-store.ts`
 *  above already carry their own markers for. */
const BENIGN_ONBOARDING_ADAPTERS = new Set([
  'fs-file-source.ts',
  'fs-snapshot.ts',
  'ignore.ts',
  'sqlite-index-store.ts',
]);

/** `packages/onboarding/src/gate` flat files with no write/decide power of
 *  their own: `snapshot.ts`'s own header comment states it is "100%
 *  synchronous and side-effect-free" and "CANNOT touch the repo" — a pure
 *  read-only view builder, the same read-only class `adapters/fs-snapshot.ts`
 *  above already stays unflagged for; `types.ts` is interfaces and constants
 *  only, carrying no write power of its own. `detect.ts` and `manifests.ts`
 *  are the two with real decide power here and both already carry their own
 *  marker, so the census below never needs to list them. `gate/detectors/`
 *  is a nested subdirectory swept separately (same split as `web/` vs
 *  `web/features/`). */
const BENIGN_ONBOARDING_GATE = new Set(['snapshot.ts', 'types.ts']);

/** `packages/onboarding/src/gate/detectors` files with no write/decide power
 *  of their own: `js.ts`, `python.ts`, `go.ts`, and `rust.ts` are the four
 *  with real decide power here and each already carries its own marker, so
 *  the census below never needs to list them. `index.ts` is a pure
 *  re-export barrel, the same carries-no-write-power class every other
 *  package's flat `index.ts` already stays unflagged for. */
const BENIGN_ONBOARDING_GATE_DETECTORS = new Set(['index.ts']);

/** `packages/onboarding/src/onboard` files with no write/decide power of
 *  their own: `onboard.ts` (the actual locks/registers/seeds orchestrator)
 *  and `soul.ts` (the starter-doctrine text `onboard.ts` writes verbatim)
 *  are the two with real power here and both already carry their own
 *  marker, so the census below never needs to list them. `types.ts` is
 *  interfaces only, the same carries-no-write-power class every other
 *  package's `types.ts` already stays unflagged for. `folder-triage.ts` and
 *  `detect-issues.ts` are both explicitly pure over a read-only
 *  `FsSnapshot` and never touch the folder they inspect (their own header
 *  comments state it) — advisory classification/duplicate-detection text
 *  only, not the gate/doctrine-deciding class above. `organize.ts` is the
 *  same pure-proposal class — its own header states it "never" performs an
 *  action, only suggests one for a human to review. `backlog.ts` is a pure
 *  filename-pattern/regex reader over the same read-only snapshot, plus an
 *  operator-declared-override parser — detection only, no write power.
 *  `task-id.ts` is a pure collision-proof id-string generator, the same
 *  no-write-power class `adapters/clock.ts`/`pacer.ts` already stay
 *  unflagged for. */
const BENIGN_ONBOARDING_ONBOARD = new Set([
  'types.ts',
  'folder-triage.ts',
  'detect-issues.ts',
  'organize.ts',
  'backlog.ts',
  'task-id.ts',
]);

/** `packages/onboarding/src/index` files with no write/decide power of their
 *  own: `core.ts` is the pure content-hash index (its own header states "No
 *  I/O"), `model.ts` and `ports.ts` are interfaces/types only, `language.ts`
 *  is a pure extension→language lookup table, and `indexer.ts` orchestrates
 *  them plus the persistence port but never writes anything itself — every
 *  actual write it triggers lands in `adapters/sqlite-index-store.ts`'s
 *  `SqliteIndexStore`, already triaged benign (rebuildable content-hash-keyed
 *  cache, same class as `store/src/search.ts`/`vector.ts`) when the
 *  `adapters/` directory was censused. */
const BENIGN_ONBOARDING_INDEX = new Set([
  'core.ts',
  'indexer.ts',
  'language.ts',
  'model.ts',
  'ports.ts',
]);

/** Flat files directly under `packages/onboarding/src/` (not in a
 *  subdirectory): `index.ts` is a pure re-export barrel, the same
 *  carries-no-write-power class every other package's flat `index.ts`
 *  already stays unflagged for, and `info.ts` is a static capability
 *  descriptor (version string + step-name constants), the same
 *  no-write-power class `backup/types.ts`/`onboard/types.ts` stay unflagged
 *  for. */
const BENIGN_ONBOARDING_ROOT = new Set(['index.ts', 'info.ts']);

/** Flat files directly under `apps/dashboard/src/` (not in a subdirectory)
 *  with no write/decide power of their own: `fly.ts` and `gate-commands.ts`
 *  are the two with real power here and both already carry their own
 *  marker, so the census below never needs to list them. Every other flat
 *  file is either a pure re-export barrel / utility, or an operator-typed
 *  CLI entry point (`pnpm dashboard:reset`/`:restore`/`:demo`/`:flight`) —
 *  none of these run automatically inside CI-on-a-PR or an unattended
 *  autopilot flight loop the way the already-flagged engine/adapters files
 *  do; a human explicitly invokes them and directly observes the result,
 *  the same own-action exemption `scripts/github/setup-branch-protection.mjs`
 *  already gets. */
const BENIGN_DASHBOARD_SRC = new Set([
  // Pure command-string builder plus a fire-and-forget `spawn` of the OS's
  // own browser-opener against a loopback URL we constructed ourselves,
  // never user/PR input.
  'browser.ts',
  // `pnpm dashboard:demo` — operator-typed, seeds the LOCAL sample fleet.
  'demo.ts',
  // Playwright's E2E `webServer` entries: they boot the ALREADY-FLAGGED
  // real server (server.ts) with a hand-built or empty fleet for
  // deterministic test content — no security logic of their own.
  'e2e-server-populated.ts',
  'e2e-server.ts',
  // `pnpm dashboard:flight` — a SCRIPTED demo flight (explicitly "no model
  // runs"), distinct from the real orchestrator `fly.ts`, which is flagged.
  'flight.ts',
  // Pure re-export barrel, same class as adapters/index.ts and
  // engine/src/index.ts above.
  'index.ts',
  // Static version constants, no I/O.
  'info.ts',
  // Pure path-equality helper (case-insensitive on win32).
  'paths.ts',
  // Pure health-check poller (injectable fetch/clock/sleep) — decides
  // nothing about the gate or a merge, only when a browser tab opens.
  'ready.ts',
  // `pnpm dashboard:reset`/`:restore` — operator-typed, single-shot local
  // store maintenance; never invoked by CI or a live flight.
  'reset-cli.ts',
  'reset.ts',
  'restore-cli.ts',
  'restore.ts',
]);

/** `ask/` files with no write/decide power of their own: `architect-proposal.ts`
 *  (the one file this directory has ever needed to flag) already carries its
 *  own marker, so the census below only needs to triage its sibling. */
const BENIGN_ASK = new Set([
  // Orchestrates retrieval + the grounded model call and, under the
  // ARCHITECT persona, lifts a proposal out of the answer via the
  // already-flagged parseArchitectProposal — but it neither computes the
  // trusted `safety` tier (architect-proposal.ts's CONTROL_TOOL_SAFETY
  // lookup does) nor executes anything. Widening or dropping the
  // `persona !== 'architect'` check here could attach a proposal to the
  // wrong persona's answer, but the action card + confirm-gated execute
  // endpoint (flight/control-execute.ts, already flagged) still require an
  // explicit operator click before any write/destructive tool runs, so no
  // path here can execute unconfirmed.
  'service.ts',
]);

/** `read/` files with no write/decide power of their own: `mutate.ts` (the one
 *  file this directory has ever needed to flag) already carries its own
 *  marker, so the census below only needs to triage its siblings — every one
 *  of which documents itself, in its own file header, as read-only/pure. */
const BENIGN_READ = new Set([
  // D4 pipeline view read-models (epic 0015): pure graph/geometry/selection
  // derivations over stored firing records — no store writes, no I/O of
  // their own (verified: no writeFileSync/INSERT/UPDATE/DELETE).
  'pipeline-canvas.ts',
  'pipeline-tree.ts',
  'pipeline-spans.ts',
  'pipeline-graph.ts',
  'pipeline-layout.ts',
  'pipeline-selection.ts',
  // "pure read-model derivations" over a project's flight log (module
  // header) — cost-spike/death-cluster/gate-fail-streak threshold checks,
  // no I/O of its own.
  'anomalies.ts',
  // Pure selection logic over an already-fetched snapshot list for the
  // operator-typed `dashboard:restore` CLI (already-benign restore.ts) —
  // no filesystem access, no store write.
  'backups.ts',
  // Resolves the store's file PATH from an env var/cwd default — never
  // opens or writes the file itself.
  'config.ts',
  // "The Fleet read-model — pure transforms ... No I/O here" (module
  // header): the DB gather lives in source.ts, this stays deterministic.
  'fleet.ts',
  // Reads only the trailing 64KB of a flight's log file, bounded, with a
  // missing file yielding an honest empty tail — no write path.
  'flightlog.ts',
  // The nine persisted-event parsers split out of source.ts (SHELL DECOMP
  // 5/5) — each takes already-fetched `events` rows for one type and
  // JSON.parses/validates them into a typed array; defensive by convention
  // (a malformed payload is skipped, never thrown), no store writes, no I/O
  // of its own.
  'persisted-events.ts',
  // "each function here opens its own store handle on demand and degrades
  // to an honest empty/null result on any failure, the same read-only
  // contract as the rest of read/" (module header).
  'project-detail.ts',
  // "Pure and proposal-only: nothing here mutates the store: a caller ...
  // decides what to do with the candidates" (module header) — proposes
  // board-task-done candidates by title/commit token overlap, never writes.
  'reconcile.ts',
  // "All SQLite access is confined here so read/fleet.ts stays pure ...
  // the read-only dashboard must never crash the way in" (module header) —
  // the `/api/state` gather seam; degrades to empty/partial on failure.
  'source.ts',
]);

/** `shared/` files with no write/decide power of their own — every file in
 *  this directory carries the identical module-header convention: "Pure
 *  logic shared by the server read-model ... and the hand-authored client
 *  bundle ... embeds this module's real compiled source into the generated
 *  `/app.js` text via `.toString()`". That splicing scheme is itself the
 *  guarantee: a `.toString()`-embedded function body runs standalone in the
 *  browser under a CSP `self`-only policy, so it can import no Node builtin
 *  (`fs`, `child_process`, `gh`) and therefore can perform no I/O or write —
 *  the same architectural constraint the `read/` files self-document one at
 *  a time, enforced here directory-wide by the embedding mechanism itself. */
const BENIGN_SHARED = new Set([
  // Formats the DETECTED BACKLOG panel's reconciliation-candidate line —
  // read `read/reconcile.ts`'s already-benign candidates, never writes.
  'backlog-match.ts',
  // Derives a firing's pronounceable callsign suffix from a hash of its
  // number — pure string/number math, no I/O.
  'callsign.ts',
  // Collapses a flat activity-file list into the flight map's tree nodes —
  // pure array/string transforms over an already-fetched list.
  'file-nodes.ts',
  // Resolves a finished flight's headline (task title → commit subject →
  // item → kind) — pure string fallback chain, no I/O.
  'flight-summary.ts',
  // Already flagged false by its own explicit test above ("only formats
  // activity for the UI, no gate/revert concern of its own") — listed here
  // too so the census does not re-litigate it.
  'live-firing.ts',
  // Classifies/phrases a single activity entry for the narrator line — pure
  // classification logic, no I/O.
  'narrator.ts',
  // Collapses consecutive same-model/same-tokens activity entries into a
  // turn count — pure array-collapsing loop, no I/O.
  'turns.ts',
]);

/** `assets/` files with no write/decide power of their own — every file here
 *  is a leaf data/encoding module (brand hex constants, vendored base64 font
 *  binaries, hand-rolled PNG/ICO chunk framing, the goggles mark's numeric
 *  geometry) with no filesystem, network, or child-process access anywhere in
 *  the directory — confirmed by grepping the whole directory for
 *  readFile/writeFile/fetch/exec/spawn/child_process/require and finding
 *  nothing. None of it runs at PR-review or merge time; it only feeds the
 *  already-reviewed client-bundle build. */
const BENIGN_ASSETS = new Set([
  // The dark-theme brand hex trio — standalone leaf, no imports.
  'brand-colors.ts',
  // Raster favicon/app-icon pipeline built from goggles-geometry.ts's shape
  // and brand-colors.ts's hex trio via the already-benign png.ts encoder.
  'brandmark.ts',
  // Vendored, generated base64 font binaries (Google Fonts latin subset) —
  // "do not hand-edit" (module header); pure data, no logic at all.
  'font-data.ts',
  // `@font-face` declarations pointing at font-data.ts's self-hosted
  // `/fonts/*.woff2` — no fetch of its own, CSP stays `default-src 'self'`.
  'fonts.ts',
  // The goggles mark's numeric shape constants — pure exported numbers.
  'goggles-geometry.ts',
  // Vector SVG mark built from goggles-geometry.ts's shape and
  // brand-colors.ts's hex trio — string templating only.
  'goggles-mark.ts',
  // Hand-rolled PNG/ICO chunk framing + CRC-32 over Node's built-in zlib
  // deflate — pure encoding math, no dependency, no I/O.
  'png.ts',
]);

/** `connection/` files: every one already matches the bare `'connection'`
 *  substring marker above, so none needs its own entry here — this census
 *  exists to keep that guaranteed the moment a future file lands (e.g. if
 *  the marker were ever narrowed to `'connection/'`), the same
 *  forward-looking guarantee every other directory census gives. Confirmed
 *  by grepping the whole directory: `cli-probe.ts` builds the injectable
 *  `execFile`-based exec primitive shared by the already-flagged
 *  connection/PR-review write paths, `gh-probe.ts` and `gh-lts.ts` only ever
 *  run read-only `gh --version`/`gh auth status`/`gh api .../releases/latest`
 *  checks, and `config.ts`/`login.ts`/`service.ts`/`verify.ts` already carry
 *  their own credential-handling reasons to flag.
 */
const BENIGN_CONNECTION = new Set<string>([]);

/** `control/` files: every one already matches the bare `'control/'`
 *  substring marker above, so none needs its own entry here — this census
 *  exists to keep that guaranteed the moment a future file lands, the same
 *  forward-looking guarantee every other directory census gives. Confirmed
 *  by reading the whole directory: `control.ts` spawns/kills the dashboard
 *  process itself, `cli.ts` is the process entrypoint that wires it,
 *  `state.ts`/`types.ts` (de)serialize its pid/port run record,
 *  `watchdog.ts`/`flight-watchdog.ts`/`fleet-watchdog.ts`/`land-watchdog.ts`/
 *  `boot-reconcile.ts` all decide WHEN to spawn, revive, or reconcile a
 *  flight or the server itself, and `ci-status.ts`/`gh-doctor.ts`/
 *  `maintenance-sweep.ts` are read-only `gh`-backed reports that already sit
 *  in the same directory as that write/decide power.
 */
const BENIGN_CONTROL = new Set<string>([]);

/** `github/` files: every one already matches the `'src/github/'` marker
 *  above, so none needs its own entry here — this census exists to keep
 *  that guaranteed the moment a future file lands, the same forward-looking
 *  guarantee every other directory census gives. Confirmed by reading the
 *  whole directory: `execute.ts`, `issue-execute.ts`, and `pr-execute.ts`
 *  are the dashboard-side EXECUTE layer that spawns `gh repo create --push`
 *  / `git push`, `gh issue create`, and fork + push + `gh pr create`
 *  against the operator's OWN GitHub — the run-the-planned-write class the
 *  marker was added for.
 */
const BENIGN_GITHUB = new Set<string>([]);

/** `landing/` files: every one already matches the `'landing/'` marker above,
 *  so none needs its own entry here — this census exists to keep that
 *  guaranteed the moment a future file lands, the same forward-looking
 *  guarantee every other directory census gives. Confirmed by reading the
 *  whole directory: `execute.ts` gate-then-merges the CSRF-guarded landing
 *  action, `self-restart.ts` is the process-swap half that rebuilds and
 *  respawns a self-hosted dashboard after that merge, and `overlap.ts`
 *  detects a sibling flight branch's unlanded commits touching the same
 *  files or lines THIS landing is about to bring into `base` — advisory
 *  detection that feeds the same landing decision, sitting in the directory
 *  the marker already covers.
 */
const BENIGN_LANDING = new Set<string>([]);

/** `release/` files: the sole file already matches the `'release/'` marker
 *  above, so it needs no entry here — this census exists to keep that
 *  guaranteed the moment a future file lands, the same forward-looking
 *  guarantee every other directory census gives. Confirmed by reading the
 *  directory: `execute.ts` writes `package.json` + `CHANGELOG.md`, runs
 *  `git commit --signoff` + `git tag`, and — opted into via `ghRelease` —
 *  pushes that tag and runs `gh release create` against the operator's own
 *  GitHub remote, the same real-write class `landing/execute.ts` and
 *  `github/execute.ts` already earned their markers for.
 */
const BENIGN_RELEASE = new Set<string>([]);

/** `server/` files: every one already matches the bare `'server'` marker
 *  above, so none needs its own entry here — this census exists to keep that
 *  guaranteed the moment a future file lands, the same forward-looking
 *  guarantee every other directory census gives. Confirmed by reading the
 *  whole directory: `server.ts`/`main.ts` boot the HTTP server and wire its
 *  router, `routes.ts` renders the shell and serves the minified client
 *  bundle `client-bundle.ts` builds, `security.ts` implements the CSP and
 *  DNS-rebind guard, `ask.ts` and `github-execute.ts` are CSRF-guarded write
 *  endpoints (the latter runs `gh`/`git` write commands against the
 *  operator's own GitHub), `gh-connection.ts` and `pool-client.ts` are their
 *  read/browse and pool-claim counterparts, `rate-limit.ts` bounds
 *  quota-spending endpoints, `browse-folder.ts` reveals filesystem paths to
 *  the client, `self-onboard.ts` registers a project on boot, and
 *  `http-util.ts` is the shared request/response plumbing every handler
 *  above runs through.
 */
const BENIGN_SERVER = new Set<string>([]);

/** `inbox/` files: its lone file, `add.ts`, already matches the new
 *  `'inbox/add.ts'` marker below, so none needs its own entry here — this
 *  census exists to keep that guaranteed the moment a future file lands, the
 *  same forward-looking guarantee every other directory census gives.
 *  Confirmed by reading the whole directory: `add.ts` is the ONLY way an
 *  operator-facing HTTP request can drop a file into a project's `INBOX/`
 *  folder — the exact folder `flight/inbox-triage.ts` (already flagged) mints
 *  a `'queued'` board task from with NO approval gate, by design, because the
 *  operator is trusted to have authored the note. `add.ts` is the write half
 *  of that trust: a PR that widened its path handling (e.g. let `projectId`
 *  or `message` escape the project's own `root_path`) would let arbitrary
 *  written content ride the same no-approval-gate path straight to an
 *  unattended board task.
 */
const BENIGN_INBOX = new Set<string>([]);

/** `web/` files (the flat 58 directly under it — `web/features/` is a
 *  separate, not-yet-censused subdirectory): this is the client-bundle
 *  splice source, spliced verbatim into the generated `/app.js` the
 *  operator's OWN browser runs. Confirmed by reading every file plus
 *  grepping the whole directory for `innerHTML`/`outerHTML`/
 *  `insertAdjacentHTML`/`eval`/`document.write`: zero hits. `shell.ts`'s own
 *  header states it builds the DOM via `createElement`/`textContent` only,
 *  and the one interpolated dynamic value (`renderShell`'s `data-project`
 *  attribute) runs through `shell-html.ts`'s centralized `escapeAttr`. None
 *  of these files call `gh`, touch the filesystem, or decide a merge/gate
 *  outcome — every gh-planning/execute surface they front-end for
 *  (github-sync, PR review, issue triage, pool-client claim, LANDING,
 *  RELEASE, report-from-here) already carries its own marker outside
 *  `web/`, and this census exists to keep that guaranteed the moment a
 *  future `web/` file starts building HTML from untrusted content instead
 *  of pure display math. */
const BENIGN_WEB = new Set([
  // Pure icon/label/tooltip/badge text math for narrator, activity, anomaly,
  // gate/backup fact, console, docs, decision, flight-map, publicity, and
  // status chips — no HTML building, no I/O.
  'activity-icon.ts',
  'activity-log.ts',
  'anomaly.ts',
  'card-facts.ts',
  'console-panel.ts',
  'decision-item.ts',
  'docs-panel.ts',
  'flight-log-rows.ts',
  'flight-map.ts',
  'flight-summary-panel.ts',
  'fly-hint.ts',
  'publicity-panel.ts',
  'status-pill.ts',
  'stat-tiles.ts',
  'tour.ts',
  // Pure APG tabs markup (attr-escaped literals, no untrusted HTML), the
  // pure roving-focus model, and pure location.hash tab-routing math (epic
  // 0015 D2.13) — DOM-free, no I/O, not yet spliced into the served bundle.
  'tab-route.ts',
  'tabs.ts',
  // Pure geometry/percent/bucketing math for gauges, sparklines, the
  // heatmap, timeline, office map, and tooltip positioning — no dynamic
  // text, no I/O.
  'drag-reorder.ts',
  'flight-progress.ts',
  'gauge.ts',
  'heatmap.ts',
  'lang-bar.ts',
  'live-progress.ts',
  'office-map.ts',
  'replay-nav.ts',
  'spark-charts.ts',
  'sparkline.ts',
  'timeline-strip.ts',
  'tip-position.ts',
  // Confirm-dialog / result-text formatting that mirrors an
  // already-flagged execute surface elsewhere — the display-only class
  // `flight/pr-review*`'s own marker comment already excludes.
  'backlog-panel.ts',
  'card-actions.ts',
  'connect-panel.ts',
  'issue-triage-panel.ts',
  'landing-panel.ts',
  'pool-client-panel.ts',
  'pr-review-panel.ts',
  'release-panel.ts',
  'report-panel.ts',
  // Pure JSON.stringify diff-signature math shared by several panels — no
  // HTML, no I/O.
  'card-sections.ts',
  'detail-sections.ts',
  'fleet-view.ts',
  // Pure parsing/classification/dedupe math over already-fetched data — no
  // HTML building, no gh, no writes.
  'ask-stream.ts',
  'coordination-panel.ts',
  'diff-view.ts',
  'evaluation-trend.ts',
  'flight-debrief.ts',
  'flight-metrics.ts',
  'flights.ts',
  'markdown.ts',
  'notifications.ts',
  'operator-actions.ts',
  'phase-rail.ts',
  'search-history.ts',
  'task-queue.ts',
  // Right-click report-from-here capture math (epic 0015): pure duck-typed
  // helpers — region resolution via closest(), an immutable console-error
  // ring buffer, a bounded JSON-safe DOM snapshot, a computed-CSS allowlist
  // read, and a PLAIN-TEXT formatter for the report description box. No
  // HTML building, no fetch, no writes — the capture only ever rides the
  // operator-previewed report flow whose execute path is already flagged
  // under 'flight/report-from-here'.
  'report-capture.ts',
  // The client-bundle assembler and its structural leaves: `shell.ts`
  // builds DOM via createElement/textContent (never innerHTML) and escapes
  // its one dynamic attribute via `shell-html.ts`'s `escapeAttr`;
  // `chunks.ts` is a static chunk-name-to-module map; `layout-css.ts` is
  // static CSS text with zero dynamic interpolation; `format.ts` is pure
  // number/date formatting; `be-right-back.ts` is pure threshold math for
  // the offline overlay.
  'be-right-back.ts',
  'chunks.ts',
  'format.ts',
  'layout-css.ts',
  'shell-html.ts',
  'shell.ts',
]);

/** `web/features/` files (epic 0002 "shell decomposition") — each is a
 *  bundle-composing assembler `web/shell.ts`'s `clientJs()` calls directly or
 *  through `featureModulesJs()`/`discoverFeatureModules('web/features')`, so
 *  its RETURN VALUE, not its compiled source, lands in the served `/app.js`
 *  text. Confirmed by grepping the whole directory for `innerHTML`/
 *  `outerHTML`/`insertAdjacentHTML`/`eval`/`document.write` (only three
 *  comment mentions in `search.ts` reassuring the reader those are NOT used)
 *  and for any Node built-in (`fs`, `child_process`, `node:*`) or `exec(`/
 *  `spawn(`/`readFileSync`/`writeFileSync` (the one `exec(` hit, in
 *  `search.ts`, is `RegExp.prototype.exec` over already-fetched text, not
 *  `child_process`): zero I/O of any kind anywhere in the directory, the same
 *  architectural guarantee `web/`'s own census establishes one level up. */
const BENIGN_WEB_FEATURES = new Set([
  // Confirm-gated panel clients whose own `POST .../execute` (or, for
  // connect.ts/fly.ts, their write action) targets a server endpoint this
  // census already flags under a directory or `flight/*` marker — the panel
  // only builds the request body and renders the response text; parsing,
  // validating, and running the actual write lives entirely server-side.
  // connect.ts: POST /api/connection, /api/connection/login,
  // /api/connection/gh-lts, /api/github-issue/execute — the credential store
  // and gh-issue write live under the already-flagged `connection` and
  // `src/github/` markers.
  'connect.ts',
  // fly.ts: POST /api/fly, /api/fly/stop, /api/fly/pause — routed to the
  // already-flagged flight/flight-api.ts and apps/dashboard/src/fly.ts;
  // already directly tested unflagged above (the Fly-bar UI client test).
  'fly.ts',
  // issue-triage.ts: POST /api/issue-triage/execute — already-flagged
  // `flight/issue-triage`.
  'issue-triage.ts',
  // landing.ts: POST /api/landing/execute — already-flagged `landing/`.
  'landing.ts',
  // pool-client.ts: POST /api/pool-client/execute and /api/fly —
  // already-flagged `flight/pool-client-execute.ts` and
  // `flight/flight-api.ts`.
  'pool-client.ts',
  // pr-review.ts: POST /api/pr-review/execute — already-flagged
  // `flight/pr-review`.
  'pr-review.ts',
  // release.ts: POST /api/release/execute — already-flagged `release/`.
  'release.ts',
  // report-menu.ts: the single right-click "📮 Report from here" menu +
  // dialog (REPORT UNIFICATION 1/2 + 2/2, epic 0015, superseding the eight
  // always-open per-region `report.ts` panels this file used to also list
  // here) — POSTs to /api/report-from-here and /api/report-from-here/execute,
  // already flagged under `flight/report-from-here`.
  'report-menu.ts',
  // search.ts: POST /api/control/execute and /api/ask/stream —
  // already-flagged `flight/control-execute` and `server`.
  'search.ts',
  // Pure display panels: GET-only (or no fetch at all) — read an
  // already-fetched fleet-state snapshot or hit a read-only GET endpoint and
  // render it, no execute action of their own.
  'activity-heatmap.ts',
  'activity.ts',
  'backlog.ts',
  'coordination.ts',
  'docs-viewer.ts',
  'evolution.ts',
  'firing-timeline.ts',
  'flight-console.ts',
  'flight-summary.ts',
  // locale-data.ts: no fetch, no I/O — the non-English half of the
  // build-time STRINGS table (board ap-mtk2tgvh-0's BUNDLE DIET),
  // Object.assign'd into core's already-benign locale.ts data.
  'locale-data.ts',
  'locale.ts',
  'metrics.ts',
  'notifications.ts',
  'office-map.ts',
  'process-health.ts',
  'publicity.ts',
  'round-panel.ts',
  'switcher.ts',
  'tour.ts',
  // report-menu.ts: the right-click context menu + the ONE report dialog
  // (epic-0015 directive 09-02) — createElement/textContent only (zero
  // innerHTML), and its two fetches target /api/report-from-here and its
  // execute, both already flagged under 'flight/report-from-here' with the
  // preview-then-confirm contract enforced server-side; the same
  // panel-fronting-a-flagged-EXECUTE class report.ts above is benign for.
  'report-menu.ts',
  // report-capture-client.ts: the live contextmenu/console.error wiring for
  // right-click report-from-here — captures a DOM/CSS/error snapshot onto
  // `window.__autopilotReportCapture`, but never fetches, never injects HTML
  // (createElement-free entirely — attributes and window state only), and
  // never submits anything: the captured text reaches a server only through
  // report-menu.ts's operator-previewed execute, already flagged under
  // 'flight/report-from-here'.
  'report-capture-client.ts',
  // Auto-generated pure re-export barrel (its own header: "do not
  // hand-edit").
  'index.ts',
]);

/** `@autopilot/tokens` — the design-token package (`packages/tokens/src/`):
 *  palette/type/space primitives, theme definitions, CSS custom-property
 *  emission, and the i18n locale/string foundation. Every file here is pure
 *  computation over constant data (no `fs`/`fetch`/`exec`/`spawn`, confirmed
 *  by grep across the whole directory) — `color.ts`'s OKLCH→WCAG contrast
 *  math, `css.ts`'s `--color-*`/`--space-*` custom-property string builders,
 *  `scale.ts`/`m3.ts`/`mx.ts`/`themes.ts`'s constant token tables,
 *  `locales.ts`/`strings.ts`'s i18n lookup tables, and `index.ts`'s
 *  re-export barrel. None decide a merge, write to disk, or call out over
 *  the network, so none earn a marker — the same no-write-power class every
 *  other package's flat `index.ts`/`types.ts` already stays unflagged for. */
const BENIGN_TOKENS = new Set([
  'color.ts',
  'css.ts',
  'index.ts',
  'locales.ts',
  'm3.ts',
  'mx.ts',
  'scale.ts',
  'strings.ts',
  'themes.ts',
]);

/** `scripts/` files (paths relative to `scripts/`, `/`-separated) with no
 *  write/decide power that reaches past the operator's own explicit action,
 *  so the recursive scripts-tree census below leaves them unflagged. Classes,
 *  each with established precedent in `SECURITY_SENSITIVE_PATH_MARKERS`'s own
 *  triage notes: doc/diagram/dataset GENERATORS and their `--check` drift
 *  modes (neutering one lets stale docs merge — a quality concern, not an
 *  enforcement bypass, per the `scripts/ci/` marker's triage of
 *  `scripts/architecture`/`citation`/`data-model`); read-only ANALYZERS
 *  (i18n string/RTL sweeps, cockpit-metrics' measurement of the served
 *  shell); operator-typed SINGLE-SHOT tools never invoked by CI or a live
 *  flight (the codemods, whose rewrites still ride normal git review + the
 *  gate, and the self-study tools — including `check-prompt-gate.mjs`,
 *  enforcement-shaped but run locally against a git-ignored telemetry store)
 *  — the same own-action exemption `demo.ts`/`reset.ts` get in
 *  `BENIGN_DASHBOARD_SRC`; `setup.mjs`, deliberately unflagged per the
 *  `setup.sh`/`setup.cmd` markers' own note; and `.d.mts` DECLARATION STUBS
 *  (types only, no runtime). NOT here, so the census proves them flagged:
 *  everything under `scripts/ci/` (CI runs them from the PR's own checkout),
 *  `scripts/github/` (real `gh` writes under the operator's identity), and
 *  the launcher `.cmd` files (shell the operator double-clicks). */
const BENIGN_SCRIPTS = new Set([
  'architecture/generate-diagram.mjs',
  // Read-only merge-integrity audit over `chore: sync` merges (git plumbing
  // reads only — rev-parse/merge-base/diff/log); writes nothing to the tree,
  // the store, or GitHub. Same measure-only class as cockpit-metrics.mjs.
  'audit-sync-merges.d.mts',
  'audit-sync-merges.mjs',
  'citation/generate-citation.d.mts',
  'citation/generate-citation.mjs',
  'cockpit-metrics.mjs',
  // Pure interaction-timing math (INP-p75 proxy summarizer) split out of
  // cockpit-metrics.mjs plus its .d.mts declaration stub — same
  // measure-only, no-gh/no-store class as the parent script above.
  'cockpit-metrics-interaction.d.mts',
  'cockpit-metrics-interaction.mjs',
  'codemod/generate-splice-manifest.d.mts',
  'codemod/generate-splice-manifest.mjs',
  'codemod/split-top-level-regions.d.mts',
  'codemod/split-top-level-regions.mjs',
  'data-model/generate-doc.mjs',
  // .d.mts declaration stub for the sibling .mjs — types only, no runtime,
  // the same class as every other codemod/i18n .d.mts already listed here.
  'docs/check-links.d.mts',
  'docs/check-links.mjs',
  'i18n/find-rtl-hazards.d.mts',
  'i18n/find-rtl-hazards.mjs',
  'i18n/find-untagged-strings.d.mts',
  'i18n/find-untagged-strings.mjs',
  'self-study/check-prompt-gate.mjs',
  'self-study/export-dataset.mjs',
  'self-study/generate-data.mjs',
  'self-study/pin-eval-suite.mjs',
  'setup.mjs',
  'threat-model/generate-table.mjs',
  // .d.mts declaration stub for the sibling .mjs — types only, no runtime,
  // the same class as every other generator .d.mts already listed here.
  'threat-model/generate-table.d.mts',
  // Renders docs/CONTRAST-MATRIX.md from @autopilot/tokens' own pure
  // contrastMatrix() — the same generate-a-committed-doc-from-pure-data class
  // as data-model/generate-doc.mjs and threat-model/generate-table.mjs above.
  // Its only write is that one doc (--check compares instead), it reads no
  // credentials, and it decides nothing: the DATA's own regression gate lives
  // in packages/tokens/test/contrast-matrix.test.ts.
  'tokens/generate-contrast-matrix.mjs',
]);

/** The shared fixture's reviewed head SHA — the pin a merge carries and the
 *  ancestry the verify-necessity stand-in check runs against. */
const HEAD_SHA = '0123456789abcdef0123456789abcdef01234567';

function candidate(overrides: Partial<PrReviewCandidate> = {}): PrReviewCandidate {
  return {
    number: 12,
    title: 'Fix flaky sparkline test',
    gateStatus: 'pass',
    mergeable: true,
    touchedPaths: ['apps/dashboard/src/web/sparkline.ts'],
    // A merge is only plannable pinned (planPrReview queues pin-less
    // candidates for a human), so the shared fixture carries a pin.
    headRefOid: HEAD_SHA,
    // Auto-merge is confined to the canonical 'main' base (epic 0007's "one
    // canonical main"); the shared fixture targets it so merge-path tests
    // reach their intended guard.
    baseRefName: 'main',
    // A merge also needs the gh-reported size CONFIRMED (an unassessed size
    // queues for a human), so the shared fixture carries a small in-cap one.
    additions: 12,
    deletions: 3,
    // A merge also needs the diff-parsed rename sweep CONFIRMED — absent
    // means no diff was ever fetched, so the rename half of the security
    // sweep never ran and planPrReview queues for a human. The shared
    // fixture carries a confirmed-empty sweep.
    renamedFromPaths: [],
    // A merge also needs the review-thread sweep CONFIRMED — absent means
    // the `gh api graphql` reviewThreads read never ran (or missed this PR),
    // so planPrReview queues for a human rather than merging over a
    // conversation nobody checked. The shared fixture carries a confirmed
    // zero.
    unresolvedReviewThreads: 0,
    ...overrides,
  };
}

/** {@link candidate} with the review-thread sweep NOT assessed — the shape
 *  `fetchOpenPrCandidates` emits before `annotateReviewThreads` runs. */
function unassessedThreadsCandidate(overrides: Partial<PrReviewCandidate> = {}): PrReviewCandidate {
  const { unresolvedReviewThreads: _unassessed, ...pr } = candidate(overrides);
  return pr;
}

describe('touchesSecuritySensitivePath', () => {
  it('flags a path containing a security-sensitive marker', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/focus.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/containment-guard.ts'])).toBe(
      true,
    );
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/server/security.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['.github/workflows/ci.yml'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(touchesSecuritySensitivePath(['apps/AUTH/login.ts'])).toBe(true);
  });

  it('returns false when no path matches', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/web/sparkline.ts'])).toBe(false);
  });

  it('returns false for an empty path list', () => {
    expect(touchesSecuritySensitivePath([])).toBe(false);
  });

  it('flags governance files that gate who can approve/merge, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['.github/CODEOWNERS'])).toBe(true);
    expect(touchesSecuritySensitivePath(['.github/branch-protection.json'])).toBe(true);
  });

  it('flags the connection module that persists API-key/OAuth-token credentials, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/connection/config.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/connection/login.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/connection/service.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/connection/verify.ts'])).toBe(true);
  });

  it('flags the server module that implements the CSRF guard, rate limiter, and auth-probe wiring, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/server/server.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/server/rate-limit.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/server/main.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/server/routes.ts'])).toBe(true);
  });

  it('flags the landing module that merges to main and self-restarts the process behind the CSRF-guarded EXECUTE endpoint, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/landing/execute.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/landing/self-restart.ts'])).toBe(true);
  });

  it('does not flag the landing-panel UI display component — it only renders, no merge/restart/CSRF concern', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/web/landing-panel.ts'])).toBe(false);
  });

  it('flags the release module that writes package.json/CHANGELOG.md and runs git commit/tag behind the CSRF-guarded EXECUTE endpoint, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/release/execute.ts'])).toBe(true);
  });

  it('does not flag the release-panel UI display component — it only formats a result message, no git/commit concern', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/web/release-panel.ts'])).toBe(false);
  });

  it('flags the control module that kills/spawns the dashboard process and self-restarts it, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/control/control.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/control/cli.ts'])).toBe(true);
  });

  it('flags this very KEEPER PR-review ritual — its decision core and its gh-merge execute wiring — even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/pr-review.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/pr-review-execute.ts'])).toBe(
      true,
    );
  });

  it('does not flag the pr-review-panel UI display component — it only formats a result message, no decide/merge concern', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/web/pr-review-panel.ts'])).toBe(false);
  });

  it('flags the sibling KEEPER triage ritual — its decision core that labels/comments GitHub issues via gh, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/issue-triage.ts'])).toBe(true);
  });

  it("flags the report-from-here ritual — it both plans the gh issue create argv AND ships the apply layer that executes it and writes board tasks, yet ends in neither '-execute.ts' (the flight census misses it) nor any security keyword", () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/report-from-here.ts'])).toBe(
      true,
    );
  });

  it('does not flag a future report-from-here display panel — directory-prefixed anchoring, same as pr-review-panel', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/web/report-from-here-panel.ts'])).toBe(
      false,
    );
  });

  it('flags the engine package modules that perform the real git merge/tag writes behind the landing and release EXECUTE endpoints, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/landing.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['packages/engine/src/release.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/git.ts'])).toBe(true);
  });

  it('does not flag unrelated engine modules that carry no merge/tag/write concern of their own', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/index.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/engine/src/ports.ts'])).toBe(false);
  });

  it('flags the engine adapters that decide the gate verdict, remediate and commit around it, invoke the Claude CLI with its own tool-permission flags, or create the containment worktree, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/gate.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/remediating-gate.ts'])).toBe(
      true,
    );
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/claude-cli.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/worktree.ts'])).toBe(true);
  });

  it('flags the real flight orchestrator that wires the live engine loop (real Claude CLI, real gate, containment breach detection, worktree, budget cap) onto a real target repo, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/fly.ts'])).toBe(true);
  });

  it('does not flag the Fly-bar UI client — it only renders flight status in the browser, no orchestration concern of its own', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/web/features/fly.ts'])).toBe(false);
  });

  it("flags the flight spawn wiring that sets AUTOPILOT_FLIGHT=1, the env var control.ts's self-kill guard checks, even without a security-keyword path", () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/spawn-flight.ts'])).toBe(true);
  });

  it('flags the dashboard-side worktree placement policy — deriveWorktreePlan decides WHERE the containment worktree lives (a sibling of target, never nested inside it), so nesting it back under target would reopen the Bash escape hatch, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/worktree.ts'])).toBe(true);
  });

  it("flags the lock/log/guard-settings identity keying — guardSettingsFileName decides which settings file a running flight's containment guard reads, so a keying change that shared it across instances would redirect a live containment boundary, even without a security-keyword path", () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/lock.ts'])).toBe(true);
  });

  it('flags the FlightRunner that decides what flight child process gets spawned against which folder and owns the budget floor + firings cap, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/runner.ts'])).toBe(true);
  });

  it('flags the ritual lock that serializes flight-end git commits across processes — weakening its acquire/wait loop reintroduces the cross-flight commit race, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/ritual-lock.ts'])).toBe(true);
  });

  it("flags the flight-side OTLP config that decides where firing spans get POSTed and which headers ride along — the 'engine/src/otlp.ts' marker cannot match it, even without a security-keyword path", () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/otlp.ts'])).toBe(true);
  });

  it('flags the end-of-flight sweeps that write board tasks and propose SOUL/fleet-wisdom amendments — a sweep taught to self-approve its own proposals would bypass the operator, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/post-flight-sweeps.ts'])).toBe(
      true,
    );
  });

  it('flags the per-firing hooks that decide which board tasks close as shipped the moment a firing lands — weakening that verification corrupts the board the way a weakened store.ts would corrupt telemetry, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/firing-hooks.ts'])).toBe(true);
  });

  it('flags the runner registry that enforces the same-folder refusal and the maxConcurrent quota cap — one layer upstream of the flagged runner.ts, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/registry.ts'])).toBe(true);
  });

  it("flags the flight-api routing that targets the operator's stop/pause kill commands — its own header records the live bug where dropped routing silently disabled stop, even without a security-keyword path", () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/flight-api.ts'])).toBe(true);
  });

  it('flags the shared gate-command mapping that fly.ts and landing/execute.ts both gate through, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/gate-commands.ts'])).toBe(true);
  });

  it('flags the ARCHITECT control-tool execute wiring that dispatches write/destructive store operations (tasks_delete, project_reset) and owns their argument validation, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/control-execute.ts'])).toBe(
      true,
    );
  });

  it('flags the atomic firing that decides gate-pass/revert/checkpoint after every commit, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/firing.ts'])).toBe(true);
  });

  it('does not flag the live-firing display module — it only formats activity for the UI, no gate/revert concern of its own', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/shared/live-firing.ts'])).toBe(false);
  });

  it('flags the SQLite adapter that writes the un-fakeable telemetry chain — the append-only events log and the metrics projection every firing is judged from — even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/store.ts'])).toBe(true);
  });

  it('flags the filesystem-control adapter that implements the STOP-sentinel kill switch and the restart-safe runner state, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/fs-control.ts'])).toBe(true);
  });

  it('flags the single-instance lock that stops two flights racing the same store and target repo, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/adapters/instance-lock.ts'])).toBe(
      true,
    );
  });

  it('keeps pace with new engine/src/adapters files automatically: every adapter is either flagged or explicitly allow-listed as benign, so a future adapter can never silently slip past this ritual the way fs-control.ts and instance-lock.ts just did', () => {
    const adapterFiles = readdirSync(ENGINE_ADAPTERS_DIR).filter((name) => name.endsWith('.ts'));
    expect(adapterFiles.length).toBeGreaterThan(0);

    const untriaged = adapterFiles.filter(
      (file) =>
        !BENIGN_ADAPTERS.has(file) &&
        !touchesSecuritySensitivePath([`packages/engine/src/adapters/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/engine/src/adapters/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ADAPTERS with why not`,
    ).toEqual([]);
  });

  it('flags the GitHub-sync policy that decides the repo-create/push write command a project-page sync action runs, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/github-sync.ts'])).toBe(true);
  });

  it('flags the OTLP exporter that performs a real outbound POST of firing-record data to an external endpoint, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/engine/src/otlp.ts'])).toBe(true);
  });

  it("flags the dashboard-side github/ EXECUTE layer that runs the planned gh/git write commands against the operator's GitHub — the engine planners (github-sync, github-contribute, github-pr-contribute) are flagged but the wiring that actually spawns `gh repo create --push`, `gh issue create`, and fork+push+`gh pr create` carries no security keyword", () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/github/execute.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/github/issue-execute.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/github/pr-execute.ts'])).toBe(true);
  });

  it("does not flag .github/ templates or github test fixtures — the src/ anchoring keeps issue templates and test/github/ out; .github's own enforcement surfaces (workflows, CODEOWNERS, branch-protection) already have their own markers", () => {
    expect(touchesSecuritySensitivePath(['.github/ISSUE_TEMPLATE/bug_report.md'])).toBe(false);
    expect(touchesSecuritySensitivePath(['apps/dashboard/test/github/execute.test.ts'])).toBe(
      false,
    );
  });

  it('keeps pace with new flat engine/src files automatically: every file directly under engine/src is either flagged or explicitly allow-listed as benign, so a future engine module can never silently slip past this ritual the way github-sync.ts and otlp.ts just did', () => {
    const engineSrcFiles = readdirSync(ENGINE_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(engineSrcFiles.length).toBeGreaterThan(0);

    const untriaged = engineSrcFiles.filter(
      (file) =>
        !BENIGN_ENGINE_SRC.has(file) &&
        !touchesSecuritySensitivePath([`packages/engine/src/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/engine/src/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ENGINE_SRC with why not`,
    ).toEqual([]);
  });

  it('keeps pace with packages/mcp/src/ files automatically: every file in the control-as-MCP package is either flagged or explicitly allow-listed as benign, so a future MCP tool with write/destructive power can never silently slip past this ritual the way control.ts just did', () => {
    const mcpSrcFiles = readdirSync(MCP_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(mcpSrcFiles.length).toBeGreaterThan(0);

    const untriaged = mcpSrcFiles.filter(
      (file) =>
        !BENIGN_MCP.has(file) && !touchesSecuritySensitivePath([`packages/mcp/src/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/mcp/src/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_MCP with why not`,
    ).toEqual([]);
  });

  it("flags the real store-mutation implementation behind read/mutate.ts's thin wrappers — deleteProject, the setTaskStatus VERDICT-close cascade, claimTask's race-proof board claim, and the SOUL/fleet-wisdom ratify overwrites — even without a security-keyword path", () => {
    expect(touchesSecuritySensitivePath(['packages/store/src/mutate.ts'])).toBe(true);
  });

  it('flags the one writable SQLite connection every package shares — the NUL-byte path guard, the foreign_keys pragma, and the busy-retry hardening — even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/store/src/db.ts'])).toBe(true);
  });

  it('flags the schema-drift checksum check and downgrade refusal, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/store/src/migrate.ts'])).toBe(true);
  });

  it('flags the CHECK-constraint domain invariants and the migration-collision validator, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/store/src/schema.ts'])).toBe(true);
  });

  it('flags the backup ritual whose integrity-check-then-compact ordering and retention pruning decide which backups survive, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/store/src/snapshot.ts'])).toBe(true);
  });

  it("does not flag the search/vector index writers — they only rebuild a project's own FTS5/vector cache, no destructive or cross-project effect", () => {
    expect(touchesSecuritySensitivePath(['packages/store/src/search.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/store/src/vector.ts'])).toBe(false);
  });

  it('keeps pace with packages/store/src/ files automatically: every file in the persistence package is either flagged or explicitly allow-listed as benign, so a future store write can never silently slip past this ritual the way mutate.ts and db.ts just did', () => {
    const storeSrcFiles = readdirSync(STORE_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(storeSrcFiles.length).toBeGreaterThan(0);

    const untriaged = storeSrcFiles.filter(
      (file) =>
        !BENIGN_STORE.has(file) && !touchesSecuritySensitivePath([`packages/store/src/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/store/src/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_STORE with why not`,
    ).toEqual([]);
  });

  it('flags the folder-lock ritual that decides the commit/tag/checkout sequence minting the MYTH+LEGACY backup snapshot, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/backup/ritual.ts'])).toBe(true);
  });

  it('does not flag the tag-name constants and read-only isBackedUp check that back the folder-lock ritual — refs.ts never mutates', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/backup/refs.ts'])).toBe(false);
  });

  it('keeps pace with packages/onboarding/src/backup/ files automatically: every file in the folder-lock ritual directory is either flagged or explicitly allow-listed as benign, so a future backup write can never silently slip past this ritual the way ritual.ts just did', () => {
    const onboardingBackupFiles = readdirSync(ONBOARDING_BACKUP_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(onboardingBackupFiles.length).toBeGreaterThan(0);

    const untriaged = onboardingBackupFiles.filter(
      (file) =>
        !BENIGN_ONBOARDING_BACKUP.has(file) &&
        !touchesSecuritySensitivePath([`packages/onboarding/src/backup/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/onboarding/src/backup/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ONBOARDING_BACKUP with why not`,
    ).toEqual([]);
  });

  it("flags the real git-write implementation behind the backup ritual's BackupVcs port — the secret-scan-then-huge-file-scan-then-commit sequence and the actual init/tag/branch/checkout writes, even without a security-keyword path", () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/adapters/git-backup.ts'])).toBe(
      true,
    );
  });

  it('flags the direct SQLite writer behind project registration and board seeding — INSERTs into projects, versions, and tasks with no approval gate, even without a security-keyword path', () => {
    expect(
      touchesSecuritySensitivePath(['packages/onboarding/src/adapters/sqlite-project-store.ts']),
    ).toBe(true);
  });

  it("does not flag the index store's rebuildable project cache, or the read-only fs walks and pure ignore-list feeding it", () => {
    expect(
      touchesSecuritySensitivePath(['packages/onboarding/src/adapters/sqlite-index-store.ts']),
    ).toBe(false);
    expect(
      touchesSecuritySensitivePath(['packages/onboarding/src/adapters/fs-file-source.ts']),
    ).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/adapters/fs-snapshot.ts'])).toBe(
      false,
    );
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/adapters/ignore.ts'])).toBe(
      false,
    );
  });

  it('keeps pace with packages/onboarding/src/adapters/ files automatically: every file in the onboarding I/O layer is either flagged or explicitly allow-listed as benign, so a future adapter write can never silently slip past this ritual the way git-backup.ts and sqlite-project-store.ts just did', () => {
    const onboardingAdaptersFiles = readdirSync(ONBOARDING_ADAPTERS_SRC_DIR, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(onboardingAdaptersFiles.length).toBeGreaterThan(0);

    const untriaged = onboardingAdaptersFiles.filter(
      (file) =>
        !BENIGN_ONBOARDING_ADAPTERS.has(file) &&
        !touchesSecuritySensitivePath([`packages/onboarding/src/adapters/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/onboarding/src/adapters/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ONBOARDING_ADAPTERS with why not`,
    ).toEqual([]);
  });

  it('flags detectGate, which ranks every ecosystem detector and returns the primary GateSpec that drives the engine GatePort — deciding a brand-new project’s gate from its first firing on, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/detect.ts'])).toBe(true);
  });

  it('flags the GateCommand argv builders and script/tool-config evidence deciders every ecosystem detector calls, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/manifests.ts'])).toBe(true);
  });

  it('does not flag the pure read-only FsSnapshot builder or the gate’s type/constant declarations', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/snapshot.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/types.ts'])).toBe(false);
  });

  it('keeps pace with packages/onboarding/src/gate/ files automatically: every flat file in the onboarding gate-detection directory is either flagged or explicitly allow-listed as benign, so a future detector-support file can never silently slip past this ritual the way detect.ts and manifests.ts just did', () => {
    const onboardingGateFiles = readdirSync(ONBOARDING_GATE_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(onboardingGateFiles.length).toBeGreaterThan(0);

    const untriaged = onboardingGateFiles.filter(
      (file) =>
        !BENIGN_ONBOARDING_GATE.has(file) &&
        !touchesSecuritySensitivePath([`packages/onboarding/src/gate/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/onboarding/src/gate/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ONBOARDING_GATE with why not`,
    ).toEqual([]);
  });

  it('flags each ecosystem gate detector — js.ts, python.ts, go.ts, and rust.ts each independently decide the typecheck/test/build/lint command a brand-new project of that ecosystem runs from its first firing on, even without a security-keyword path', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/detectors/js.ts'])).toBe(
      true,
    );
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/detectors/python.ts'])).toBe(
      true,
    );
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/detectors/go.ts'])).toBe(
      true,
    );
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/detectors/rust.ts'])).toBe(
      true,
    );
  });

  it('does not flag the detectors barrel — index.ts is a pure re-export with no decide power of its own', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/gate/detectors/index.ts'])).toBe(
      false,
    );
  });

  it('keeps pace with packages/onboarding/src/gate/detectors/ files automatically: every file in the per-ecosystem gate-detection directory is either flagged or explicitly allow-listed as benign, so a future fifth-language detector can never silently slip past this ritual the way js.ts, python.ts, go.ts, and rust.ts just did', () => {
    const onboardingGateDetectorsFiles = readdirSync(ONBOARDING_GATE_DETECTORS_SRC_DIR, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(onboardingGateDetectorsFiles.length).toBeGreaterThan(0);

    const untriaged = onboardingGateDetectorsFiles.filter(
      (file) =>
        !BENIGN_ONBOARDING_GATE_DETECTORS.has(file) &&
        !touchesSecuritySensitivePath([`packages/onboarding/src/gate/detectors/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/onboarding/src/gate/detectors/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ONBOARDING_GATE_DETECTORS with why not`,
    ).toEqual([]);
  });

  it('flags the onboarding orchestrator — onboard.ts backs up, registers/resumes, and seeds a new project with no further review step', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/onboard/onboard.ts'])).toBe(true);
  });

  it('flags the starter-SOUL generator — soul.ts decides the actual safety doctrine text baked into every onboarded project', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/onboard/soul.ts'])).toBe(true);
  });

  it('does not flag the pure advisory helpers — folder-triage.ts, organize.ts, and detect-issues.ts only classify/propose, never act', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/onboard/folder-triage.ts'])).toBe(
      false,
    );
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/onboard/organize.ts'])).toBe(
      false,
    );
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/onboard/detect-issues.ts'])).toBe(
      false,
    );
  });

  it('keeps pace with packages/onboarding/src/onboard/ files automatically: every file in the onboarding-ritual orchestration directory is either flagged or explicitly allow-listed as benign, so a future write/decide surface can never silently slip past this ritual the way onboard.ts and soul.ts just did', () => {
    const onboardingOnboardFiles = readdirSync(ONBOARDING_ONBOARD_SRC_DIR, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(onboardingOnboardFiles.length).toBeGreaterThan(0);

    const untriaged = onboardingOnboardFiles.filter(
      (file) =>
        !BENIGN_ONBOARDING_ONBOARD.has(file) &&
        !touchesSecuritySensitivePath([`packages/onboarding/src/onboard/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/onboarding/src/onboard/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ONBOARDING_ONBOARD with why not`,
    ).toEqual([]);
  });

  it('does not flag the content-hash index — core.ts/model.ts/ports.ts/language.ts are pure, and indexer.ts only orchestrates the already-benign SqliteIndexStore cache', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/index/core.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/index/indexer.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/index/language.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/index/model.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/index/ports.ts'])).toBe(false);
  });

  it('keeps pace with packages/onboarding/src/index/ files automatically: every file in the content-hash index directory is either flagged or explicitly allow-listed as benign, so a future index write surface can never silently slip past this ritual', () => {
    const onboardingIndexFiles = readdirSync(ONBOARDING_INDEX_SRC_DIR, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(onboardingIndexFiles.length).toBeGreaterThan(0);

    const untriaged = onboardingIndexFiles.filter(
      (file) =>
        !BENIGN_ONBOARDING_INDEX.has(file) &&
        !touchesSecuritySensitivePath([`packages/onboarding/src/index/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/onboarding/src/index/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ONBOARDING_INDEX with why not`,
    ).toEqual([]);
  });

  it('does not flag the package barrel or its static capability descriptor — index.ts is a pure re-export and info.ts is version/step constants only', () => {
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/index.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['packages/onboarding/src/info.ts'])).toBe(false);
  });

  it('keeps pace with flat packages/onboarding/src/ files automatically: every file directly in the package root is either flagged or explicitly allow-listed as benign, closing out the full census of @autopilot/onboarding', () => {
    const onboardingRootFiles = readdirSync(ONBOARDING_SRC_DIR, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(onboardingRootFiles.length).toBeGreaterThan(0);

    const untriaged = onboardingRootFiles.filter(
      (file) =>
        !BENIGN_ONBOARDING_ROOT.has(file) &&
        !touchesSecuritySensitivePath([`packages/onboarding/src/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/onboarding/src/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ONBOARDING_ROOT with why not`,
    ).toEqual([]);
  });

  it("keeps pace with new flight/*-execute.ts files automatically: every execute-wiring file in the flight directory is either flagged or explicitly allow-listed as benign, so a future ritual's write wiring can never silently slip past this ritual the way control-execute.ts did", () => {
    const executeFiles = readdirSync(FLIGHT_SRC_DIR).filter((name) => name.endsWith('-execute.ts'));
    expect(executeFiles.length).toBeGreaterThan(0);

    const untriaged = executeFiles.filter(
      (file) =>
        !BENIGN_FLIGHT_EXECUTE.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/flight/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/flight/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_FLIGHT_EXECUTE with why not`,
    ).toEqual([]);
  });

  it('keeps pace with ALL flight/ files automatically, not just *-execute.ts: every file in apps/dashboard/src/flight is either flagged or explicitly allow-listed as benign, so the next report-from-here-shaped gap (a decide/write file whose name fits no narrower census) fails a test until triaged', () => {
    const flightFiles = readdirSync(FLIGHT_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(flightFiles.length).toBeGreaterThan(0);

    const untriaged = flightFiles.filter(
      (file) =>
        !BENIGN_FLIGHT.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/flight/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/flight/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_FLIGHT with why not`,
    ).toEqual([]);
  });

  it('keeps pace with flat apps/dashboard/src files automatically: every file directly under dashboard src/ (not in a subdirectory) is either flagged or explicitly allow-listed as benign, so a future top-level module can never silently slip past this ritual the way fly.ts and gate-commands.ts once could have', () => {
    const dashboardSrcFiles = readdirSync(DASHBOARD_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(dashboardSrcFiles.length).toBeGreaterThan(0);

    const untriaged = dashboardSrcFiles.filter(
      (file) =>
        !BENIGN_DASHBOARD_SRC.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_DASHBOARD_SRC with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/ask/ files automatically: every file in the ARCHITECT chat service directory is either flagged or explicitly allow-listed as benign, so a future proposal-adjacent file can never silently slip past this ritual the way architect-proposal.ts almost did', () => {
    const askFiles = readdirSync(ASK_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(askFiles.length).toBeGreaterThan(0);

    const untriaged = askFiles.filter(
      (file) =>
        !BENIGN_ASK.has(file) && !touchesSecuritySensitivePath([`apps/dashboard/src/ask/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/ask/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ASK with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/read/ files automatically: every file in the dashboard read-model directory is either flagged or explicitly allow-listed as benign, so a future write slipped in beside mutate.ts can never silently escape this ritual', () => {
    const readFiles = readdirSync(READ_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(readFiles.length).toBeGreaterThan(0);

    const untriaged = readFiles.filter(
      (file) =>
        !BENIGN_READ.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/read/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/read/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_READ with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/shared/ files automatically: every file in the server/client shared-logic directory is either flagged or explicitly allow-listed as benign, so a future shared module can never silently slip past this ritual', () => {
    const sharedFiles = readdirSync(SHARED_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(sharedFiles.length).toBeGreaterThan(0);

    const untriaged = sharedFiles.filter(
      (file) =>
        !BENIGN_SHARED.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/shared/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/shared/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_SHARED with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/assets/ files automatically: every file in the brand/font/icon data directory is either flagged or explicitly allow-listed as benign, so a future asset module can never silently slip past this ritual', () => {
    const assetsFiles = readdirSync(ASSETS_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(assetsFiles.length).toBeGreaterThan(0);

    const untriaged = assetsFiles.filter(
      (file) =>
        !BENIGN_ASSETS.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/assets/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/assets/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_ASSETS with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/connection/ files automatically: every file in the GitHub/Claude-CLI connection directory is either flagged or explicitly allow-listed as benign, so a future connection module can never silently slip past this ritual even if the bare "connection" marker were ever narrowed', () => {
    const connectionFiles = readdirSync(CONNECTION_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(connectionFiles.length).toBeGreaterThan(0);

    const untriaged = connectionFiles.filter(
      (file) =>
        !BENIGN_CONNECTION.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/connection/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/connection/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_CONNECTION with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/control/ files automatically: every file in the dashboard process/watchdog control directory is either flagged or explicitly allow-listed as benign, so a future control module can never silently slip past this ritual even if the bare "control/" marker were ever narrowed', () => {
    const controlFiles = readdirSync(CONTROL_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(controlFiles.length).toBeGreaterThan(0);

    const untriaged = controlFiles.filter(
      (file) =>
        !BENIGN_CONTROL.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/control/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/control/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_CONTROL with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/github/ files automatically: every file in the dashboard-side GitHub EXECUTE-layer directory is either flagged or explicitly allow-listed as benign, so a future github module can never silently slip past this ritual even if the "src/github/" marker were ever narrowed', () => {
    const githubFiles = readdirSync(GITHUB_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(githubFiles.length).toBeGreaterThan(0);

    const untriaged = githubFiles.filter(
      (file) =>
        !BENIGN_GITHUB.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/github/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/github/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_GITHUB with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/landing/ files automatically: every file in the LANDING gate-then-merge directory is either flagged or explicitly allow-listed as benign, so a future landing module can never silently slip past this ritual even if the "landing/" marker were ever narrowed', () => {
    const landingFiles = readdirSync(LANDING_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(landingFiles.length).toBeGreaterThan(0);

    const untriaged = landingFiles.filter(
      (file) =>
        !BENIGN_LANDING.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/landing/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/landing/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_LANDING with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/release/ files automatically: every file in the RELEASE write directory is either flagged or explicitly allow-listed as benign, so a future release module can never silently slip past this ritual even if the "release/" marker were ever narrowed', () => {
    const releaseFiles = readdirSync(RELEASE_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(releaseFiles.length).toBeGreaterThan(0);

    const untriaged = releaseFiles.filter(
      (file) =>
        !BENIGN_RELEASE.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/release/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/release/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_RELEASE with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/server/ files automatically: every file in the HTTP server directory is either flagged or explicitly allow-listed as benign, so a future server module can never silently slip past this ritual even if the bare "server" marker were ever narrowed', () => {
    const serverFiles = readdirSync(SERVER_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(serverFiles.length).toBeGreaterThan(0);

    const untriaged = serverFiles.filter(
      (file) =>
        !BENIGN_SERVER.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/server/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/server/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_SERVER with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/inbox/ files automatically: every file in the operator-note-drop directory is either flagged or explicitly allow-listed as benign, so a future inbox module can never silently slip past this ritual even if the "inbox/add.ts" marker were ever narrowed', () => {
    const inboxFiles = readdirSync(INBOX_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(inboxFiles.length).toBeGreaterThan(0);

    const untriaged = inboxFiles.filter(
      (file) =>
        !BENIGN_INBOX.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/inbox/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/inbox/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_INBOX with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/web/ files automatically: every flat file in the client-bundle splice source is either flagged or explicitly allow-listed as benign, so a future web/ module that starts building HTML from untrusted content can never silently slip past this ritual (web/features/ is censused separately below)', () => {
    const webFiles = readdirSync(WEB_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(webFiles.length).toBeGreaterThan(0);

    const untriaged = webFiles.filter(
      (file) =>
        !BENIGN_WEB.has(file) && !touchesSecuritySensitivePath([`apps/dashboard/src/web/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/web/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_WEB with why not`,
    ).toEqual([]);
  });

  it('keeps pace with apps/dashboard/src/web/features/ files automatically: every shell-decomposition feature module is either flagged or explicitly allow-listed as benign, so a future feature module that starts building HTML from untrusted content, or wires a new write path outside an already-flagged EXECUTE endpoint, can never silently slip past this ritual', () => {
    const webFeaturesFiles = readdirSync(WEB_FEATURES_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(webFeaturesFiles.length).toBeGreaterThan(0);

    const untriaged = webFeaturesFiles.filter(
      (file) =>
        !BENIGN_WEB_FEATURES.has(file) &&
        !touchesSecuritySensitivePath([`apps/dashboard/src/web/features/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under apps/dashboard/src/web/features/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_WEB_FEATURES with why not`,
    ).toEqual([]);
  });

  it('keeps pace with packages/tokens/src/ files automatically: every file in the design-token package is either flagged or explicitly allow-listed as benign, so a future token module that starts writing to disk or deciding a merge can never silently slip past this ritual unmarked', () => {
    const tokensSrcFiles = readdirSync(TOKENS_SRC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(tokensSrcFiles.length).toBeGreaterThan(0);

    const untriaged = tokensSrcFiles.filter(
      (file) =>
        !BENIGN_TOKENS.has(file) && !touchesSecuritySensitivePath([`packages/tokens/src/${file}`]),
    );
    expect(
      untriaged,
      `untriaged files under packages/tokens/src/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_TOKENS with why not`,
    ).toEqual([]);
  });

  it("flags the operator-run gh write scripts under scripts/github/ — sync-labels.mjs applies .github/labels.json via `gh label create --force` under the operator's identity, so a PR teaching it to rename or delete a hold label would disarm the HOLD_LABEL_MARKERS guard this very ritual honors", () => {
    expect(touchesSecuritySensitivePath(['scripts/github/sync-labels.mjs'])).toBe(true);
    expect(touchesSecuritySensitivePath(['scripts/github/setup-branch-protection.mjs'])).toBe(true);
    expect(touchesSecuritySensitivePath(['scripts/i18n/find-untagged-strings.mjs'])).toBe(false);
  });

  it('keeps pace with the scripts/ tree automatically (recursively): every file under scripts/ is either flagged or explicitly allow-listed as benign, so a future script that writes to GitHub, the store, or the tree can never silently slip past this ritual unmarked', () => {
    const scriptsFiles = readdirSync(SCRIPTS_DIR, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        `${entry.parentPath}/${entry.name}`.slice(SCRIPTS_DIR.length + 1).replaceAll('\\', '/'),
      );
    expect(scriptsFiles.length).toBeGreaterThan(0);

    const untriaged = scriptsFiles.filter(
      (file) => !BENIGN_SCRIPTS.has(file) && !touchesSecuritySensitivePath([`scripts/${file}`]),
    );
    expect(
      untriaged,
      'untriaged files under scripts/ — for EACH: add a marker if it writes/decides anything, or add it to BENIGN_SCRIPTS with why not',
    ).toEqual([]);
  });

  it('the new census-driven flight/ markers stay .ts-anchored: the close-decision and gate-cadence surfaces flag, their test files do not', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/completion.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/gate-schedule.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/flight/triage-factors.ts'])).toBe(
      true,
    );
    expect(touchesSecuritySensitivePath(['apps/dashboard/test/flight/triage.test.ts'])).toBe(false);
    expect(touchesSecuritySensitivePath(['apps/dashboard/test/flight/budget.test.ts'])).toBe(false);
  });

  it("flags the package-manager supply-chain manifests — CI runs the PR's own scripts, so a PR that neuters a gate script in any package.json, swaps a tarball in pnpm-lock.yaml, enables postinstall via pnpm-workspace.yaml, retargets the registry via .npmrc, or plants a .husky hook would pass its own green gate", () => {
    expect(touchesSecuritySensitivePath(['package.json'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/package.json'])).toBe(true);
    expect(touchesSecuritySensitivePath(['pnpm-lock.yaml'])).toBe(true);
    expect(touchesSecuritySensitivePath(['pnpm-workspace.yaml'])).toBe(true);
    expect(touchesSecuritySensitivePath(['.npmrc'])).toBe(true);
    expect(touchesSecuritySensitivePath(['.husky/commit-msg'])).toBe(true);
  });

  it("flags the CI enforcement scripts themselves — ci.yml runs scripts/ci/*.mjs from the PR's own checkout, so a PR that neuters secret-scan.mjs or validate-configs.mjs passes the very check it disabled; the package.json marker only catches rewiring the script LINE, not the script FILE", () => {
    expect(touchesSecuritySensitivePath(['scripts/ci/secret-scan.mjs'])).toBe(true);
    expect(touchesSecuritySensitivePath(['scripts/ci/validate-no-personal-paths.mjs'])).toBe(true);
    expect(touchesSecuritySensitivePath(['scripts/ci/validate-spdx-headers.mjs'])).toBe(true);
    expect(touchesSecuritySensitivePath(['scripts/ci/validate-configs.mjs'])).toBe(true);
  });

  it("flags the gate's own config files — tsc, vitest, eslint, prettier, commitlint, playwright, and Stryker all read their config from the PR's own checkout, so a PR that excludes tests in vitest.config.ts, narrows a tsconfig, widens .prettierignore, or trivializes a mutation config would pass the very gate it neutered; the package.json marker only catches rewiring the script LINE, not the config the tool reads", () => {
    expect(touchesSecuritySensitivePath(['vitest.config.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['vitest.setup.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['tsconfig.base.json'])).toBe(true);
    expect(touchesSecuritySensitivePath(['packages/engine/tsconfig.typecheck.json'])).toBe(true);
    expect(touchesSecuritySensitivePath(['eslint.config.js'])).toBe(true);
    expect(touchesSecuritySensitivePath(['.prettierignore'])).toBe(true);
    expect(touchesSecuritySensitivePath(['commitlint.config.js'])).toBe(true);
    expect(touchesSecuritySensitivePath(['apps/dashboard/e2e/playwright.config.ts'])).toBe(true);
    expect(touchesSecuritySensitivePath(['config/mutation/stryker.dashboard-ask.config.mjs'])).toBe(
      true,
    );
  });

  it('does not flag the flaky-test quarantine list — vitest never reads it (no gate exclusion), only the already-flagged scripts/ci reporting tools do, so editing it cannot narrow what the gate runs', () => {
    expect(touchesSecuritySensitivePath(['config/quarantine/flaky-tests.json'])).toBe(false);
  });

  it('does not flag the doc-freshness --check scripts outside scripts/ci/ — neutering a diagram/citation drift check lets stale docs merge, a quality concern, not a security enforcement bypass', () => {
    expect(touchesSecuritySensitivePath(['scripts/architecture/generate-diagram.mjs'])).toBe(false);
    expect(touchesSecuritySensitivePath(['scripts/citation/generate-citation.mjs'])).toBe(false);
    expect(touchesSecuritySensitivePath(['scripts/setup.mjs'])).toBe(false);
  });

  it("flags the operator-executed launcher scripts — root SETUP/START/STOP/RESTART/STATUS/WATCH-DASHBOARD.cmd/.sh and scripts/launchers/ — shell the operator runs by double-click, so a PR editing one injects commands straight onto the operator's machine, the same execute-on-the-maintainer-box class as the .husky/ hooks", () => {
    expect(touchesSecuritySensitivePath(['SETUP.cmd'])).toBe(true);
    expect(touchesSecuritySensitivePath(['SETUP.sh'])).toBe(true);
    expect(touchesSecuritySensitivePath(['START-DASHBOARD.cmd'])).toBe(true);
    expect(touchesSecuritySensitivePath(['STOP-DASHBOARD.sh'])).toBe(true);
    expect(touchesSecuritySensitivePath(['RESTART-DASHBOARD.cmd'])).toBe(true);
    expect(touchesSecuritySensitivePath(['STATUS-DASHBOARD.sh'])).toBe(true);
    expect(touchesSecuritySensitivePath(['WATCH-DASHBOARD.cmd'])).toBe(true);
    expect(touchesSecuritySensitivePath(['scripts/launchers/DEMO-DASHBOARD.cmd'])).toBe(true);
    expect(touchesSecuritySensitivePath(['scripts/launchers/FLY-DASHBOARD.cmd'])).toBe(true);
  });

  it('keeps the launcher markers extension-anchored: dashboard-named source and docs stay judged by their own per-file markers, not swept up by the launcher rule', () => {
    expect(touchesSecuritySensitivePath(['docs/dashboard.md'])).toBe(false);
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/web/sparkline.ts'])).toBe(false);
  });

  it("flags .nvmrc — CI installs the gate's Node runtime from it (node-version-file in ci.yml), so a quiet downgrade re-runs every gate under an older runtime: the same gate-config class as the tsconfig/vitest markers", () => {
    expect(touchesSecuritySensitivePath(['.nvmrc'])).toBe(true);
  });

  it('flags .github/dependabot.yml — the config that mints automated dependency PRs: a quiet edit could enable insecure-external-code-execution (update jobs running external code with registry credentials), retarget a registry, or redirect target-branch away from protected main — the same supply-chain class as the package-manager manifests, outside .github/workflows and with no security keyword in its path', () => {
    expect(touchesSecuritySensitivePath(['.github/dependabot.yml'])).toBe(true);
  });

  it('does not flag the .github label/template metadata — label colors and issue/PR templates execute nothing and gate nothing', () => {
    expect(touchesSecuritySensitivePath(['.github/labels.json'])).toBe(false);
    expect(touchesSecuritySensitivePath(['.github/ISSUE_TEMPLATE/bug_report.yml'])).toBe(false);
    expect(touchesSecuritySensitivePath(['.github/PULL_REQUEST_TEMPLATE.md'])).toBe(false);
  });

  it('flags the ARCHITECT proposal parser that computes the safety tier (CONTROL_TOOL_SAFETY[tool]) the client trusts to auto-run "read" proposals without a click — a PR that mislabeled a write/destructive tool as "read" here would let it auto-execute (e.g. project_reset) with no operator confirmation, and the path carries no security keyword', () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/ask/architect-proposal.ts'])).toBe(
      true,
    );
  });

  it("flags read/mutate.ts — despite living under a directory named 'read', it is the store-mutation wrapper (deleteProject, resetProjectTelemetry, setTaskStatus, deleteTask, ratifySoulAmendment, ratifyFleetWisdomAmendment among others) every dashboard write API call goes through; a PR that weakened its fail-safe-to-false error handling or exposed a new dangerous mutation would carry no security keyword and match no other marker", () => {
    expect(touchesSecuritySensitivePath(['apps/dashboard/src/read/mutate.ts'])).toBe(true);
  });
});

describe('planPrReview', () => {
  it('merges a policy-green PR: gate passed, mergeable, no sensitive paths', () => {
    const decision = planPrReview(candidate());

    expect(decision).toMatchObject({ decision: 'merge' });
    expect(decision.reasoning).toContain('#12');
    expect(decision.reasoning).toContain('policy-green');
  });

  it('requests changes when the gate failed', () => {
    const decision = planPrReview(candidate({ gateStatus: 'fail' }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('failed');
  });

  it('requests changes when the gate is still pending', () => {
    const decision = planPrReview(candidate({ gateStatus: 'pending' }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('still running');
  });

  it('queues for a human when no gating check reported at all — an unreported gate is no verdict, not "still running", and nothing the author can fix', () => {
    const decision = planPrReview(candidate({ gateStatus: 'unreported' }));

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('#12');
    expect(decision.reasoning).toContain('no gating check');
    expect(decision.reasoning).toContain("MASTERMIND's human eyes");
    // The old verdict asserted a run nobody observed: with zero checks
    // nothing may be running (a base outside CI's trigger filter, a fork's
    // first run awaiting approval, only "(optional)" checks reporting).
    expect(decision.reasoning).not.toContain('still running');
    expect(decision.reasoning).not.toContain('failed');
  });

  it('an unreported gate never outranks the security-hard rule', () => {
    const decision = planPrReview(
      candidate({ gateStatus: 'unreported', touchedPaths: ['.github/workflows/ci.yml'] }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('security-hard rule');
    expect(decision.reasoning).not.toContain('no gating check');
  });

  it('an unreported gate sits at the gate tier — judged ahead of the conflict verdict, exactly where a pending gate is', () => {
    const decision = planPrReview(candidate({ gateStatus: 'unreported', mergeable: false }));

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('no gating check');
    expect(decision.reasoning).not.toContain('conflicts');
  });

  it('an unreported gate plans the queue comment and dedups it like every other queue-for-human verdict', () => {
    const pr = candidate({ gateStatus: 'unreported' });
    const decision = planPrReview(pr);

    const commands = planPrReviewCommands(pr, decision);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.args).toEqual(['pr', 'comment', '12', '--body', decision.reasoning]);
    expect(planPrReviewCommands({ ...pr, ownComments: [decision.reasoning] }, decision)).toEqual(
      [],
    );
  });

  it('requests changes when there are merge conflicts', () => {
    const decision = planPrReview(candidate({ mergeable: false }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('conflicts');
  });

  it('names the actual conflicting files when a local git apply --check confirmed them', () => {
    const decision = planPrReview(
      candidate({ mergeable: false, conflictingPaths: ['apps/dashboard/src/web/shell.ts'] }),
    );

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('apps/dashboard/src/web/shell.ts');
    expect(decision.reasoning).toContain('conflicts');
  });

  it('requests changes on an uncomputed merge state with honest reasoning — never a false conflicts claim', () => {
    const decision = planPrReview(candidate({ mergeable: false, mergeStateUnknown: true }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).not.toContain('conflicts');
    expect(decision.reasoning).toContain('not finished computing');
  });

  it('requests changes when the PR touches zero files — an empty diff cannot genuinely improve the tree, so a green gate must not carry it to a merge', () => {
    const decision = planPrReview(candidate({ touchedPaths: [] }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('touches no files');
  });

  it('queues for a human when gh enumerated fewer paths than the changed-file total — a truncated files list (gh caps it at 100) means the security sweep cannot claim to have checked every path', () => {
    const decision = planPrReview(
      candidate({ touchedPaths: ['docs/a.md', 'docs/b.md'], changedFiles: 150 }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('150');
    expect(decision.reasoning).toContain('truncated');
  });

  it('ranks truncation above the empty-diff verdict: zero enumerated paths with a positive changed-file total is a truncated list, not an empty diff', () => {
    const decision = planPrReview(candidate({ touchedPaths: [], changedFiles: 5 }));

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('truncated');
  });

  it('still merges when the changed-file total matches the enumerated paths — the truncation guard only narrows', () => {
    const decision = planPrReview(candidate({ changedFiles: 1 }));

    expect(decision).toMatchObject({ decision: 'merge' });
  });

  it('queues for a human when the enumerated paths sit AT the 100-entry cap and gh reported no changed-file total — an unconfirmed total cannot confirm the sweep saw every path', () => {
    const decision = planPrReview(
      candidate({
        touchedPaths: Array.from({ length: 100 }, (_, i) => `docs/note-${i}.md`),
      }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('100');
    expect(decision.reasoning).toContain('truncated');
  });

  it('queues for a human when the files list itself was never assessed — a garbage gh files value must not masquerade as an empty diff, since the security sweep then checked nothing', () => {
    const decision = planPrReview(candidate({ touchedPaths: [], touchedPathsUnassessed: true }));

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('files list');
    expect(decision.reasoning).not.toContain('touches no files');
  });

  it('ranks the unassessed-files guard above the empty-diff verdict even with paths enumerated — a partially-dropped list cannot back a complete security sweep', () => {
    const decision = planPrReview(
      candidate({ touchedPaths: ['docs/a.md'], touchedPathsUnassessed: true }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
  });

  it('treats a negative changed-file total as unconfirmed rather than "not truncated" — garbage at the cap fails closed toward a human, never toward a merge', () => {
    const decision = planPrReview(
      candidate({
        touchedPaths: Array.from({ length: 100 }, (_, i) => `docs/note-${i}.md`),
        changedFiles: -5,
      }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
  });

  it('still merges an absent changed-file total when the enumerated list sits UNDER the cap — gh truncates only at the cap, so an under-cap list is complete', () => {
    const decision = planPrReview(candidate({ touchedPaths: ['docs/a.md'] }));

    expect(decision).toMatchObject({ decision: 'merge' });
  });

  it('still merges at the cap when the confirmed total matches it exactly — a complete 100-file enumeration is not truncation', () => {
    const decision = planPrReview(
      candidate({
        touchedPaths: Array.from({ length: 100 }, (_, i) => `docs/note-${i}.md`),
        changedFiles: 100,
      }),
    );

    expect(decision).toMatchObject({ decision: 'merge' });
  });

  it('lets the security-hard rule win over truncation when a sensitive path is already visible in the partial list', () => {
    const decision = planPrReview(
      candidate({
        touchedPaths: ['apps/dashboard/src/server/security.ts'],
        changedFiles: 150,
      }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('security-hard rule');
  });

  it('queues for a human when a security-sensitive path is touched, even with a green gate', () => {
    const decision = planPrReview(
      candidate({ touchedPaths: ['apps/dashboard/src/server/security.ts'] }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('security-hard rule');
  });

  it('queues for a human even when the gate failed too — security always wins', () => {
    const decision = planPrReview(
      candidate({
        gateStatus: 'fail',
        mergeable: false,
        touchedPaths: ['apps/dashboard/src/flight/worktree-guard.ts'],
      }),
    );

    expect(decision.decision).toBe('queue-for-human');
  });

  it('queues an otherwise policy-green PR for a human when no reviewed head SHA was captured — an unpinned merge would reopen the review-to-merge TOCTOU window', () => {
    const pinless: PrReviewCandidate = {
      number: 12,
      title: 'Fix flaky sparkline test',
      gateStatus: 'pass',
      mergeable: true,
      touchedPaths: ['apps/dashboard/src/web/sparkline.ts'],
      baseRefName: 'main',
      additions: 12,
      deletions: 3,
      renamedFromPaths: [],
      unresolvedReviewThreads: 0,
    };

    const decision = planPrReview(pinless);

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('pinned');
  });
});

describe('planPrReviewCommands', () => {
  it('plans an approve review followed by a squash merge for a merge decision', () => {
    const pr = candidate();
    const decision = planPrReview(pr);

    expect(planPrReviewCommands(pr, decision)).toEqual([
      {
        command: 'gh',
        args: ['pr', 'review', '12', '--approve', '--body', decision.reasoning],
        details: 'approving #12 — policy-green',
      },
      {
        command: 'gh',
        args: [
          'pr',
          'merge',
          '12',
          '--squash',
          '--match-head-commit',
          '0123456789abcdef0123456789abcdef01234567',
        ],
        details: 'merging #12 (squash, head pinned to 01234567)',
      },
    ]);
  });

  it('pins the merge to the reviewed head SHA when the candidate carries one — a commit pushed between review and merge must not slip into the squash', () => {
    const pr = candidate({ headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' });
    const decision = planPrReview(pr);

    expect(planPrReviewCommands(pr, decision)[1]).toEqual({
      command: 'gh',
      args: [
        'pr',
        'merge',
        '12',
        '--squash',
        '--match-head-commit',
        'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      ],
      details: 'merging #12 (squash, head pinned to a1b2c3d4)',
    });
  });

  it('fails closed on a merge decision for a candidate with no reviewed head SHA — the command layer never plans an unpinned merge', () => {
    const { headRefOid: _dropped, ...pinless } = candidate();

    expect(() =>
      planPrReviewCommands(pinless, {
        decision: 'merge',
        reasoning: 'a merge decision a buggy or bypassing caller might hand over',
      }),
    ).toThrow(/unpinned merge/);
  });

  it('plans only a request-changes review, never a merge', () => {
    const pr = candidate({ gateStatus: 'fail' });
    const decision = planPrReview(pr);

    expect(planPrReviewCommands(pr, decision)).toEqual([
      {
        command: 'gh',
        args: ['pr', 'review', '12', '--request-changes', '--body', decision.reasoning],
        details: 'requesting changes on #12',
      },
    ]);
  });

  it('plans only a plain comment for queue-for-human — never a review verdict', () => {
    const pr = candidate({ touchedPaths: ['apps/dashboard/src/server/security.ts'] });
    const decision = planPrReview(pr);

    expect(planPrReviewCommands(pr, decision)).toEqual([
      {
        command: 'gh',
        args: ['pr', 'comment', '12', '--body', decision.reasoning],
        details: "flagging #12 for MASTERMIND's human review — never auto-merged",
      },
    ]);
  });
});

describe('planPrReviewBatch', () => {
  it('plans a decision and its commands for every PR, independently', () => {
    const prs = [candidate({ number: 1 }), candidate({ number: 2, gateStatus: 'fail' })];

    const plans = planPrReviewBatch(prs);

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ pr: prs[0], decision: { decision: 'merge' } });
    expect(plans[1]).toMatchObject({ pr: prs[1], decision: { decision: 'request-changes' } });
    expect(plans[0]?.commands).toEqual(planPrReviewCommands(prs[0]!, plans[0]!.decision));
  });

  it('returns an empty array for an empty PR batch', () => {
    expect(planPrReviewBatch([])).toEqual([]);
  });
});

describe('fetchOpenPrCandidates', () => {
  it('calls gh pr list with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchOpenPrCandidates(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      String(MAX_PR_LIST_CANDIDATES),
      '--json',
      'number,title,author,mergeable,mergeStateStatus,baseRefName,headRefOid,statusCheckRollup,files,labels,changedFiles,additions,deletions,latestReviews,isDraft,autoMergeRequest,comments,reviews',
    ]);
  });

  it("passes an explicit --limit — gh pr list's default caps the fetch at the 30 newest PRs, so without it the oldest open PRs silently never receive any verdict", async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchOpenPrCandidates(exec);

    const argv = (exec as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as readonly string[];
    const limitFlag = argv.indexOf('--limit');
    expect(limitFlag).toBeGreaterThan(-1);
    expect(Number(argv[limitFlag + 1])).toBe(MAX_PR_LIST_CANDIDATES);
    // The cap must WIDEN gh's default (30), never narrow it — a lower value
    // would shrink the ritual's coverage instead of fixing the silent gap.
    expect(MAX_PR_LIST_CANDIDATES).toBeGreaterThan(30);
  });

  it('captures the additions/deletions totals gh reports, so the size guard can judge them', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 15,
          title: 'Big sweep',
          mergeable: 'MERGEABLE',
          additions: 900,
          deletions: 350,
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [{ path: 'docs/HELLO.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.additions).toBe(900);
    expect(prs[0]?.deletions).toBe(350);
  });

  it('leaves additions/deletions absent when gh reports a non-numeric value — an unassessed size beats judging garbage', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 16, title: 'Odd counts', mergeable: 'MERGEABLE', additions: '900', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('additions');
    expect(prs[0]).not.toHaveProperty('deletions');
  });

  it('marks touchedPathsUnassessed when gh reports a non-array files value — an unreported files list must not masquerade as a confirmed-empty diff', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 17, title: 'No files key', mergeable: 'MERGEABLE', files: 'garbage' },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.touchedPaths).toEqual([]);
    expect(prs[0]?.touchedPathsUnassessed).toBe(true);
  });

  it('marks touchedPathsUnassessed when a files entry carries a non-string path — a silently-dropped path is an unswept path', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 18,
          title: 'Partial files',
          mergeable: 'MERGEABLE',
          files: [{ path: 42 }, { path: 'docs/a.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.touchedPaths).toEqual(['docs/a.md']);
    expect(prs[0]?.touchedPathsUnassessed).toBe(true);
  });

  it('leaves touchedPathsUnassessed absent for a real files array — a confirmed-empty diff keeps its request-changes verdict', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 19, title: 'Truly empty', mergeable: 'MERGEABLE', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('touchedPathsUnassessed');
  });

  it('leaves negative or fractional additions/deletions absent — only a non-negative integer is a confirmed line count', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 16,
          title: 'Garbage counts',
          mergeable: 'MERGEABLE',
          additions: -900,
          deletions: 3.5,
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('additions');
    expect(prs[0]).not.toHaveProperty('deletions');
  });

  it('captures the changed-file total gh reports, so the truncation guard can compare it against the enumerated paths', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 17,
          title: 'Wide sweep',
          mergeable: 'MERGEABLE',
          changedFiles: 150,
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [{ path: 'docs/HELLO.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.changedFiles).toBe(150);
  });

  it('leaves changedFiles absent when gh reports a non-numeric value — an unassessed total beats judging garbage', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 18, title: 'Odd total', mergeable: 'MERGEABLE', changedFiles: '150', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('changedFiles');
  });

  it('drops a negative changed-file total to absent — only a non-negative integer can confirm the enumeration is complete', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 18, title: 'Bad total', mergeable: 'MERGEABLE', changedFiles: -5, files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('changedFiles');
  });

  it('defaults touchedPaths to empty when gh reports a non-array files value — malformed output beats a crash, not a guess', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 19, title: 'Odd files', mergeable: 'MERGEABLE', files: 'oops' },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.touchedPaths).toEqual([]);
  });

  it('captures the head commit SHA gh reports, so a planned merge can pin the exact reviewed commit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 9,
          title: 'Pin me',
          mergeable: 'MERGEABLE',
          headRefOid: 'deadbeef00112233445566778899aabbccddeeff',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.headRefOid).toBe('deadbeef00112233445566778899aabbccddeeff');
  });

  it('captures the base branch gh reports, so the canonical-base guard can confirm the PR targets main', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 14,
          title: 'Targets main',
          mergeable: 'MERGEABLE',
          baseRefName: 'main',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.baseRefName).toBe('main');
  });

  it('leaves baseRefName absent when gh reports a non-string or empty value — an unconfirmed base fails closed toward a human, never a wrong-branch merge', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 15, title: 'No base', mergeable: 'MERGEABLE', baseRefName: 7, files: [] },
        { number: 16, title: 'Empty base', mergeable: 'MERGEABLE', baseRefName: '', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('baseRefName');
    expect(prs[1]).not.toHaveProperty('baseRefName');
  });

  it('leaves headRefOid absent when gh reports a non-string or empty value — an unpinned merge beats passing garbage argv to gh', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 10, title: 'No oid', mergeable: 'MERGEABLE', headRefOid: 42, files: [] },
        { number: 11, title: 'Empty oid', mergeable: 'MERGEABLE', headRefOid: '', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('headRefOid');
    expect(prs[1]).not.toHaveProperty('headRefOid');
  });

  it('parses a well-formed PR into a candidate with a derived pass gate status', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 3,
          title: 'Add feature',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'SUCCESS' }],
          files: [{ path: 'apps/dashboard/src/web/gauge.ts' }],
          // Confirmed-empty label/review reports keep the candidate free of
          // the unassessed flags an unreadable report would mint.
          labels: [],
          latestReviews: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs).toEqual([
      {
        number: 3,
        title: 'Add feature',
        gateStatus: 'pass',
        mergeable: true,
        touchedPaths: ['apps/dashboard/src/web/gauge.ts'],
      },
    ]);
  });

  it('derives a fail gate status when any check failed', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 4,
          title: 'Broken PR',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.gateStatus).toBe('fail');
  });

  it('derives a fail gate status for terminal non-success conclusions — a cancelled run is not "still running"', async () => {
    const terminalConclusions = [
      'CANCELLED',
      'TIMED_OUT',
      'ACTION_REQUIRED',
      'STARTUP_FAILURE',
      'STALE',
    ];
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(
        terminalConclusions.map((conclusion, index) => ({
          number: 20 + index,
          title: `Terminal ${conclusion}`,
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion }],
          files: [],
        })),
      ),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.gateStatus)).toEqual(['fail', 'fail', 'fail', 'fail', 'fail']);
  });

  it('derives a fail gate status when a commit-status entry reports state FAILURE or ERROR — gh mixes StatusContext entries (context/state) into statusCheckRollup, and a red external status is not "still running"', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 40,
          title: 'External status failed',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [
            { name: 'verify (ubuntu-latest)', conclusion: 'SUCCESS' },
            { context: 'ci/external: build', state: 'FAILURE' },
          ],
          files: [],
        },
        {
          number: 41,
          title: 'External status errored',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ context: 'ci/external: build', state: 'ERROR' }],
          files: [],
        },
        {
          // Pins the deliberate conservative half: a green commit status does
          // NOT count toward a pass — only conclusion-SUCCESS CheckRuns may
          // pass the gate, since recognizing a green status could only WIDEN
          // what auto-merges, and every check in this ritual may only narrow.
          number: 42,
          title: 'External status green',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [
            { name: 'verify (ubuntu-latest)', conclusion: 'SUCCESS' },
            { context: 'ci/external: build', state: 'SUCCESS' },
          ],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.gateStatus)).toEqual(['fail', 'fail', 'pending']);
  });

  it('derives a pending gate status when a gating check exists but has not concluded', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 6,
          title: 'Still running',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: null }],
          files: [],
        },
        {
          number: 7,
          title: 'Queued, not started',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [
            { name: 'verify (ubuntu-latest)', status: 'QUEUED', conclusion: null },
          ],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.gateStatus)).toEqual(['pending', 'pending']);
  });

  it('derives an unreported gate status when NO gating check exists — an absent rollup, an empty one, or only "(optional)" checks: nothing is "still running" there', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 5, title: 'No rollup at all', mergeable: 'MERGEABLE', files: [] },
        {
          number: 8,
          title: 'Empty rollup — CI never triggered for this base',
          mergeable: 'MERGEABLE',
          baseRefName: 'autopilot/flight',
          statusCheckRollup: [],
          files: [],
        },
        {
          number: 9,
          title: 'Rollup is not a list',
          mergeable: 'MERGEABLE',
          statusCheckRollup: 'oops',
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.gateStatus)).toEqual(['unreported', 'unreported', 'unreported']);
  });

  it('survives a null or garbage entry in statusCheckRollup — an unreadable check cannot confirm a pass, so the gate stays pending instead of a TypeError crashing the whole fetch', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 7,
          title: 'Null check entry',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [null, { conclusion: 'SUCCESS' }],
          files: [],
        },
        {
          number: 8,
          title: 'Garbage check entry',
          mergeable: 'MERGEABLE',
          statusCheckRollup: ['oops', { conclusion: 'SUCCESS' }],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.gateStatus)).toEqual(['pending', 'pending']);
  });

  it('ignores checks named (optional) when rolling up the gate status', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 9,
          title: 'Optional informational check failed',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [
            { name: 'verify (ubuntu-latest)', conclusion: 'SUCCESS' },
            { name: 'reuse lint (optional)', conclusion: 'FAILURE' },
          ],
          files: [],
        },
        {
          number: 10,
          title: 'Only optional checks reported',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ name: 'reuse lint (optional)', conclusion: 'FAILURE' }],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    // Only optional checks reporting is no verdict at all — unreported, the
    // same as no checks, never a pass and never "still running".
    expect(prs.map((pr) => pr.gateStatus)).toEqual(['pass', 'unreported']);
  });

  it('excludes draft PRs from the sweep — a draft is its author saying "not ready", so no automated verdict may touch it', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 30,
          title: 'Draft: work in progress',
          isDraft: true,
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [{ path: 'docs/HELLO.md' }],
        },
        {
          number: 31,
          title: 'Ready for review',
          isDraft: false,
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [{ path: 'docs/HELLO.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.number)).toEqual([31]);
  });

  it('treats a non-boolean isDraft as not-a-draft — defensive parsing fails toward reviewing, never silently skipping', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 32, title: 'Odd isDraft', isDraft: 'yes', mergeable: 'MERGEABLE', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.number)).toEqual([32]);
  });

  it('treats an unclear mergeable state as not mergeable', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 7, title: 'Conflicting', mergeable: 'CONFLICTING', files: [] },
        { number: 8, title: 'Unknown', mergeable: 'UNKNOWN', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.mergeable)).toEqual([false, false]);
  });

  it('marks only an uncomputed merge state as unknown — CONFLICTING is a real conflicts verdict', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 7, title: 'Conflicting', mergeable: 'CONFLICTING', files: [] },
        { number: 8, title: 'Unknown', mergeable: 'UNKNOWN', files: [] },
        { number: 9, title: 'Missing state', files: [] },
        { number: 10, title: 'Clean', mergeable: 'MERGEABLE', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs.map((pr) => pr.mergeStateUnknown)).toEqual([undefined, true, true, undefined]);
  });

  it('drops entries missing a numeric number or string title', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 1, title: 'Valid', mergeable: 'MERGEABLE', files: [] },
        { number: 'not-a-number', title: 'Bad number' },
        { title: 'Missing number' },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs).toHaveLength(1);
    expect(prs[0]?.number).toBe(1);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchOpenPrCandidates(exec)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    expect(await fetchOpenPrCandidates(exec)).toEqual([]);
  });

  it('returns an empty array when stdout parses to a non-array', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{"not":"an array"}' });

    expect(await fetchOpenPrCandidates(exec)).toEqual([]);
  });
});

describe('assessPrAlreadyApplied', () => {
  it('reports true when the diff reverse-applies cleanly on a tree that stands in for the base, feeding git apply the fetched patch', async () => {
    let patchPath = '';
    let patchContents = '';
    const exec: CliExec = vi.fn(async (bin, args) => {
      if (bin === 'gh') return { code: 0, stdout: 'diff --git a/x b/x\n' };
      if (args[0] === 'status') return { code: 0, stdout: '' }; // clean tree
      if (args[0] === 'merge-base') return { code: 1, stdout: '' }; // history excludes the PR head
      patchPath = args[args.length - 1] ?? '';
      patchContents = readFileSync(patchPath, 'utf8');
      return { code: 0, stdout: '' };
    });

    const verdict = await assessPrAlreadyApplied(12, exec, HEAD_SHA);

    expect(verdict).toBe(true);
    expect(exec).toHaveBeenNthCalledWith(1, 'gh', ['pr', 'diff', '12']);
    expect(exec).toHaveBeenNthCalledWith(2, 'git', ['apply', '--reverse', '--check', patchPath]);
    expect(patchContents).toBe('diff --git a/x b/x\n');
  });

  it('reports false when the diff does not reverse-apply', async () => {
    const exec: CliExec = vi.fn(async (bin) =>
      bin === 'gh'
        ? { code: 0, stdout: 'diff --git a/x b/x\n' }
        : { code: 1, stdout: 'error: patch failed' },
    );

    expect(await assessPrAlreadyApplied(12, exec)).toBe(false);
  });

  it('reports not-assessed when the diff fetch fails, without running git', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await assessPrAlreadyApplied(12, exec)).toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('reports not-assessed for an empty diff, without running git', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '  \n' });

    expect(await assessPrAlreadyApplied(12, exec)).toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('removes the temp patch file even when the check fails', async () => {
    let patchPath = '';
    const exec: CliExec = vi.fn(async (bin, args) => {
      if (bin === 'gh') return { code: 0, stdout: 'diff --git a/x b/x\n' };
      patchPath = args[args.length - 1] ?? '';
      return { code: 1, stdout: '' };
    });

    await assessPrAlreadyApplied(12, exec);

    expect(patchPath).not.toBe('');
    expect(existsSync(patchPath)).toBe(false);
  });
});

describe('annotateAlreadyApplied', () => {
  it('passes a truncated-list candidate through without spending a gh pr diff call — truncation already queues it for a human, so no diff verdict could change the decision', async () => {
    const pr = candidate({ changedFiles: 150 });
    const exec: CliExec = vi.fn();

    const annotated = await annotateAlreadyApplied([pr], exec);

    expect(exec).not.toHaveBeenCalled();
    expect(annotated[0]).toBe(pr);
  });

  it('annotates a non-security candidate with the reverse-apply verdict, immutably', async () => {
    const pr = candidate();
    const exec: CliExec = vi.fn(async (bin, args) => ({
      // A clean tree whose history excludes the PR head stands in for the
      // base, so the clean reverse-apply below mints the positive verdict.
      code: args[0] === 'merge-base' ? 1 : 0,
      stdout: bin === 'gh' ? 'diff --git a/x b/x\n' : '',
    }));

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated?.alreadyApplied).toBe(true);
    expect('alreadyApplied' in pr).toBe(false);
  });

  it('passes security-sensitive candidates through without spending a gh call', async () => {
    const pr = candidate({ touchedPaths: ['apps/dashboard/src/server/security.ts'] });
    const exec: CliExec = vi.fn();

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated).toBe(pr);
    expect(exec).not.toHaveBeenCalled();
  });

  it('passes the candidate through unchanged when the verdict is not-assessed', async () => {
    const pr = candidate();
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated).toBe(pr);
    expect(annotated && 'alreadyApplied' in annotated).toBe(false);
  });

  it('passes a viewer-authored candidate through without spending a gh pr diff call — self-authorship already queues it for a human, so no diff verdict could change the decision', async () => {
    const pr = candidate({ viewerIsAuthor: true });
    const exec: CliExec = vi.fn();

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated).toBe(pr);
    expect(exec).not.toHaveBeenCalled();
  });

  it('passes a zero-file candidate through without spending a gh pr diff call — an empty diff already requests changes ahead of every diff verdict, and the fetch could only return an empty diff that assesses nothing', async () => {
    const pr = candidate({ touchedPaths: [] });
    const exec: CliExec = vi.fn();

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated).toBe(pr);
    expect(exec).not.toHaveBeenCalled();
  });

  it('passes a touchedPathsUnassessed candidate through without spending a gh pr diff call — an unreadable files list already queues it for a human ahead of every diff verdict', async () => {
    const pr = candidate({ touchedPaths: ['docs/a.md'], touchedPathsUnassessed: true });
    const exec: CliExec = vi.fn();

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated).toBe(pr);
    expect(exec).not.toHaveBeenCalled();
  });

  it('requests the forward conflict-path check for a gh-confirmed conflict and folds the paths in', async () => {
    const pr = candidate({ mergeable: false });
    const exec: CliExec = vi.fn(async (bin, args) => {
      if (bin === 'gh') return { code: 0, stdout: 'diff --git a/x b/x\n' };
      if (args.includes('--reverse')) return { code: 1, stdout: '' };
      if (args[0] === 'status') return { code: 0, stdout: '' }; // clean tree
      if (args[0] === 'merge-base') return { code: 1, stdout: '' }; // history excludes the PR head
      return { code: 1, stdout: '', stderr: 'error: patch failed: x.ts:3\n' };
    });

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated?.conflictingPaths).toEqual(['x.ts']);
    expect(exec).toHaveBeenCalledTimes(5); // diff + reverse check + tree stand-in (status, ancestry) + forward check
  });

  it('does not request the forward conflict-path check for a mergeable candidate — the reverse-apply failure there means nothing about a conflict', async () => {
    const pr = candidate({ mergeable: true });
    const exec: CliExec = vi.fn(async (bin) => ({
      code: bin === 'gh' ? 0 : 1,
      stdout: bin === 'gh' ? 'diff --git a/x b/x\n' : '',
    }));

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated && 'conflictingPaths' in annotated).toBe(false);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('does not request the forward conflict-path check for an uncomputed merge state — nothing to name yet', async () => {
    const pr = candidate({ mergeable: false, mergeStateUnknown: true });
    const exec: CliExec = vi.fn(async (bin) => ({
      code: bin === 'gh' ? 0 : 1,
      stdout: bin === 'gh' ? 'diff --git a/x b/x\n' : '',
    }));

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated && 'conflictingPaths' in annotated).toBe(false);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('executePrReviewCommands', () => {
  it('runs every planned command through exec, in order, and pairs each with its result', async () => {
    const pr = candidate();
    const decision = planPrReview(pr);
    const commands = planPrReviewCommands(pr, decision);
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'approved' })
      .mockResolvedValueOnce({ code: 0, stdout: 'merged' });

    const results = await executePrReviewCommands(commands, exec);

    expect(exec).toHaveBeenNthCalledWith(1, 'gh', [
      'pr',
      'review',
      '12',
      '--approve',
      '--body',
      decision.reasoning,
    ]);
    expect(exec).toHaveBeenNthCalledWith(2, 'gh', [
      'pr',
      'merge',
      '12',
      '--squash',
      '--match-head-commit',
      '0123456789abcdef0123456789abcdef01234567',
    ]);
    expect(results).toEqual([
      { command: commands[0], code: 0, stdout: 'approved' },
      { command: commands[1], code: 0, stdout: 'merged' },
    ]);
  });

  it('stops after the first failing command instead of continuing', async () => {
    const pr = candidate();
    const decision = planPrReview(pr);
    const commands = planPrReviewCommands(pr, decision);
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, stdout: 'approve failed' })
      .mockResolvedValueOnce({ code: 0, stdout: 'merged' });

    const results = await executePrReviewCommands(commands, exec);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ command: commands[0], code: 1, stdout: 'approve failed' }]);
  });

  it('returns an empty array for an empty plan without calling exec', async () => {
    const exec: CliExec = vi.fn();

    expect(await executePrReviewCommands([], exec)).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('resolvePrReviewAutoMergePolicy', () => {
  it("defaults to 'green' when AUTOPILOT_PR_AUTOMERGE is unset or unrecognized", () => {
    expect(resolvePrReviewAutoMergePolicy({})).toBe('green');
    expect(resolvePrReviewAutoMergePolicy({ AUTOPILOT_PR_AUTOMERGE: 'no' })).toBe('green');
  });

  it("disables auto-merge only on the explicit value 'off' — any case, padding tolerated", () => {
    expect(resolvePrReviewAutoMergePolicy({ AUTOPILOT_PR_AUTOMERGE: 'off' })).toBe('off');
    expect(resolvePrReviewAutoMergePolicy({ AUTOPILOT_PR_AUTOMERGE: ' OFF ' })).toBe('off');
  });
});

describe('planPrReview with the auto-merge policy lever', () => {
  const policyGreen: PrReviewCandidate = {
    number: 91,
    title: 'docs: clarify a paragraph',
    baseRefName: 'main',
    gateStatus: 'pass',
    mergeable: true,
    touchedPaths: ['docs/HELLO.md'],
    headRefOid: '0123456789abcdef0123456789abcdef01234567',
    additions: 4,
    deletions: 2,
    renamedFromPaths: [],
    unresolvedReviewThreads: 0,
  };

  it("policy 'off' turns a policy-green merge into queue-for-human, naming the lever", () => {
    const decision = planPrReview(policyGreen, 'off');

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('AUTOPILOT_PR_AUTOMERGE=off');
  });

  it("policy 'off' changes nothing for red-gate or security-touching PRs", () => {
    const redGate = planPrReview({ ...policyGreen, gateStatus: 'fail' }, 'off');
    expect(redGate.decision).toBe('request-changes');

    const security = planPrReview(
      { ...policyGreen, touchedPaths: ['packages/engine/src/guard.ts'] },
      'off',
    );
    expect(security.decision).toBe('queue-for-human');
    expect(security.reasoning).not.toContain('AUTOPILOT_PR_AUTOMERGE');
  });

  it('planPrReviewBatch threads an explicit policy to every PR', () => {
    const plans = planPrReviewBatch([policyGreen], 'off');

    expect(plans[0]?.decision.decision).toBe('queue-for-human');
    expect(plans[0]?.commands.map((command) => command.args[1])).toEqual(['comment']);
  });

  it('planPrReviewBatch defaults from the environment, still merging when unset', () => {
    delete process.env['AUTOPILOT_PR_AUTOMERGE'];

    const plans = planPrReviewBatch([policyGreen]);

    expect(plans[0]?.decision.decision).toBe('merge');
  });
});

describe('planPrReview verify-necessity (already-applied PRs)', () => {
  const applied: PrReviewCandidate = {
    number: 92,
    title: 'fix: something already landed',
    gateStatus: 'pass',
    mergeable: true,
    touchedPaths: ['docs/HELLO.md'],
    alreadyApplied: true,
  };

  it('requests changes on an otherwise policy-green PR whose diff is already in the tree', () => {
    const decision = planPrReview(applied);

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('already present in the current tree');
  });

  it('security-hard still wins: an already-applied security-touching PR queues for a human', () => {
    const security = planPrReview({
      ...applied,
      touchedPaths: ['packages/engine/src/guard.ts'],
    });

    expect(security.decision).toBe('queue-for-human');
  });

  it('outranks the gate: an already-applied red-gate PR reports the necessity reason', () => {
    const redGate = planPrReview({ ...applied, gateStatus: 'fail' });

    expect(redGate.decision).toBe('request-changes');
    expect(redGate.reasoning).toContain('already present');
  });

  it('an unassessed candidate (field absent) still merges when policy-green', () => {
    const unassessed: PrReviewCandidate = {
      number: 93,
      title: 'docs: tweak a sentence',
      baseRefName: 'main',
      gateStatus: 'pass',
      mergeable: true,
      touchedPaths: ['docs/HELLO.md'],
      headRefOid: '0123456789abcdef0123456789abcdef01234567',
      additions: 4,
      deletions: 2,
      renamedFromPaths: [],
      unresolvedReviewThreads: 0,
    };

    expect(planPrReview(unassessed).decision).toBe('merge');
  });
});

describe('planPrReview content judgment (binary diffs)', () => {
  const binary: PrReviewCandidate = {
    number: 94,
    title: 'chore: refresh the logo asset',
    gateStatus: 'pass',
    mergeable: true,
    touchedPaths: ['docs/logo.png'],
    hasBinaryDiff: true,
  };

  it('queues an otherwise policy-green PR for a human when its diff carries binary content byte-review cannot read', () => {
    const decision = planPrReview(binary);

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('binary');
  });

  it('outranks the gate: no automated review verdict gets posted on bytes the ritual cannot read', () => {
    const redGate = planPrReview({ ...binary, gateStatus: 'fail' });

    expect(redGate.decision).toBe('queue-for-human');
    expect(redGate.reasoning).toContain('binary');
  });

  it('security-hard still wins: a binary-carrying security-touching PR reports the security reason', () => {
    const security = planPrReview({ ...binary, touchedPaths: ['packages/engine/src/guard.ts'] });

    expect(security.decision).toBe('queue-for-human');
    expect(security.reasoning).toContain('security-hard rule');
  });

  it('an unassessed candidate (field absent) still merges when policy-green', () => {
    expect(planPrReview(candidate()).decision).toBe('merge');
  });
});

describe('assessPrDiff (binary content detection)', () => {
  it('flags a "Binary files ... differ" diff and skips the reverse-apply spawn — the API diff omits the payload, so the check could never pass anyway', async () => {
    const exec: CliExec = vi.fn(async () => ({
      code: 0,
      stdout: 'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n',
    }));

    expect(await assessPrDiff(12, exec)).toEqual({ hasBinaryDiff: true, renamedFromPaths: [] });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('flags a "GIT binary patch" diff the same way', async () => {
    const exec: CliExec = vi.fn(async () => ({
      code: 0,
      stdout: 'diff --git a/x.bin b/x.bin\nGIT binary patch\nliteral 8\n',
    }));

    expect(await assessPrDiff(12, exec)).toEqual({ hasBinaryDiff: true, renamedFromPaths: [] });
  });

  it('does not flag a text diff that merely ADDS a line quoting a binary marker — diff body lines start with +/-/space, never at column 0', async () => {
    const exec: CliExec = vi.fn(async (bin, args) => ({
      code: args[0] === 'merge-base' ? 1 : 0,
      stdout: bin === 'gh' ? 'diff --git a/x.md b/x.md\n+Binary files a/x and b/x differ\n' : '',
    }));

    expect(await assessPrDiff(12, exec, { headRefOid: HEAD_SHA })).toEqual({
      alreadyApplied: true,
      hasBinaryDiff: false,
      renamedFromPaths: [],
    });
  });

  it('assesses nothing on a failed diff fetch', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await assessPrDiff(12, exec)).toEqual({});
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe('parseDiffRenameSources', () => {
  it("extracts the OLD path from a rename header pair — the path gh's files list no longer shows", () => {
    const diff =
      'diff --git a/packages/engine/src/firing.ts b/packages/engine/src/util2.ts\n' +
      'similarity index 97%\n' +
      'rename from packages/engine/src/firing.ts\n' +
      'rename to packages/engine/src/util2.ts\n';

    expect(parseDiffRenameSources(diff)).toEqual(['packages/engine/src/firing.ts']);
  });

  it('strips git core-quoting from a rename-from path with special characters', () => {
    const diff = 'rename from "docs/we ird.md"\nrename to docs/weird.md\n';

    expect(parseDiffRenameSources(diff)).toEqual(['docs/we ird.md']);
  });

  it('never matches a diff BODY line quoting the header — real headers sit at column 0', () => {
    const diff = 'diff --git a/x.md b/x.md\n+rename from packages/engine/src/firing.ts\n';

    expect(parseDiffRenameSources(diff)).toEqual([]);
  });

  it('returns nothing for a rename-free diff', () => {
    expect(parseDiffRenameSources('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n')).toEqual(
      [],
    );
  });
});

describe('assessPrDiff rename-source capture', () => {
  it('captures rename-from paths off the same fetched diff — no extra gh spend', async () => {
    const diff =
      'diff --git a/packages/engine/src/firing.ts b/packages/engine/src/util2.ts\n' +
      'similarity index 90%\n' +
      'rename from packages/engine/src/firing.ts\n' +
      'rename to packages/engine/src/util2.ts\n' +
      '--- a/packages/engine/src/firing.ts\n' +
      '+++ b/packages/engine/src/util2.ts\n';
    const exec: CliExec = vi.fn(async (bin) => ({
      code: bin === 'gh' ? 0 : 1,
      stdout: bin === 'gh' ? diff : '',
    }));

    expect(await assessPrDiff(12, exec)).toEqual({
      alreadyApplied: false,
      hasBinaryDiff: false,
      renamedFromPaths: ['packages/engine/src/firing.ts'],
    });
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('planPrReview rename-source guard (security-hard rule vs renames)', () => {
  it('queues for a human when the diff renames a file OUT of a security-sensitive path — the files list reports only the NEW name, so the path sweep alone would miss the move', () => {
    const decision = planPrReview(
      candidate({
        touchedPaths: ['packages/engine/src/util2.ts'],
        renamedFromPaths: ['packages/engine/src/firing.ts'],
      }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('rename');
    expect(decision.reasoning).toContain('packages/engine/src/firing.ts');
  });

  it('outranks the gate: a guarded-path move gets no automated verdict regardless of gate result', () => {
    const decision = planPrReview(
      candidate({
        gateStatus: 'fail',
        touchedPaths: ['packages/engine/src/util2.ts'],
        renamedFromPaths: ['packages/engine/src/firing.ts'],
      }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('rename');
  });

  it('a rename between two unguarded paths stays policy-green', () => {
    const decision = planPrReview(
      candidate({ touchedPaths: ['docs/new.md'], renamedFromPaths: ['docs/old.md'] }),
    );

    expect(decision.decision).toBe('merge');
  });

  it('queues for a human when the rename sweep was never assessed (field absent) on an otherwise policy-green PR — a failed diff fetch must not silently void the rename half of the security sweep', () => {
    const { renamedFromPaths: _dropped, ...unswept } = candidate();

    const decision = planPrReview(unswept);

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('rename');
    expect(decision.reasoning).toContain('never assessed');
  });

  it('a confirmed-empty rename sweep still merges — the guard demands the sweep RAN, not that it found anything', () => {
    expect(planPrReview(candidate({ renamedFromPaths: [] })).decision).toBe('merge');
  });

  it('the unassessed-sweep guard sits in the merge tier: a red-gate PR with no rename assessment still gets the honest "gate failed" feedback', () => {
    const { renamedFromPaths: _dropped, ...unswept } = candidate({ gateStatus: 'fail' });

    const decision = planPrReview(unswept);

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('failed');
  });
});

describe('parseGitApplyConflictPaths', () => {
  it('extracts the path from a "patch failed: <path>:<line>" hunk-mismatch line', () => {
    const stderr = 'error: patch failed: apps/dashboard/src/web/shell.ts:42\n';

    expect(parseGitApplyConflictPaths(stderr)).toEqual(['apps/dashboard/src/web/shell.ts']);
  });

  it('extracts the path from a "<path>: <reason>" apply-failure line', () => {
    const stderr = 'error: apps/dashboard/src/web/shell.ts: patch does not apply\n';

    expect(parseGitApplyConflictPaths(stderr)).toEqual(['apps/dashboard/src/web/shell.ts']);
  });

  it('dedupes and sorts when both line shapes name the same or different files', () => {
    const stderr =
      'error: patch failed: b.ts:10\n' +
      'error: b.ts: patch does not apply\n' +
      'error: a.ts: already exists in working directory\n';

    expect(parseGitApplyConflictPaths(stderr)).toEqual(['a.ts', 'b.ts']);
  });

  it('returns an empty array for stderr with no recognizable error lines', () => {
    expect(parseGitApplyConflictPaths('')).toEqual([]);
    expect(parseGitApplyConflictPaths('warning: something unrelated\n')).toEqual([]);
  });
});

describe('assessPrDiff conflicting-path detection', () => {
  it('skips the forward apply check when checkConflictPaths is not requested', async () => {
    const exec: CliExec = vi.fn(async (bin) => ({
      code: bin === 'gh' ? 0 : 1,
      stdout: bin === 'gh' ? 'diff --git a/x b/x\n' : '',
    }));

    expect(await assessPrDiff(12, exec)).toEqual({
      alreadyApplied: false,
      hasBinaryDiff: false,
      renamedFromPaths: [],
    });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('runs a forward apply check and captures the conflicting paths when requested and not already applied', async () => {
    const exec: CliExec = vi.fn(async (bin, args) => {
      if (bin === 'gh') return { code: 0, stdout: 'diff --git a/x b/x\n' };
      if (args.includes('--reverse')) return { code: 1, stdout: '' };
      if (args[0] === 'status') return { code: 0, stdout: '' }; // clean tree
      if (args[0] === 'merge-base') return { code: 1, stdout: '' }; // history excludes the PR head
      return { code: 1, stdout: '', stderr: 'error: patch failed: x.ts:3\n' };
    });

    const result = await assessPrDiff(12, exec, { checkConflictPaths: true, headRefOid: HEAD_SHA });

    expect(result).toEqual({
      alreadyApplied: false,
      hasBinaryDiff: false,
      conflictingPaths: ['x.ts'],
      renamedFromPaths: [],
    });
    expect(exec).toHaveBeenCalledTimes(5);
    expect(exec).toHaveBeenNthCalledWith(5, 'git', ['apply', '--check', expect.any(String)]);
  });

  it('omits conflictingPaths when the forward check cannot name a file (or unexpectedly succeeds)', async () => {
    const exec: CliExec = vi.fn(async (bin, args) => {
      if (bin === 'gh') return { code: 0, stdout: 'diff --git a/x b/x\n' };
      if (args.includes('--reverse')) return { code: 1, stdout: '' };
      if (args[0] === 'merge-base') return { code: 1, stdout: '' }; // history excludes the PR head
      return { code: 0, stdout: '' }; // clean status, and a forward check that unexpectedly succeeds
    });

    const result = await assessPrDiff(12, exec, { checkConflictPaths: true, headRefOid: HEAD_SHA });

    expect(result).toEqual({ alreadyApplied: false, hasBinaryDiff: false, renamedFromPaths: [] });
    expect(exec).toHaveBeenCalledTimes(5);
  });

  it('never runs the forward check when the reverse-apply already succeeded (already applied)', async () => {
    const exec: CliExec = vi.fn(async (bin, args) => ({
      code: args[0] === 'merge-base' ? 1 : 0,
      stdout: bin === 'gh' ? 'diff --git a/x b/x\n' : '',
    }));

    const result = await assessPrDiff(12, exec, { checkConflictPaths: true, headRefOid: HEAD_SHA });

    expect(result).toEqual({ alreadyApplied: true, hasBinaryDiff: false, renamedFromPaths: [] });
    expect(exec).toHaveBeenCalledTimes(4); // diff + reverse check + tree stand-in (status, ancestry); no forward check
  });
});

describe('assessPrDiff (working-tree stand-in confirmation)', () => {
  // The reverse-apply check judges the dashboard's own working tree, which is
  // NOT guaranteed to stand in for the base branch: a tree with uncommitted
  // edits, or one whose history already contains the PR's own head (the
  // `gh pr checkout` a human review starts with), reverse-applies the PR's
  // diff cleanly for reasons that say nothing about the PR being "already
  // fixed elsewhere". So the positive verdict — and conflict-path naming — is
  // minted only after confirming the tree can stand in; a plain "not applied"
  // needs no confirmation since it can only fall through.
  function standInExec(git: {
    readonly apply?: number;
    readonly status?: { readonly code: number; readonly stdout: string };
    readonly ancestor?: number;
  }): CliExec {
    return vi.fn(async (bin, args) => {
      if (bin === 'gh') return { code: 0, stdout: 'diff --git a/x b/x\n' };
      if (args[0] === 'status') return git.status ?? { code: 0, stdout: '' };
      if (args[0] === 'merge-base') return { code: git.ancestor ?? 1, stdout: '' };
      return { code: git.apply ?? 0, stdout: '' };
    });
  }

  it('mints already-applied only after confirming a clean tree whose history excludes the PR head — exact argv, in order', async () => {
    const exec = standInExec({});

    const result = await assessPrDiff(12, exec, { headRefOid: HEAD_SHA });

    expect(result).toEqual({ alreadyApplied: true, hasBinaryDiff: false, renamedFromPaths: [] });
    expect(exec).toHaveBeenNthCalledWith(3, 'git', [
      'status',
      '--porcelain',
      '--untracked-files=no',
    ]);
    expect(exec).toHaveBeenNthCalledWith(4, 'git', [
      'merge-base',
      '--is-ancestor',
      HEAD_SHA,
      'HEAD',
    ]);
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it('withholds the verdict on a dirty tree — uncommitted edits make a clean reverse-apply prove nothing, and the ancestry spend is skipped', async () => {
    const exec = standInExec({ status: { code: 0, stdout: ' M apps/dashboard/src/web/x.ts\n' } });

    const result = await assessPrDiff(12, exec, { headRefOid: HEAD_SHA });

    expect(result).toEqual({ hasBinaryDiff: false, renamedFromPaths: [] });
    expect('alreadyApplied' in result).toBe(false);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('withholds the verdict when the tree could not be confirmed clean (git status failed)', async () => {
    const exec = standInExec({ status: { code: 128, stdout: '' } });

    const result = await assessPrDiff(12, exec, { headRefOid: HEAD_SHA });

    expect('alreadyApplied' in result).toBe(false);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('withholds the verdict when local history already contains the PR head — a checked-out PR IS the PR, not evidence it was fixed elsewhere', async () => {
    const exec = standInExec({ ancestor: 0 });

    const result = await assessPrDiff(12, exec, { headRefOid: HEAD_SHA });

    expect(result).toEqual({ hasBinaryDiff: false, renamedFromPaths: [] });
    expect('alreadyApplied' in result).toBe(false);
  });

  it('treats a head git does not know locally (merge-base exit 128) as not contained — a never-fetched PR cannot be the tree', async () => {
    const exec = standInExec({ ancestor: 128 });

    expect(await assessPrDiff(12, exec, { headRefOid: HEAD_SHA })).toEqual({
      alreadyApplied: true,
      hasBinaryDiff: false,
      renamedFromPaths: [],
    });
  });

  it('withholds the verdict with no head SHA to check ancestry against, spending nothing on the tree — the stand-in cannot be confirmed', async () => {
    const exec = standInExec({});

    const result = await assessPrDiff(12, exec);

    expect(result).toEqual({ hasBinaryDiff: false, renamedFromPaths: [] });
    expect('alreadyApplied' in result).toBe(false);
    expect(exec).toHaveBeenCalledTimes(2); // diff + reverse check only
  });

  it('needs no confirmation for a failed reverse-apply — "not applied" can only fall through, never mint a verdict', async () => {
    const exec = standInExec({ apply: 1 });

    expect(await assessPrDiff(12, exec, { headRefOid: HEAD_SHA })).toEqual({
      alreadyApplied: false,
      hasBinaryDiff: false,
      renamedFromPaths: [],
    });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("confirms the tree before naming conflicting paths too — a dirty tree would name the operator's own edits as conflicts", async () => {
    let forwardChecks = 0;
    const exec: CliExec = vi.fn(async (bin, args) => {
      if (bin === 'gh') return { code: 0, stdout: 'diff --git a/x b/x\n' };
      if (args.includes('--reverse')) return { code: 1, stdout: '' };
      if (args[0] === 'status') return { code: 0, stdout: ' M x.ts\n' }; // dirty
      forwardChecks += 1;
      return { code: 1, stdout: '', stderr: 'error: patch failed: x.ts:3\n' };
    });

    const result = await assessPrDiff(12, exec, { checkConflictPaths: true, headRefOid: HEAD_SHA });

    expect(result).toEqual({ alreadyApplied: false, hasBinaryDiff: false, renamedFromPaths: [] });
    expect(forwardChecks).toBe(0);
    expect(exec).toHaveBeenCalledTimes(3); // diff + reverse check + status
  });
});

describe('annotateAlreadyApplied (binary verdict wiring)', () => {
  it('annotates a candidate whose fetched diff carries binary content, immutably', async () => {
    const pr = candidate();
    const exec: CliExec = vi.fn(async () => ({
      code: 0,
      stdout: 'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n',
    }));

    const [annotated] = await annotateAlreadyApplied([pr], exec);

    expect(annotated?.hasBinaryDiff).toBe(true);
    expect('hasBinaryDiff' in pr).toBe(false);
  });
});

describe('planPrReview size judgment (oversized diffs)', () => {
  const oversized: PrReviewCandidate = {
    number: 95,
    title: 'refactor: sweeping rename across the tree',
    gateStatus: 'pass',
    mergeable: true,
    touchedPaths: ['docs/HELLO.md'],
    headRefOid: '0123456789abcdef0123456789abcdef01234567',
    baseRefName: 'main',
    additions: MAX_AUTO_MERGE_CHANGED_LINES,
    deletions: 1,
    renamedFromPaths: [],
    unresolvedReviewThreads: 0,
  };

  it('queues an otherwise policy-green PR for a human when its changed-line total exceeds the cap — an auto-merge implicitly claims byte-review, which is not honest at that scale', () => {
    const decision = planPrReview(oversized);

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain(String(MAX_AUTO_MERGE_CHANGED_LINES));
  });

  it('merges at exactly the cap — the guard triggers strictly above it', () => {
    const atCap = planPrReview({
      ...oversized,
      additions: MAX_AUTO_MERGE_CHANGED_LINES,
      deletions: 0,
    });

    expect(atCap.decision).toBe('merge');
  });

  it('queues an otherwise policy-green PR for a human when gh reported no size at all — a merge asserts a byte-review within the cap, which an unassessed size cannot honestly back', () => {
    const { additions: _additions, deletions: _deletions, ...unsized } = oversized;

    const decision = planPrReview(unsized);

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('size');
  });

  it('queues when only one of the two size totals is present — a partial size is not a confirmed size', () => {
    const { deletions: _deletions, ...additionsOnly } = oversized;

    const decision = planPrReview({ ...additionsOnly, additions: 1 });

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('size');
  });

  it('queues on a negative size total — a negative count undercounts changedLines, the one way garbage could still slip an oversized diff under the cap', () => {
    const decision = planPrReview({ ...oversized, additions: -2000, deletions: 1 });

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('size');
  });

  it('queues on a fractional size total — a line count is a whole number, anything else is not a confirmed size', () => {
    const decision = planPrReview({ ...oversized, additions: 3.5, deletions: 2 });

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('size');
  });

  it('does not outrank the gate: a red-gate oversized PR still gets the honest gate verdict — size only guards the merge step', () => {
    const redGate = planPrReview({ ...oversized, gateStatus: 'fail' });

    expect(redGate.decision).toBe('request-changes');
    expect(redGate.reasoning).toContain('gate');
  });

  it('does not outrank conflicts: an oversized conflicting PR still requests changes for the conflicts', () => {
    const conflicting = planPrReview({ ...oversized, mergeable: false });

    expect(conflicting.decision).toBe('request-changes');
    expect(conflicting.reasoning).toContain('conflicts');
  });

  it('security-hard still wins: an oversized security-touching PR reports the security reason', () => {
    const security = planPrReview({ ...oversized, touchedPaths: ['packages/engine/src/guard.ts'] });

    expect(security.decision).toBe('queue-for-human');
    expect(security.reasoning).toContain('security-hard rule');
  });

  it('reports the size reason ahead of the policy lever: oversized queues as oversized even under AUTOPILOT_PR_AUTOMERGE=off', () => {
    const decision = planPrReview(oversized, 'off');

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).not.toContain('AUTOPILOT_PR_AUTOMERGE');
  });
});

describe('planPrReview viewer-authored (own) PRs', () => {
  it('queues a policy-green own PR for a human — a self-review is no review, and GitHub 422s self-approval outright', () => {
    const decision = planPrReview(candidate({ viewerIsAuthor: true }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('same GitHub identity');
  });

  it('queues an own PR whose gate failed — gh pr review --request-changes 422s on an own PR, so that verdict could never land', () => {
    const decision = planPrReview(candidate({ viewerIsAuthor: true, gateStatus: 'fail' }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('same GitHub identity');
  });

  it('queues an own PR touching zero files instead of requesting changes, for the same 422 reason', () => {
    const decision = planPrReview(candidate({ viewerIsAuthor: true, touchedPaths: [] }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('same GitHub identity');
  });

  it('keeps the security-hard reasoning when an own PR also touches a security-sensitive path', () => {
    const decision = planPrReview(
      candidate({ viewerIsAuthor: true, touchedPaths: ['apps/dashboard/src/web/guard.ts'] }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('security-hard');
  });

  it('leaves a non-own or unassessed PR untouched — absent means not assessed and can only narrow', () => {
    expect(planPrReview(candidate({ viewerIsAuthor: false })).decision).toBe('merge');
    expect(planPrReview(candidate()).decision).toBe('merge');
  });
});

describe('planPrReview canonical-base guard (one canonical main)', () => {
  it('merges an otherwise policy-green PR that targets the canonical main branch', () => {
    expect(planPrReview(candidate({ baseRefName: 'main' })).decision).toBe('merge');
  });

  it('queues an otherwise policy-green PR that targets a non-canonical base branch — a squash-merge into any branch but main is never automated', () => {
    const decision = planPrReview(candidate({ baseRefName: 'release/2.0' }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain("'release/2.0' branch");
    expect(decision.reasoning).toContain('one canonical main');
  });

  it('queues when gh reported no base branch at all — like the head-SHA pin, the merge path needs the base CONFIRMED, so absent fails closed toward a human', () => {
    // exactOptionalPropertyTypes forbids an explicit `undefined` override, so
    // the absent-base candidate is built by dropping the fixture's key.
    const { baseRefName: _base, ...baseless } = candidate();
    const decision = planPrReview(baseless);

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('a branch gh did not report');
  });

  it('does not outrank the gate: a red-gate non-main PR still gets the honest gate verdict — the base guard only narrows the merge step', () => {
    const decision = planPrReview(candidate({ baseRefName: 'develop', gateStatus: 'fail' }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('the gate');
  });

  it('does not outrank conflicts: a non-main conflicting PR still requests changes for the conflicts first', () => {
    const decision = planPrReview(candidate({ baseRefName: 'develop', mergeable: false }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('merge conflicts');
  });

  it('security-hard still wins: a non-main security-touching PR reports the security reason', () => {
    const decision = planPrReview(
      candidate({ baseRefName: 'develop', touchedPaths: ['apps/dashboard/src/web/guard.ts'] }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('security-hard');
  });
});

describe('prHasHoldLabel', () => {
  it('matches the canonical do-not-merge label in every common spelling', () => {
    for (const spelling of [
      'do-not-merge',
      'Do Not Merge',
      'do_not_merge',
      'status: do-not-merge',
    ]) {
      expect(prHasHoldLabel(candidate({ labels: [spelling] }))).toBe(true);
    }
  });

  it('matches hold, blocked, wip, and work-in-progress at token boundaries', () => {
    expect(prHasHoldLabel(candidate({ labels: ['hold'] }))).toBe(true);
    expect(prHasHoldLabel(candidate({ labels: ['on hold'] }))).toBe(true);
    expect(prHasHoldLabel(candidate({ labels: ['blocked'] }))).toBe(true);
    expect(prHasHoldLabel(candidate({ labels: ['blocked-by-upstream'] }))).toBe(true);
    expect(prHasHoldLabel(candidate({ labels: ['WIP'] }))).toBe(true);
    expect(prHasHoldLabel(candidate({ labels: ['work in progress'] }))).toBe(true);
  });

  it('never trips on a bare substring — "threshold" is not "hold", "swipe" is not "wip"', () => {
    expect(prHasHoldLabel(candidate({ labels: ['threshold-tuning'] }))).toBe(false);
    expect(prHasHoldLabel(candidate({ labels: ['swipe-gesture'] }))).toBe(false);
    expect(prHasHoldLabel(candidate({ labels: ['household'] }))).toBe(false);
  });

  it('is false with no labels, an empty list, or only non-hold labels', () => {
    expect(prHasHoldLabel(candidate())).toBe(false);
    expect(prHasHoldLabel(candidate({ labels: [] }))).toBe(false);
    expect(prHasHoldLabel(candidate({ labels: ['bug', 'enhancement', 'good-first-firing'] }))).toBe(
      false,
    );
  });
});

describe('planPrReview hold-label guard (human "do not merge yet" signal)', () => {
  it('queues an otherwise policy-green PR for a human when a maintainer applied a hold label', () => {
    const decision = planPrReview(candidate({ labels: ['do-not-merge'] }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('hold label');
  });

  it('names every hold marker in the reasoning so the operator knows which labels to clear', () => {
    const decision = planPrReview(candidate({ labels: ['hold'] }));

    for (const marker of HOLD_LABEL_MARKERS) {
      expect(decision.reasoning).toContain(marker);
    }
  });

  it('does not outrank the gate: a red-gate held PR still gets the honest gate verdict — the hold guard only narrows the merge step', () => {
    const decision = planPrReview(candidate({ labels: ['blocked'], gateStatus: 'fail' }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('the gate');
  });

  it('does not outrank conflicts: a held conflicting PR still requests changes for the conflicts first', () => {
    const decision = planPrReview(candidate({ labels: ['wip'], mergeable: false }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('merge conflicts');
  });

  it('security-hard still wins: a held security-touching PR reports the security reason', () => {
    const decision = planPrReview(
      candidate({ labels: ['hold'], touchedPaths: ['apps/dashboard/src/web/guard.ts'] }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('security-hard');
  });

  it('leads the merge tier: a held PR that also targets a non-canonical base reports the hold, not the base', () => {
    const decision = planPrReview(candidate({ labels: ['do-not-merge'], baseRefName: 'develop' }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('hold label');
  });

  it('leaves an unlabeled or non-hold-labeled policy-green PR merging — the guard only narrows', () => {
    expect(planPrReview(candidate()).decision).toBe('merge');
    expect(planPrReview(candidate({ labels: ['enhancement'] })).decision).toBe('merge');
  });
});

describe('planPrReview changes-requested guard (human reviewer\'s standing "not yet")', () => {
  it('queues an otherwise policy-green PR for a human when a human reviewer has a standing changes-requested review', () => {
    const decision = planPrReview(candidate({ reviewChangesRequested: true }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('changes-requested review');
  });

  it('does not outrank the gate: a red-gate PR with a changes-requested review still gets the honest gate verdict', () => {
    const decision = planPrReview(candidate({ reviewChangesRequested: true, gateStatus: 'fail' }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('the gate');
  });

  it('does not outrank conflicts: a conflicting PR with a changes-requested review still requests changes for the conflicts first', () => {
    const decision = planPrReview(candidate({ reviewChangesRequested: true, mergeable: false }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('merge conflicts');
  });

  it('security-hard still wins: a changes-requested PR touching a security path reports the security reason', () => {
    const decision = planPrReview(
      candidate({
        reviewChangesRequested: true,
        touchedPaths: ['apps/dashboard/src/web/guard.ts'],
      }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('security-hard');
  });

  it('leads the merge tier over a wrong base: a changes-requested PR targeting a non-canonical base reports the review, not the base', () => {
    const decision = planPrReview(
      candidate({ reviewChangesRequested: true, baseRefName: 'develop' }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('changes-requested review');
  });

  it('leaves a policy-green PR with no standing changes-requested review merging — the guard only narrows', () => {
    expect(planPrReview(candidate()).decision).toBe('merge');
    expect(planPrReview(candidate({ reviewChangesRequested: false })).decision).toBe('merge');
  });
});

describe('planPrReview unverified changes-requested guard (viewer lookup failed)', () => {
  it('queues an otherwise policy-green PR whose standing changes-requested review could not be attributed — merging over a possibly-human "not yet" is the one irreversible outcome', () => {
    const decision = planPrReview(candidate({ reviewChangesRequestedUnverified: true }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('could not');
    expect(decision.reasoning).toContain('changes-requested review');
  });

  it('does not outrank the gate: a red-gate PR with an unverified review still gets the honest gate verdict', () => {
    const decision = planPrReview(
      candidate({ reviewChangesRequestedUnverified: true, gateStatus: 'fail' }),
    );

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('the gate');
  });

  it('yields to the confirmed flag when both are set — a verified other-reviewer review posts the stronger, attributed reasoning', () => {
    const decision = planPrReview(
      candidate({ reviewChangesRequested: true, reviewChangesRequestedUnverified: true }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('reviewer other than this ritual');
  });
});

describe('planPrReview unassessed label/review-facts guards (garbage gh output must not disarm the human-signal sweeps)', () => {
  it("queues an otherwise policy-green PR whose gh label report was unreadable — a human's standing hold label could be invisible", () => {
    const decision = planPrReview(candidate({ labelsUnassessed: true }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('label');
    expect(decision.reasoning).toContain('never ran');
  });

  it('does not outrank the gate: a red-gate PR with an unreadable label report still gets the honest gate verdict', () => {
    const decision = planPrReview(candidate({ labelsUnassessed: true, gateStatus: 'fail' }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('the gate');
  });

  it('yields to a readable hold label when both are set — the attributed hold reasoning is the more actionable verdict', () => {
    const decision = planPrReview(candidate({ labels: ['do-not-merge'], labelsUnassessed: true }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('hold label');
  });

  it('queues an otherwise policy-green PR whose gh latest-reviews report was unreadable — a human\'s standing "not yet" could be invisible', () => {
    const decision = planPrReview(candidate({ latestReviewsUnassessed: true }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('review');
    expect(decision.reasoning).toContain('never ran');
  });

  it('does not outrank the gate: a red-gate PR with an unreadable latest-reviews report still gets the honest gate verdict', () => {
    const decision = planPrReview(candidate({ latestReviewsUnassessed: true, gateStatus: 'fail' }));

    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain('the gate');
  });

  it('still merges when both facts are confirmed (flags absent) — the guards only narrow', () => {
    expect(planPrReview(candidate()).decision).toBe('merge');
  });
});

describe('planPrReview unassessed files guard (unreadable gh files report)', () => {
  it('queues an otherwise policy-green PR whose gh files report was unreadable — the security-hard path sweep judged only a subset nobody confirmed', () => {
    const decision = planPrReview(
      candidate({ touchedPaths: ['docs/HELLO.md'], touchedPathsUnassessed: true }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('usable files list');
    expect(decision.reasoning).toContain('path sweep');
  });

  it('never posts the false "touches no files" verdict on a fully unreadable report — that request-changes would tell the author something actionably wrong', () => {
    const decision = planPrReview(candidate({ touchedPaths: [], touchedPathsUnassessed: true }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).not.toContain('touches no files');
  });

  it('queues regardless of gate result, like the truncated-list guard — an unreadably-swept PR might be security-touching, and those always queue', () => {
    const decision = planPrReview(candidate({ touchedPathsUnassessed: true, gateStatus: 'fail' }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('usable files list');
  });

  it('security-hard still wins: a readable guarded path posts the standing security reasoning, not the unreadable-report one', () => {
    const decision = planPrReview(
      candidate({ touchedPaths: ['packages/engine/src/guard.ts'], touchedPathsUnassessed: true }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('security-hard rule');
  });

  it("outranks the truncated-list guard when both hold — unreadability is the root cause, so the reasoning names it, not gh's enumeration cap", () => {
    const decision = planPrReview(
      candidate({ touchedPaths: ['docs/HELLO.md'], touchedPathsUnassessed: true, changedFiles: 5 }),
    );

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('usable files list');
    expect(decision.reasoning).not.toContain('truncated');
  });

  it('still merges when the flag is absent — the guard only narrows', () => {
    expect(planPrReview(candidate()).decision).toBe('merge');
  });
});

describe('planPrReview behind-base guard (stale gate against a moved base)', () => {
  it('requests changes on an otherwise policy-green PR whose branch is behind the base — its green gate was computed against a base that has since moved, and the strict-up-to-date protection would refuse the planned merge AFTER the approve landed', () => {
    const decision = planPrReview(candidate({ behindBase: true }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('behind');
    expect(decision.reasoning).toContain('#12');
  });

  it('still gives the honest "gate failed" feedback on a behind-base PR with a red gate — being behind never hides the more actionable verdict', () => {
    const decision = planPrReview(candidate({ behindBase: true, gateStatus: 'fail' }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('failed');
    expect(decision.reasoning).not.toContain('behind');
  });

  it('lets a confirmed conflict outrank the behind verdict — resolving conflicts is the more specific branch work', () => {
    const decision = planPrReview(candidate({ behindBase: true, mergeable: false }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('conflicts');
  });

  it("still merges when behindBase is absent or false — an unassessed merge state can only narrow, never change today's behavior", () => {
    expect(planPrReview(candidate()).decision).toBe('merge');
    expect(planPrReview(candidate({ behindBase: false })).decision).toBe('merge');
  });
});

describe('fetchOpenPrCandidates behind-base capture', () => {
  it('asks gh for mergeStateStatus and flags a BEHIND PR, so planPrReview can stop a doomed approve+merge up front', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 31,
          title: 'Out of date',
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'BEHIND',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [{ path: 'docs/HELLO.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    const argv = (exec as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as readonly string[];
    expect(argv[argv.indexOf('--json') + 1]).toContain('mergeStateStatus');
    expect(prs[0]?.behindBase).toBe(true);
  });

  it('leaves behindBase absent for any other status — only the literal BEHIND narrows; recognizing a "good" state could widen what auto-merges', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 32,
          title: 'Clean',
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'CLEAN',
          files: [],
        },
        {
          number: 33,
          title: 'Blocked',
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'BLOCKED',
          files: [],
        },
        { number: 34, title: 'No status', mergeable: 'MERGEABLE', files: [] },
        { number: 35, title: 'Garbage', mergeable: 'MERGEABLE', mergeStateStatus: 42, files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    for (const pr of prs) {
      expect(pr).not.toHaveProperty('behindBase');
    }
  });
});

describe('planPrReview auto-merge-armed guard (GitHub auto-merge)', () => {
  it("queues an otherwise policy-green PR for a human when GitHub's own auto-merge is armed — the ritual's approve would itself trigger a merge with whatever method and head the arming chose, before the pinned squash runs", () => {
    const decision = planPrReview(candidate({ autoMergeArmed: true }));

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('auto-merge');
    expect(decision.reasoning).toContain('#12');
  });

  it('still gives the honest "gate failed" feedback on an armed PR with a red gate — arming never hides the more actionable verdict', () => {
    const decision = planPrReview(candidate({ autoMergeArmed: true, gateStatus: 'fail' }));

    expect(decision).toMatchObject({ decision: 'request-changes' });
    expect(decision.reasoning).toContain('failed');
  });

  it('reports the armed reason even under AUTOPILOT_PR_AUTOMERGE=off — the policy lever only narrows what the RITUAL merges; it cannot disarm GitHub, and the human merging by hand must know it is armed', () => {
    const decision = planPrReview(candidate({ autoMergeArmed: true }), 'off');

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('auto-merge');
    expect(decision.reasoning).not.toContain('AUTOPILOT_PR_AUTOMERGE');
  });

  it('security-hard still wins: an armed security-touching PR reports the security reason', () => {
    const decision = planPrReview(
      candidate({ autoMergeArmed: true, touchedPaths: ['packages/engine/src/guard.ts'] }),
    );

    expect(decision).toMatchObject({ decision: 'queue-for-human' });
    expect(decision.reasoning).toContain('security-hard rule');
  });

  it("still merges when autoMergeArmed is absent or false — an unarmed PR can only narrow, never change today's behavior", () => {
    expect(planPrReview(candidate()).decision).toBe('merge');
    expect(planPrReview(candidate({ autoMergeArmed: false })).decision).toBe('merge');
  });
});

describe('fetchOpenPrCandidates auto-merge capture', () => {
  it("asks gh for autoMergeRequest and flags an armed PR, so planPrReview can stop the approve that would trigger GitHub's own merge", async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 51,
          title: 'Armed to merge itself',
          mergeable: 'MERGEABLE',
          autoMergeRequest: { enabledAt: '2026-08-28T00:00:00Z', mergeMethod: 'MERGE' },
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [{ path: 'docs/HELLO.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    const argv = (exec as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as readonly string[];
    expect(argv[argv.indexOf('--json') + 1]).toContain('autoMergeRequest');
    expect(prs[0]?.autoMergeArmed).toBe(true);
  });

  it('leaves autoMergeArmed absent when gh reports null or omits the field, while a garbage non-null value still counts as armed — narrowing toward a human beats trusting garbage', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 52,
          title: 'Disarmed',
          mergeable: 'MERGEABLE',
          autoMergeRequest: null,
          files: [],
        },
        { number: 53, title: 'Not reported', mergeable: 'MERGEABLE', files: [] },
        {
          number: 54,
          title: 'Garbage',
          mergeable: 'MERGEABLE',
          autoMergeRequest: 'yes',
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('autoMergeArmed');
    expect(prs[1]).not.toHaveProperty('autoMergeArmed');
    expect(prs[2]?.autoMergeArmed).toBe(true);
  });
});

describe('fetchOpenPrCandidates hold-label capture', () => {
  it('captures the label names gh reports, so the hold-label guard can judge them', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 41,
          title: 'Held for now',
          mergeable: 'MERGEABLE',
          labels: [{ name: 'do-not-merge' }, { name: 'enhancement' }],
          files: [{ path: 'docs/HELLO.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.labels).toEqual(['do-not-merge', 'enhancement']);
    expect(prHasHoldLabel(prs[0] as PrReviewCandidate)).toBe(true);
  });

  it('leaves labels absent on a confirmed-empty report, and flags an unreadable one (non-array, nameless entry, or missing key) as unassessed instead of silently disarming the hold sweep', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 42, title: 'No labels', mergeable: 'MERGEABLE', labels: [], files: [] },
        { number: 43, title: 'Bad labels', mergeable: 'MERGEABLE', labels: 'oops', files: [] },
        {
          number: 44,
          title: 'Nameless',
          mergeable: 'MERGEABLE',
          labels: [{ color: 'f00' }],
          files: [],
        },
        { number: 45, title: 'Missing key', mergeable: 'MERGEABLE', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    for (const pr of prs) {
      expect(pr).not.toHaveProperty('labels');
    }
    expect(prs[0]).not.toHaveProperty('labelsUnassessed');
    expect(prs[1]?.labelsUnassessed).toBe(true);
    expect(prs[2]?.labelsUnassessed).toBe(true);
    expect(prs[3]?.labelsUnassessed).toBe(true);
  });
});

describe('fetchOpenPrCandidates latest-reviews unassessed capture', () => {
  it('flags an unreadable latest-reviews report (non-array, stateless entry, or missing key) as unassessed instead of silently disarming the changes-requested sweep', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 51,
          title: 'Confirmed empty',
          mergeable: 'MERGEABLE',
          latestReviews: [],
          files: [],
        },
        {
          number: 52,
          title: 'Garbage reviews',
          mergeable: 'MERGEABLE',
          latestReviews: 'oops',
          files: [],
        },
        {
          number: 53,
          title: 'Stateless entry',
          mergeable: 'MERGEABLE',
          latestReviews: [{ author: { login: 'copilot' } }],
          files: [],
        },
        { number: 54, title: 'Missing key', mergeable: 'MERGEABLE', files: [] },
        {
          number: 55,
          title: 'Readable',
          mergeable: 'MERGEABLE',
          latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
          files: [],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('latestReviewsUnassessed');
    expect(prs[1]?.latestReviewsUnassessed).toBe(true);
    expect(prs[2]?.latestReviewsUnassessed).toBe(true);
    expect(prs[3]?.latestReviewsUnassessed).toBe(true);
    expect(prs[4]).not.toHaveProperty('latestReviewsUnassessed');
  });

  it('survives a null entry in latestReviews — flagged unassessed instead of a TypeError crashing the whole fetch, and a readable human CR beside it still counts', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 56,
              title: 'Null review entry',
              mergeable: 'MERGEABLE',
              latestReviews: [null],
              files: [],
            },
            {
              number: 57,
              title: 'Null entry beside a human CR',
              mergeable: 'MERGEABLE',
              latestReviews: [null, { state: 'CHANGES_REQUESTED', author: { login: 'human' } }],
              files: [],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.latestReviewsUnassessed).toBe(true);
    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[1]?.latestReviewsUnassessed).toBe(true);
    expect(prs[1]?.reviewChangesRequested).toBe(true);
  });
});

describe('fetchOpenPrCandidates files unassessed capture', () => {
  it('flags an unreadable files report (non-array, pathless or null entry, or missing key) as unassessed instead of silently shrinking the security sweep — readable paths still ride along', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 61, title: 'Confirmed empty', mergeable: 'MERGEABLE', files: [] },
        { number: 62, title: 'Garbage files', mergeable: 'MERGEABLE', files: 'oops' },
        {
          number: 63,
          title: 'Pathless entry',
          mergeable: 'MERGEABLE',
          files: [{ path: 'docs/HELLO.md' }, { additions: 3 }, { path: '' }],
        },
        {
          number: 64,
          title: 'Null entry',
          mergeable: 'MERGEABLE',
          files: [null, { path: 'docs/HELLO.md' }],
        },
        { number: 65, title: 'Missing key', mergeable: 'MERGEABLE' },
        {
          number: 66,
          title: 'Readable',
          mergeable: 'MERGEABLE',
          files: [{ path: 'docs/HELLO.md' }],
        },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('touchedPathsUnassessed');
    expect(prs[1]?.touchedPathsUnassessed).toBe(true);
    expect(prs[2]?.touchedPathsUnassessed).toBe(true);
    expect(prs[2]?.touchedPaths).toEqual(['docs/HELLO.md']);
    expect(prs[3]?.touchedPathsUnassessed).toBe(true);
    expect(prs[3]?.touchedPaths).toEqual(['docs/HELLO.md']);
    expect(prs[4]?.touchedPathsUnassessed).toBe(true);
    expect(prs[5]).not.toHaveProperty('touchedPathsUnassessed');
    expect(prs[5]?.touchedPaths).toEqual(['docs/HELLO.md']);
  });
});

describe('fetchOpenPrCandidates viewer-authored detection', () => {
  it('resolves the viewer once via gh api user and marks each candidate the viewer authored (login compared case-insensitively)', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 21,
              title: 'Own',
              mergeable: 'MERGEABLE',
              author: { login: 'MASTERMIND' },
              files: [],
            },
            {
              number: 22,
              title: 'Theirs',
              mergeable: 'MERGEABLE',
              author: { login: 'copilot' },
              files: [],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'mastermind' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.viewerIsAuthor).toBe(true);
    expect(prs[1]?.viewerIsAuthor).toBe(false);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenCalledWith('gh', ['api', 'user']);
  });

  it('skips the gh api user spend entirely when no candidate reports an author login', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 23, title: 'No author', mergeable: 'MERGEABLE', files: [] },
      ]),
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('viewerIsAuthor');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('leaves viewerIsAuthor absent when gh api user fails — ownership stays not-assessed and can only narrow', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 24,
              title: 'Own?',
              mergeable: 'MERGEABLE',
              author: { login: 'MASTERMIND' },
              files: [],
            },
          ]),
        };
      }
      return { code: 1, stdout: '' };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('viewerIsAuthor');
  });

  it('leaves viewerIsAuthor absent when gh api user returns malformed JSON — a parse failure is not-assessed, same as a failed exec', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 25,
              title: 'Own?',
              mergeable: 'MERGEABLE',
              author: { login: 'MASTERMIND' },
              files: [],
            },
          ]),
        };
      }
      return { code: 0, stdout: 'not json' };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('viewerIsAuthor');
  });

  it('leaves viewerIsAuthor absent when gh api user parses fine but reports no usable login — a valid-JSON, bad-shape response is not-assessed too', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 26,
              title: 'Own?',
              mergeable: 'MERGEABLE',
              author: { login: 'MASTERMIND' },
              files: [],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: '' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('viewerIsAuthor');
  });
});

describe('fetchOpenPrCandidates changes-requested detection', () => {
  it('flags a PR whose latest review from a reviewer OTHER than the KEEPER is CHANGES_REQUESTED (login compared case-insensitively)', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 51,
              title: 'A human said no',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'CHANGES_REQUESTED', author: { login: 'copilot' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
    expect(exec).toHaveBeenCalledWith('gh', ['api', 'user']);
  });

  it("flags CHANGES_REQUESTED from a second reviewer even when the first reviewer in the list only approved — each reviewer's latest review is checked, not just the first", async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 58,
              title: 'One approved, one requested changes',
              mergeable: 'MERGEABLE',
              latestReviews: [
                { state: 'APPROVED', author: { login: 'copilot' } },
                { state: 'CHANGES_REQUESTED', author: { login: 'another-human' } },
              ],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
  });

  it("ignores the KEEPER's OWN changes-requested review — a green PR the ritual once flagged is not stalled forever by its own stale review", async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 52,
              title: 'Only the KEEPER flagged it',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'CHANGES_REQUESTED', author: { login: 'mastermind' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
  });

  it("does not flag when a human reviewer's latest review is APPROVED or COMMENTED, not CHANGES_REQUESTED", async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 53,
              title: 'Approved',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
            {
              number: 54,
              title: 'Just commented',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'COMMENTED', author: { login: 'copilot' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[1]).not.toHaveProperty('reviewChangesRequested');
  });

  it("flags a CHANGES_REQUESTED review whose author gh did not report — an unattributed review counts as a human's, failing toward queue-for-human", async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 57,
              title: 'CR with no reported author',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'CHANGES_REQUESTED' }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
  });

  it('fetches the viewer login even when no PR reports an author, as long as a changes-requested review is present', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 55,
              title: 'No author field, but a human requested changes',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'CHANGES_REQUESTED', author: { login: 'copilot' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
    expect(exec).toHaveBeenCalledWith('gh', ['api', 'user']);
  });

  it('flags reviewChangesRequestedUnverified when a CR review exists but the viewer lookup failed — a standing "not yet" nobody could attribute fails closed, never toward a merge over it', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 56,
              title: 'CR but viewer unknown',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'CHANGES_REQUESTED', author: { login: 'copilot' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 1, stdout: '' };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[0]?.reviewChangesRequestedUnverified).toBe(true);
  });

  it('leaves both review flags absent when the viewer lookup fails on a PR with no changes-requested review — a mere lookup outage must not queue every PR', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 58,
              title: 'No standing review at all',
              mergeable: 'MERGEABLE',
              author: { login: 'someone-else' },
              latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 1, stdout: '' };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[0]).not.toHaveProperty('reviewChangesRequestedUnverified');
  });

  it('leaves reviewChangesRequestedUnverified absent when the viewer lookup succeeds — a verified review uses the confirmed flag alone', async () => {
    const exec: CliExec = vi.fn(async (_cmd: string, args: readonly string[]) => {
      if (args[0] === 'pr') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 59,
              title: 'CR with the viewer known',
              mergeable: 'MERGEABLE',
              latestReviews: [{ state: 'CHANGES_REQUESTED', author: { login: 'copilot' } }],
              files: [{ path: 'docs/HELLO.md' }],
            },
          ]),
        };
      }
      return { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
    expect(prs[0]).not.toHaveProperty('reviewChangesRequestedUnverified');
  });
});

describe('fetchOpenPrCandidates changes-requested detection through the review history', () => {
  // gh's `latestReviews` is the latest review per reviewer of ANY state, so a
  // human's CHANGES_REQUESTED followed by their own comment-only review shows
  // up there as COMMENTED — while GitHub keeps the request standing until that
  // reviewer approves or it is dismissed. The full `reviews` history (with
  // `submittedAt`) is the only gh-reported fact that sees through the mask.
  const row = {
    number: 61,
    title: 'Masked by a follow-up comment',
    mergeable: 'MERGEABLE',
    files: [{ path: 'docs/HELLO.md' }],
  };
  const viewerKnown = { code: 0, stdout: JSON.stringify({ login: 'MASTERMIND' }) };
  const viewerUnknown = { code: 1, stdout: '' };
  const execFor = (fields: Record<string, unknown>, viewer = viewerKnown): CliExec =>
    vi.fn(async (command: string, args: readonly string[]) => {
      if (command === 'gh' && args[0] === 'api') return viewer;
      return { code: 0, stdout: JSON.stringify([{ ...row, ...fields }]) };
    });

  it("flags a human's CHANGES_REQUESTED that a later comment-only review from the same reviewer masks in latestReviews — and spends the viewer lookup for it even with no author field", async () => {
    const exec = execFor({
      latestReviews: [{ state: 'COMMENTED', author: { login: 'copilot' } }],
      reviews: [
        {
          state: 'CHANGES_REQUESTED',
          author: { login: 'copilot' },
          submittedAt: '2026-09-01T09:00:00Z',
        },
        { state: 'COMMENTED', author: { login: 'copilot' }, submittedAt: '2026-09-01T10:00:00Z' },
      ],
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
    expect(exec).toHaveBeenCalledWith('gh', ['api', 'user']);
  });

  it("does not flag a CHANGES_REQUESTED the same reviewer later superseded with an approval, or one that was dismissed — only APPROVED/CHANGES_REQUESTED/DISMISSED set a reviewer's standing verdict", async () => {
    const exec: CliExec = vi.fn(async (command: string, args: readonly string[]) => {
      if (command === 'gh' && args[0] === 'api') return viewerKnown;
      return {
        code: 0,
        stdout: JSON.stringify([
          {
            ...row,
            number: 62,
            latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
            reviews: [
              {
                state: 'CHANGES_REQUESTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T09:00:00Z',
              },
              {
                state: 'APPROVED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T10:00:00Z',
              },
            ],
          },
          {
            ...row,
            number: 63,
            latestReviews: [{ state: 'COMMENTED', author: { login: 'copilot' } }],
            reviews: [
              {
                state: 'DISMISSED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T09:00:00Z',
              },
              {
                state: 'COMMENTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T10:00:00Z',
              },
            ],
          },
        ]),
      };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[1]).not.toHaveProperty('reviewChangesRequested');
  });

  it("ignores the KEEPER's OWN masked changes-requested review — the history sweep excludes the viewer the same way the latestReviews sweep does", async () => {
    const exec = execFor({
      latestReviews: [{ state: 'COMMENTED', author: { login: 'mastermind' } }],
      reviews: [
        {
          state: 'CHANGES_REQUESTED',
          author: { login: 'Mastermind' },
          submittedAt: '2026-09-01T09:00:00Z',
        },
        {
          state: 'COMMENTED',
          author: { login: 'mastermind' },
          submittedAt: '2026-09-01T10:00:00Z',
        },
      ],
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[0]).not.toHaveProperty('reviewChangesRequestedUnverified');
  });

  it('orders the history by submittedAt, not by array position — the LATER opinionated review is the standing one', async () => {
    const exec: CliExec = vi.fn(async (command: string, args: readonly string[]) => {
      if (command === 'gh' && args[0] === 'api') return viewerKnown;
      return {
        code: 0,
        stdout: JSON.stringify([
          {
            ...row,
            number: 64,
            latestReviews: [{ state: 'COMMENTED', author: { login: 'copilot' } }],
            // Listed CR-first, but the approval was submitted EARLIER — array
            // order alone would read the approval as standing; the request is.
            reviews: [
              {
                state: 'CHANGES_REQUESTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T10:00:00Z',
              },
              {
                state: 'APPROVED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T09:00:00Z',
              },
              {
                state: 'COMMENTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T11:00:00Z',
              },
            ],
          },
          {
            ...row,
            number: 65,
            latestReviews: [{ state: 'COMMENTED', author: { login: 'copilot' } }],
            // Listed approval-first, but the approval was submitted LATER —
            // array order alone would read the request as standing; it is not.
            reviews: [
              {
                state: 'APPROVED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T10:00:00Z',
              },
              {
                state: 'CHANGES_REQUESTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T09:00:00Z',
              },
              {
                state: 'COMMENTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T11:00:00Z',
              },
            ],
          },
        ]),
      };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
    expect(prs[1]).not.toHaveProperty('reviewChangesRequested');
  });

  it('flags an unattributed CHANGES_REQUESTED in the history as standing even when a later unattributed approval follows — nothing proves the two came from the same reviewer, so it fails toward a human', async () => {
    const exec = execFor({
      latestReviews: [{ state: 'COMMENTED', author: { login: 'copilot' } }],
      reviews: [
        { state: 'CHANGES_REQUESTED', submittedAt: '2026-09-01T09:00:00Z' },
        { state: 'APPROVED', submittedAt: '2026-09-01T10:00:00Z' },
      ],
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]?.reviewChangesRequested).toBe(true);
  });

  it('flags reviewChangesRequestedUnverified when the masked CR exists but the viewer lookup failed — and leaves both flags absent when the history shows no standing CR at all', async () => {
    const exec: CliExec = vi.fn(async (command: string, args: readonly string[]) => {
      if (command === 'gh' && args[0] === 'api') return viewerUnknown;
      return {
        code: 0,
        stdout: JSON.stringify([
          {
            ...row,
            number: 66,
            latestReviews: [{ state: 'COMMENTED', author: { login: 'copilot' } }],
            reviews: [
              {
                state: 'CHANGES_REQUESTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T09:00:00Z',
              },
              {
                state: 'COMMENTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T10:00:00Z',
              },
            ],
          },
          {
            ...row,
            number: 67,
            latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
            reviews: [
              {
                state: 'CHANGES_REQUESTED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T09:00:00Z',
              },
              {
                state: 'APPROVED',
                author: { login: 'copilot' },
                submittedAt: '2026-09-01T10:00:00Z',
              },
            ],
          },
        ]),
      };
    });

    const prs = await fetchOpenPrCandidates(exec);

    expect(prs[0]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[0]?.reviewChangesRequestedUnverified).toBe(true);
    expect(prs[1]).not.toHaveProperty('reviewChangesRequested');
    expect(prs[1]).not.toHaveProperty('reviewChangesRequestedUnverified');
  });

  it("judges nothing from an absent or unreadable history — the sweep is additive, so latestReviews alone still decides (today's behavior, narrowing-only)", async () => {
    const exec: CliExec = vi.fn(async (command: string, args: readonly string[]) => {
      if (command === 'gh' && args[0] === 'api') return viewerKnown;
      return {
        code: 0,
        stdout: JSON.stringify([
          {
            ...row,
            number: 68,
            latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
          },
          {
            ...row,
            number: 69,
            latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
            reviews: 'oops',
          },
          {
            ...row,
            number: 70,
            latestReviews: [{ state: 'APPROVED', author: { login: 'copilot' } }],
            reviews: [null, { author: { login: 'copilot' } }],
          },
        ]),
      };
    });

    const prs = await fetchOpenPrCandidates(exec);

    for (const pr of prs) {
      expect(pr).not.toHaveProperty('reviewChangesRequested');
      expect(pr).not.toHaveProperty('reviewChangesRequestedUnverified');
    }
  });
});

describe('remediateDanglingApproval', () => {
  // The exact dangling-approval shape: a merge decision whose approve landed
  // (code 0) but whose pinned merge was refused (code !== 0) — the
  // --match-head-commit TOCTOU refusal leaves the "policy-green" approval
  // standing over bytes the ritual never judged.
  function dangling() {
    const pr = candidate();
    const decision = planPrReview(pr);
    const commands = planPrReviewCommands(pr, decision);
    const results = [
      { command: commands[0]!, code: 0, stdout: 'approved' },
      { command: commands[1]!, code: 1, stdout: 'head mismatch' },
    ];
    return { pr, decision, results };
  }

  it('skips the dismissal when the PR actually MERGED despite the nonzero merge exit — gh can exit nonzero after the merge API call landed (e.g. a network error on a follow-up call), and the approval then accurately vouches for exactly the pinned bytes that merged', async () => {
    const { pr, decision, results } = dangling();
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ state: 'MERGED' }) });

    const remediation = await remediateDanglingApproval(pr, decision, results, exec);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('gh', ['pr', 'view', '12', '--json', 'state']);
    expect(remediation).toHaveLength(1);
    expect(remediation[0]?.code).toBe(0);
  });

  it('proceeds with the dismissal when the merged-state probe fails, returns garbage, or reports any non-MERGED state — only a CONFIRMED merge skips it; on a genuinely refused merge, dismissing stays the safe direction', async () => {
    for (const probe of [
      { code: 1, stdout: '' },
      { code: 0, stdout: 'not json' },
      { code: 0, stdout: JSON.stringify({ state: 'OPEN' }) },
    ]) {
      const { pr, decision, results } = dangling();
      const reviews = JSON.stringify([{ id: 1, state: 'APPROVED', body: decision.reasoning }]);
      const exec: CliExec = vi
        .fn()
        .mockResolvedValueOnce(probe)
        .mockResolvedValueOnce({ code: 0, stdout: reviews })
        .mockResolvedValue({ code: 0, stdout: '{}' });

      const remediation = await remediateDanglingApproval(pr, decision, results, exec);

      expect(exec).toHaveBeenNthCalledWith(3, 'gh', [
        'api',
        '--method',
        'PUT',
        'repos/{owner}/{repo}/pulls/12/reviews/1/dismissals',
        '-f',
        expect.stringMatching(/^message=/),
      ]);
      expect(remediation).toHaveLength(3);
    }
  });

  it("dismisses only the ritual's own dangling approval(s) — APPROVED reviews whose body is the posted reasoning — never anyone else's review", async () => {
    const { pr, decision, results } = dangling();
    const reviews = JSON.stringify([
      { id: 1, state: 'APPROVED', body: decision.reasoning },
      { id: 2, state: 'APPROVED', body: "someone else's approval" },
      { id: 3, state: 'CHANGES_REQUESTED', body: decision.reasoning },
      { id: 4, state: 'APPROVED', body: decision.reasoning },
      { id: 'nan', state: 'APPROVED', body: decision.reasoning },
    ]);
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ state: 'OPEN' }) })
      .mockResolvedValueOnce({ code: 0, stdout: reviews })
      .mockResolvedValue({ code: 0, stdout: '{}' });

    const remediation = await remediateDanglingApproval(pr, decision, results, exec);

    expect(exec).toHaveBeenNthCalledWith(1, 'gh', ['pr', 'view', '12', '--json', 'state']);
    expect(exec).toHaveBeenNthCalledWith(2, 'gh', [
      'api',
      'repos/{owner}/{repo}/pulls/12/reviews?per_page=100',
    ]);
    expect(exec).toHaveBeenNthCalledWith(3, 'gh', [
      'api',
      '--method',
      'PUT',
      'repos/{owner}/{repo}/pulls/12/reviews/1/dismissals',
      '-f',
      expect.stringMatching(/^message=/),
    ]);
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'api',
      '--method',
      'PUT',
      'repos/{owner}/{repo}/pulls/12/reviews/4/dismissals',
      '-f',
      expect.stringMatching(/^message=/),
    ]);
    expect(exec).toHaveBeenCalledTimes(4);
    expect(remediation).toHaveLength(4);
    expect(remediation.every((entry) => entry.code === 0)).toBe(true);
  });

  it('lists reviews with per_page=100 — GitHub pages reviews oldest-first at a default 30, so on a busy PR the freshly-posted dangling approval (chronologically LAST) would fall outside an unsized first page and the remediation would silently dismiss nothing', async () => {
    const { pr, decision, results } = dangling();
    const reviews = JSON.stringify([{ id: 9, state: 'APPROVED', body: decision.reasoning }]);
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ state: 'OPEN' }) })
      .mockResolvedValueOnce({ code: 0, stdout: reviews })
      .mockResolvedValue({ code: 0, stdout: '{}' });

    await remediateDanglingApproval(pr, decision, results, exec);

    expect(exec).toHaveBeenNthCalledWith(2, 'gh', [
      'api',
      'repos/{owner}/{repo}/pulls/12/reviews?per_page=100',
    ]);
  });

  it('does not assert a specific unverified cause in the dismissal message — the pinned merge can fail for reasons other than a moved head (e.g. an unmet branch-protection requirement), and the ritual never re-checks which one actually happened', async () => {
    const { pr, decision, results } = dangling();
    const reviews = JSON.stringify([{ id: 1, state: 'APPROVED', body: decision.reasoning }]);
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ state: 'OPEN' }) })
      .mockResolvedValueOnce({ code: 0, stdout: reviews })
      .mockResolvedValue({ code: 0, stdout: '{}' });

    await remediateDanglingApproval(pr, decision, results, exec);

    const mockExec = exec as unknown as ReturnType<typeof vi.fn>;
    const dismissArgs = mockExec.mock.calls[2]?.[1] as string[];
    const message = dismissArgs.find((arg) => arg.startsWith('message='));
    expect(message).toBeDefined();
    expect(message).not.toMatch(/the head moved/i);
  });

  it('does nothing when the merge succeeded, when the approve itself failed, or when the decision was not a merge', async () => {
    const exec: CliExec = vi.fn();
    const { pr, decision, results } = dangling();

    const merged = results.map((entry) => ({ ...entry, code: 0 }));
    expect(await remediateDanglingApproval(pr, decision, merged, exec)).toEqual([]);

    const approveFailed = [{ ...results[0]!, code: 1 }];
    expect(await remediateDanglingApproval(pr, decision, approveFailed, exec)).toEqual([]);

    const rcPr = candidate({ gateStatus: 'fail' });
    const rcDecision = planPrReview(rcPr);
    const rcCommands = planPrReviewCommands(rcPr, rcDecision);
    const rcResults = [{ command: rcCommands[0]!, code: 1, stdout: '' }];
    expect(await remediateDanglingApproval(rcPr, rcDecision, rcResults, exec)).toEqual([]);

    expect(exec).not.toHaveBeenCalled();
  });

  it('fails soft when the review list cannot be fetched or parsed — reports the probe and fetch attempts, dismisses nothing', async () => {
    const { pr, decision, results } = dangling();

    const failing: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });
    const fetchFailed = await remediateDanglingApproval(pr, decision, results, failing);
    expect(fetchFailed).toHaveLength(2);
    expect(fetchFailed[1]?.code).toBe(1);
    expect(failing).toHaveBeenCalledTimes(2);

    const garbage: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });
    const parseFailed = await remediateDanglingApproval(pr, decision, results, garbage);
    expect(parseFailed).toHaveLength(2);
    expect(garbage).toHaveBeenCalledTimes(2);

    const notArray: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({}) });
    const nonArrayResult = await remediateDanglingApproval(pr, decision, results, notArray);
    expect(nonArrayResult).toHaveLength(2);
    expect(notArray).toHaveBeenCalledTimes(2);
  });
});

describe('isRitualPolicyGreenApprovalBody', () => {
  it('round-trips the exact reasoning planPrReview posts on a merge', () => {
    // The stale-approval sweep recognizes the ritual's own approvals by this
    // shape — if the merge reasoning's wording ever drifts from the matcher,
    // crashed-run approvals become undismissable, so the coupling is pinned.
    const decision = planPrReview(candidate());
    expect(decision.decision).toBe('merge');
    expect(isRitualPolicyGreenApprovalBody(decision.reasoning, 12)).toBe(true);
  });

  it('matches despite a title edited after the approve was posted', () => {
    const body =
      '#12 "A title long since renamed" is policy-green — gate passed, no conflicts, no security-sensitive paths touched.';
    expect(isRitualPolicyGreenApprovalBody(body, 12)).toBe(true);
  });

  it('rejects other PR numbers, non-strings, and human review bodies', () => {
    const body = planPrReview(candidate()).reasoning;
    expect(isRitualPolicyGreenApprovalBody(body, 13)).toBe(false);
    expect(isRitualPolicyGreenApprovalBody(undefined, 12)).toBe(false);
    expect(isRitualPolicyGreenApprovalBody(42, 12)).toBe(false);
    expect(isRitualPolicyGreenApprovalBody('LGTM, nice work', 12)).toBe(false);
    expect(
      isRitualPolicyGreenApprovalBody(
        '#12 "x" — the gate failed; an agent\'s judgment never substitutes for it.',
        12,
      ),
    ).toBe(false);
  });
});

describe('planPrReview @-mention neutralization (posted verdicts never ping from the founder identity)', () => {
  // Every reasoning string is posted verbatim under the founder's own gh
  // login (comment, request-changes body, or approve body), and GitHub
  // linkifies @name anywhere in a posted body — so a contributor-controlled
  // title like "fix typo @acme/everyone" would make the KEEPER ping
  // arbitrary users/teams AS MASTERMIND the moment it posts its verdict.
  const ZWSP = '​';

  it('neutralizes @-mentions a contributor plants in the PR title before they reach a posted verdict body', () => {
    const decision = planPrReview(
      candidate({ title: 'Fix typo — thanks @octocat and @acme/release-team' }),
    );
    expect(decision.reasoning).toContain(`@${ZWSP}octocat`);
    expect(decision.reasoning).toContain(`@${ZWSP}acme/release-team`);
    expect(decision.reasoning).not.toContain('@octocat');
    expect(decision.reasoning).not.toContain('@acme');
  });

  it('neutralizes the policy-green approve body too, and the stale-approval matcher still recognizes it', () => {
    const decision = planPrReview(candidate({ title: 'apply @octocat suggestion' }));
    expect(decision.decision).toBe('merge');
    expect(decision.reasoning).toContain(`@${ZWSP}octocat`);
    expect(decision.reasoning).not.toContain('@octocat');
    expect(isRitualPolicyGreenApprovalBody(decision.reasoning, 12)).toBe(true);
  });

  it('neutralizes @-leading conflict paths named in a request-changes reasoning — an attacker names files too', () => {
    const decision = planPrReview(
      candidate({ mergeable: false, conflictingPaths: ['@octocat', 'src/a.ts'] }),
    );
    expect(decision.decision).toBe('request-changes');
    expect(decision.reasoning).toContain(`@${ZWSP}octocat`);
    expect(decision.reasoning).not.toContain('@octocat');
  });

  it('neutralizes @-leading rename sources in the security-hard rename verdict WITHOUT weakening the sweep', () => {
    const decision = planPrReview(candidate({ renamedFromPaths: ['@acme/auth-helpers.ts'] }));
    // The guarded-rename queue-for-human still fires (the 'auth' marker
    // match is untouched — no marker contains '@'), only the posted text
    // is neutralized.
    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain(`@${ZWSP}acme/auth-helpers.ts`);
    expect(decision.reasoning).not.toContain('@acme');
  });

  it('leaves a bare @ (not followed by an alphanumeric) and mention-free titles byte-identical', () => {
    const decision = planPrReview(candidate({ title: 'Sparkline fix @ last' }));
    expect(decision.reasoning).toContain('"Sparkline fix @ last"');
    expect(decision.reasoning).not.toContain(ZWSP);
  });

  it('is idempotent — an already-neutralized mention is not double-escaped', () => {
    const decision = planPrReview(candidate({ title: `ping @${ZWSP}octocat` }));
    expect(decision.reasoning).toContain(`@${ZWSP}octocat`);
    expect(decision.reasoning).not.toContain(`@${ZWSP}${ZWSP}`);
  });
});

describe('planPrReviewCommands queue-for-human idempotency (re-runs mint nothing twice)', () => {
  // A security-touching PR: planPrReview queues it for a human on every pass
  // while it waits on MASTERMIND — exactly the shape that was collecting one
  // identical comment per pass.
  const queued: PrReviewCandidate = {
    number: 88,
    title: 'touches a guarded path',
    gateStatus: 'pass',
    mergeable: true,
    touchedPaths: ['apps/dashboard/src/server/server.ts'],
  };

  it('plans NO command when the ritual already posted this exact verdict comment on the PR', () => {
    const decision = planPrReview(queued);
    expect(decision.decision).toBe('queue-for-human');
    const commands = planPrReviewCommands(
      { ...queued, ownComments: [decision.reasoning] },
      decision,
    );
    expect(commands).toEqual([]);
  });

  it('still plans the comment when prior own comments carry a DIFFERENT verdict text — a changed fact posts fresh', () => {
    const decision = planPrReview(queued);
    const commands = planPrReviewCommands(
      { ...queued, ownComments: ['an earlier pass posted a different verdict'] },
      decision,
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]?.args).toContain('comment');
  });

  it('never suppresses a request-changes decision — the dedup is comment-only, review verdicts always post', () => {
    const redGate: PrReviewCandidate = {
      number: 89,
      title: 'plain change, red gate',
      gateStatus: 'fail',
      mergeable: true,
      touchedPaths: ['apps/dashboard/src/web/sparkline.ts'],
    };
    const decision = planPrReview(redGate);
    expect(decision.decision).toBe('request-changes');
    const commands = planPrReviewCommands(
      { ...redGate, ownComments: [decision.reasoning] },
      decision,
    );
    expect(commands).toHaveLength(1);
  });
});

describe('fetchOpenPrCandidates own-comment capture (queue-for-human dedup wiring)', () => {
  const row = {
    number: 5,
    title: 'x',
    author: { login: 'someone' },
    mergeable: 'MERGEABLE',
    baseRefName: 'main',
    headRefOid: 'abc123',
    statusCheckRollup: [],
    files: [{ path: 'a.ts' }],
  };

  const execFor =
    (comments: unknown): CliExec =>
    async (command, args) => {
      if (command === 'gh' && args[0] === 'api') return { code: 0, stdout: '{"login":"Keeper"}' };
      return { code: 0, stdout: JSON.stringify([{ ...row, comments }]) };
    };

  it("captures the viewer's own comment bodies (case-insensitive login match), dropping others' and empty bodies", async () => {
    const [pr] = await fetchOpenPrCandidates(
      execFor([
        { author: { login: 'keeper' }, body: 'prior verdict' },
        { author: { login: 'someone' }, body: 'not ours' },
        { author: { login: 'KEEPER' }, body: '' },
        { author: {}, body: 'authorless — not provably ours' },
      ]),
    );
    expect(pr?.ownComments).toEqual(['prior verdict']);
  });

  it('leaves ownComments absent when the viewer authored no comments — absent behaves as an empty list', async () => {
    const [pr] = await fetchOpenPrCandidates(
      execFor([{ author: { login: 'someone' }, body: 'not ours' }]),
    );
    expect(pr).toBeDefined();
    expect('ownComments' in (pr ?? {})).toBe(false);
  });

  it('leaves ownComments absent on garbage comments payloads rather than judging them', async () => {
    const [pr] = await fetchOpenPrCandidates(execFor('not an array'));
    expect(pr).toBeDefined();
    expect('ownComments' in (pr ?? {})).toBe(false);
  });
});

describe('planPrReviewCommands request-changes idempotency (re-runs mint nothing twice)', () => {
  // A red-gate PR: planPrReview requests changes on every pass while the
  // author leaves it red — exactly the shape that was collecting one
  // identical request-changes review per pass.
  const redGate: PrReviewCandidate = {
    number: 90,
    title: 'plain change, red gate',
    gateStatus: 'fail',
    mergeable: true,
    touchedPaths: ['apps/dashboard/src/web/sparkline.ts'],
  };

  it("plans NO command when the ritual's own standing changes-requested review already carries this exact reasoning", () => {
    const decision = planPrReview(redGate);
    expect(decision.decision).toBe('request-changes');
    const commands = planPrReviewCommands(
      { ...redGate, ownRequestChangesBody: decision.reasoning },
      decision,
    );
    expect(commands).toEqual([]);
  });

  it('still plans the review when the standing body carries DIFFERENT text — a changed fact posts fresh', () => {
    const decision = planPrReview(redGate);
    const commands = planPrReviewCommands(
      { ...redGate, ownRequestChangesBody: 'an earlier pass requested different changes' },
      decision,
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]?.args).toContain('--request-changes');
  });

  it('never dedups a queue-for-human comment off the review body — the two verdicts dedup only against their own kind', () => {
    const queued: PrReviewCandidate = {
      number: 91,
      title: 'touches a guarded path',
      gateStatus: 'pass',
      mergeable: true,
      touchedPaths: ['apps/dashboard/src/server/server.ts'],
    };
    const decision = planPrReview(queued);
    expect(decision.decision).toBe('queue-for-human');
    const commands = planPrReviewCommands(
      { ...queued, ownRequestChangesBody: decision.reasoning },
      decision,
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]?.args).toContain('comment');
  });
});

describe('fetchOpenPrCandidates own request-changes review capture (request-changes dedup wiring)', () => {
  const row = {
    number: 6,
    title: 'y',
    author: { login: 'someone' },
    mergeable: 'MERGEABLE',
    baseRefName: 'main',
    headRefOid: 'abc123',
    statusCheckRollup: [],
    files: [{ path: 'a.ts' }],
  };

  const execFor =
    (latestReviews: unknown): CliExec =>
    async (command, args) => {
      if (command === 'gh' && args[0] === 'api') return { code: 0, stdout: '{"login":"Keeper"}' };
      return { code: 0, stdout: JSON.stringify([{ ...row, latestReviews }]) };
    };

  it("captures the viewer's own standing CHANGES_REQUESTED body (case-insensitive login match) without tripping the human changes-requested guard", async () => {
    const [pr] = await fetchOpenPrCandidates(
      execFor([
        { state: 'CHANGES_REQUESTED', author: { login: 'keeper' }, body: 'prior reasoning' },
      ]),
    );
    expect(pr?.ownRequestChangesBody).toBe('prior reasoning');
    expect('reviewChangesRequested' in (pr ?? {})).toBe(false);
  });

  it("leaves it absent when the standing changes-requested review is someone ELSE's — that one trips the human guard instead", async () => {
    const [pr] = await fetchOpenPrCandidates(
      execFor([
        { state: 'CHANGES_REQUESTED', author: { login: 'copilot' }, body: 'their reasoning' },
      ]),
    );
    expect('ownRequestChangesBody' in (pr ?? {})).toBe(false);
    expect(pr?.reviewChangesRequested).toBe(true);
  });

  it("leaves it absent when the viewer's own latest review is not CHANGES_REQUESTED", async () => {
    const [pr] = await fetchOpenPrCandidates(
      execFor([{ state: 'APPROVED', author: { login: 'keeper' }, body: 'looks good' }]),
    );
    expect('ownRequestChangesBody' in (pr ?? {})).toBe(false);
  });

  it('leaves it absent on an empty or non-string body rather than deduping against garbage', async () => {
    const [empty] = await fetchOpenPrCandidates(
      execFor([{ state: 'CHANGES_REQUESTED', author: { login: 'keeper' }, body: '' }]),
    );
    expect('ownRequestChangesBody' in (empty ?? {})).toBe(false);

    const [garbage] = await fetchOpenPrCandidates(
      execFor([{ state: 'CHANGES_REQUESTED', author: { login: 'keeper' }, body: 42 }]),
    );
    expect('ownRequestChangesBody' in (garbage ?? {})).toBe(false);
  });
});

describe('isRitualPolicyGreenApprovalBody', () => {
  it('round-trips the exact reasoning planPrReview posts on a merge', () => {
    // The stale-approval sweep recognizes the ritual's own approvals by this
    // shape — if the merge reasoning's wording ever drifts from the matcher,
    // crashed-run approvals become undismissable, so the coupling is pinned.
    const decision = planPrReview(candidate());
    expect(decision.decision).toBe('merge');
    expect(isRitualPolicyGreenApprovalBody(decision.reasoning, 12)).toBe(true);
  });

  it('matches despite a title edited after the approve was posted', () => {
    const body =
      '#12 "A title long since renamed" is policy-green — gate passed, no conflicts, no security-sensitive paths touched.';
    expect(isRitualPolicyGreenApprovalBody(body, 12)).toBe(true);
  });

  it('rejects other PR numbers, non-strings, and human review bodies', () => {
    const body = planPrReview(candidate()).reasoning;
    expect(isRitualPolicyGreenApprovalBody(body, 13)).toBe(false);
    expect(isRitualPolicyGreenApprovalBody(undefined, 12)).toBe(false);
    expect(isRitualPolicyGreenApprovalBody(42, 12)).toBe(false);
    expect(isRitualPolicyGreenApprovalBody('LGTM, nice work', 12)).toBe(false);
    expect(
      isRitualPolicyGreenApprovalBody(
        '#12 "x" — the gate failed; an agent\'s judgment never substitutes for it.',
        12,
      ),
    ).toBe(false);
  });
});

describe('fetchOpenPrCandidateReport', () => {
  it('flags a nonzero gh pr list exit as fetchFailed instead of masquerading as an empty queue', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    const report = await fetchOpenPrCandidateReport(exec);

    expect(report.candidates).toEqual([]);
    expect(report.fetchFailed).toBe(true);
  });

  it('flags unparseable gh output as fetchFailed', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    const report = await fetchOpenPrCandidateReport(exec);

    expect(report.candidates).toEqual([]);
    expect(report.fetchFailed).toBe(true);
  });

  it('flags a non-array gh report as fetchFailed', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{"oops":true}' });

    const report = await fetchOpenPrCandidateReport(exec);

    expect(report.candidates).toEqual([]);
    expect(report.fetchFailed).toBe(true);
  });

  it('leaves fetchFailed absent on a successful read — a CONFIRMED empty queue stays a plain empty list', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    const report = await fetchOpenPrCandidateReport(exec);

    expect(report.candidates).toEqual([]);
    expect('fetchFailed' in report).toBe(false);
  });

  it('returns parsed candidates on success, same shapes fetchOpenPrCandidates emits', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 7,
          title: 'docs: fix typo',
          mergeable: 'MERGEABLE',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          files: [{ path: 'docs/README.md' }],
        },
      ]),
    });

    const report = await fetchOpenPrCandidateReport(exec);

    expect(report.fetchFailed).toBeUndefined();
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.number).toBe(7);
    expect(report.candidates[0]?.touchedPaths).toEqual(['docs/README.md']);
  });

  it('keeps fetchOpenPrCandidates returning a bare [] on failure — the execute miss path probes that case itself', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchOpenPrCandidates(exec)).toEqual([]);
  });
});

describe('unresolved review-thread guard (branch protection requires conversation resolution)', () => {
  it('queues an otherwise policy-green PR for a human when a reviewer\'s line-level thread is still unresolved — a human "look at this" the ritual must not squash-merge over, and the merge would be refused after the approve posted anyway', () => {
    const decision = planPrReview(candidate({ unresolvedReviewThreads: 2 }));

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('2 unresolved review thread');
    expect(decision.reasoning).toContain('conversation resolution');
  });

  it('queues for a human when the thread sweep was never assessed — a merge asserts every conversation is resolved, so an absent read fails closed, never toward a merge', () => {
    const decision = planPrReview(unassessedThreadsCandidate());

    expect(decision.decision).toBe('queue-for-human');
    expect(decision.reasoning).toContain('could not be read');
  });

  it('merges on a CONFIRMED zero — the only state a merge may treat as clean', () => {
    expect(planPrReview(candidate({ unresolvedReviewThreads: 0 })).decision).toBe('merge');
  });

  it('sits last in the merge tier: the security-hard rule still leads, a red gate still gets its honest request-changes, and every earlier merge-tier guard still names its own reason', () => {
    expect(
      planPrReview(
        candidate({
          unresolvedReviewThreads: 1,
          touchedPaths: ['apps/dashboard/src/server/server.ts'],
        }),
      ).reasoning,
    ).toContain('security-hard');
    expect(
      planPrReview(candidate({ unresolvedReviewThreads: 1, gateStatus: 'fail' })),
    ).toMatchObject({
      decision: 'request-changes',
    });
    expect(
      planPrReview(candidate({ unresolvedReviewThreads: 1, baseRefName: 'develop' })).reasoning,
    ).toContain("'develop'");
    expect(
      planPrReview(candidate({ unresolvedReviewThreads: 1, autoMergeArmed: true })).reasoning,
    ).toContain('auto-merge armed');
    expect(planPrReview(unassessedThreadsCandidate({ labels: ['hold'] })).reasoning).toContain(
      'hold label',
    );
  });

  it('outranks the operator policy lever — a human merging by hand under AUTOPILOT_PR_AUTOMERGE=off must know a thread is still open', () => {
    expect(planPrReview(candidate({ unresolvedReviewThreads: 1 }), 'off').reasoning).toContain(
      'unresolved review thread',
    );
    expect(planPrReview(unassessedThreadsCandidate(), 'off').reasoning).toContain(
      'could not be read',
    );
  });

  it('plans the queue comment and dedups it like every other queue-for-human verdict', () => {
    const pr = candidate({ unresolvedReviewThreads: 1 });
    const decision = planPrReview(pr);

    expect(planPrReviewCommands(pr, decision)).toMatchObject([
      { args: ['pr', 'comment', '12', '--body', decision.reasoning] },
    ]);
    expect(planPrReviewCommands({ ...pr, ownComments: [decision.reasoning] }, decision)).toEqual(
      [],
    );
  });
});

function reviewThreadsGraphql(nodes: unknown): string {
  return JSON.stringify({ data: { repository: { pullRequests: { nodes } } } });
}

describe('fetchUnresolvedReviewThreadCounts', () => {
  it("spends one gh api graphql read scoped to the current repo via {owner}/{repo} placeholders and counts each open PR's unresolved threads", async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: reviewThreadsGraphql([
        {
          number: 12,
          reviewThreads: {
            totalCount: 3,
            nodes: [{ isResolved: false }, { isResolved: true }, { isResolved: false }],
          },
        },
        { number: 13, reviewThreads: { totalCount: 0, nodes: [] } },
      ]),
    });

    const counts = await fetchUnresolvedReviewThreadCounts(exec);

    expect(exec).toHaveBeenCalledTimes(1);
    const [bin, args] = vi.mocked(exec).mock.calls[0] as [string, readonly string[]];
    expect(bin).toBe('gh');
    expect(args.slice(0, 7)).toEqual([
      'api',
      'graphql',
      '-F',
      'owner={owner}',
      '-F',
      'name={repo}',
      '-f',
    ]);
    expect(args[7]).toMatch(/^query=/);
    expect(args[7]).toContain('pullRequests(states: OPEN, first: 100');
    expect(args[7]).toContain('reviewThreads(first: 100)');
    expect(args[7]).toContain('isResolved');
    expect([...counts]).toEqual([
      [12, 2],
      [13, 0],
    ]);
  });

  it('confirms nothing when the read fails or the output is unreadable — an empty map leaves every candidate unassessed', async () => {
    for (const reply of [
      { code: 1, stdout: '' },
      { code: 0, stdout: 'not json' },
      { code: 0, stdout: '{"data":null}' },
      { code: 0, stdout: reviewThreadsGraphql('oops') },
    ]) {
      const exec: CliExec = vi.fn().mockResolvedValue(reply);

      expect((await fetchUnresolvedReviewThreadCounts(exec)).size).toBe(0);
    }
  });

  it('confirms only a PR whose thread page is COMPLETE and every entry readable — a truncated page (totalCount past the fetched nodes), a non-boolean isResolved, a garbage node, or an unreadable number stays unconfirmed', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: reviewThreadsGraphql([
        { number: 1, reviewThreads: { totalCount: 101, nodes: [{ isResolved: true }] } },
        { number: 2, reviewThreads: { totalCount: 1, nodes: [{ isResolved: 'no' }] } },
        null,
        { number: 'x', reviewThreads: { totalCount: 0, nodes: [] } },
        { number: 3, reviewThreads: 'oops' },
        { number: 5, reviewThreads: { totalCount: 'many', nodes: [] } },
        { number: 4, reviewThreads: { totalCount: 1, nodes: [{ isResolved: false }] } },
      ]),
    });

    const counts = await fetchUnresolvedReviewThreadCounts(exec);

    expect([...counts]).toEqual([[4, 1]]);
  });
});

describe('annotateReviewThreads', () => {
  it('spends the read only when some candidate would otherwise merge — a batch with nothing at the merge tier passes through untouched, no gh call', async () => {
    const red = unassessedThreadsCandidate({ gateStatus: 'fail' });
    const held = unassessedThreadsCandidate({ labels: ['do-not-merge'] });
    const exec: CliExec = vi.fn();

    const annotated = await annotateReviewThreads([red, held], exec);

    expect(exec).not.toHaveBeenCalled();
    expect(annotated[0]).toBe(red);
    expect(annotated[1]).toBe(held);
  });

  it('annotates every confirmed candidate from the one read, immutably, and leaves an unconfirmed one absent so the merge tier fails closed on it', async () => {
    const green = unassessedThreadsCandidate({ number: 12 });
    const missing = unassessedThreadsCandidate({ number: 13 });
    const red = unassessedThreadsCandidate({ number: 14, gateStatus: 'fail' });
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: reviewThreadsGraphql([
        { number: 12, reviewThreads: { totalCount: 1, nodes: [{ isResolved: false }] } },
        { number: 14, reviewThreads: { totalCount: 0, nodes: [] } },
      ]),
    });

    const annotated = await annotateReviewThreads([green, missing, red], exec);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(annotated[0]).toEqual({ ...green, unresolvedReviewThreads: 1 });
    expect('unresolvedReviewThreads' in green).toBe(false);
    expect(annotated[1]).toBe(missing);
    expect(annotated[2]).toEqual({ ...red, unresolvedReviewThreads: 0 });
    expect(planPrReview(annotated[0]!).decision).toBe('queue-for-human');
    expect(planPrReview(annotated[1]!).reasoning).toContain('could not be read');
  });

  it('spends the read for a would-merge candidate even under the off policy — the policy-off queue reasoning must still be honest about an open thread', async () => {
    const green = unassessedThreadsCandidate();
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: reviewThreadsGraphql([
        { number: 12, reviewThreads: { totalCount: 1, nodes: [{ isResolved: false }] } },
      ]),
    });

    const [annotated] = await annotateReviewThreads([green], exec);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(planPrReview(annotated!, 'off').reasoning).toContain('unresolved review thread');
  });

  it('a would-merge candidate whose read failed stays unassessed — the decision queues it with the honest "could not be read" reason rather than merging over a thread nobody checked', async () => {
    const green = unassessedThreadsCandidate();
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    const [annotated] = await annotateReviewThreads([green], exec);

    expect(annotated).toBe(green);
    expect(planPrReview(annotated!)).toMatchObject({ decision: 'queue-for-human' });
    expect(planPrReview(annotated!).reasoning).toContain('could not be read');
  });
});
