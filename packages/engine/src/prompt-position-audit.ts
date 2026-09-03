// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Prompt position audit (RESEARCH-LIBRARY "COGNITIVE DEFENSES" gap,
 * web-mssn107s-qh8d95 — lost-in-the-middle: arXiv 2606.29718 and Chroma's
 * 18-model context-rot study both find attention degrades hardest for
 * content buried in the MIDDLE of a long context, while recency and
 * primacy both fare better). `prompt.ts`'s `buildFiringPrompt` already
 * places its two non-negotiable sections (Containment, Hard rules) near
 * the tail deliberately, but nothing enforced that placement — a future
 * section spliced in AFTER either one would silently push it back toward
 * the middle without any test failing, since `prompt.test.ts`'s
 * pinned-output tests only assert exact line arrays for FIXED inputs, not
 * relative position as the prompt grows. This is that regression guard.
 */

export interface PromptPositionAuditResult {
  readonly marker: string;
  readonly found: boolean;
  /** The marker's start offset as a fraction of total prompt length: 0 is
   *  the very start, 1 is the very end. */
  readonly positionFraction: number;
  readonly passes: boolean;
}

/** A critical rule marker must start at or after this fraction of the
 *  prompt's length — the last quarter — to count as tail-positioned. */
export const CRITICAL_TAIL_FRACTION = 0.75;

/** `buildFiringPrompt`'s own non-negotiable section headers, in the order
 *  they currently appear. A change that adds a new section after either of
 *  these without deliberately re-checking placement is exactly the drift
 *  this guard exists to catch. */
export const CRITICAL_RULE_MARKERS = [
  '## Containment (absolute — leaving the target is a CRITICAL failure)',
  '## Hard rules (non-negotiable)',
] as const;

/**
 * Locates each marker in `prompt` and checks it starts within the last
 * {@link CRITICAL_TAIL_FRACTION} of the text. A marker missing from the
 * prompt entirely is reported not-found and fails the audit — silently
 * dropping a critical section is strictly worse than merely misplacing it,
 * so this never treats "absent" as a pass.
 */
export function auditPromptPosition(
  prompt: string,
  markers: readonly string[] = CRITICAL_RULE_MARKERS,
): readonly PromptPositionAuditResult[] {
  const total = prompt.length;
  return markers.map((marker) => {
    const idx = total === 0 ? -1 : prompt.indexOf(marker);
    if (idx === -1) {
      return { marker, found: false, positionFraction: 0, passes: false };
    }
    const positionFraction = idx / total;
    return {
      marker,
      found: true,
      positionFraction,
      passes: positionFraction >= CRITICAL_TAIL_FRACTION,
    };
  });
}
