# Datasheet for the AUTOPILOT firing dataset

> Follows the **Datasheets for Datasets** template (Gebru et al., 2018,
> [arXiv:1803.09010](https://arxiv.org/abs/1803.09010)). Answers below describe the dataset produced by
> `pnpm self-study:export` (`scripts/self-study/export-dataset.mjs`), one row per recorded *firing* — see
> [PAPER.md](PAPER.md) for the full self-study this dataset supports.

## Motivation

**For what purpose was the dataset created?**
To let outside researchers evaluate the three research questions in [PAPER.md §2](PAPER.md#research-questions)
(ship-rate sustainability, guidance-cost effects, cost/turns efficiency over prompt-version eras) without depending
on AUTOPILOT's own generated tables, and without needing access to the private repository or local telemetry store
the tables are computed from. It exists because §2's "Available" artifact-badge claim (data + generation script
open, in-repo, regenerable) was true only of the *rendered summary tables* — the underlying per-firing rows were
never independently exportable until this script.

**Who created the dataset and on behalf of whom?**
AUTOPILOT itself, an autonomous engineering agent, authored the export script during a self-directed firing; the
repository owner (1337 · REL AZEUS · MΔSTERMIND) is the party publishing any dataset actually produced with it.

**Who funded the creation of the dataset?**
No external funding. The underlying telemetry is a byproduct of ordinary AUTOPILOT operation (flying its own repo),
not data collected for a funded study.

## Composition

**What do the instances represent?**
Each row is one *firing* — one bounded unit of autonomous work (orient → pick → implement → gate → commit-or-revert)
recorded to the local SQLite store (`packages/store/src/schema.ts`'s `metrics` table).

**How many instances are there?**
Variable — as many rows as the exporting machine's `.autopilot/autopilot.db` has accumulated for its first
registered project at the time `pnpm self-study:export` is run. There is no fixed release size; each export is a
snapshot, not a versioned corpus.

**Does the dataset contain all possible instances, or a sample?**
All firings recorded for the project, in chronological order — no sampling or filtering by outcome.

**What data does each instance consist of?**
Exactly the columns `EXPORT_COLUMNS` in `scripts/self-study/export-dataset.mjs` selects, plus a synthetic `row_id`:
`kind` (feat/fix/docs/test/refactor/chore/perf/ci/build/style/revert), `shipped` and `self_reported` (0/1),
`model`, `cost_usd` and `real_cost_usd`, `input_tokens`/`output_tokens`/`cache_read_tokens`/`cache_write_tokens`,
`turns`, `duration_ms`, `gate_result`, `head_advanced` and `sha_verified` (0/1 ground-truth checks — PATTERNS-AND-
STANDARDS §7), `completion` (slice/complete/null), `test_first` (0/1/null), `picked_rank` (null for a free pick),
`resumed` and `extended` (0/1/null), and `created_at` (Unix ms).

**Is any information missing from individual instances?**
Yes, deliberately. See **Anonymization** below — several raw `metrics` columns are dropped entirely rather than
redacted per-row, so every instance is missing them uniformly (not a per-row gap).

**Are relationships between instances made explicit?**
`row_id` preserves chronological order (ties broken by the store's internal insertion order) so era/trend analysis
(RQ1, RQ3) stays possible, but it does not round-trip to the original `firing_id` — see Anonymization.

**Anonymization — what was removed and why.**
The export drops: `project_id` and `firing_id` (replaced by sequential `row_id`), `item` (board task id, may name
internal features), `sha`/`head_before`/`head_after` (git commit hashes into a private repository), `commit_subject`
(free-text commit titles, the single highest-risk field for incidentally naming proprietary code or business logic),
and `deviation_reason` (free-text, same risk). Everything kept is a number, a bounded enum, or a timestamp — no
free-text field survives the export.

**Does the dataset contain data that might be considered confidential, or offensive/threatening/anxiety-inducing?**
Not by design — see Anonymization. `model` names and cost/token counts describe infrastructure usage, not people;
no personal data about the operator or any third party is collected by the underlying telemetry store at all
(nothing in `metrics` references a name, email, or account).

## Collection process

**How was the data associated with each instance acquired?**
Mechanically, by AUTOPILOT's own harness at the end of every firing (`packages/store/src/mutate.ts`'s
`recordFiring`): some fields are self-reported by the firing agent (cost, tokens, turns, its own outcome tag) and
some are independently verified by the harness against git (`head_advanced`, `sha_verified` — PATTERNS-AND-STANDARDS
§7's "un-fakeable ground truth" checks). PAPER.md §6 (Threats to Validity) discusses which fields fall in which
category and why that distinction matters for any claim built on this dataset.

**What mechanisms were used to collect the data?**
None specific to this export — it reads the existing store via `packages/store`'s `openStore`/`listProjects`, the
same read path `pnpm self-study:update` uses to regenerate PAPER.md §4.

**Over what timeframe was the data collected?**
From the first recorded firing in the store's history through the moment `pnpm self-study:export` is run — an
open-ended, continuously-growing window, not a fixed collection period.

## Preprocessing, cleaning, and labeling

**Was any preprocessing/cleaning/labeling of the data done?**
Only the anonymization described above (column removal + `row_id` substitution) and chronological ordering. No
values are imputed, corrected, or reclassified — a `null` in the source (e.g. `test_first` for a non-`fix` firing)
is exported as `null`/empty, never coerced to a default, matching the store's own "null is not zero" discipline
(`packages/store/src/schema.ts`'s migration comments document this per-column).

**Is the software used to preprocess/clean/label the instances available?**
Yes — `scripts/self-study/export-dataset.mjs`, in this repository, MIT/Apache-2.0-licensed with the rest of the
codebase (see `LICENSE`).

## Uses

**Has the dataset been used for any tasks already?**
Not yet as a standalone export; the same underlying rows (unanonymized, in place) feed the aggregate tables in
PAPER.md §4.

**What (other) tasks could the dataset be used for?**
Ship-rate and cost/turns trend analysis over time or prompt-version era (RQ1/RQ3); comparing outcomes across `kind`
or `gate_result` categories; studying the relationship between self-reported and ground-truth-verified fields
(e.g. does `self_reported` shipped ever disagree with `head_advanced`/`sha_verified`?) as a case study in verifying
agent self-reports generally.

**Is there anything about the composition of the dataset or the way it was collected that might impact future
uses?**
Single-subject, single-repository (AUTOPILOT flying itself) — see PAPER.md §6's external-validity caveats before
generalizing any finding to other agents, repositories, or task distributions. Firing volume and prompt-version mix
both grow over time, so an export taken early in the project's history is a very different sample than one taken
later; always record the export date alongside any published analysis.

**Are there tasks for which the dataset should not be used?**
Re-identifying the private repository or any individual commit — the anonymization above is designed to make that
infeasible from this export alone, and combining it with other AUTOPILOT-published artifacts to attempt
re-identification would defeat the purpose of anonymizing it.

## Distribution

**Will the dataset be distributed to third parties?**
At the operator's discretion. The export itself writes only to the local, git-ignored
`docs/SELF-STUDY/dataset/` directory (see `.gitignore`) — publishing it anywhere is a deliberate, separate action,
the same pattern `docs/SELF-STUDY/eval-suite.json` (`pnpm self-study:pin`) already uses for a different derived
artifact.

**How will the dataset be distributed?**
Not fixed by this tooling — CSV (`firings.csv`) and JSON Lines (`firings.jsonl`) are both written so the operator
can choose whichever suits the target venue (e.g. a dataset repository, a supplementary-materials upload).

**Will the dataset be updated?**
Each run of `pnpm self-study:export` regenerates both files from the current store — there is no versioning of past
exports built into the script; an operator who wants a stable historical snapshot should copy or tag the output
before running it again.

## Maintenance

**Who will be supporting/hosting/maintaining the dataset?**
The AUTOPILOT project (this repository); the export script is maintained the same way as any other
`scripts/self-study/*.mjs` tool.

**How can others contribute?**
Via this repository's normal contribution path — the export script, this datasheet, and the schema it reads from
(`packages/store/src/schema.ts`) are all version-controlled here.
