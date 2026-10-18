---
name: obs012a-gate-residues
description: OBS-012A architect gate 2026-10-13 — APPROVE-WITH-CONDITIONS; D-A residues placed (legacy /admission → OBS-014, artifact-1 runtime-version stamps → OBS-009); guidedMain C2 proof = backend ITs
metadata:
  type: project
---

OBS-012A gate (2026-10-13): APPROVE-WITH-CONDITIONS. Hard pre-QA condition: runner tiers green on final tree (runner-gates-final).

D-A residues found outside the AC-7 grep scope, assigned (not fixed in 012A):
- Legacy `POST /internal/studio/executions/{id}/admission` (AdmissionCasService.claim) has no runner caller and bypasses observed binding check → **OBS-014 deletes** (route, DTOs, OpenAPI op claimAdmission, pins).
- Runner `versions.ts` ARTIFACT_VERSION=1/validatorSchema 2.0.0/executor 2.1.0 stamped into every run's runtime_versions and the public RuntimeVersions → **OBS-009** fixes (image/build identity).
- Legacy v1 authoring read path (LegacyAuthoringRequest, LEGACY_AUTHORING) is an open D-A question for PO (candidate OBS-015).
- R9-OBS-3 (inferred): GuidedPublicationAuthorization still uses the JVM clock; V15:217 judges by DB clock → OBS-011 fold.

**Why:** the user strongly prefers single path with no residue. I chose placement over a 012A re-run because the residues are fail-closed and need a trusted caller. The user may override that and ask for a 012A follow-up lane.
**How to apply:** at OBS-009/014 gates, check that these items actually landed before OBS-010. Backend guided ITs consume untracked studio-runner/dist. Hash-compare dist before crediting them. Stale Gradle daemons holding 127.0.0.1 ports shadow Docker *:P (host-port collision class). See [[r9-r10-clock-controlwindow-ruling]], [[single-path-decision]].
