---
name: governance-overcontrol-inventory
description: 2026-10-24 user approved UI-test governance cleanup (STUDIO-GOV epic) - schedules via shared ScheduleService, service principal, no governed policy, origins = test URLs + runner deny list, test-scoped secrets
metadata:
  type: project
---

On 2026-10-24 the user approved removing the UI test approval gates. This supersedes the same-day "keep guided policy, widen allowlist" decision ([[decision-guided-policy-keep-origin-allowlist]]). That decision lives in the user's global memory.

**User rules (verbatim intent):**
- "When we decide to remove the gate means, remove not add a feature flag."
- "The gate is not the feature itself." Scheduling stays, reusing the ordinary check scheduling flow.
- "The secrets created should only be usable on the same tests they were created."

**Decisions:**
- Delete the Studio scheduler (studio_schedule_* tables, StudioScheduleService/Processor, 8 openapi ops, StudioScheduleDialog).
- UI test schedules are rows in `schedules`, through a new nullable `ui_test_id`, XOR with `check_id`.
- CronDispatcher hands UI_TEST rows to Studio acceptance under one constant service principal.
- G11a/b (revision ack, uncertainty ack, paused-on-create) are removed.
- Governed policy (V19 tables, 5 ops, approver groups) is removed; side-effect stance is removed (behaves as ALLOW).
- Allowed origins are derived from the test's URLs.
- The deny list lives only in the runner and is enforced at connection time, redirects included.
- The secret entitlement map and SecretRevocationSweep are deleted; secrets are test-scoped by the Vault path.
- G10, G12, G13 kept.

**Why:** "too much governance is not good". UI tests are checks, and checks schedule and run on CSI ownership alone.

**How to apply:** do not reintroduce kill switches, approvals or Studio-specific schedule paths. The V21 `studio_015_prefix_confirmation_wait` function depends on the V19 policy tables and the CLARIFY_FIRST stance, so it must be replaced in the same migration that drops them.
