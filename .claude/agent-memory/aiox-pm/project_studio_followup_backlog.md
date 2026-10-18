---
name: project-studio-followup-backlog
description: STUDIO-OBS-F01..F04 backlog items outside wave STUDIO-OBS-SINGLE-PATH; F01-F03 conditionally gated, F04 (artifact HMAC/Vault Transit) pilot-blocking unless named residual at OBS-010
metadata:
  type: project
---

The "Follow-up backlog (not in this wave)" section of docs/stories/STUDIO-OBSERVED/README.md holds four items. All were recorded on 2026-10-13.
- F01: prune or retain the guided stores that OBS-014 AC-3 does not prune. It is not release-blocking unless Security & Compliance require pruning at OBS-010 AC-4 row a.
- F02: unify the governed policy (learning) with TrustedPolicy (replay). @architect rules first. It is provisionally P2 post-release, and it is reclassified to blocking on any of three named triggers.
- F03 (added by @po): governed exact-field reads of non-scalar elements (RS-1). It is evidence-gated by OBS-009 AC-7.
- F04: artifact HMAC via Vault Transit, from architect ruling ar-ac11-and-refusal-codes.json. Unlike the others it is **pilot-blocking by default**. It must land before any deployed observed-replay pilot, unless the OBS-010 security review accepts it as a named residual (OBS-010 AC-4 clarification c). Its entry gate is E1–E4 CONFIRMED.
- E1–E8, the Vault Transit prerequisites (owner Platform/SRE; E4 is shared with the ED-02 owner, PUT Core platform), are nested under ED-02 as `related_external_dependencies` in docs/epics/EPIC-10-EXECUTION.yaml. They are also mirrored in staging-acceptance-register.md §1, but kept out of its front matter so verify-staging-registration.mjs ignores them.

**Why:** these were kept outside wave scope on purpose. F04 was deferred because no environment can exercise real Transit, so implementing it now would give a fake production claim.
**How to apply:** do not fold these into wave stories. Before pilot or release planning, check the E1–E4 status and the OBS-010 compliance outcome. Never write "artifact integrity enabled" for any deployed environment until E1–E4 are confirmed. If you add top-level ED ids, re-run the guard script. [[project-secrets-disclaimer-policy]]
