---
name: ar1-obs013-recording-ruling
description: AR-1 (2026-10-13) OBS-013 guided recording: recordEvidence reuse rejected (terminal refusal), V20 immutable fact, DB-clock SQL expiry, VideoEvidence uses `status`
metadata:
  type: project
---

The AR-1 ruling is at docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-1-obs013.json. It overrides s0-plan-refresh in five places:
- **recordEvidence reuse rejected.** Playwright finalizes the webm only at context close, and that happens after stop() has set a terminal state. internal() → active() refuses terminal sessions, and owner() needs a live lease. The new GuidedSessionEvidenceService accepts the callback after terminal using subject + fence equality and a DB-clock window (session expires_at + settle grace). It never mutates the session. Precedent: reconcileLateModelUsage.
- **V20 is an immutable single-insert row.** Stored state is AVAILABLE, FAILED or UNAVAILABLE. PROCESSING and EXPIRED are derived at read time, the same way ExecutionSnapshotMapper does it.
- **Public VideoEvidence field is `status`, not `state`.** manifestRef and keys are never exposed. actionTimings are non-empty only when video is AVAILABLE. maxItems is 400.
- **Guided wire is integer-only** (README raw JSON rule). The runner rounds once. Step items are derived by the backend from action items.
- **Keys are deterministic:** studio/{csiId}/guided/{sessionId}.webm, with a golden vector rather than a runner-context field.

**Why:** the plan was written before tracing the stop → close → upload ordering, and launchGuidedBrowser's closeBrowser deletes the scratch directory, which holds the video.
**How to apply:** for OBS-015 (prefix replay must use the same session clock and fill the reserved kinds) and for OBS-008 (it re-polls the result while the video status is PROCESSING), start from ar-1-obs013.json. Related: [[obs013-014-hidden-overlaps]], [[contract-change-checklist]].
