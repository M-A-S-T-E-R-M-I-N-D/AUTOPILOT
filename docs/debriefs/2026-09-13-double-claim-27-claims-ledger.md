<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: #27 claimed twice — the claims ledger

**What happened.** On 2026-09-11 an outside contributor claimed pool issue #27 from
their pool client. The client ran `gh issue edit --add-assignee` first and the claim
comment second; GitHub refuses to assign someone with no footprint on the issue, so
the assign failed silently and only the comment landed. On 2026-09-12 the maintainer
claimed the same issue from their dashboard. The pool read `assignees` alone, saw
none, called the issue free, and let the second claim through with no warning. The
stale-claim reaper read assignees too, so the first claim could never have been
released either.

**Why it mattered.** A contributor who claims in good faith must never be walked
over without a word, and a maintainer must never be able to do it unknowingly. Both
happened, and the dashboard showed nothing of the first claim.

**Fix (epic 0007, "The claims ledger").** The comment is the claim: a pure ledger
(`flight/claim-ledger.ts`) reads claim comments and assignees together; the claim
comment is posted before the assign; a live claim held by someone else yields a
`contest` decision that the panel shows and the confirm spells out (who holds it,
since when, the 14-quiet-day release, both solutions get compared); stale claims
release inline on the next claim and on their own at every flight end
(`runStaleClaimSweep`, maintainer identity only); a contested task names the holder
it contests.

**Never recur.** `claim-ledger.test.ts` pins the #27 shape (comment-only claim
counts), `pool-client.test.ts` pins comment-before-assign and the contest decision,
`mirror-pass.test.ts` pins one reaper clock per claim, `post-flight-sweeps.test.ts`
pins the flight-end release under role honesty.
