<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0011. Fix-commit generation strategy for a `defect` diagnosis verdict (epic 0020 slice 8b) — a design proposal

Status: Proposed (🟣 operator decision — this record proposes a matching
strategy, it does not implement one; VERDICT `ap-mtydvfm1-0`
(`docs/debriefs/2026-09-13-verdict-ap-mtydvfm1-0-epic-0020-s8-fix-commit-half-confirmed.md`)
already named slice (b) a decision-before-code item, the same posture ADR
0010 took for a smaller guard change)

## Context

Epic 0020 slice 8, "Diagnose & fix a red check," splits into three
board-tracked pieces once its classify+evidence half shipped:
`flight/check-diagnosis.ts`'s `diagnoseFailedCheck` (pure `flake`/`defect`/
`unknown` classifier) and `createCheckDiagnosisApi`
(`GET /api/pr-review/diagnose?number=`), both live behind the `🔧 Diagnose`
button. VERDICT `ap-mtydvfm1-0` split the remaining `defect` → fix-commit
work into (a) a diff-approval UI shell, (b) fix-commit generation, (c) the
apply-approved-fix execute path — because "the actual fix-authoring step has
no precedent to reuse at all... it is new capability, not new wiring around
existing capability."

Slice (a) shipped (`ap-mtzrb9gy-2`): `web/features/pr-review.ts`'s
`renderFixProposal` renders a `FixCommitProposal` (`check-diagnosis.ts`)
with a permanently-disabled-with-reason Approve and a no-confirm Discard,
proven against a hand-authored fixture diff
(`test/web/pr-review-fix-proposal.test.ts`). `diagnoseFailedCheck` itself
still never populates `fixProposal` — nothing generates one anywhere in this
repo.

The board now carries the follow-on slices with a concrete **API shape**
already decided:

- `ap-mtzqkq96-0` (s8b): "build a candidate commit on a scratch ref off the
  PR head and expose its diff via a new endpoint; never push."
- `ap-mtzqkq99-1` (s8c): "panel showing the candidate fix diff beside the
  Diagnose verdict with an explicit Approve(push)/Reject action, mirroring
  update-branch's confirm-first pattern" — i.e. slice (c), the execute path,
  which has nothing real to push until (b) produces a scratch-ref commit.

Neither task title answers the actual open question: **what produces the
diff content that becomes the scratch-ref commit?** That is the specific
gap VERDICT `ap-mtydvfm1-0` flagged as needing its own design pass, and
re-verifying against the current tree (2026-09-19, this firing) confirms it
is still entirely unanswered:

- A repo-wide search under `apps/dashboard/src` for
  `diff-approval|diffApproval|fix-commit|fixCommit|code-gen|codegen|
  applyFix|generateFix` returns only the already-shipped slice (a) contract
  — no generation logic anywhere.
- Every `claude -p`/`Anthropic`/agent-invocation reference in
  `apps/dashboard/src` (`connection/service.ts`, `connection/verify.ts`,
  `flight/verify-by.ts`, `server/main.ts`, `server/server.ts`) is the
  **auth-verification probe** — confirming the caller's credentials work —
  never a content-generation call. There is no precedent anywhere in this
  codebase for invoking an LLM to author a patch.
- No board task, ADR, or debrief between the VERDICT (2026-09-13) and this
  firing (2026-09-19) touches the question; `git log` on
  `flight/check-diagnosis.ts` shows no commits past the slice (a) shell.

Building s8b's scratch-ref/commit/diff-endpoint plumbing without answering
this first means guessing at an architecture for a feature that (1) writes
generated content onto a real PR's history (even off-branch, on a scratch
ref) and (2) will, once (c) lands, be one confirm-click away from pushing
that content to a contributor's branch. That is exactly the class of
decision `PATTERNS-AND-STANDARDS.md` §10's "plan-before-execute" principle
and this directory's own convention reserve for an ADR rather than a
self-initiated implementation.

## The generation-strategy question

Given a `defect` verdict plus its evidence (failing test path(s), touched
paths, job log), what produces the candidate patch? Three options:

### Option A — delegate to a scoped agent invocation

Spawn a tightly-scoped `claude -p` (or Agent SDK) call: feed it the job log,
touched paths, and diagnosis reasoning; constrain it to diff-only output
with no tool/shell/network access; capture the resulting patch text.

- **Pros:** general — not limited to a fixed set of defect shapes; reuses
  the `claude -p` invocation pattern already proven for auth verification
  (`connection/verify.ts`), so the *transport* has precedent even though the
  *purpose* does not.
- **Cons:** real per-call cost and latency (likely too slow for a
  synchronous HTTP handler — `createCheckDiagnosisApi`'s existing calls all
  return within one `gh` round-trip; this would need an async job pattern
  the route layer doesn't have yet). **New attack surface**: the job log and
  PR metadata this call would be fed are attacker-controlled — a
  contributor's PR can put arbitrary text in a failing test's output or a
  commit message. That text must be treated as untrusted data the same way
  this environment already treats fetched web/tool content, never as
  instructions to the generation call, or a malicious PR could steer what
  "fix" gets proposed for a human to approve. Needs its own security design
  pass, not just a wiring decision.

### Option B — narrow, deterministic heuristics for known-mechanical shapes

Cover a small, explicit set of defect shapes with plain, deterministic
tooling: a stale snapshot mismatch → re-run the project's snapshot-update
command and diff the result; a lint-autofixable failure → run the linter's
`--fix` and diff. Anything outside the known shapes returns no candidate —
the same "an honest `unknown` beats a confident wrong answer" discipline
`diagnoseFailedCheck` already follows (FAILURE-DOCTRINE row 6).

- **Pros:** zero LLM cost or latency; fully deterministic and testable with
  fixture repos, the same style as every other flight API in this codebase
  (`CliExec`-injected, no live network dependency in tests); no new
  untrusted-input-to-generation surface, since the "fix" is a fixed command
  re-run, not free-form authored content.
- **Cons:** narrow — covers a small slice of real `defect` verdicts.
  Requires extending `diagnoseFailedCheck`'s verdict shape to sub-classify
  *which* mechanical shape a `defect` is (today it only says `defect`, not
  why), which is itself new classifier surface, not just a generation
  backend.

### Option C — no generation yet; invest in evidence quality instead

Leave slice (a)'s Approve button permanently disabled. Put further effort
into `CheckDiagnosisResult.reasoning` — richer evidence, direct links to
failing lines/job steps — so a human hand-authors the fix faster, without
this repo ever authoring code on someone else's behalf.

- **Pros:** zero new risk surface; nothing to get wrong. Consistent with
  this codebase's general bias toward surfacing evidence over automating
  judgment calls it cannot yet make confidently.
- **Cons:** closes none of the epic's stated slice-8 shape ("prepare a
  commit... show a diff for approval"); s8b/s8c stay permanently unbuildable
  as scoped.

## Recommendation (non-binding — operator decides)

Option B as the first cut, with Option A explicitly deferred rather than
rejected. B is buildable with this codebase's existing patterns (injected
exec, fixture-driven tests, honest decline as a first-class outcome) and
carries none of A's cost/latency/prompt-injection surface. A remains the
only path to *general* defect coverage, but its per-call cost and the
untrusted-content-into-generation risk are exactly the kind of tradeoff this
ADR exists to put in front of the operator before any code, not something a
firing should default into. If B is accepted, s8b's "scratch ref off the PR
head" plumbing can be built against a first concrete backend (snapshot-update
re-run) rather than an empty interface with no caller — avoiding the
speculative-infrastructure trap of building the scratch-ref/endpoint shell
before there is any real content to put in it.

## Consequences

Positive: unblocks `ap-mtzqkq96-0`/`ap-mtzqkq99-1`, which are otherwise
correctly stuck — two firings (the 2026-09-13 VERDICT and this one) have
now independently confirmed the same gap rather than one guessing past it.
Option B, if accepted, keeps the feature's first real version inside this
project's established low-risk patterns.

Tradeoff: whichever option is picked, this is new capability with no
existing test/telemetry surface to lean on — the first version will need
its own fixture-repo test harness (a real scratch git repo, not just
string fixtures) that nothing in `test/flight/` currently provides for
`check-diagnosis.ts`'s siblings. Option A specifically trades that cost for
generality, and its untrusted-input surface needs explicit sign-off, not
implicit inheritance from the (unrelated) auth-probe precedent.

## Related

- `docs/debriefs/2026-09-13-verdict-ap-mtydvfm1-0-epic-0020-s8-fix-commit-half-confirmed.md`
  — the split this ADR resolves one branch of.
- `docs/debriefs/2026-09-16-epic-0020-s8a-diff-approval-shell-confirmed-shipped.md`
  — slice (a), already shipped, that (b)'s output would flow into.
- `docs/epics/0020-legible-surface.md` row 8.
- `apps/dashboard/src/flight/check-diagnosis.ts`,
  `apps/dashboard/src/connection/verify.ts` (the auth-probe `claude -p`
  precedent Option A would reuse the transport of, not the purpose).
