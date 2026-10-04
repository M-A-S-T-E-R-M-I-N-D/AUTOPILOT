<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Closing GitHub `#5`: the static-site sample it asks for shipped 2026-09-07, fifteen days before the issue was ever opened to the fleet

GitHub `#5` ("Add the planned static-site sample (`samples/static-site`)") is
labeled `good first issue`, `agent-ok`, `pool: information`, `priority:
medium` — KEEPER's own 2026-09-22 comment opened it to the fleet after 17
days unclaimed by a human. It names no open board task or `unlanded`/
`touching` entry on any sibling's FLEET digest line this firing, and is not
GitHub `#21` (the other open issue, claimed live by `fleet-4`), so it was
free to pick up. The board's own assigned item (`ap-musvu2gp-1`) is a 🟣
operator-only action re-verified unchanged earlier today
(`docs/debriefs/2026-10-04-verdict-ap-musvu2gp-1-labels-only-resolves-milestone-concern.md`);
this firing's own deeper epic/doctrine sweep (0007, `FAILURE-DOCTRINE.md`,
`MODELS.md`/`ci:model-freshness`, lint, contrast-matrix) found nothing else
both small and unclaimed, which is what led here.

## The ask was already met

`samples/README.md`'s own capability matrix already lists `static-site/` as
**Verified**, and the files are on disk: `samples/static-site/{README.md,
index.html, about.html, style.css}`. `git log` traces them to `00bc8f9a`
("feat(samples): build the missing static-site fixture repo", 2026-09-07) —
an ancestor of this firing's `HEAD`. That commit predates the issue's own
"opened to the fleet" comment (2026-09-22) by fifteen days: KEEPER's
issue-triage ritual dedupes an incoming report against the board and
backlog titles, not against samples already built directly to main, so it
never saw that `#5` had already landed.

## Re-verified this firing, standalone, exactly as the issue's own steps ask

```
cd samples/static-site
npx --yes html-validate "**/*.html"   # exit 0, no findings
npx --yes linkinator . --recurse      # 4/4 links, all 200, all local
```

Both gate commands the capability matrix names run clean with no network
dependency beyond fetching the two npx packages themselves (every checked
link is local). The sample has a real `MISSION.md`-equivalent (`README.md`
states what it demonstrates), one `index.html`, one `style.css`, and a
second page (`about.html`) — matching `calculator/`'s reference shape per
`samples/README.md`'s "Adding a sample" rules, and the matrix row already
reads "present" (Verified) rather than "Planned."

## VERDICT

**Confirmed shipped, close.** Nothing in this repo needs a code change for
`#5` — the fixture, its README, and the capability-matrix row all already
exist and pass. The only remaining gap was bookkeeping: the GitHub issue
itself was never closed because the fix landed as a direct commit, not a PR
with a `Closes #5` trailer for GitHub to act on. Closed via `gh issue close
5` with a one-line comment citing `00bc8f9a` and this debrief (per the
operator's standing GitHub-write budget: one-line closes are fine,
unsolicited progress comments are not).

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file plus the regenerated
`docs/debriefs/README.md` index (`node
scripts/docs/generate-debriefs-index.mjs`) — the only paths staged. Pure
documentation: `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs, so
`typecheck`/`build`/`lint`/`format:check` are structurally unaffected. The
sample's own gate (`html-validate` + `linkinator`) was run standalone this
firing and passed, as shown above; no repo source or test file was touched.

## Deviation note (PICK DISCIPLINE)

No `picked_rank` — this is a free pick with no linked board task. The
board's sole assigned item, `ap-musvu2gp-1`, is 🟣 (operator-only: create a
label on the live repo) and was re-verified unchanged minutes into this
firing (still 404 live) before this pick — repeating that same-day
verification again would have been pure duplicate effort, not a second
unit of value. A broad sweep for other self-initiated work (epic 0007's
remaining open slices, the `FAILURE-DOCTRINE.md` open counters, the model
catalogue/`ci:model-freshness`, lint, the contrast matrix) turned up nothing
else both small enough for one firing and unclaimed by a sibling; this
GitHub issue was the one concrete, verifiable, genuinely-available gap
found.
