// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The end-of-flight ritual sweeps `fly.ts` runs after its firing loop: each
 * is best-effort (a hiccup must never fail the flight itself), self-contained,
 * and proposal-only where it touches the board (source: 'self', status:
 * 'needs_approval' — the operator decides). Split out of `fly.ts` (SHELL
 * DECOMP) — pure move, no behavior change. The sweeps that read/write
 * flight-local closure state (self-study ritual, flight-end sync-back,
 * near-miss debrief) stay in `fly.ts` on purpose.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  recentTasks,
  doneTasks,
  setTaskStatus,
  createTask,
  proposeSoulAmendment,
  proposeFleetWisdomAmendment,
  createSnapshot,
  pruneSnapshots,
  type Store,
} from '@autopilot/store';
import type { GitVcs } from '@autopilot/engine';
import { out } from './firing-hooks.js';
import { findReconciliationCandidates } from '../read/reconcile.js';
import { backlogMatchText } from '../shared/backlog-match.js';
import {
  findDueVerifyByNotes,
  findStaleVerifyByProposalIds,
  verifyByIdPrefix,
  verifyByTaskId,
} from './verify-by.js';
import { familyEconomicsFromRows, isRunaway } from './triage-factors.js';
import {
  DOC_SUBJECTS,
  computeDocDrift,
  collectDocFreshnessTimestamps,
  docFreshnessIdPrefix,
  docFreshnessTaskId,
  findStaleDocFreshnessProposalIds,
} from './doc-freshness.js';
import { findClosedTaskAuditFindings } from './closed-task-audit.js';
import {
  mineSoulAmendment,
  pruneSoulAmendment,
  mineNoopSoulAmendment,
  pruneNoopSoulAmendment,
  SOUL_MINING_GATE_LOOKBACK,
} from './soul-mining.js';
import { mineFleetWisdom } from './fleet-wisdom-mining.js';

/** How many recent commits the end-of-flight reconciliation proposal scans for a title match. */
const RECONCILE_COMMIT_WINDOW = 50;

/**
 * Board/git reconciliation PROPOSAL (BACKLOG-999 "Board hygiene", the real
 * caller `findReconciliationCandidates` was waiting on): the exact-match
 * safety net (`reconcileShippedTasks`) only catches a task closed by ITS OWN
 * METRICS item id — work shipped in an INTERACTIVE session (no METRICS line
 * at all, so no metrics row ever names the task) still strands the board task
 * "queued" forever. Fuzzy-match every open task's title against recent commit
 * subjects instead; proposal-only (never auto-applied) — the operator marks
 * it done on the dashboard if the match is real. Best-effort: a
 * reconciliation hiccup must never fail the flight itself.
 */
export async function runReconciliationProposalSweep(
  store: Store,
  projectId: string,
  vcs: GitVcs,
): Promise<void> {
  try {
    const openTasks = recentTasks(store.db, projectId).filter(
      (t) => t.status === 'queued' || t.status === 'in_progress',
    );
    const commits = await vcs.recentCommits(RECONCILE_COMMIT_WINDOW);
    const candidates = findReconciliationCandidates(
      openTasks,
      commits.map((c) => ({ sha: c.shortSha, subject: c.subject, files: c.files })),
    );
    for (const c of candidates) {
      out(
        `  ? possible ship (unconfirmed — review on the dashboard): ${c.taskId} — "${c.taskTitle}" ` +
          backlogMatchText(c),
      );
    }
  } catch {
    /* reconciliation proposal is best-effort — never fail the flight over it */
  }
}

/**
 * VERIFY-BY enforcement (web-msnsqj1f-azaeee, board-task promotion
 * web-mt1qajrv-ukabrc — the lesson-bank half of SOUL/LESSON PRUNE):
 * docs/RESEARCH-LIBRARY.md carries dated "verify by YYYY-MM-DD" notes on
 * section headings that NOTHING previously read — a note could sit stale
 * forever with zero signal. Post-flight sweep parses them and PROPOSES a
 * re-verification through the SAME approval gate every other self-mined task
 * uses (source: 'self', status: 'needs_approval') — a durable,
 * dashboard-actionable surface, not only the console line (which a flight
 * nobody is watching live would simply lose). Never edits the doc itself. The
 * library is THIS engine repo's own doc, not necessarily the flown target's —
 * skip cleanly when it isn't present in this process's cwd. Dedup by identity
 * prefix (title, not a sweep-run timestamp), same doctrine the DOC-FRESHNESS
 * 40-duplicate-proposal incident recorded. Best-effort: a read/parse hiccup
 * must never fail the flight itself.
 */
export function runVerifyBySweep(store: Store, projectId: string, now: () => number): void {
  try {
    const libraryPath = join(process.cwd(), 'docs', 'RESEARCH-LIBRARY.md');
    if (existsSync(libraryPath)) {
      const due = findDueVerifyByNotes(readFileSync(libraryPath, 'utf8'), now());
      const openVerifyByProposal = store.db.prepare(
        "SELECT 1 FROM tasks WHERE project_id = ? AND id LIKE ? AND status IN ('needs_approval', 'queued') LIMIT 1",
      );
      for (const note of due) {
        const overdue = note.daysOverdue === 0 ? 'due today' : `${note.daysOverdue} day(s) overdue`;
        out(
          `  ⏰ verify-by due (docs/RESEARCH-LIBRARY.md): "${note.title}" — ` +
            `was due ${note.verifyByDate} (${overdue}). Re-research and refresh the note.`,
        );
        if (openVerifyByProposal.get(projectId, `${verifyByIdPrefix(note.title)}%`)) continue;
        const created = createTask(store, {
          id: verifyByTaskId(note),
          projectId,
          title: `VERIFY-BY: "${note.title}" — was due ${note.verifyByDate} (${overdue}); re-research and refresh docs/RESEARCH-LIBRARY.md`,
          source: 'self',
          status: 'needs_approval',
          createdAt: now(),
        });
        if (created) {
          out(`  📚 verify-by re-verification proposed (awaiting your approval): ${note.title}`);
        }
      }

      // Prune counterpart (board web-mt1qajrv-ukabrc, "SOUL/LESSON
      // PRUNE"): once a note's own date is edited, `due` above stops
      // including it under its old id, but the OLDER open proposal for
      // that stale id can still be sitting `needs_approval` — and the
      // mint-side dedup check above (LIKE prefix, any open status) would
      // keep treating it as "already covered" forever, so a fresh,
      // accurate proposal could never surface. Deferring (never deleting)
      // a stale proposal is reversible — same non-destructive contract
      // the NOOP→VERDICT auto-defer already uses — and only ever touches
      // 'needs_approval' rows: once an operator has approved one into
      // 'queued', its fate is the operator's call, not this sweep's.
      const openVerifyByIds = store.db
        .prepare(
          "SELECT id FROM tasks WHERE project_id = ? AND id LIKE 'verifyby-%' AND status = 'needs_approval'",
        )
        .all(projectId) as { id: string }[];
      for (const staleId of findStaleVerifyByProposalIds(
        openVerifyByIds.map((r) => r.id),
        due,
      )) {
        if (setTaskStatus(store, staleId, 'deferred', now())) {
          out(`  🧹 stale verify-by proposal auto-deferred (note no longer matches): ${staleId}`);
        }
      }
    }
  } catch {
    /* verify-by sweep is best-effort — never fail the flight over it */
  }
}

/**
 * TASK ECONOMICS v2 — commit-subject FAMILY runaway detection (board
 * web-mstxk2vm-g446is): the per-item runaway guard can only ever see ONE item
 * id's own history, so a work pattern that keeps getting a FRESH item id per
 * firing (or none at all) never individually crosses the per-item thresholds
 * even though the pattern itself burns real money — this repo's own
 * ~45-commit "mutation testing widens to *.ts" run, split across dozens of
 * ids, is the concrete case that motivated this. Same "print it, operator
 * decides" proposal contract as VERIFY-BY/reconciliation — never blocks or
 * reorders anything on its own. Best-effort: a query hiccup must never fail
 * the flight.
 */
export function runFamilyRunawaySweep(store: Store, projectId: string, now: () => number): void {
  try {
    const familyRows = store.db
      .prepare(
        'SELECT commit_subject AS commitSubject, cost_usd AS costUsd, completion FROM metrics WHERE project_id = ? ORDER BY id ASC',
      )
      .all(projectId) as {
      commitSubject: string | null;
      costUsd: number;
      completion: string | null;
    }[];
    for (const [family, econ] of familyEconomicsFromRows(familyRows)) {
      if (!isRunaway(econ)) continue;
      store.db
        .prepare(
          'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          projectId,
          null,
          'family-runaway',
          JSON.stringify({ family, spendUsd: econ.spendUsd, firings: econ.firings }),
          now(),
        );
      out(
        `  ⚠ recurring pattern burning real money across MANY task ids: "${family}" — ` +
          `$${econ.spendUsd.toFixed(0)} across ${econ.firings} firings, no single id ever ` +
          `crossed the per-task threshold. TASK ECONOMICS family guard (web-mstxk2vm-g446is).`,
      );
    }
  } catch {
    /* family-runaway sweep is best-effort — never fail the flight over it */
  }
}

/**
 * DOC-FRESHNESS sweep (web-msnsjxqu-25trfq): once per flight, compare each
 * governed epic doc's last-touch time against its subjects' — a subject
 * touched more recently than the doc describing it is drift worth a look.
 * DOC_SUBJECTS names THIS engine repo's own paths (like self-study), so the
 * sweep reads process.cwd()'s git history, not the flown target's. Findings
 * become self-mined proposals through the SAME approval gate every other
 * self-mined task uses (source: 'self', status: 'needs_approval') — the
 * operator decides, the autopilot never edits docs on its own say-so. The id
 * folds in the newest-stale-subject's touch time so the SAME unresolved drift
 * is never re-proposed flight after flight, while a doc/subject touched again
 * later (a fresh drift, or a re-drift after an old proposal was resolved)
 * mints a new one.
 */
export function runDocFreshnessSweep(store: Store, projectId: string, now: () => number): void {
  try {
    const timestamps = collectDocFreshnessTimestamps(process.cwd(), DOC_SUBJECTS);
    const findings = computeDocDrift(DOC_SUBJECTS, timestamps);
    const openDocProposal = store.db.prepare(
      "SELECT 1 FROM tasks WHERE project_id = ? AND id LIKE ? AND status IN ('needs_approval', 'queued') LIMIT 1",
    );
    for (const finding of findings) {
      // Dedup by DOC, not by exact id: the id folds in the newest-stale-
      // subject's touch time, so every later commit to a subject mints a
      // NEW id while the old, unresolved proposal stays open — the board
      // accumulated 13 near-identical rows this way (2026-08-20), one per
      // fleet member's flight-end sweep per subject touch. While ANY open
      // proposal for this doc exists, the drift is already surfaced; a
      // fresh proposal adds noise, not signal.
      if (openDocProposal.get(projectId, `${docFreshnessIdPrefix(finding.doc)}%`)) continue;
      const created = createTask(store, {
        id: docFreshnessTaskId(finding),
        projectId,
        title: `DOC-FRESHNESS: ${finding.doc} may be stale — ${finding.newestStaleSubject} changed more recently`,
        source: 'self',
        status: 'needs_approval',
        createdAt: now(),
      });
      if (created) {
        out(`  📑 doc-freshness drift proposed (awaiting your approval): ${finding.doc}`);
      }
    }

    // Prune counterpart (same VERIFY-BY doctrine as its sibling sweep
    // above): once a doc catches up past a finding's subject-touch time —
    // fixed by hand, as docs/epics/0001 and 0003 both were — the OLD open
    // proposal, keyed to a touch time no current finding matches, never
    // gets superseded on its own; it sits needs_approval forever even
    // though the drift it named is already resolved. Deferring (never
    // deleting) is reversible, and only ever touches 'needs_approval' rows:
    // once an operator has approved one into 'queued', its fate is the
    // operator's call, not this sweep's.
    const openDocFreshnessIds = store.db
      .prepare(
        "SELECT id FROM tasks WHERE project_id = ? AND id LIKE 'docfresh-%' AND status = 'needs_approval'",
      )
      .all(projectId) as { id: string }[];
    for (const staleId of findStaleDocFreshnessProposalIds(
      openDocFreshnessIds.map((r) => r.id),
      findings,
    )) {
      if (setTaskStatus(store, staleId, 'deferred', now())) {
        out(`  🧹 stale doc-freshness proposal auto-deferred (doc caught up): ${staleId}`);
      }
    }
  } catch {
    out('  📑 doc-freshness sweep skipped (best-effort, non-fatal).');
  }
}

/**
 * CLOSED-TASK AUDIT ritual (web-msu74pog-w4hjgq): the VERIFY DIET false-close
 * class — `markTaskDoneIfShipped`'s DELIVERABLE verifier only proves a
 * "complete" claim true AT SHIP TIME, against that one commit's patch. Code
 * drifts after a task closes (a later refactor can delete or rename away the
 * very thing a closed claim pointed at) with nothing re-checking it once the
 * task is off the board. Once per flight, re-runs the same keyword-overlap
 * heuristic against the CURRENT tree for this project's most-recently-done
 * tasks, plus a narrower UX-EXPRESSION re-check for clauses that promise a
 * UI/Docs surface (a keyword can survive in a stray backend comment long
 * after the panel it described was ripped out — plain keyword-anywhere
 * presence misses that). A finding becomes a proposal through the SAME
 * approval gate every other self-mined task uses (source: 'self', status:
 * 'needs_approval') — the audit never reopens the original task itself, the
 * operator decides. The id is keyed on the task alone (not a timestamp) so an
 * unresolved finding isn't re-proposed every flight; once the original task
 * is fixed (or the drift somehow reverses), the audit simply stops finding it.
 */
export async function runClosedTaskAuditSweep(
  store: Store,
  projectId: string,
  vcs: GitVcs,
  now: () => number,
): Promise<void> {
  try {
    const findings = await findClosedTaskAuditFindings(doneTasks(store.db, projectId), vcs);
    for (const finding of findings) {
      const clauseDescription =
        finding.reason === 'ux-expression-drift'
          ? "its DELIVERABLE clause's UI/Docs expression no longer appears in the tree"
          : 'its DELIVERABLE clause no longer checks out';
      const created = createTask(store, {
        id: `closedaudit-${finding.taskId}`,
        projectId,
        title: `CLOSED-TASK AUDIT: "${finding.taskId}" claimed done but ${clauseDescription} — re-verify: ${finding.title}`,
        source: 'self',
        status: 'needs_approval',
        createdAt: now(),
      });
      if (created) {
        out(
          `  🔍 closed-task drift proposed (awaiting your approval): ${finding.taskId} — "${finding.deliverable}"`,
        );
      }
    }
  } catch {
    out('  🔍 closed-task audit sweep skipped (best-effort, non-fatal).');
  }
}

/**
 * SOUL evolution loop mining step (web-msnsndir-k1xgnd), continuing
 * 6447b45/4bc52d5/afd05bf/e9c2795: those slices landed the storage and the
 * ratify/dismiss UI, but nothing ever CALLED proposeSoulAmendment — this is
 * that missing call. mineSoulAmendment (flight/soul-mining.ts) is pure; this
 * collects its inputs (the project's current soul/pending proposal, and its
 * newest firings' gate results) and, when it decides a proposal is worth
 * making, writes it to the SAME soul_proposed slot the dashboard's
 * ratify/dismiss panel already reads — never applied without the operator's
 * explicit ratify, same locked-by-default contract as every other SOUL change.
 */
export function runSoulMiningSweep(store: Store, projectId: string, now: () => number): void {
  try {
    const soulState = store.db
      .prepare('SELECT soul, soul_proposed FROM projects WHERE id = ?')
      .get(projectId) as { soul: string | null; soul_proposed: string | null } | undefined;
    const recentGateRows = store.db
      .prepare(
        'SELECT gate_result FROM metrics WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      )
      .all(projectId, SOUL_MINING_GATE_LOOKBACK) as { gate_result: string | null }[];
    if (soulState) {
      const soulMiningInput = {
        soul: soulState.soul ?? '',
        soulProposed: soulState.soul_proposed,
        recentGateResults: recentGateRows.map((r) => r.gate_result),
      };
      // With two learning kinds (epic 0014 slice 2) and ONE soul_proposed
      // slot, actions across kinds are no longer mutually exclusive (e.g. a
      // noop streak can both qualify the noop mine AND break the checkpoint
      // streak its note described) — and proposeSoulAmendment overwrites
      // unconditionally. So: walk in priority order and STOP at the first
      // action that proposes; the rest wait for the sweep after the
      // operator ratifies/dismisses, same registry-order contract as
      // mineFleetWisdom. Mine before its prune within a kind (a fresh
      // learning outranks retracting a stale one).
      const soulActions = [
        { decide: mineSoulAmendment, summary: 'recurring checkpoint pattern' },
        { decide: pruneSoulAmendment, summary: 'retract stale checkpoint-pattern note' },
        { decide: mineNoopSoulAmendment, summary: 'recurring noop pattern' },
        { decide: pruneNoopSoulAmendment, summary: 'retract stale noop-pattern note' },
      ];
      for (const action of soulActions) {
        const proposed = action.decide(soulMiningInput);
        if (proposed && proposeSoulAmendment(store, projectId, proposed, now())) {
          out(`  🧬 SOUL amendment proposed (awaiting your ratify/dismiss): ${action.summary}.`);
          break;
        }
      }
    }
  } catch {
    out('  🧬 SOUL mining sweep skipped (best-effort, non-fatal).');
  }
}

/**
 * FLEET WISDOM mining step (board web-msnt26xe-pc4pzp): storage (schema v20,
 * mutate.ts's propose/ratify/dismiss) and the pure decision
 * (flight/fleet-wisdom-mining.ts's mineFleetWisdom) both already existed,
 * but — same gap the SOUL sweep documents — nothing ever CALLED
 * proposeFleetWisdomAmendment. This is that missing call: it reads every
 * project's SOUL from the SAME store the flight already has open (one shared
 * SQLite file, many project rows) plus the fleet row's current wisdom/pending
 * proposal, and only writes a new pending proposal when mineFleetWisdom
 * decides the checkpoint-streak learning has generalized across enough
 * distinct projects. Never applied without an explicit operator ratify — this
 * only ever touches the pending slot.
 */
export function runFleetWisdomSweep(store: Store, now: () => number): void {
  try {
    const allProjectSouls = store.db.prepare('SELECT slug, soul FROM projects').all() as {
      slug: string;
      soul: string | null;
    }[];
    const fleetRow = store.db
      .prepare(`SELECT wisdom, wisdom_proposed FROM fleet WHERE id = 'fleet'`)
      .get() as { wisdom: string; wisdom_proposed: string | null } | undefined;
    if (fleetRow) {
      const fleetWisdomProposal = mineFleetWisdom({
        projects: allProjectSouls.map((p) => ({ slug: p.slug, soul: p.soul ?? '' })),
        fleetWisdom: fleetRow.wisdom,
        fleetWisdomProposed: fleetRow.wisdom_proposed,
      });
      if (fleetWisdomProposal && proposeFleetWisdomAmendment(store, fleetWisdomProposal, now())) {
        out(
          '  🧬🌐 FLEET WISDOM amendment proposed (awaiting operator ratify/dismiss): checkpoint pattern confirmed fleet-wide.',
        );
      }
    }
  } catch {
    out('  🧬🌐 FLEET WISDOM mining sweep skipped (best-effort, non-fatal).');
  }
}

/**
 * STORE BACKUP + retention (web-msnsnde8-gv5ndj): the SQLite store is the
 * entire research dataset behind SELF-STUDY/PAPER.md, and it had zero
 * backups. Snapshot it once per flight via SQLite's own online backup API
 * (integrity-checked; packages/store/src/snapshot.ts), rotated to the
 * DEFAULT_SNAPSHOT_RETENTION most recent copies. Best-effort: a backup hiccup
 * must never fail the flight itself.
 */
export async function runStoreBackupSweep(
  store: Store,
  dbPath: string,
  now: () => number,
): Promise<void> {
  try {
    const backupDir = join(dirname(dbPath), 'backups');
    const snapshot = await createSnapshot(store, backupDir, now);
    if (snapshot.ok) {
      const removed = pruneSnapshots(backupDir);
      out(
        `  💾 store snapshot saved (${(snapshot.sizeBytes / 1_048_576).toFixed(1)} MB)` +
          (removed.length > 0 ? ` — pruned ${removed.length} older snapshot(s).` : '.'),
      );
    } else {
      out(`  ⚠ store snapshot failed integrity check: ${snapshot.integrityError}`);
    }
  } catch {
    out('  💾 store backup skipped (best-effort, non-fatal).');
  }
}
