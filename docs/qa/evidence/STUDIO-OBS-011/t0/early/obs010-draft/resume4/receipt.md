# STUDIO-OBS-010 resume4 — DOC-010-03 narrow correction

Morgan (@pm). **Ready for independent narrow re-review; unapplied. No story QA, product acceptance, Done or release-readiness claim.** All worker writes are confined to `docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft/resume4/`. The reviewed resume2 (30 files) and resume3 (37 files) packages remain byte-identical. Declared budget USD 500; actual spend unavailable.

Only current-package references change. The operator runbook now links resume4's corrected traceability matrix; the handoff designates resume4 and its sheets; readiness's current off-tree output paths follow resume4. Historical source/review references deliberately retain their original destinations. Accepted drift/logging content and the bounded PM008 existing-AC6 carrier decision / PO-registration-pending state are unchanged.

Exact line deltas against resume3's proposed target files:

| Eventual target | Changed lines | Exact line numbers |
|---|---|---|
| `docs/runbooks/studio-guided-authoring.md` | 1 | 33 |
| `docs/qa/evidence/studio-observed-authoring/usability-pilot.md` | 0 | none — byte-identical |
| `docs/qa/evidence/studio-observed-authoring/release-readiness.md` | 6 | 52, 64, 65, 66, 68, 78 |
| `docs/qa/evidence/studio-observed-authoring/devops-handoff.md` | 2 | 13, 26 |
| `docs/stories/10.34.story.md` | 0 | none — byte-identical |

All **42 static package checks pass**. The full five exact patches reconstruct previews byte-for-byte in memory; the combined patch is their literal concatenation, and read-only `git apply --check` exits 0. All **167 current input hashes** match. Existing actual target bases remain unchanged and new targets absent. The pilot and 10.34 previews and PM decision files are byte-identical to resume3.

Self-reference verification examines actual proposed target files, not just metadata: **no stale current-package pointer to resume2/resume3 remains**. All **11 eventual links/anchors** resolve. The current runbook URL resolves to resume4's matrix containing the accepted RBR-12 runtime/ADR sources and all five current documentary-carry mappings. The handoff explicitly says “resume4 package”. `reference-deltas.json`, `operator-reference-delta.patch` and `link-and-section14-checks.json` provide exact before/after lines and semantic checks. The section-14 runbook remains 12,392 bytes / SHA256 `4d83b3594c7cab2daa4a4505df1088dbc43c74e55ee4e6f1e9c552ff07880e66`; whole-file SHA256 `8971ca6b0f5f08b3b35041abe960065d1b6f4fdf4e5fa3b9557a30dd9c16223b`; it is not a patch target.

Package entry points: `DOC01003-disposition.json`; `preview/`; `traceability.md` / `.json`; verbatim architecture/global-external extracts; `10.34-dispositions.json`; accepted `pm-ac24-carrier-decision.*`; `sheets/`; `manifest.json`; `patches/`; `static-checks.json`; historical preservation records; `SHA256SUMS`. The 19 RBR rows, 21 story-010 obligations, separate 21 global external obligations, five documentary carries, Groups A–N, all 33 original ACs and 70 release rows are preserved. Pilot sheets remain empty/unassigned with 12 blank NOT_RUN denominator rows and zero real users. Functional-only accessibility and every real external gate remain intact.

Manifest SHA256: `8bc9a396d37f511ce2c8b0999da9b9e62a0129e7cf10521c72d0ec167f0b3d20`.

Combined patch SHA256: `7d94f14b96e1198c703011f70b385a2f1c765f99941d55d107e426756943dce0`.

Independent narrow re-review and root's baseline/freeze gate remain pending before accepted target application. OI-25, PO carrier registration, 009 Done/D-C, post-Done Live-list remeasurement/PM acceptance, real authorized pilot/access/focus/remediation and all applicable security/deployment/operational/release inputs are not closed. No source/dist/quoted target application, runtime/build/test/formatter/Docker/provider call, process signal, git write or external contact occurred.
