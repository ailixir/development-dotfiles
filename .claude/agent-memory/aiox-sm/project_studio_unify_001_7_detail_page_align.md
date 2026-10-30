---
name: studio-unify-001-7-detail-page-align
description: STUDIO-UNIFY-001.7 (drafted 2026-10-24): UI test detail page drops tabs, mirrors CheckDetailsPage; design defaults and code facts
metadata:
  type: project
---

STUDIO-UNIFY-001.7 drafted 2026-10-24 from user choice "Align to check page" (spec §8 tabs were never compared with CheckDetailsPage). Frontend only, size M, 12 ACs, 6 tasks (7.1 Latest run card, 7.2 Recent Runs card, 7.3 shell/routes/helper removal, 7.4 e2e+docs, 7.5 gate, 7.6 coordinator real-stack check), lanes A (7.1->7.3), B (7.2), C (7.4).

**Why:** user goal is "UI tests are checks"; user insisted on no scope increase and no overengineering.

**How to apply (re-check before reuse):**
- List items of GET /executions are full ExecutionSnapshots (logs, stepResults, video, streamComplete), so Latest run needs no new read: second useStudioRuns size 1; poll while !streamComplete (terminal status can still have PROCESSING video).
- Defaults flagged for @po: grid two-column from `lg` not `md`; System column dropped from RunRow (redundant with header CSI); cards renamed Tab->Card; drawer deep link ui-tests/:id/runs/:executionId kept, bare /runs route and uiTestRunsPath/uiTestDetailTab/useUiTestDetailContext removed (scan S5 symbols only); layout route child `runs/:executionId` with no element, page reads executionId via useParams.
- .6 was Done but uncommitted at draft time (HEAD dc1fbb7d4); files edited by .7 carry its changes.
- Docs lines to change: CLAUDE.md/AGENTS.md L101+L116, PRD.md L113, docs/architecture/studio-execution.md L237. Spec/requirements/stories .2,.5 left as historical.
- Grep tool unavailable in this agent session; use Bash grep with quoted --include globs (zsh errors on unquoted globs).
