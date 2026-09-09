<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Case studies

Full, honest narratives of a mini-app flown by AUTOPILOT: what the human asked for, what the
machine did firing-by-firing, and how the delivered result scores against the mission's own
checklist — including the part that went wrong. `README.md`'s self-study line says it plainly:
"including the failures … no claims without a paper trail." A case study is that promise applied
to one concrete flight instead of the aggregate.

## Standard

A case study earns its place here only when it can cite:

- the mission brief the human wrote (a `MISSION.md` or equivalent, committed before the flight);
- real flight-log excerpts — commit subjects, gate verdicts, revert-and-retry moments — not a
  paraphrase from memory;
- gate-verified acceptance numbers (tests green/red, not "looked right"); and
- self-study telemetry (cost, firing count, ship-rate) from `docs/SELF-STUDY/dataset/` where the
  flight is recent enough to be tracked there.

A mini-app that was flown before self-study telemetry existed, or whose flight history was
squashed by a repo-history rewrite (`samples/node-cli` and `samples/python-lib` both predate the
dataset and both landed as a single `genesis` commit — no per-firing record survives), does not
get a case study yet. Writing one anyway would mean inventing the missing numbers, which is
exactly the failure mode this directory exists to refuse. It gets one the next time it is flown
for real, with telemetry captured live.

The same refusal covers a sample that was never flown as a mission at all. `samples/static-site`
was built directly as onboarding-detector test infrastructure (`00bc8f9a`, one firing, no
`MISSION.md`) rather than delivered against a human ask — there is no brief to score the result
against, so a case study would have nothing honest to narrate. It gets one the first time it is
picked up as an actual flight target.

## Index

| Mini-app | Case study | Telemetry source |
| --- | --- | --- |
| [`samples/calculator`](../../samples/calculator) | [calculator.md](calculator.md) | observed live, launch night (2026-09-04) |
| `samples/node-cli` | not yet — history squashed at `genesis`, no paper trail | none survives |
| `samples/python-lib` | not yet — history squashed at `genesis`, no paper trail | none survives |
| `samples/static-site` | not yet — built as a fixture, never flown as a mission | none — not yet flown |

## Adding one

1. Fly the mission for real; do not reconstruct a flight after the fact.
2. Cite the flight's actual commits and gate output — quote them, don't summarize from memory.
3. Score the result against the mission's own checklist, unedited after the fact.
4. Report what went wrong as plainly as what went right; a case study with no rough edge reads as
   marketing, not evidence.
5. Add a row to the index above and link the case study from `README.md`'s self-study section.
