<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Closing `ap-mui04ldw-0`: `status: needs-format` already exists on the live repo, but `dossier-posted` is still missing

Board (🟣, operator): "run `pnpm dashboard:taxonomy-seed` once on the live repo so `status:
needs-format` exists before KEEPER's next triage pass". A firing can't run that command: it writes
labels and milestones to the public repo, and it is tagged for the operator. A firing can still
check what the live repo carries. All of the checks below are read-only `gh` calls.

## The label the task asks for is live

`gh api repos/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/labels/status:%20needs-format` returns the label:

- color `e4e669`
- description "Filed off the issue template; KEEPER waits for the template's sections before
  boarding it"

The protocol gate in `issue-triage.ts` adds `NEEDS_FORMAT_LABEL` with `gh issue edit --add-label`,
which looks the label up by name only. So the failure `8a4df6ad` recorded ("'status: needs-format'
not found") can no longer happen, and the gate can fire on KEEPER's next pass. No issue carries the
label yet (`gh issue list --label "status: needs-format" --state all` is empty).

## The seed has not run since `status: needs-format` joined it

The operator created this label by hand. The seed did not create it:

- Its color and description differ from the code. `HOUSE_TAXONOMY_LABELS` has `fef2c0` and
  "Filed off the issue template — KEEPER named the missing sections; lifts once the body
  conforms". The live text appears nowhere in this repo's history (`git log --all -S "waits for
  the template"` returns nothing). The seed's `gh label create --force` would have overwritten
  both fields.
- **`dossier-posted` does not exist on the live repo.** `gh api …/labels/dossier-posted` returns
  404. `dd497ff2` (2026-09-27) added it to the seed for the same reason `8a4df6ad` added
  `status: needs-format`. The KEEPER dossier ritual (`contributor-dossier.ts`,
  `DOSSIER_POSTED_LABEL`) adds the label by name before it posts. With the label missing, that
  edit fails, the marker never lands, and later passes may post the dossier again. The only open
  question is when the next application arrives. The one application so far, #29, is closed and
  does not carry the label.
- The other 17 house labels match `HOUSE_TAXONOMY_LABELS` byte for byte (name, color and
  description). That doesn't prove the seed ever ran here. Its starter milestones have been in the
  plan since the module's first commit (`fe085d1a`, 2026-09-08), and none of them exists live. The
  live milestones date from 2026-09-07, the day before the seed was written, so the labels it
  transcribes may be older than the seed too.

## What running it now would also do

`planTaxonomySeed` plans every starter milestone that is missing by title. None of `Foundations`,
`V1` and `Hardening` exists on the live repo. Its milestones are the four hand-authored ones the
owner created on 2026-09-07: Full dashboard i18n, Multi-provider pilots, Cockpit & Navigation
wave, and Foundation & community. A run today would:

1. create `dossier-posted`, which is the real gap;
2. recolor `status: needs-format` and replace its description with the seed's text;
3. leave the other 17 labels as they are, because their upserts write the same values;
4. **create the three generic starter milestones** next to the four project milestones.
   `docs/GOVERNANCE.md` calls this set "a generic bootstrap set for a fresh repo", and the CLI has
   no dry-run or labels-only flag to skip it.

The operator should know item 4 before running the command. If the milestones are unwanted, the
quickest route to item 1 is creating that one label by hand, which is the same thing the operator
did for `status: needs-format`.

## Outcome

The task's stated end state, `status: needs-format` existing before KEEPER's next triage pass, is
met on the live repo, so `ap-mui04ldw-0` is complete with this evidence. Closing it is safe
because the remaining gap goes to the operator as its own 🟣 proposal:
`dossier-posted` is missing, and running the seed would also create the starter milestones. The
old title asks for a label that already exists, so it would have pointed the operator at the wrong
gap.

## Left alone

- **The live repo.** Every call this firing made against GitHub was a read.
- **`taxonomy-seed.ts`.** A labels-only or `--dry-run` mode would let the operator skip item 4.
  That is a feature request for whoever owns epic 0019 (the steward), not this closing debrief.
  It is raised as a proposal instead.
