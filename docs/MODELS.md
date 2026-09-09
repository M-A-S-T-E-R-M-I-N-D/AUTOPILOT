<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Models — what the fleet flies, and how it keeps up

**Operator question, 2026-09-09:** *"I don't see selectable models like
Fable 5.1 — make sure the software is tight and really knows how to use
the new models, and updates them as they ship."*

The honest answer had three parts, and only one of them was a problem.

## We already fly the newest — by design

The engine's defaults are family **aliases**, not pinned versions:

```
primaryModel:  'fable'   →  the newest Fable the CLI knows
fallbackModel: 'opus'    →  the newest Opus
routing.cheapModel: 'haiku'
```

The Claude CLI resolves an alias to that family's current member. So when
Fable 5.1 shipped, every firing picked it up with **no code change and no
release on our side**. That part was already right, and it is why the
answer to "are we on Fable 5.1?" is yes.

## What was missing

| Gap | Consequence |
| --- | --- |
| Nothing could LIST the models | No UI could offer a choice — hence "I don't see selectable models" |
| Nothing recorded which version an alias RESOLVED to | A debrief could not say what actually flew |
| Nothing noticed a whole new FAMILY | Aliases track versions, not families — a new family would be missed forever, silently |

## The catalogue

`packages/engine/src/models.ts` lists every model the fleet knows, each
family offering both:

- an **alias** (`fable`) — keeps tracking new releases on its own
- a **pinned id** (`claude-fable-5-1`) — reproducible, deliberately frozen

The alias is listed first in every family, so a picker lands on the
auto-tracking choice by default.

### The rule that matters

**The catalogue describes; it never restricts.**

An unknown model string is passed to the CLI unchanged. A model newer than
this build still flies the day it ships. `modelFamilyOf('claude-fable-6')`
already answers `fable` — it reads the family off the name, so a future
version is recognised before anyone edits this repo.

A registry that *gated* would turn every model launch into a release
blocker for us. That trade is never worth it.

## Keeping up: `pnpm ci:model-freshness`

Asks the installed CLI what aliases it advertises and compares them to the
catalogue. **Informational by default** — a model launch must never turn
into a red build here. `--strict` makes it fail for a maintainer who wants
the reminder to block.

It is scoped to the CLI's one alias-naming sentence rather than to every
quoted word in its help: the loose first version flagged `'agent'` from an
unrelated flag, and a check that cries wolf gets ignored the day it is
right (FAILURE-DOCTRINE row 6).

When it fires, update `MODEL_CATALOGUE` and this file. Nothing is broken
in the meantime.
