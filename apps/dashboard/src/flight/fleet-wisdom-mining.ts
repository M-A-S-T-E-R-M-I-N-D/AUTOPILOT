// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET WISDOM (M7 companion, board web-msnt26xe-pc4pzp): the first slice of
 * "learnings that generalize graduate from per-project SOUL to a shared
 * fleet layer". `soul-mining.ts` already mines ONE learning — the recurring
 * checkpoint-streak note — into a single project's SOUL. This module answers
 * the fleet-level follow-up: once that SAME learning has independently
 * recurred across enough DISTINCT projects, it stops being one project's
 * idiosyncrasy and becomes fleet-wide wisdom worth proposing to every
 * project, not just the ones that rediscovered it.
 *
 * Generalization is a MARKER REGISTRY, not a similarity engine (epic
 * `docs/epics/0014-fleet-wisdom-generalization.md`): every machine-mined
 * SOUL note carries a stable `## Learned: …` marker written by its
 * project-level miner, so "the same learning across projects" is an exact
 * marker match — {@link LEARNING_KINDS} holds one `{ marker, fleetTemplate }`
 * entry per known learning. Adding a learning kind is adding a registry
 * entry; storage, routes, and the compose seam never change.
 *
 * CONFIDENTIALITY BOUNDARY: the mined text is a fixed, pre-authored template
 * that never interpolates any project-identifying data (slug, name, root
 * path, or verbatim SOUL content) — only the count of projects that
 * confirmed it. One project's specifics can never leak into the shared
 * layer through this function, by construction rather than by a redaction
 * pass that could miss a case.
 */

import {
  CHECKPOINT_SOUL_AMENDMENT_MARKER,
  NOOP_SOUL_AMENDMENT_MARKER,
  stripMarkedSection,
} from './soul-mining.js';

/** How many DISTINCT projects must independently carry the same learning
 *  before it is proposed fleet-wide — one or two projects could be
 *  coincidence or a project-specific quirk; three is a pattern. */
export const FLEET_WISDOM_GENERALIZATION_THRESHOLD = 3;

/** One graduatable learning: the stable `## Learned: …` heading its
 *  project-level miner stamps, and the fixed fleet-wide note to propose once
 *  enough projects carry it. The template interpolates ONLY the confirming
 *  count — never slug, name, root path, or verbatim SOUL content (the
 *  confidentiality boundary above, held by construction). */
export interface FleetLearningKind {
  readonly marker: string;
  readonly fleetTemplate: (confirmingCount: number) => string;
}

/** Every learning the fleet layer knows how to graduate, in priority order:
 *  with a single pending-proposal slot, mining proposes the FIRST entry that
 *  qualifies and the rest wait for the sweep after the operator acts. */
export const LEARNING_KINDS: readonly FleetLearningKind[] = [
  {
    marker: CHECKPOINT_SOUL_AMENDMENT_MARKER,
    fleetTemplate: (confirmingCount) =>
      `${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n` +
      `- Confirmed independently across ${confirmingCount} projects: a streak of firings ` +
      `that each hit the turn cap mid-unit (checkpoint-and-resume) means the unit was sized too ` +
      `large. Size the next unit smaller than instinct suggests: commit the first ` +
      `safely-verifiable slice well before the cap, instead of chasing the whole task in one ` +
      `firing.\n`,
  },
  {
    marker: NOOP_SOUL_AMENDMENT_MARKER,
    fleetTemplate: (confirmingCount) =>
      `${NOOP_SOUL_AMENDMENT_MARKER}\n` +
      `- Confirmed independently across ${confirmingCount} projects: a streak of firings ` +
      `that each ended with no commit (gate_result: no-commit) means the board is stale or ` +
      `scoped away from the project. Spend such firings on VERDICT proposals ` +
      `(split/close/deprioritize/blocked) so the operator can unblock or retire the work, ` +
      `instead of re-scanning the same ground.\n`,
  },
];

/** `## Learned: <name>` — the shared heading prefix every registered marker
 *  uses (pinned by the registry-shape test); the human-readable kind name is
 *  the marker minus this prefix. */
const LEARNED_MARKER_PREFIX = /^## Learned:\s*/;

/**
 * Names the learning kind a pending fleet proposal carries (epic 0014 slice
 * 4: "the banner names WHICH learning kind"). A proposal is the full
 * replacement wisdom text, so markers already ratified into the current
 * fleet layer appear in it too — the proposal's OWN kind is the first
 * registry entry present in the proposed text but absent from the current
 * one. Returns null for a proposal with no newly-added registered marker
 * (e.g. hand-authored text), so the banner can fall back to its generic
 * title. The label is derived from the marker itself — a new registry entry
 * names itself, with no per-kind label map to forget.
 */
export function proposedWisdomKindLabel(
  currentWisdom: string,
  proposedWisdom: string,
): string | null {
  const added = LEARNING_KINDS.find(
    (kind) => proposedWisdom.includes(kind.marker) && !currentWisdom.includes(kind.marker),
  );
  return added ? added.marker.replace(LEARNED_MARKER_PREFIX, '') : null;
}

/** The slice of a project this module needs — its SOUL text and a stable
 *  identity for de-duplication. Never read for its content in the output
 *  (see the confidentiality boundary note above). */
export interface ProjectSoulLike {
  readonly slug: string;
  readonly soul: string;
}

export interface FleetWisdomMiningInput {
  readonly projects: readonly ProjectSoulLike[];
  /** The fleet-wide shared text every project's SOUL is layered on top of. */
  readonly fleetWisdom: string;
  /** A pending fleet-level amendment awaiting operator ratify/dismiss, if any. */
  readonly fleetWisdomProposed: string | null;
}

/**
 * Decides whether any registered learning has generalized across the fleet
 * and, if so, returns the full proposed replacement fleet-wisdom text (never
 * a diff — same whole-text-replace contract as `mineSoulAmendment`). Walks
 * {@link LEARNING_KINDS} in priority order and proposes the FIRST kind that
 * qualifies. Returns `null` when: a fleet-level proposal is already pending
 * (never overwrite an unreviewed one), or no kind both is absent from the
 * fleet layer and has at least
 * {@link FLEET_WISDOM_GENERALIZATION_THRESHOLD} distinct confirming
 * projects.
 */
export function mineFleetWisdom(input: FleetWisdomMiningInput): string | null {
  if (input.fleetWisdomProposed !== null) return null;

  for (const kind of LEARNING_KINDS) {
    if (input.fleetWisdom.includes(kind.marker)) continue;

    const confirmingSlugs = new Set(
      input.projects.filter((p) => p.soul.includes(kind.marker)).map((p) => p.slug),
    );
    if (confirmingSlugs.size < FLEET_WISDOM_GENERALIZATION_THRESHOLD) continue;

    const existing = input.fleetWisdom.trim();
    const prefix = existing.length > 0 ? `${existing}\n\n` : '';
    return prefix + kind.fleetTemplate(confirmingSlugs.size);
  }
  return null;
}

/** Heading the composed firing prompt renders ratified fleet wisdom under —
 *  a `#`-level sibling of the SOUL's own `# SOUL — <name>` heading, so the
 *  wisdom's `## `-level notes nest as its children. */
export const FLEET_WISDOM_PROMPT_HEADER = '# FLEET WISDOM (shared across all projects)';

/**
 * The CONSUMPTION side of fleet wisdom: mining/propose/ratify above fill the
 * `fleet.wisdom` slot, and this layers that ratified shared text into a
 * project's firing prompt — the "every project's SOUL is layered on top of
 * the fleet-wide shared text" promise in {@link FleetWisdomMiningInput}.
 * Pure (same seam as {@link mineFleetWisdom}) so the prompt-assembly call
 * site is a one-line wire-up.
 *
 * "Layered on top" is literal: for every registered learning kind whose
 * marked note the project's SOUL already carries, the fleet copy of that
 * note is stripped before rendering — the project-local copy is more
 * specific ("the LAST N firings HERE") and duplicating the same lesson twice
 * in one prompt is noise. When nothing of the fleet layer survives (or it
 * was empty), the SOUL is returned unchanged.
 */
export function composeSoulWithFleetWisdom(soul: string, fleetWisdom: string): string {
  const deduped = LEARNING_KINDS.reduce(
    (wisdom, kind) =>
      soul.includes(kind.marker) ? stripMarkedSection(wisdom, kind.marker) : wisdom,
    fleetWisdom,
  );
  const shared = deduped.trim();
  if (shared.length === 0) return soul;
  const sharedBlock = `${FLEET_WISDOM_PROMPT_HEADER}\n\n${shared}\n`;
  const base = soul.trimEnd();
  return base.length > 0 ? `${base}\n\n${sharedBlock}` : sharedBlock;
}
