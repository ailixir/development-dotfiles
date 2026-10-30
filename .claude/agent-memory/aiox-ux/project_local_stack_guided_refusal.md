---
name: local-stack-guided-refusal
description: On the local,dev real stack a freshly created UI test gets guidedStart RUNTIME_INCOMPATIBLE (no guided policy/permit/pin for CSI+env), so runs can't be visually verified without provisioning
metadata:
  type: project
---

Seen on 2026-10-23 during the STUDIO-UNIFY-001 visual review. A new UI test (CSI 178672) had `GET /api/v1/studio/tests/{id}/capabilities`, which returned `guidedStart.available=false, code RUNTIME_INCOMPATIBLE` in all 4 environments. Run Test showed a refusal banner and sent no POST.

**Why:** `StudioCapabilitiesService.guidedStart` requires guided enabled, a `studio_guided_policies` row for (CSI, env), a translation permit and a trusted replay pin. The seed data has none of these for fresh tests.

**How to apply:** before a real-stack visual run of Studio learning/replay, ask the coordinator to provision a guided policy for the test's CSI+env. Otherwise, report the run path as unverifiable early instead of waiting on it. See [[studio-harness-b-ui-constraints]].
