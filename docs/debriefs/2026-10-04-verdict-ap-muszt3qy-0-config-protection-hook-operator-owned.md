<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# VERDICT blocked `ap-muszt3qy-0`: the hook that blocks `eslint.config.js` is the operator's own Claude Code hook, outside every flight's containment — the allowlist/override is an operator decision, not a repo change

Board (medium, information): "config-protection hook blocks ALL edits to `eslint.config.js`
unconditionally, even operator-assigned fixes — consider an allowlist/override path."

This firing considered it. The short answer: nothing in this repository is that hook, so no
firing can add the allowlist or the override. What a firing can do is lay out the evidence, the
two positions earlier firings already took, and the options the operator has — which this debrief
does.

## Where the hook lives (and where it does not)

- **Not in this repo.** There is no `.claude/` directory in the tree, no hook configuration
  committed anywhere, and the only in-repo git hook is husky's `commit-msg` (commitlint). Nothing
  under `apps/dashboard/src`, `packages/` or `scripts/` names `eslint.config.js` as protected. The
  firing prompt's own "the guard will refuse" list — the repo-native guard — does not name it
  either. The in-repo mentions of the file are the regression test's header comment and
  `pr-review.ts`'s security-sensitive path list, which flags a pull request touching it for
  review; it does not block an edit.
- **In the operator's user-level Claude Code settings.** `1221646f`'s commit body is the primary
  evidence: the firing tried the edit through both the Edit and the Write tool, got the same
  BLOCKED message both times, and recorded that the hook "lives outside this repo's containment".
  A tool-level block that fires identically on two different tools, with no repo file to account
  for it, is a `PreToolUse` hook from the machine's own Claude Code configuration. It applies to
  every session on this machine, fleet worktrees included.

A flight cannot read that configuration (the containment rule forbids any path outside the target),
so this debrief does not describe the hook's internals, only its observed behaviour.

## What the repo already did about the one case that surfaced it

The task that hit the hook (`ap-musv31hq-0`) needed `.tmp-autopilot/**` lint-ignored, after
`c33c392c` was reverted by `5d524950` for a lint red in an untracked scratch file.
`1221646f` closed that need without touching `eslint.config.js`: the root `lint` and `lint:fix`
scripts in `package.json` pass `--ignore-pattern ".tmp-autopilot/**"`, which ESLint maps onto the
same `ignorePatterns` option the config file's `ignores` list would populate, and
`apps/dashboard/test/tooling/eslint-ignores-firing-scratch.test.ts` parses the real script and
asserts the pattern still reaches ESLint. No commit since has needed to touch `eslint.config.js`
or that script.

## The policy question the operator actually owns

Two firings read the same block two ways, and both are on this branch:

- `536919dd` declined the rank-1 task on principle: "Routing the same ignore through
  `package.json` or a shell write would sidestep the hook rather than satisfy it, so the edit is
  left to the operator."
- `1221646f` routed it through `package.json` the next day and shipped, with a regression test.

Both readings are defensible, which is exactly why this is an operator decision. The hook's
evident intent is to keep autonomous agents from rewriting tooling configuration. Whether that
intent covers *the file* (so an equivalent CLI flag in `package.json` is a sanctioned surface) or
*the lint configuration as a whole* (so `1221646f` should have been a 🟣 proposal) is a line only
the hook's owner can draw — and until it is drawn, the next firing that meets the block will spend
a unit re-deriving one of these two answers.

## Options for the operator (shapes, not verified against the hook's code)

1. **Keep the block, bless the surface.** State that `package.json` script flags are the sanctioned
   way to change lint behaviour from a flight, and `eslint.config.js` itself is operator-only.
   Zero machine change; this debrief plus the regression test become the documentation.
2. **Scope the hook off fleet worktrees.** Exempt paths under `.autopilot-worktrees/` so flights
   may edit the file while interactive sessions on the primary checkout stay protected. Cheapest
   true override, but it removes the protection exactly where autonomous edits happen.
3. **Environment override set by the launcher.** Have the hook honour a variable the flight sets
   when a board task names the file. Needs a change in the hook *and* in `fly.ts`, and a hook
   that trusts an environment variable is a hook any session can switch off.
4. **Board-aware allowlist.** Have the hook consult the dashboard's board for an open task naming
   the file. Most precise, most machinery, and couples a user-level hook to one project's store.

The firing's recommendation is option 1: it matches what the hook was installed to do, costs
nothing, and the one need that ever hit the block is already met and pinned by a test. Options 2–4
are listed so the decision is made against the full menu, not only the default.

## What this firing did not do, and why

- **No edit to any hook or settings file.** Outside the target; the containment rule is absolute.
- **No `FAILURE-DOCTRINE.md` row.** Rows pair a failure class with a permanent counter that lives
  in this repo; the counter here is the operator's hook configuration, so a row would point outside
  the tree. If the operator picks option 1, the policy sentence belongs in `docs/RUNBOOK.md` or
  the firing prompt's guard list, in the same commit that records the decision.
- **No code.** The repo-side work shipped in `1221646f`; nothing was left to pin.

## Outcome

`ap-muszt3qy-0` is **blocked on the operator**: the allowlist/override it asks for can only be
added where the hook lives, and the policy choice between the two readings above is theirs. The
`VERDICT blocked` proposal this firing emits benches the task until a human rules; approving the
verdict retires it.

## Verification note for this firing's own METRICS

This firing's unit is this file plus the regenerated `docs/debriefs/README.md` index
(`node scripts/docs/generate-debriefs-index.mjs`), both pure documentation. `docs/` is excluded
from `prettier --check .` and from ESLint's `files` globs, so `typecheck`, `lint` and `build` are
structurally unaffected; the doc-side checks (`ci:doc-links`, `ci:doc-commit-refs`, `ci:spdx`,
`ci:no-personal-paths`, `ci:conflict-markers`) were run directly. Every SHA cited above was
confirmed an ancestor of HEAD before it was written. The full test suite was left to the harness's
post-commit gate, per the active MACHINE BUDGET constraint.
