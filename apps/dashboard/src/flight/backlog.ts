// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic backstop for the C2 backlog item ("proposals dedupe against
 * board AND backlog", `docs/BACKLOG-999.md` §L): the firing prompt ASKS the
 * model to dedupe every proposal against docs/BACKLOG-999.md, but a prompt
 * instruction is not enforcement — a model that ignores it (or re-mines the
 * same line under slightly different wording) can propose the same backlog
 * item every flight forever. Parsing the file's own bullet text into a title
 * list lets fly.ts's harvestProposals reject a VERBATIM repeat the same way
 * it already rejects a title that duplicates an existing board task.
 */

// `+` (vs. a single `\s`) and the trailing `$` are both redundant here: any
// extra leading whitespace the `+` would additionally consume ends up at the
// front of the capture instead, and `.trim()` below strips it either way;
// `$` is a no-op since `content.split(/\r?\n/)` already guarantees `line`
// has no embedded newline for `(.+)` to stop short of. Both are omitted so
// there's no unkillable (equivalent) mutant on this line.
const BACKLOG_ITEM_RE = /^-\s\[[ x~]\]\s(.+)/;

/**
 * Extract every bullet item's text from a BACKLOG-999.md-shaped markdown
 * document — one entry per `- [ ]` / `- [~]` / `- [x]` line. Continuation
 * text that wraps onto the next line without its own checkbox marker is not
 * appended; the checkbox line alone already carries enough signal for
 * exact-title dedup. Headings, blank lines, and prose outside a checkbox
 * item are ignored. Never throws — an unreadable/malformed doc just yields
 * fewer (or zero) titles.
 */
export function parseBacklogTitles(content: string): readonly string[] {
  const titles: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = BACKLOG_ITEM_RE.exec(line);
    if (match?.[1]) titles.push(match[1].trim());
  }
  return titles;
}
