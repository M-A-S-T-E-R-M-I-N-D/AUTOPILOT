<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtri8f7a-3`: BACKLOG-999 compression "needs a dedicated slice plan" — confirmed in part, refuted in part

Board: `ap-mtri8f7a-3` (VERDICT split, targeting `web-mtndm5m6-rfly97`) — "BACKLOG-999.md
compression (234→<100 lines, fix scrambled order) is too large for one firing — needs a
dedicated slice plan."

## Verification against current history (`origin/main`)

This worktree was ~185 commits behind `origin/main` fleet-wide, but `docs/BACKLOG-999.md`
and `docs/BACKLOG-999-ARCHIVE.md` specifically were current to within one commit
(`git log origin/main..HEAD -- docs/BACKLOG-999.md docs/BACKLOG-999-ARCHIVE.md` returns
nothing — none of this worktree's 13 unlanded commits touch either file), so both files
were synced to `origin/main`'s tip (`git checkout origin/main -- <path>`) before this
firing's own edit, to avoid clobbering already-landed compaction.

1. **"Fix scrambled order" — already done, before this verdict was likely written.**
   `9518e898 docs(backlog): fix scrambled section order in BACKLOG-999 (A→L)` is already
   in history. The verdict's own premise on this half is stale.

2. **"Too large for one firing" — confirmed, and already being handled without a formal
   plan document.** `f87095f8 docs(backlog): archive Board hygiene's full evidence, compact
   the inline item` moved the single longest `[x]` item (30 lines) to a new
   `docs/BACKLOG-999-ARCHIVE.md`, shrinking the register 254→229 lines, with the commit
   body stating explicitly: "One slice of several needed to clear the <100-line target."
   That is a real, working, repeatable pattern — archive a done item's full narrative
   verbatim, leave a compact pointer inline — established by precedent, not by a written
   plan.

3. **This firing continued that exact pattern as its own slice**, moving the next-longest
   `[x]` item (`apps/dashboard` browser tsconfig — lib/jsdom split, 11 lines) to
   `BACKLOG-999-ARCHIVE.md §K`, leaving a 3-line pointer. `docs/BACKLOG-999.md`:
   229 → 221 lines. Two consecutive firings independently applying the same mechanical
   rule (biggest remaining `[x]` item → archive) is itself the proof that no separate
   coordination artifact is needed for the rest of the compression — the rule *is* the
   plan.

## VERDICT

**Confirmed in part, refuted in part.** The underlying diagnosis — compressing
`docs/BACKLOG-999.md` from 234 to under 100 lines is genuinely too large for one firing —
holds; two firings in, the file is still at 221 lines. But the prescription — that this
needs a *dedicated slice plan* as a separate planning artifact — is refuted by what has
actually happened: the archive-and-compact rule (move a `[x]` item's full narrative to
`BACKLOG-999-ARCHIVE.md`, leave a compact pointer, biggest item first) is already a
self-sufficient, repeatable template that two independent firings have now applied without
any written plan beyond the doc's own standing note (`docs/BACKLOG-999.md` line 6: "this
register is compressed toward a scannable size … the inline line always says so"). Writing
a formal slice-plan document would only restate a rule the doc already states about itself.
`web-mtndm5m6-rfly97` should stay open and keep absorbing one archive-and-compact slice per
firing that picks it up — no new planning task is warranted. Next concrete slices (by
remaining inline-narrative length, all `[x]`, same mechanical pattern): §L **C4**
deterministic diff-size gate (9 lines), §K reuse-lint CI job (8 lines), then the three
7-line items (§K readonly-open-path, §K OpenTelemetry export, §L **A3** three-valued gate
verdict, §L **B5** starter-SOUL curation guard).

## Verification note for this firing's own METRICS

This firing's unit of work is a real content edit to `docs/BACKLOG-999.md` and
`docs/BACKLOG-999-ARCHIVE.md` (both docs, gate-exempt: `docs/` is excluded from
`prettier --check .` via `.prettierignore` and from ESLint's `files` globs, which target
only `*.ts`/`*.mjs`/`*.js`), plus this debrief and `.autopilot-intent` (git-ignored). No
source or test code changed, so `typecheck`/`build`/`test` are structurally unaffected.
