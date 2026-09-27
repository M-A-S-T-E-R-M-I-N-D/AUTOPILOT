<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing CLOSED-TASK AUDIT `closedaudit-web-mtd1wyte-ssntzi`: D1 TAB-STOP ROVING is still live, and the tab stops it cut stay cut

Board: `CLOSED-TASK AUDIT: "web-mtd1wyte-ssntzi" claimed done but its DELIVERABLE clause no longer
checks out — re-verify: D1 TAB-STOP ROVING (epic 0015, MEASURED 08-28: 25.0 stops/flight-log row,
8.0/lane — …`. The title predates bdcfd726, so its `DELIVERABLE:` clause sits past the board's
200-char cut and never reached this firing. The same thing happened to
`closedaudit-web-mss50iak-g176g8`, whose processing is recorded in
[2026-09-26-closedaudit-web-mss50iak-g176g8-deliverable-confirmed.md](2026-09-26-closedaudit-web-mss50iak-g176g8-deliverable-confirmed.md).
This debrief does not guess at the hidden words. It checks the two things the visible title does
state: that the roving-tabindex work exists, and that the measured tab-stop counts went down.

## What a "deliverable-drift" finding claims

`auditClosedTaskDeliverable` (`apps/dashboard/src/flight/closed-task-audit.ts`) reports drift only
when every keyword of the clause (4+ characters, not a stopword) is missing from HEAD according to
`git grep --ignore-case --fixed-strings`. So the finding says the clause shares no vocabulary at all
with the current tree.

## Evidence, measured at 211641d6

1. **The vocabulary is everywhere.** Running the audit's own lookup (`git grep -i -F -l <word> HEAD`,
   exit 0 each time) finds `roving` in 146 tracked files, `tabindex` in 135, `tab-stop` in 80,
   `flight-log` in 87, `lane` in 288, and the task id `web-mtd1wyte-ssntzi` itself in 45 (source
   comments in `web/shell.ts` and `web/features/*.ts`, plus the tests below).
2. **The behaviour is tested and passing.** All 18 `apps/dashboard/test/web/*roving-tabindex*.test.ts`
   files pass: 71 tests in 31 s under `vitest run`. They cover flight-log rows, live-worker lane
   chips, fleet-card meta chips, stat tiles, task rows, the gauge, the LANDING panel, the flight map,
   the Docs chart, Ask activity chips, search hits, coordination lines, publicity, and the KEEPER
   panels. Each one asserts a single Tab stop per group, with ArrowLeft/ArrowRight/Home/End moving the
   roving stop and mouse or programmatic focus carrying it along.
3. **The measurement still shows the improvement.** The task's own instrument is
   `scripts/cockpit-metrics.mjs`, whose tab-stop axes gave the 08-28 figures in its title. Its
   tab-axis code (`measureTabStops`/`measureTabAxis` and the row/task/lane fixtures) was re-run
   unchanged against today's built bundle, leaving out the Chromium and axe passes to save machine
   time:

   | axis | 08-28 (COCKPIT-BASELINE.md) | 09-03 (COCKPIT-BASELINE.md) | 2026-09-27 (this firing) |
   | --- | --- | --- | --- |
   | row (fleet cards, 1 → 8) | 23.0 stops/unit | 23.0 | **15.0** (132 → 237) |
   | task (task board, 1 → 20) | 4.4 | 4.4 | 4.6 (187 → 274) |
   | lane (live-workers strip, 1 → 8) | 7.0 | 3.0 | **3.0** (146 → 167) |

   `docs/COCKPIT-BASELINE.md` gives the 08-28 row figure as 23.0. The title's "25.0" comes from
   the task's own measurement before its first slices landed. Either way, the row cost per added card
   has fallen by more than a third since the last recorded run. The lane figure is holding at
   3.0, less than half the baseline. The task axis moved up slightly (+0.2 stops per task). That is
   a separate question about new task-row controls, not drift in the roving work.

## Why the finding fired

c6e65a2b found the cause. `GitVcs.containsText` treated any non-zero `git grep` exit as "absent",
including exit 128, which means git could not search at all. One failed lookup per keyword was
enough to flag every recently closed task that carries a clause. That commit's own message names
this task and `web-mss50iak-g176g8` as fitting that shape. Now a failed lookup throws, and the
sweep skips instead of filing a finding. The stale-audit prune in `runClosedTaskAuditSweep` defers
only rows nobody has acted on. This task was approved onto the board, so it needs a firing to
close it. This debrief is that firing's record.

## VERDICT

**Refuted: close `closedaudit-web-mtd1wyte-ssntzi`.** The D1 TAB-STOP ROVING deliverable is
present at HEAD, it is covered by 71 passing keyboard tests, and re-measuring confirms it still
holds the tab-stop reduction it was closed on. Leave `web-mtd1wyte-ssntzi` closed. No code change
is needed.
