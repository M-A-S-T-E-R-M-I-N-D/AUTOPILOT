# AUTOPILOT Model Card & Evaluation Card

> **Living document, localized-maintenance convention.** Model cards for agentic systems go stale the moment a
> version ships if every update rewrites the prose. This one is split on purpose: **§3–§5 (Capabilities, Limitations,
> Intended Use) are narrative and should change rarely** — only when the engine's actual behavior changes. **§6
> (Evidence Pointers) is the only section meant to be edited routinely** — version numbers, links, and dates, not
> sentences. When a firing updates evaluation data or ships a capability change, update the pointer, not the
> paragraph around it. See **§7 AI-Use Disclosure** before treating any claim here as independently verified.

## 1. What this is

A **model card** (Mitchell et al., 2019, "Model Cards for Model Reporting") normally documents a trained model:
intended use, performance characteristics, limitations. AUTOPILOT is not a trained model — it is an **agent harness**
around a general-purpose model (Claude, via the local Claude Code CLI) plus a gated autonomous loop: orient → pick →
do → gate → commit. This document adapts the model-card convention to that unit: what the *harness* — not the
underlying model — is known to do well, known to do badly, and how that's measured. The companion **evaluation
card** content lives in §6, pointing at the same telemetry store the self-study paper reads.

## 2. Subject & versioning

- **Subject:** the AUTOPILOT engine (`packages/engine/`) driving firings against a target repository, as shipped in
  this repo's `package.json` (`autopilot-monorepo`).
- **Versioned by two independent axes**, both tracked in §6 rather than restated here:
  - **Engine/package version** (`package.json` `version`, SemVer, one MINOR per milestone — `CHANGELOG.md`).
  - **Firing-Prompt-Version** (the `Firing-Prompt-Version` git trailer written at commit time — the operating
    instructions handed to the agent each firing, independent of the code version; see `docs/SELF-STUDY/PAPER.md` §3).
- These two versions drift independently: a prompt revision can land without a package bump, and vice versa. A claim
  in this card is only trustworthy for the pair of versions named in §6, not "AUTOPILOT" in the abstract.
- **Bumping `FIRING_PROMPT_VERSION` is gated, not free.** Run `pnpm self-study:gate` before shipping a prompt
  revision: it evaluates the new version's pinned-suite pass rate, cost per solved task, and median turns
  (`evaluatePromptVersionGate`, `packages/store/src/read.ts`) against the prior version with the most pinned-suite
  data and exits non-zero on a regression past tolerance. It is a LOCAL check against the git-ignored telemetry
  store (`FLIGHT-CONTAINMENT.md`), not a CI check, and passes provisionally — never blocks — until the new version
  has accumulated enough pinned-suite firings to judge.

## 3. Intended use

- **In scope:** unsupervised, small-scope engineering firings against a repository the operator has explicitly
  pointed AUTOPILOT at — one gate-verified unit of work per firing, committed or reverted, never force-pushed, never
  touching `main` directly (`SOUL` operating rules).
- **Out of scope:** unattended flights against untrusted or shared targets without the OS-level Bash sandbox (§4);
  subjective/ethical/experiential judgments (visual design quality, UX feel, appropriateness) — these are the 🟣
  PURPLE gate (`MASTER-PLAN.md` §17.2) and are *proposed*, never decided, by the agent; and any claim requiring
  cross-repository or cross-tool generalization evidence this card does not have (§5).

## 4. Capabilities

Machine-verified, not self-reported (`MASTER-PLAN.md` §17.1 draws this line explicitly):

- **Gated loop with revert-on-fail.** Every firing runs the project's own gate (typecheck + lint + format + test +
  build, plus this repo's CI validators) before a commit counts as shipped; a failing gate reverts the change rather
  than landing it.
- **Un-fakeable telemetry.** `metrics.gate_result`, `metrics.sha_verified`, and `metrics.head_advanced` are computed
  by the harness independently of the agent's own end-of-firing report — a firing cannot self-report "shipped" and
  have that be the only record (`docs/SELF-STUDY/PAPER.md` §3).
- **Post-firing containment audit.** The engine snapshots guarded repos' HEAD between firings and at flight end; a
  moved HEAD outside the declared target stops the flight and surfaces the breach non-zero (`containment.ts`,
  detection layer of §5's containment gap).
- **CLI-level permission enforcement.** Every flight runs under a generated Claude Code settings file whose
  `PreToolUse` hooks deny absolute paths outside the target, home-directory references, bare `cd`, and destructive
  git (`force-push`, `reset --hard`, `rebase`, `branch -D`, checkout of `main`, `clean -f`) — prevention layer of §5's
  containment gap (`docs/FLIGHT-CONTAINMENT.md`).
- **Self-study.** The engine's own performance against its own repository is tracked and periodically summarized
  from real telemetry, not anecdote (`docs/SELF-STUDY/PAPER.md` §4).

## 5. Limitations & known failure modes

- **Flights are not sandboxed.** Bash is not jailed by default; the CLI-level guard (§4) blocks the *observed*
  escape shapes (absolute-path `cd`/`git -C`, destructive git) but "cannot statically resolve every relative-path
  dance or git invocation" — the detection audit is the backstop, not a preventive guarantee. The OS-level Bash
  sandbox that would close this is **platform-gated: macOS/Linux/WSL2 only, not native Windows**
  (`docs/FLIGHT-CONTAINMENT.md`). **Never point a flight at a sandbox nested under a repo you care about.**
- **Self-report/verification conflation.** Cost, token counts, and the agent's own `completion` tag are self-reported
  by the same agent whose performance they describe; gate-verified fields guard against a firing lying about
  shipping, but cannot detect a firing that picked an artificially easy task or over-claimed "complete" on a partial
  slice (`docs/SELF-STUDY/PAPER.md` §6). The `kind:"fix"` TDD-first rule (`testFirst`, `metrics.test_first`) is the
  same shape: the prompt requires a failing test before the fix, but compliance is a self-report the harness does not
  (yet) independently verify by re-running the named test against the pre-fix commit. The PICK DISCIPLINE audit
  (`picked_rank`, `deviation_reason`, `metrics.picked_rank`/`metrics.deviation_reason`, `pickDisciplineAudit` in
  `packages/store/src/eval-gate.ts`, rendered in `docs/SELF-STUDY/PAPER.md` §4) shares the same conflation: a firing
  self-reports which board rank it worked and why it deviated, and the harness does not (yet) independently verify
  that report against the board's actual rendered order at pick time. The BOARD DIVERSITY audit
  (`boardDiversityAudit`, same file, same §4) is the same self-report one layer down: it reads `metrics.item` on
  those same deviated firings to catch a repeated same-item pick pickDisciplineAudit's justified/unjustified split
  can't see, but a fabricated `item` id would still slip past both audits undetected.
- **Single-subject evaluation.** Every number in §6's evidence pointers comes from AUTOPILOT flying exactly one
  codebase — its own. No claim here generalizes to a different stack, team, or codebase size until a second project
  is in the evaluation data.
- **Selection bias in task picking.** The agent is explicitly instructed to prefer "small and certain over
  ambitious," which keeps the gate meaningful but also means the evaluation record is systematically weighted toward
  low-risk, well-precedented work — not a random sample of the backlog's difficulty.
- **No human-vs-agent baseline yet.** There is no comparison of operator-assigned vs. self-picked task outcomes, or
  of approvals/rejections/edits as evaluation labels, in the current evidence — that is separate, not-yet-built
  work (tracked on the board as the SELF-STUDY human-vs-agent slice).

## 6. Evidence pointers

_The only section of this document expected to change routinely. Update values and links here; leave §3–§5 prose
alone unless the underlying behavior actually changed. The `Engine/package version` row is generated: `pnpm
citation:update` rewrites it from `package.json` and `pnpm run ci:citation` fails on drift — the other rows are
hand-maintained._

| Pointer | Value |
|---|---|
| Engine/package version | `0.21.0` (`package.json`) |
| Firing-Prompt-Version (current) | `firing-v12` |
| Evaluation data | `docs/SELF-STUDY/PAPER.md` §4 `DATA:SUMMARY` — regenerate with `pnpm self-study:update` |
| Prompt-version regression gate | `pnpm self-study:gate` (§2) — pass/fail against the pinned suite before bumping `Firing-Prompt-Version` |
| Containment posture | `docs/FLIGHT-CONTAINMENT.md` — detection (done) + CLI prevention (done) + OS sandbox
  (platform-gated, not native Windows) |
| Verification boundary (🟢 autonomous vs. 🟣 human-required) | `docs/MASTER-PLAN.md` §17 |
| This card last reviewed against the above | 2026-09-03 |

## 7. AI-Use Disclosure

- This document's narrative sections (§1–§5, this section) were drafted autonomously by AUTOPILOT (model
  `claude-sonnet-5`) during a single unsupervised firing, committed without a human review or edit pass — the same
  unsupervised-firing process `docs/SELF-STUDY/PAPER.md` describes.
- §6's values were sourced from the repository at the time of writing (`package.json`, recent commit trailers,
  `docs/FLIGHT-CONTAINMENT.md`, `docs/MASTER-PLAN.md`) rather than invented; they carry the same staleness risk as
  any hand-maintained pointer table and should be spot-checked against the cited files, not trusted blind.
- Nothing in this document has been independently evaluated, reproduced, or replicated by a party other than
  AUTOPILOT itself — same **Available**-only artifact-badge posture as `docs/SELF-STUDY/PAPER.md` §2.
