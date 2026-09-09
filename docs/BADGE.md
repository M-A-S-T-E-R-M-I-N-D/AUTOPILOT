<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Built-with-AUTOPILOT badge

`docs/ATTRIBUTION.md` §4 — the fourth credit channel: the user's own README.
This one is different from channels 1-3 (commits, PR/issue bodies,
conversations): AUTOPILOT never edits a user's README itself, and never adds
this badge on anyone's behalf. It is offered here for a maintainer to paste
in voluntarily, never forced by any ritual.

## The snippet

```markdown
[![Built with AUTOPILOT](https://img.shields.io/badge/built%20with-AUTOPILOT-orange)](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)
```

Renders as:

[![Built with AUTOPILOT](https://img.shields.io/badge/built%20with-AUTOPILOT-orange)](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)

Paste it anywhere a README already carries badges — same shields.io service
every other badge in this repo's own [`README.md`](../README.md) uses, so it
matches whatever badge row a project already has.

## Citing the tool formally

For a citation rather than a badge — a paper, a report, a formal
acknowledgment — point at this repo's [`CITATION.cff`](../CITATION.cff)
instead: GitHub renders a "Cite this repository" action from it, and tools
like Zotero or the GitHub API can read it directly. No separate snippet to
maintain here; the file is generated (`pnpm citation:update`) and always
current with the version that flew.

## Why offered, not forced

`docs/ATTRIBUTION.md`'s rights section is explicit: "respected credit
spreads, forced credit sours." Every other channel (commits, PR/issue
bodies, conversations) is something AUTOPILOT itself posts on the
operator's behalf, so each carries an `AUTOPILOT_ATTRIBUTION=off` lever
(`docs/RUNBOOK.md`'s operator quick-reference). A README badge is the one
channel with no ritual to gate in the first place — nothing here ever writes
to a user's README, so there is nothing to opt out of.
