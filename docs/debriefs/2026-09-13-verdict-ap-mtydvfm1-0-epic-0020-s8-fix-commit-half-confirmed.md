<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtydvfm1-0`: EPIC 0020 S8's fix-commit half is confirmed unstarted, split into three slices

Board (medium/priorities): "VERDICT split `web-mtvpuoj4-tv1z09`: the
defect-verdict fix-commit+diff-approval half needs its own firing — no
code-gen/diff-approval infra exists yet; classify+evidence UI already
shipped." This is a VERDICT task — a prior firing's proposal about another
task, not buildable work itself. Per the VERDICT-processing protocol, this
firing's unit is to verify the claim, propose the concrete follow-on slices,
and complete this task with the evidence — not to attempt the underlying
feature.

## Verification of the claim

1. **The classify+evidence half is shipped, not "in progress."**
   `docs/epics/0020-legible-surface.md` row 8 records slice 8 as
   **started**, and its own text names exactly what shipped: the pure
   classifier (`flight/check-diagnosis.ts`'s `diagnoseFailedCheck`, `flake` /
   `defect` / `unknown`), wired to `GET /api/pr-review/diagnose?number=`
   (`createCheckDiagnosisApi`), and a `🔧 Diagnose` button beside "Re-run
   failed" that calls the route and renders the verdict with its evidence
   (`web/pr-review-panel.ts`'s `checkDiagnosisResult`). `git log` confirms
   four real commits behind this, not a stub: `f6222d3b` (pure classifier),
   `c1f73138` (route wiring), `06986920` (button, reverted once for a gate
   failure), `5c875473` (the button, redone within budget).
2. **The fix-commit + diff-approval half has zero code anywhere.** The
   epic's own slice-8 text ends with "the `defect` verdict's diff-for-approval
   prep still remains," and `check-diagnosis.ts`'s file header independently
   says the same: "Still deferred: the 🔧 Diagnose button and the `defect`
   verdict's diff-for-approval preparation." A repo-wide search for
   `diff-approval|diffApproval|fix-commit|fixCommit|code-gen|codegen|
   applyFix|generateFix` under `apps/dashboard/src` returns nothing relevant
   (`qrcode-lib.ts`'s one hit is an unrelated substring match, not
   fix-commit infra). No `mirror-pass-execute.ts`-shaped `*-execute.ts`
   companion, no server route, no panel affordance exists for this half.
3. **The epic's own worked example shows why this half is not a small
   follow-up.** Slice 8's "Shape" section: "For `defect`, prepare a commit on
   the PR branch and show a diff for approval. Never auto-push: pushing to a
   contributor's branch without asking is exactly what `update-branch`
   already refuses to do silently." `update-branch` (`human-merge.ts`) only
   re-runs an existing `gh pr update-branch` — it never authors new content.
   Nothing in this codebase today *writes* a candidate fix; the confirm-first
   push discipline `update-branch`'s button already models
   (`pr-review-panel.ts:309-310`, "a real commit on someone else's branch")
   is reusable for the apply step, but the actual fix-authoring step has no
   precedent to reuse at all — it is new capability, not new wiring around
   existing capability.

## VERDICT

**Confirmed, and the split call is correct.** The classify+evidence half
(epic 0020 slice 8's first two "Shape" bullets) is fully shipped and
already closes its own board task. The remaining third bullet — prepare a
fix commit for a `defect` verdict and show it as a diff for approval — is
irreducibly a separate, larger unit: it requires an actual fix-authoring
capability this repo has never built, not just a UI affordance around an
existing one. Recommending three independently-shippable slices, each
scoped to fit one firing:

- **(a) Diff-approval UI shell**, decoupled from fix generation: given an
  already-prepared unified diff for a PR's branch, render it for the
  operator (mirroring the `checkDiagnosisResult` evidence-first rendering
  convention already established) with an explicit approve/discard choice
  and no auto-apply — provable today with a hand-authored fixture diff, no
  code-gen dependency, so it can land and be tested before slice (b) exists.
- **(b) Fix-commit generation core.** The actual capability gap: given a
  `defect` verdict plus its evidence (failing test path, touched paths, job
  log), produce a candidate patch. This is new, not wiring — whether it
  delegates to a scoped agent invocation or something narrower needs its own
  design pass (a 🟣 operator-facing scope decision, the same posture ADR 0010
  already took for a smaller guard change), and it must preserve the
  classifier's existing "an honest `unknown` beats a confident wrong answer"
  discipline (FAILURE-DOCTRINE row 6): declining to propose a fix is a valid,
  common outcome, not a fallback to route around.
- **(c) Apply-approved-fix execute path.** Once (a) and (b) exist, push the
  approved commit to the PR branch under the same confirm-before-mutate
  discipline `update-branch`'s button already uses, with an `*-execute.ts`
  companion and CSRF/rate-limit-guarded route following the established
  `pr-review.ts` → `pr-review-execute.ts` pairing convention.

This firing does not attempt any of (a)-(c) — (b) in particular is a
🟣 operator-scope decision before any code, and (a)/(c) are each their own
firing-sized unit. Per the VERDICT-processing protocol, this firing's own
unit is the verification and the proposals above, not the underlying
feature.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file this firing staged or touched. Pure
documentation: `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no
source or test code and `typecheck`/`test`/`build` are structurally
unaffected by it.
