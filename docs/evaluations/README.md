<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Round evaluations

Every round of the fleet evaluates itself. When the last lane of a round
ends, it reads the round back from the dashboard's store and writes what it
found here, in one file per month (`ROUNDS-YYYY-MM.md`). The file is
committed on the flight branch, so each evaluation lands together with the
work it judges.

## What a round records

- **Outcomes:** how many firings shipped, died or were reverted, broken down
  by the kind of work, the lane and the model that served each firing. A
  firing the account's quota killed before it could work reads as
  `died (quota)`: it counts in the round, but not against its model, and the
  model sections say how many they left out.
- **Cost:** total spend, cost per shipped commit, and median minutes.
- **Convergence:** how the merged head fared after each sync-back, split
  into reds on a lane's own commit, reds on a merge, and gates that gave no
  verdict.
- **Rung 4:** how many conflicting sync-backs the merge-escalation agent
  tried to resolve, how many it resolved, and which step stopped it on the
  rest: the agent itself, a path it left unresolved, the gate or the commit.
- **Parked work:** commits still sitting on a lane branch.
- **The model scoreboard:** for each tier of work, each model's firings,
  ship rate and cost per ship. A tier's leader is the cheapest model whose
  ship rate is credibly within five points of the best: the lower end of a
  95% Wilson interval, so a short lucky run cannot win.

The same numbers are kept as a `round-evaluation` event in the store, and
the dashboard's Benchmark screen draws from the same records.

## Turning it on or off

The written evaluation is off by default, because it commits into the
project's own repository:

```text
dashboard evaluation-docs on    [folder]
dashboard evaluation-docs off   [folder]
dashboard evaluation-docs status [folder]
```

When the project's docs carry a licence header, the evaluation file carries
the same one. If the checkout has uncommitted changes when the round ends,
the lane skips the commit, says so in the flight log, and still records the
event.

## Reading it by hand

The same report is available at any time, for any window:

```text
pnpm dashboard:fleet-report [folder] [days]
```

Earlier evaluations were written by hand, one question at a time. They are
listed in the docs index.
