// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE MODEL CATALOGUE — what the fleet knows it can fly on.
 *
 * The engine has always passed a bare string (`'fable'`, `'opus'`) to the
 * Claude CLI's `--model`, which resolves an alias to the newest model in
 * that family. That is the right default: a new Fable ships and every
 * firing picks it up with no code change. But it left three things true
 * at once, and the operator caught all three (2026-09-09: "I don't see
 * selectable models like Fable 5.1"):
 *
 *   1. Nothing could LIST what was available, so no UI could offer a
 *      choice.
 *   2. Nothing recorded WHICH version an alias resolved to, so a debrief
 *      could not say what actually flew.
 *   3. Nothing noticed when a new family shipped, so "we track the latest
 *      automatically" was true of versions and false of families.
 *
 * This module is the answer to all three, and its design rule is the
 * important part: **the catalogue describes, it never restricts.** An
 * unknown model string is passed through to the CLI untouched. A pinned
 * ID this file has never heard of still flies. The catalogue exists to
 * make choices VISIBLE and staleness LOUD — never to become the reason a
 * brand-new model cannot be used the day it ships. A registry that gates
 * would turn every model launch into a release blocker for us.
 */

/** How a model is meant to be reached. */
export type ModelSelector =
  /** A family alias the CLI resolves to that family's newest member —
   *  `fable`, `opus`, `sonnet`, `haiku`. Tracks new versions for free. */
  | 'alias'
  /** A full model id pinned to one exact version — reproducible, but
   *  frozen until someone updates it. */
  | 'pinned';

/** One entry in the catalogue. */
export interface CatalogueModel {
  /** What goes on the CLI's `--model`. */
  readonly id: string;
  /** Operator-facing name. */
  readonly label: string;
  readonly selector: ModelSelector;
  /** The family an alias belongs to, or a pinned id resolves into. */
  readonly family: ModelFamily;
  /** One line on when to reach for it — shown in a picker. */
  readonly note: string;
}

/** The model families the fleet flies. Adding one here is what makes a
 *  newly-shipped family visible; {@link UNKNOWN_FAMILY_HINT} explains what
 *  happens until someone does. */
export type ModelFamily = 'fable' | 'opus' | 'sonnet' | 'haiku';

export const MODEL_FAMILIES: readonly ModelFamily[] = ['fable', 'opus', 'sonnet', 'haiku'];

/**
 * The catalogue. Aliases come FIRST in each family on purpose: a picker
 * renders in this order, so the auto-tracking choice is the one an
 * operator lands on first, and the pinned ids sit below as the deliberate
 * "freeze this" option.
 *
 * Pinned ids are the current members as of 2026-09-09. They are allowed to
 * go stale — `docs/MODELS.md` and `ci:model-freshness` exist so that
 * staleness is announced rather than discovered.
 */
export const MODEL_CATALOGUE: readonly CatalogueModel[] = [
  {
    id: 'fable',
    label: 'Fable (latest)',
    selector: 'alias',
    family: 'fable',
    note: 'The default flying model — tracks the newest Fable automatically.',
  },
  {
    id: 'claude-fable-5-1',
    label: 'Fable 5.1',
    selector: 'pinned',
    family: 'fable',
    note: 'Pins today’s Fable exactly — reproducible, but frozen.',
  },
  {
    id: 'opus',
    label: 'Opus (latest)',
    selector: 'alias',
    family: 'opus',
    note: 'Deepest reasoning — the fallback the primary chain escalates to.',
  },
  {
    id: 'claude-opus-5',
    label: 'Opus 5',
    selector: 'pinned',
    family: 'opus',
    note: 'Pins today’s Opus exactly.',
  },
  {
    id: 'sonnet',
    label: 'Sonnet (latest)',
    selector: 'alias',
    family: 'sonnet',
    note: 'Balanced capability and cost.',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    selector: 'pinned',
    family: 'sonnet',
    note: 'Pins today’s Sonnet exactly.',
  },
  {
    id: 'haiku',
    label: 'Haiku (latest)',
    selector: 'alias',
    family: 'haiku',
    note: 'Cheapest tier — mechanical substeps and high-frequency calls.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    selector: 'pinned',
    family: 'haiku',
    note: 'Pins today’s Haiku exactly.',
  },
];

/** What the fleet does with a model string it does not recognize. Stated
 *  as a constant because it is a PROMISE, not an implementation detail:
 *  the day a new family ships, an operator can type its name and fly. */
export const UNKNOWN_FAMILY_HINT =
  'not in the catalogue — passed to the CLI unchanged, so a model newer than this build still flies';

/** The family a model string belongs to, or `null` when this build has
 *  never heard of it. Never throws and never rejects: an unknown string is
 *  a fact to report, not an error to raise. */
export function modelFamilyOf(model: string): ModelFamily | null {
  const trimmed = model.trim().toLowerCase();
  if (trimmed === '') return null;
  const exact = MODEL_CATALOGUE.find((entry) => entry.id.toLowerCase() === trimmed);
  if (exact) return exact.family;
  // A pinned id this build has not seen — `claude-fable-6`, say — still
  // reads its family off the name, so a future version is recognized as
  // Fable even before anyone updates this file.
  return MODEL_FAMILIES.find((family) => trimmed.includes(family)) ?? null;
}

/** A model string as an operator should see it: the catalogue's label when
 *  known, otherwise the raw string plus an honest note that it is
 *  unrecognized but usable. */
export function describeModel(model: string): { label: string; known: boolean; note: string } {
  const entry = MODEL_CATALOGUE.find((e) => e.id.toLowerCase() === model.trim().toLowerCase());
  if (entry) return { label: entry.label, known: true, note: entry.note };
  const family = modelFamilyOf(model);
  return {
    label: model,
    known: false,
    note: family
      ? `A ${family} model ${UNKNOWN_FAMILY_HINT}.`
      : `${UNKNOWN_FAMILY_HINT.charAt(0).toUpperCase()}${UNKNOWN_FAMILY_HINT.slice(1)}.`,
  };
}

/** True when a model string names an alias rather than a pinned version —
 *  i.e. it will follow new releases on its own. A picker uses this to say
 *  which choice keeps tracking and which one freezes. */
export function tracksLatest(model: string): boolean {
  const trimmed = model.trim().toLowerCase();
  return MODEL_FAMILIES.some((family) => family === trimmed);
}
