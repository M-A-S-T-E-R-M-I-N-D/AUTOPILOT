// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure lookup for the activity feed's row icons — client-only (no server
 * counterpart), so it lives in `web/` rather than `shared/` (epic 0002 "shell
 * decomposition"). `actIcon()` (the `iconEl()` call `narratorKind()`'s icon
 * needs) stays inline in `fleetJs()`: it's pure DOM wiring with no computable
 * logic left once the kind→icon lookup — {@link actIconName} — moves out here.
 *
 * Epic 0025 law 1: the feed drew a hand-authored 16-unit glyph set beside the
 * vendored one; each kind now names a Lucide icon from `icons.ts`, so the feed
 * shares the icon system's 24-unit grid, stroke and licence. The phase kinds
 * take the live phase pill's shapes (`LIVE_PHASE_ICONS` in `web/shell.ts`).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()`/`JSON.stringify()` — see
 * `fleetJs()` — instead of hand-retyping it, so the two copies can no longer
 * drift apart.
 */

/** The vendored icon each `narratorKind()` draws, so the icon always matches
 *  the sentence next to it. `other` (any tool without a phrase of its own)
 *  keeps the plain dot it drew before. */
export const ACT_ICONS: Readonly<Record<string, string>> = {
  edit: 'pencil',
  read: 'file-text',
  search: 'search',
  gate: 'shield-check',
  commit: 'git-commit-horizontal',
  orient: 'compass',
  command: 'square-terminal',
  other: 'dot',
};

/**
 * Resolves `kind` (`narratorKind()`'s output) to its icon's name, falling
 * back to the `other` dot for any kind without a dedicated icon —
 * `actIcon()`'s one piece of decision logic.
 */
export function actIconName(kind: string): string {
  return ACT_ICONS[kind] ?? ACT_ICONS['other']!;
}
