---
name: replayit-temp-forensics
description: Where ReplayIT failure forensics live (host TEMP obs007-joined-* dirs) and which files reveal first-cause vs masked retries
metadata:
  type: reference
---

ReplayIT (GuidedPublicationReplayIT) keeps per-run forensics in the host TEMP dir named in the failure
message (`logs /var/folders/.../T/obs007-joined-<n>`), one dir per Gradle task/lane. These dirs are not copied
into docs/qa/evidence.

Most useful files:
- `failed-test-state-<invocation>-<ordinal>-enriched.json`: per-session counters, acquisition polls,
  observation coverage, actions and model attempts.
- `failed-test-cleanup-<invocation>.json`: the teardownStatus for each owned session.
- `finalize-exception-<N>.json` (ordered by N/mtime): a stack-frame dump for every guided exception. It shows
  the **first** refusal, before retries mask it. Example: the runner transport replay cache turns a failed
  context delivery into repeated IDENTITY_MISMATCH.
- `owned-generations/generation-<k>/`: archived worker-generation logs and controls.

**Why:** the JUnit XML only has the final assertion. The root cause has usually been in these files
(STUDIO-OBS-015 b2-d3-diagnosis01).

**How to apply:** when diagnosing a ReplayIT failure, list the TEMP dir before theorizing, and check that it still
exists, because the host may purge it.
