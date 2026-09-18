---
name: epic10-evidence-locations
description: Where Epic 10's normative and evidentiary artefacts actually live — including the QA attack ledger, the staging-spike register, and one path spawn briefs have cited that does not exist.
metadata:
  type: reference
---

Epic 10 artefact locations, verified in the worktree on 2026-09-12.

| What | Where |
|---|---|
| Execution manifest (stories, waves, `external_dependencies` ED-01…ED-06, `file_ownership_conflicts`) | `docs/epics/EPIC-10-EXECUTION.yaml` |
| Retired per-story scope/acceptance text | `git show 9425e7e7d:docs/stories/10.studio-execution.epic.md` |
| **Staging spike register — SPK-01…SPK-06**, each with questions, evidence, gates, owner, *Result* line, and the **Closure rule** | `docs/architecture/studio-staging-spikes.md` |
| Spike evidence records | `docs/qa/spikes/SPK-0N/` (only `SPK-01` exists so far) |
| QA gates, incl. **SEC-2's full attack ledger** and **MED-2's thread dump** | `docs/qa/gates/10.NN-<slug>.yml` |

**`docs/epics/EPIC-10-RUN-LOG.md` does not exist** — not in the worktree and not in `git log --all`.
Spawn briefs have cited it as the home of the thirteen-attack SEC-2 ledger. The ledger is actually in
`docs/qa/gates/10.12-chromium-execution-and-native-video.yml` (the `SEC-2` block under
`top_issues_recheck`, plus the narrative in `docs/stories/10.12.story.md` under
*"SEC-2 (new, MEDIUM) — the browser binary, not the launch option"*).

**Why this matters:** the SPK register is the single most under-cited source for wave-6/7/8 stories —
it is what turns each `ED-0N` into a question with an owner and a named evidence file, and four of
its six spikes gate story 10.18 alone. Read it before drafting any story whose criteria are blocked.

**Lettered split stories (10.11c, 10.16a/10.16b, 10.18a/10.18b) do not get their own
`docs/stories/{id}.story.md` file — verified 2026-09-16.** Their record lives inside the pre-split
story's file (e.g. 10.16a's and 10.16b's content — AC-11/AC-12, Dev Agent Record, everything — is
inside `docs/stories/10.16.story.md`, confirmed by `git log` on the split commits, e.g. `a57d4ed17`
"10.16a dev record..." touches only that one file). Before citing a lettered story's AC by number,
check whether a file of that exact name exists (`find docs/stories -iname "10.16a*"` returned nothing);
if not, the content is inside the base id's file and the citation should say so rather than imply a
separate document.

**Closed QA gate reports (`docs/qa/gates/*.yml`) can carry a status-set literal that later drifts from
the document, and this is not a defect — verified 2026-09-16.** E.g.
`docs/qa/gates/10.15-authorized-range-video-download-endpoint.yml:20,128` records `{200,206,404,410,416}`
for `getExecutionVideo`; story 10.31 changes that set and does **not** edit the gate file. `git log`
shows exactly one commit ever touching that file (the gate itself) — there is no precedent in this
epic for retroactively editing a closed gate. **How to apply:** when grepping for "every hand-kept copy
of a status set" before a contract amendment, a hit inside `docs/qa/gates/` is a point-in-time audit
record to report and exclude, not a guard to update.

See [[epic10-open-escalations]] and [[normative-sources-outrank-brief]].
