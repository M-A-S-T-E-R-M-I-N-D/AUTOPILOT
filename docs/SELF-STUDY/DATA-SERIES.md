# Data series — the AUTOPILOT self-study (machine appendix)

> The exact per-day / per-era / per-firing rollup values behind `PAPER.md` §4's tables and charts,
> regenerated wholesale by `pnpm self-study:update` (and automatically at flight-end). Never hand-edit
> between the markers. Split out of the paper on 2026-09-05 — 798 lines of JSON were 62% of the
> document; analysis reads better with the raw values one click away.

<!-- DATA:SERIES:START -->
_Generated 2026-09-05T05:21:49.261Z by `pnpm self-study:update` — the chart data plane behind §4 (backlog web-msnsgcvf-zgmo7i). Per-firing rows (oldest first), per-day aggregates, and per-era (`Firing-Prompt-Version`) comparison, derived from the same telemetry the tables above summarize. Machine-readable, not meant for hand-reading; never hand-edit._

```json
{
  "generatedAt": "2026-09-05T05:21:49.261Z",
  "project": "autopilot",
  "perFiring": [
    {
      "firingId": "fly-autopilot--fleet-6:firing-6",
      "day": "2026-09-03",
      "sha": "2c59a3bf",
      "kind": "docs",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.8442632000000003,
      "turns": 57
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-5",
      "day": "2026-09-03",
      "sha": "3769986",
      "kind": "docs",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.8524426000000005,
      "turns": 53
    },
    {
      "firingId": "fly-autopilot:firing-1",
      "day": "2026-09-03",
      "sha": "8128058e",
      "kind": "fix",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.7098305,
      "turns": 31
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-4",
      "day": "2026-09-03",
      "sha": "d249c769",
      "kind": "feat",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.5995666,
      "turns": 70
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-2",
      "day": "2026-09-03",
      "sha": "a5aafe7a",
      "kind": "feat",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 3.2938346000000007,
      "turns": 81
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-8",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.7053774,
      "turns": 34
    },
    {
      "firingId": "fly-autopilot--fleet-6:firing-7",
      "day": "2026-09-03",
      "sha": "559f939e",
      "kind": "docs",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.1352576000000005,
      "turns": 28
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-3",
      "day": "2026-09-03",
      "sha": "d144b9af",
      "kind": "fix",
      "shipped": false,
      "completion": "complete",
      "outcome": "reverted",
      "promptVersion": "firing-v12",
      "costUsd": 5.2239922,
      "turns": 116
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-11",
      "day": "2026-09-03",
      "sha": "79a70945",
      "kind": null,
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 0.8258734000000002,
      "turns": 25
    },
    {
      "firingId": "fly-autopilot:firing-9",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.9554745999999992,
      "turns": 45
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-10",
      "day": "2026-09-03",
      "sha": null,
      "kind": "fix",
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.6980878000000001,
      "turns": 45
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-12",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": "complete",
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.4739886,
      "turns": 50
    },
    {
      "firingId": "fly-autopilot--fleet-6:firing-13",
      "day": "2026-09-03",
      "sha": null,
      "kind": "fix",
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.3352718000000003,
      "turns": 44
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-15",
      "day": "2026-09-03",
      "sha": "90bc1bbe",
      "kind": "fix",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.017718,
      "turns": 27
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-14",
      "day": "2026-09-03",
      "sha": "90bc1bbe",
      "kind": null,
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 0,
      "turns": 115
    },
    {
      "firingId": "fly-autopilot:firing-16",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.4075964000000003,
      "turns": 35
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-18",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": "complete",
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.3239785999999996,
      "turns": 40
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-17",
      "day": "2026-09-03",
      "sha": "8aa620bb",
      "kind": "feat",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.5358318000000004,
      "turns": 51
    },
    {
      "firingId": "fly-autopilot--fleet-6:firing-19",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "reverted",
      "promptVersion": "firing-v12",
      "costUsd": 0.9716478000000001,
      "turns": 27
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-20",
      "day": "2026-09-03",
      "sha": "4251df6c",
      "kind": "fix",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.4540806,
      "turns": 42
    },
    {
      "firingId": "fly-autopilot:firing-22",
      "day": "2026-09-03",
      "sha": null,
      "kind": "feat",
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.6539424,
      "turns": 34
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-23",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": "complete",
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.5012198,
      "turns": 38
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-21",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 2.0552879999999996,
      "turns": 50
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-24",
      "day": "2026-09-03",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 2.4654065999999997,
      "turns": 62
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-26",
      "day": "2026-09-04",
      "sha": "0465c35b",
      "kind": "fix",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.8425346,
      "turns": 76
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-29",
      "day": "2026-09-04",
      "sha": "18d8d6d4",
      "kind": "feat",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.769516800000001,
      "turns": 81
    },
    {
      "firingId": "fly-autopilot:firing-25",
      "day": "2026-09-04",
      "sha": "b2425622",
      "kind": "refactor",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.8224438000000003,
      "turns": 51
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-27",
      "day": "2026-09-04",
      "sha": "4628793a",
      "kind": "fix",
      "shipped": true,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.5731904000000005,
      "turns": 45
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-31",
      "day": "2026-09-04",
      "sha": "4628793a",
      "kind": "fix",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 0.5012782,
      "turns": 18
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-28",
      "day": "2026-09-04",
      "sha": "b2425622",
      "kind": "fix",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.4091072000000002,
      "turns": 82
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-35",
      "day": "2026-09-04",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": "complete",
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.0182072000000004,
      "turns": 32
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-30",
      "day": "2026-09-04",
      "sha": "04aff56a",
      "kind": "docs",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.4903706000000003,
      "turns": 36
    },
    {
      "firingId": "fly-autopilot:firing-32",
      "day": "2026-09-04",
      "sha": "d968fc6a",
      "kind": "docs",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.9966068000000001,
      "turns": 46
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-36",
      "day": "2026-09-04",
      "sha": "0a6bce47",
      "kind": "docs",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.1039823999999998,
      "turns": 31
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-37",
      "day": "2026-09-04",
      "sha": "10eb6593",
      "kind": "feat",
      "shipped": true,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.1832258000000002,
      "turns": 31
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-34",
      "day": "2026-09-04",
      "sha": "73923f1b",
      "kind": "fix",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 3.769418500000001,
      "turns": 85
    },
    {
      "firingId": "fly-autopilot--fleet-4:firing-39",
      "day": "2026-09-04",
      "sha": "ca30803d",
      "kind": "docs",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.9900358999999992,
      "turns": 50
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-33",
      "day": "2026-09-04",
      "sha": "b2319e2e",
      "kind": "test",
      "shipped": true,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 5.266004399999999,
      "turns": 101
    },
    {
      "firingId": "fly-autopilot--fleet-5:firing-41",
      "day": "2026-09-04",
      "sha": "d370c8d0",
      "kind": "docs",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 0.8898712000000002,
      "turns": 26
    },
    {
      "firingId": "fly-autopilot:firing-38",
      "day": "2026-09-04",
      "sha": "f71fb4dd",
      "kind": "refactor",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 3.6248963999999995,
      "turns": 79
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-40",
      "day": "2026-09-04",
      "sha": "ceef5c28",
      "kind": "fix",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 3.2848877999999995,
      "turns": 77
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-42",
      "day": "2026-09-04",
      "sha": "7fa6f52b",
      "kind": "test",
      "shipped": true,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.7589674,
      "turns": 71
    },
    {
      "firingId": "fly-autopilot:firing-43",
      "day": "2026-09-04",
      "sha": "876d1f55",
      "kind": "docs",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 1.4894893999999999,
      "turns": 39
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-44",
      "day": "2026-09-04",
      "sha": "f966e48e",
      "kind": "fix",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 7.096565999999999,
      "turns": 44
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-47",
      "day": "2026-09-04",
      "sha": "e4fc802b",
      "kind": "fix",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.1386119999999997,
      "turns": 59
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-46",
      "day": "2026-09-04",
      "sha": "53f544d5",
      "kind": "feat",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 8.614796499999999,
      "turns": 55
    },
    {
      "firingId": "fly-autopilot:firing-45",
      "day": "2026-09-04",
      "sha": "29c4edfa",
      "kind": "fix",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 5.0568534000000005,
      "turns": 147
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-49",
      "day": "2026-09-04",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.1013176,
      "turns": 32
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-48",
      "day": "2026-09-04",
      "sha": "92074488",
      "kind": "docs",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.3379007999999994,
      "turns": 68
    },
    {
      "firingId": "fly-autopilot:firing-50",
      "day": "2026-09-04",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 2.7807646000000004,
      "turns": 61
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-51",
      "day": "2026-09-04",
      "sha": "ce651fb8",
      "kind": "fix",
      "shipped": false,
      "completion": "slice",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 3.3150745999999987,
      "turns": 89
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-52",
      "day": "2026-09-04",
      "sha": "c67e1fae",
      "kind": "feat",
      "shipped": false,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 3.6809282,
      "turns": 87
    },
    {
      "firingId": "fly-autopilot:firing-53",
      "day": "2026-09-04",
      "sha": null,
      "kind": null,
      "shipped": false,
      "completion": "complete",
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.0187796,
      "turns": 22
    },
    {
      "firingId": "fly-autopilot--fleet-2:firing-55",
      "day": "2026-09-04",
      "sha": null,
      "kind": "docs",
      "shipped": false,
      "completion": null,
      "outcome": "noop",
      "promptVersion": "firing-v12",
      "costUsd": 1.2047515999999996,
      "turns": 32
    },
    {
      "firingId": "fly-autopilot--fleet-3:firing-54",
      "day": "2026-09-04",
      "sha": "91f869cf",
      "kind": "docs",
      "shipped": true,
      "completion": "complete",
      "outcome": "shipped",
      "promptVersion": "firing-v12",
      "costUsd": 2.0001373,
      "turns": 30
    },
    {
      "firingId": "fly-autopilot:firing-56",
      "day": "2026-09-04",
      "sha": "f7fb3482",
      "kind": "feat",
      "shipped": false,
      "completion": "complete",
      "outcome": "reverted",
      "promptVersion": "firing-v12",
      "costUsd": 1.9047342,
      "turns": 59
    }
  ],
  "perDay": [
    {
      "day": "2026-09-03",
      "firings": 24,
      "shipped": 3,
      "costUsd": 43.04,
      "turns": 1200,
      "rollingShipRate": 0.125
    },
    {
      "day": "2026-09-04",
      "firings": 32,
      "shipped": 10,
      "costUsd": 86.0353,
      "turns": 1842,
      "rollingShipRate": 0.2321
    }
  ],
  "perEra": [
    {
      "promptVersion": "firing-v12",
      "firings": 56,
      "shipped": 13,
      "passRate": 0.2321,
      "medianTurns": 48,
      "costVariance": 2.3213723569406697,
      "costPerSolved": 9.928863238461535
    }
  ],
  "turnsHistogram": [
    {
      "bucketStart": 10,
      "firings": 1,
      "shipped": 1,
      "bucketLabel": "10-19"
    },
    {
      "bucketStart": 20,
      "firings": 6,
      "shipped": 2,
      "bucketLabel": "20-29"
    },
    {
      "bucketStart": 30,
      "firings": 13,
      "shipped": 4,
      "bucketLabel": "30-39"
    },
    {
      "bucketStart": 40,
      "firings": 8,
      "shipped": 2,
      "bucketLabel": "40-49"
    },
    {
      "bucketStart": 50,
      "firings": 10,
      "shipped": 0,
      "bucketLabel": "50-59"
    },
    {
      "bucketStart": 60,
      "firings": 3,
      "shipped": 1,
      "bucketLabel": "60-69"
    },
    {
      "bucketStart": 70,
      "firings": 5,
      "shipped": 1,
      "bucketLabel": "70-79"
    },
    {
      "bucketStart": 80,
      "firings": 6,
      "shipped": 1,
      "bucketLabel": "80-89"
    },
    {
      "bucketStart": 90,
      "firings": 0,
      "shipped": 0,
      "bucketLabel": "90-99"
    },
    {
      "bucketStart": 100,
      "firings": 1,
      "shipped": 1,
      "bucketLabel": "100-109"
    },
    {
      "bucketStart": 110,
      "firings": 2,
      "shipped": 0,
      "bucketLabel": "110-119"
    },
    {
      "bucketStart": 120,
      "firings": 0,
      "shipped": 0,
      "bucketLabel": "120-129"
    },
    {
      "bucketStart": 130,
      "firings": 0,
      "shipped": 0,
      "bucketLabel": "130-139"
    },
    {
      "bucketStart": 140,
      "firings": 1,
      "shipped": 0,
      "bucketLabel": "140-149"
    }
  ]
}
```
<!-- DATA:SERIES:END -->
