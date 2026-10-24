# Three-story completion plan review — current05

**Verdict: REVISE before actual 009 adoption or execution. Proceed with the bounded preparation lanes below.** The overall direction is sound. Seal the authoritative revision tuple used by the incremental update and replace the stale initial-validation sequence with the supported freeze-first sequence described below. Neither adjustment reopens 011 or warrants another backend run.

## Basis and accepted state

This is an independent document-based plan judgment against the supplied current05 context, dated 2026-10-21T11:05Z, plus root's subsequent Gateway source-finding update. Read: repository AGENTS.md; selected canonical 009/010/011 story and epic passages; routing review06/review, findings and bindings; adoption05/plan, proof-carry and independent review; final-root-closure20/manifest and source-freeze release. No product source, SDK, private corpus, raw execution bodies or external evidence was inspected. The detailed execution counts, source captures, Gateway source behavior and remaining external facts below are supplied/accepted facts, not independently repeated measurements.

- **011 is Done, independent QA PASS, no waiver**, administratively closed at story 0.2.22, all 18 tasks checked and actual shared File List 103. Closure20 releases preparation of a separately bound 009 window, not application or CLI execution. Conditional `apply_qa_fixes` pending is normal; do not reset or manufacture its completion.
- The accepted 011 tuple is A1/1814 and E19/238. Fresh postclosure source/SDK/runtime/mode applicability remains owed. All six full backend calls and twelve diagnostic projections are consumed/completed. Preserve accepted limitations, including Node23 frontend carry, the two-invocation private fixture result, Replay-only/startup-UNKNOWN process scope and increased matched-class timing. No seventh run, repeated diagnostics or speedup claim.
- Routing review06 establishes **FR06-01**: archived `updateDraft` omits mandatory positive integer `sourceRevision` and `configurationRevision`; its incremental caller does not supply them. The ten-buffer adoption05 was source-clean, not API-compatible. Keep that adoption held. Its immutable 105-pass proof remains historical for its exact tuple.
- **009 and 010 remain InProgress.** Actual application-provider spend/headroom is UNKNOWN under the shared USD500 ceiling. The existing consolidated external question remains pending; this review neither duplicates it nor treats elapsed time as an answer.

## Required changes to the next plan

### 1. Specify revision ownership across the complete incremental flow

The architecture correction must name the trusted response/read that supplies the draft's **current integer tuple immediately before PUT**, and how a successful update replaces that tuple for subsequent work. “Pass the known revisions” is incomplete unless it establishes whether base publication or any intervening operation can change either revision. Do not assume the create response remains current through publication.

Trace create → base session/publication → current draft tuple → incremental PUT → returned tuple → incremental session/finalize. If a read is necessary, it observes authoritative state; it does not eliminate the optimistic-concurrency race. A conflict remains a recorded unsuccessful attempt, with no silent reread/retry, invented counter or revision from model text. Missing/malformed revision responses must not cause guessed values. Keep PUT integer revisions distinct from the guided start/finalize string contracts, with any conversion occurring only at the documented contract boundary. Do not weaken the backend contract.

Independent architecture/QA review must accept that flow before the candidate correction. Update the declaration surface and actual incremental caller together. Test observable behavior: exact nontrivial revision values in the public PUT; consumption of a changed authoritative tuple rather than stale initial values; the incremental continuation's use of the accepted update result; and conflict propagation without another PUT or suffix model work. Include malformed/missing tuple behavior if the correction adds that validation. Existing tests may satisfy parts of this matrix; avoid mirrored implementation tests or unrelated coverage expansion.

Run only meaningful affected Node tests and required type/lint checks under a separately admitted runtime. Declare which historical assertions still carry and which changed behavior receives fresh evidence. No automatic repeat of all 105, historical intentional REDs, native fixtures or backend gates. A correction to one source invalidates exact whole-candidate equivalence, not every unrelated accepted proof.

### 2. Resolve the source-pin transition before admitting a transaction

The proposed “apply → initial validate → freeze → validate” cannot promise an initial PASS while the manifest still pins the old evaluator. **Root's subsequent Gateway finding resolves the supported order:** unchanged `freeze-corpus` invokes `freezeManifest` first, repins the declared inputs and writes actual time/digest through `.next`/rename, and only then calls strict `validateCorpusManifest` with file checking enabled by default. I accept this as supplied source evidence; I did not independently read that implementation.

Revise the admitted sequence to **approved corrected adoption → reviewed original freeze-corpus, including its strict validation → original validate-corpus → honest final captures/qualification**. Keep the stale initial-validation proposal held; there is no reason to execute it merely to manufacture an expected failure. This supported path needs no hand-written pre-freeze manifest surgery. Gateway must bind the exact ordered state table: evaluator tuple, manifest state/digest, CLI outcome, permitted mutations and resulting tuple at every step. Independent source/delta/output-handling review and root admission remain required.

Freeze mutates before validating, so a failed CLI exit must not be interpreted as “no write”: retain before/after custody, stop consumers, preserve the failure and apply only the already-reviewed owned-state recovery policy. Never claim a successful corpus gate on failure. The original CLI remains the sole semantic validator with file checking enabled. No `checkFiles: false`, alternate semantic validator, private seed substitution or forced historical hash. Preserve business seed, oracles, rates, statuses, field membership and ordering. Permit only reviewed derived pin/gate/sessionPlan/time/digest changes; account for freeze's `.next` creation and rename. Root must have opaque input/output custody and the reviewed closed projector before the first CLI call because diagnostic output can expose private bodies.

Bind corrected candidate hashes and any legitimate corpus successor honestly. If the fix fits the existing ten source targets, retain exactly those ten; if it requires another target, explicitly revise membership and transaction review before adoption. Never silently expand the ten-file transaction or mutate archived green buffers.

### 3. Make fresh admission a barrier, not an assumption

Root may prepare original sourcecapture and unchanged-profile full SDK metadata in parallel with candidate work. Final admission must bind the final corrected candidate, exact regular-file preimages/modes, runtime facts and canonical5/bin21/protected11 comparisons against whole6. Recheck transaction preconditions immediately before writes; an earlier snapshot alone is insufficient if intervening work occurred. Drift stops the affected lane for assessment, with no automatic install, restore or repair.

One actual writer owns the complete adoption window. No consumer may observe partial replacements; retain owned-byte rollback guards and the absence of a cross-file atomicity claim. Apply, affected actual Node gates, the resolved original CLI sequence and before/after captures are serialized as admitted. An independent reviewer then qualifies the actual result and precise proof carry. Fixture imports remain a separate exact Node24 import-only admission: source-safe is not imported, and imported is not server/browser/deployed proof.

## Critical path and safe expert parallelism

Use root plus at most three experts, with explicit disjoint ownership:

| Owner | Work now | Join/stop boundary |
|---|---|---|
| Root/coordinator | Fresh metadata lane; one approved-reference prerequisite packet; candidate/admission reconciliation and sole actual writer ownership | No actual adoption until correction review, pin-transition design, output custody and fresh bindings agree |
| Expert 1 — evaluator owner | Minimal revision-flow design, then candidate-only correction and scoped test preparation | Independent design acceptance precedes correction; no actual-tree writes or runtime authority inferred |
| Expert 2 — Gateway/corpus owner | Exact CLI I/O membership, safe closed projector, source-pin transition and allowed manifest deltas | Private body stays opaque; no corpus mutation or CLI run during preparation |
| Expert 3 — independent architect/QA | Review Expert 1's design and final candidate, then Expert 2's transition and root's final admission/result | Read-only review, no self-approval; may prepare 010 T2 local evidence rows between reviews without claiming external fulfillment |

Expert 1 and Expert 2 can prepare simultaneously; their common join is the corrected evaluator hash and its effect on corpus pins. Root's snapshots can overlap preparation, but final rechecks and all actual writes are serialized. Expert 3's review queue is a real dependency, not a fourth expert hidden behind parallel labels. No further delegation is needed.

The local path is: **revision design/review → candidate correction/affected checks**, joined with **CLI transition/projector review + fresh metadata → separately admitted adoption → actual affected checks and strict corpus qualification → independent adoption assessment**. Source-only reviews must not be mistaken for execution releases.

The completion path then joins external prerequisites: **approved deployed environment and security/model/budget inputs → real gateway guided-schema probe before AC-7 → actual 009 T4/D-C/live obligations and T6 → independent 009 QA/closure → 010 pilot and release-readiness completion**. Already accepted 011 proof is a dependency satisfied, not a recurring stage.

## External and human gates remain on the completion path

Maintain one coordinator-owned packet with requirement → named owner → approved reference → state → delivery → dependent gate. It must cover U13/security acknowledgement before AE work, export/retention/gateway privacy, F04 landed or externally accepted owned residual, approved staging SSO/origins/accounts/secret references and independent oracles; ED-01 provider/model/exact input-output-thinking rates, measured aggregate spend/headroom and pre-call admission; ED-02 Vault/background authority, TLS issuer, DBA role/live privileges, SIEM, NTP, internal image and SRE/D-B; and the named C17 masked-video reviewer. An unnamed owner or unanswered reference remains missing. No outreach or provider call is authorized here.

009 still owes real ≥20 workflows ×3, ≥90% completion with zero false pass/leak, 100 stable-fixture replays at ≥98%, and the schema/oracle/guard/canary/live-fault/security/human-video/MODEL-SIZING obligations. Local corpus validation and private unit totals cannot substitute for those outcomes. Budget authorization alone cannot establish rates, actual prior spend or available headroom.

010 may advance only the early-T2 local/runbook preparation now, carrying external rows as owed/unrun with owners. After 009 Done and D-C PASS, remeasure/re-date Live surface, retain PM acceptance, perform per-application/per-dist focus qualification, and obtain five real consenting nontechnical participants with actual outcomes and remediation evidence. Contact still requires its existing explicit authorization. Populate first-learn p95 and both matching disclosure rows from T4, not estimates; retain release-readiness and independent QA gates. No credible all-three completion ETA exists before external delivery and human outcomes are known.

**Exit from this review's REVISE:** root has an independently accepted authoritative revision flow, an executable original-CLI pin-transition order with exact allowed deltas/output custody, and a corrected candidate/fresh-admission plan. That permits reconsidering the bounded 009 action; it does not itself authorize it. This review changed only this file and grants no application/provider, lifecycle, deployment or external acceptance authority.
