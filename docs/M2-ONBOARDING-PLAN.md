<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# M2 — Onboarding plan ("lock onto any project, safely")

> Synthesized from the M2 design pass (gate-detection · backup-safety · project-index blueprints) plus the
> orchestrator design. Package: `@autopilot/onboarding`. Depends on M1 (`v0.7.1`). Built in gated TDD slices, each
> `typecheck + lint + test≥80% + build` green before commit — same discipline as M1.

## DoD (ACTION-PLAN M2)

Point it at **3 different-stack repos** → each is **backed up**, **oriented**, its **gate detected**, its **index built**;
**re-locking a seen repo resumes state**; **no repo is ever touched before its MYTH/LEGACY snapshot exists**. Dogfooding:
AUTOPILOT registers its own repo as tracked project #1.

## The cardinal invariant

**Back up before any git action** (MASTER-PLAN §7). The ritual order is load-bearing:
`backup(MYTH) → baseline(LEGACY) → safety-branch → detect-gate → map-arch → build-index → register → SOUL → board`.
Detection + indexing are **read-only** against the working tree (they only ever write SQLite), so even if reordered they
cannot violate the rule; the backup step is the sole gatekeeper and is enforced by `assertBackedUp` before any write.

## Hexagonal design (reuse M1's ports + adapters + store patterns)

- **Pure cores** (no I/O, fully unit-testable): gate detection over an `FsSnapshot` abstraction; the content-hash index
  core (`hashContent`/`treeHash`/`diffIndex`/`buildIndex`); the ritual/resume decision logic.
- **Thin adapters** (impure, tested against real temp git repos + real `:memory:` sqlite): fs/git file sources, the
  git backup ops (extend `GitVcs`), the SQLite index/versions/projects repos.
- **Store**: a new **migration v3** adds `project_index` + `project_index_meta` (append-only; v1/v2 stay checksum-frozen).
  MYTH/LEGACY/FLIGHT are recorded in the existing `versions` table (`tier` ∈ myth|legacy|flight).

## Shared types (defined once)

- `GateKind = 'typecheck'|'test'|'build'|'lint'`; `GateCommand {bin, args[], label}`; `GateSpec {…commands, ecosystem}`;
  `GateDetection {spec, candidates[], ambiguity}`. A detected `GateSpec` drives the engine's existing `GatePort` via a
  `CommandGate` bridge (closes the M1 loop: onboarding detects → engine gates).
- `Language` (as-const tuple; lives in `@autopilot/store` as the `project_index.language` CHECK list + the detector's map).
- `IndexEntry {path, contentHash, size, language}`; `ProjectIndex {entries[], treeHash, summary, hotFiles[]}`;
  `IndexDiff {added, changed, removed, unchanged}`.
- `LockResult {tier tags, flightBranch, resumed}`; the ritual returns this to the orchestrator.

## Slice order (each gated + committed)

1. **Gate auto-detection** (pure; no store/git changes) — `FsSnapshot` boundary + a registry of ecosystem detectors
   (JS/TS, Python, Go, Rust) → `GateSpec`; `CommandGate` bridges to the engine `GatePort`. **← this slice.**
   *Tests:* per-ecosystem detection, multi-stack ambiguity, unknown-repo fallback. *DoD:* "gate detected" across stacks.
2. **Project index** — store migration **v3** (`project_index`+`_meta`) + pure hash/diff core + `GitFileSource`/`FsFileSource`
   + `SqliteIndexStore`. *Tests:* real sqlite round-trip, incremental delta (one edit → 1 changed), resume no-op.
   *DoD:* "index built"; "re-locking resumes state"; efficiency (ENGINE-RESEARCH I3).
3. **Backup + safety ritual** — extend `GitVcs` with tag/branch/status ops; `lockRepo` writes MYTH/LEGACY tags +
   FLIGHT branch + `versions` rows, `assertBackedUp` guard; resume detects existing snapshot. *Tests:* real temp repos —
   order proof, no-force proof, resume. *DoD:* "backed up"; "no repo touched before MYTH/LEGACY".
4. **Onboard orchestrator + starter SOUL + board** — `onboard(repoPath)` runs the ritual in order over injected deps,
   registers the `projects` row (slug/name/root_path/status/soul/gate_config), generates a starter SOUL, seeds the board
   (`tasks`). Resume path loads state. *Tests:* fakes for order; real for registration.
5. **e2e DoD** — onboard 3 real temp repos (TS, Python, Go): each backed up + gate detected + index built; re-lock a seen
   repo → resumes; assert HEAD+status unchanged by detect/index (safety). Dogfood: register AUTOPILOT itself as project #1.

## Deferrals (tracked in BACKLOG §K)

- Deep architecture/convention mapping (indentation/naming inference) — M2 ships stack + entry-point + gate; richer
  convention mining is incremental.
- Semantic index (FTS5 + embeddings) is **M4**; M2's `content_hash` is the exact invalidation key M4 reuses.
- `(size,mtime)` fast-path for the index is an M6 optimization; M2 always hashes (invalidation-correct).
