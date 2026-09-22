<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Publicity drafts — awesome-list submissions

Board item `web-mtncmhn9-j15fhc`: "prepare PR drafts submitting AUTOPILOT to
awesome-claude-code / awesome-ai-agents style lists — drafts only, operator reviews and
submits; no outbound actions." This firing researched both target lists' actual
contribution rules (read-only `gh api` calls only — nothing was opened, filed, or
submitted) and drafted the content below. **Nothing here has been submitted.** The
operator reviews, edits to taste, and submits by hand.

## Eligibility check (both lists gate on repo maturity)

`M-A-S-T-E-R-M-I-N-D/AUTOPILOT`: public, created 2026-09-03, pushed as recently as
2026-09-21, 2 stars. That is 19 days of continuous, active daily commits — it clears
awesome-claude-code's "14 days since first commit + ongoing activity" bar on age/activity
alone (it does not clear the alternate 100-star bar, but only one of the two is required).

## 1. `hesreallyhim/awesome-claude-code` — does NOT take a PR

Their own `CONTRIBUTING.md` is explicit: **"Do not open a PR. Just fill out the form."**
and **"It is not possible to submit a resource recommendation using the `gh` CLI."**
Recommendations must also be "created by human beings" — not filed by an agent on the
operator's behalf. So there is no PR to draft for this one; the actionable artifact is
the pre-filled form content below, for the operator to paste into the web form
themselves:

**Submit here:** https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

| Field | Value |
| --- | --- |
| Display Name | `AUTOPILOT` |
| Category | `Agent Orchestration` |
| Link | `https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT` |
| Author Name | `1337 · REL AZEUS · MΔSTERMIND` (swap for a personal handle if preferred) |
| Author Link | `https://github.com/M-A-S-T-E-R-M-I-N-D` (org page — no individual profile is documented in-repo; swap if there's a preferred personal one) |
| Description | See below (445 chars, within their 10–500 limit) |

Description (descriptive, not promotional, per their STYLE rule):

> AUTOPILOT is an autonomous engineering agent for Claude Code that repeatedly orients
> itself in a target repository, selects the single highest-value verifiable change,
> implements it, runs the project's own gate (typecheck, lint, test, build), and commits
> only when green. It runs on the operator's existing Claude Code CLI subscription — no
> separate API key or per-token billing — and ships a local dashboard for supervising
> parallel fleets of flights across a repository.

Before submitting, the checklist also asks the submitter to confirm the resource is
"sufficiently distinct from any existing resource" — the list already carries **OSS
Autopilot** (`costajohnt/oss-autopilot`, line ~201 of their README), a similarly-named
but functionally different tool (it discovers and tracks *external* OSS contributions
and diagnoses CI failures across other people's repos, rather than autonomously
shipping verified changes to the repo it's pointed at). Worth a one-line gut check by
whoever files this that the distinction reads clearly to a reviewer skimming both names.

## 2. `e2b-dev/awesome-ai-agents` — DOES take a PR

Their README: "Create a pull request or fill in this form. Please keep the alphabetical
order and in the correct category." No `CONTRIBUTING.md` exists beyond that. Repo is
still active (last commit 2026-08-21). Ready-to-paste entry, matching their existing
format exactly (e.g. the `Aider` entry, `Category: Coding, GitHub`):

```markdown
## [AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)
Autonomous engineering agent that repeatedly picks the highest-value verifiable change in your repo, implements it, and commits only when your own gate passes

<details>

### Category
Coding, GitHub

### Description
- AUTOPILOT points at any repository, orients itself using the project's own board, docs, and git history, and picks the single highest-value change it can finish and verify
- It implements the change, runs the repository's own gate (typecheck, lint, test, build), and commits only when green — otherwise it reverts and reports
- Runs on the operator's existing Claude Code CLI subscription (no separate API key or per-token billing) and includes a local dashboard for supervising parallel fleets of flights across a repository

### Links
- [Website](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)
- Author: [1337 · REL AZEUS · MΔSTERMIND](https://github.com/M-A-S-T-E-R-M-I-N-D)

</details>
```

**Insertion point:** their list is one long alphabetical `##` heading per entry.
`AUTOPILOT` sorts after `Automata` and before `AutoPR` (`AutoG… < Autom… < AUTOPILOT <
AutoPR…`) — drop the block above right before the `## [AutoPR](...)` heading.

No duplicate of this project's name exists on their list today (only the unrelated
"Airplane Autopilot" and "Code Autopilot" entries, checked by grep against the live
README).

## What this firing did NOT do

- No issue was opened, no PR was filed, no form was submitted — every `gh` call above
  was a read (`gh api repos/.../contents/...`, `gh search repos`).
- Neither draft has been fact-checked against a future repo state; re-verify the star
  count, category list, and alphabetical neighbors at submission time in case either
  upstream list has changed.
