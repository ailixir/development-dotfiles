# Independent review of the STUDIO-OBS-010 resume2 documentation proposal

Quinn (@qa), 2026-10-18 EDT. Applied `.codex/skills/aiox-qa/SKILL.md` and the canonical QA role to the dispatched static draft-content review. **Content revisions required. This is not a story QA verdict, product acceptance, lifecycle transition, pilot result or release approval.** Story 010 remains InProgress. Declared execution ceiling USD500; actual spend unavailable. No build, test, formatter, Docker/provider call, process signal, git write, external message or application of a patch occurred. Review writes are confined to this directory.

## Required corrections

1. **DOC-010-01 — RBR-12 misstates the supported drift behavior (medium; correct before accepting/applying the runbook).** `resume2/preview/docs/runbooks/studio-guided-authoring.md:107` says a changed/missing prefix “must refuse” and describes replaying the entire prefix before learning at k without its supported earlier-switch exception. OBS-015 AC-4 (`docs/stories/STUDIO-OBSERVED/STUDIO-OBS-015.story.md:32`) and ADR-SC-005 D-D require eligible target/observation drift at j < k to switch to learning at j. Current `studio-runner/src/guided/runtime.ts:345` and `:524` implement pre-admission drift and proven-before-effect admitted drift, with value-free receipts and no old-action retry. An assertion failure or policy refusal stops the run. The present wording could cause an operator to diagnose the implemented earlier switch as a defect, or to expect a refusal instead of the documented product behavior.

   **Exact fix:** state the normal 1…k−1 replay / k…n learn path and its exception: eligible target/observation drift at j < k may switch to learning at j only under the existing no-effect proof; j and the re-learned prefix steps are recorded in the receipt/revision and share the same session budget. Already-dispatched effects are not repeated. Assertion FAIL and POLICY_REFUSED stop; unknown outcomes never trigger automatic replay. Keep the explicit prohibition on invented pre-Ready drift UI copy. Update RBR-12 traceability and regenerate the exact runbook/combined patches and all affected hashes. This requests prose matching existing behavior, not a new runtime change.

2. **DOC-010-02 — The remaining VIDEO-LOGGING runbook disclosure is absent (low; correct before accepting the complete AC-5 runbook).** The historical concern at story 010 line202 is superseded by its strict reconciliation at line213 and `strict-qa-20261014/po/closure-placements-reconciliation.json`, VIDEO-LOGGING disposition **LOCAL_RESOLVED_RUNBOOK_SCOPE_OPEN**. OBS013 already closed A13-5 with fixed safe logging and four captured full-throwable metadata/range cases across execution/guided subjects. **No local logging validation, new ruling or assertion is owed to 010.** What remains is accurate evidence-access/runbook disclosure; the proposal contains no description or source linkage for that specific invariant. Generic value-free dispatch/heap-dump advice in RBR-07 does not explain shared recording-store diagnostics. The verbatim 21-row architecture extract does not enumerate every remaining documentary carry in the story.

   **Exact fix:** add a short recording/evidence privacy disclosure: INFO+ logs name only the safe subject and fixed disposition; store keys, bucket, endpoint and cause-chain/throwable are not logged. Cite the current strict reconciliation and OBS013 A13-5 proof; link the disclosure in separate story-carry traceability. If represented in readiness/handoff, mark **local logging resolved by 013; documentary disclosure pending application**, not an unresolved runtime/security gate. Keep the 21-row architecture extraction verbatim. Regenerate affected runbook/combined patches and hashes. Do not reopen the historical WARN-cause concern, add a test obligation, claim an observed secret leak or change its nonblocking status. My initial coordinator message treated the historical concern as still open; this current review corrects that interpretation against the later authoritative disposition.

## Independently verified package integrity

All mechanical checks in `static-checks.json` pass. The check reconstructs every proposed file from its individual unified patch in memory and compares exact bytes with the preview; it does not rely solely on the author's check receipt. Read-only `git apply --check` also exits 0.

- All **76 input hashes** match current files. Existing target bases match; the three new targets are absent. SHA256SUMS entries match all listed package artifacts.
- The combined patch is the literal concatenation of five individual diffs and targets exactly the guided runbook, pilot protocol, readiness ledger, unsubmitted handoff and append-only 10.34 proposal. No source, dist, migration, framework, Live-list or runner-runbook target is present.
- The architecture source has **68 obligations**. The exact story-010 extraction has **21 = 3 local + 9 lane-dependent + 9 external**, preserved verbatim. The global external extraction independently preserves the **21 external rows across all stories**. These are distinct sets. All 21 story rows have a corresponding proposal/input mapping; this does not resolve their actual gates or remedy DOC-010-02.
- All eight relative Markdown links and the section-14 anchor resolve from eventual target locations. Repository paths in release evidence cells point to existing sources or explicitly identify missing proof/off-tree proposals.
- `docs/runbooks/studio-runner.md` remains byte-identical at whole-file SHA256 `8971ca6b0f5f08b3b35041abe960065d1b6f4fdf4e5fa3b9557a30dd9c16223b`. Section 14 is **12,392 bytes**, SHA256 `4d83b3594c7cab2daa4a4505df1088dbc43c74e55ee4e6f1e9c552ff07880e66`. No patch targets it.
- Pilot attempts and focus-target sheets are header-only. P01…P05 are five UNASSIGNED slots with every participant fact blank. All **12 denominator rows** have blank numeric/observation cells and NOT_RUN state. The sample size is zero actual users, with no invented outcome/rate.
- The exact first-learn disclosure remains pending T4 with `___ steps at p95` in both previews; no p95 is estimated. Capacity arithmetic is labelled as arithmetic and T6/<15 requires re-ruling/PM decision. No actual consent, recruitment, real probe, provider call, approval, new Done status or release readiness is asserted.
- ADR-SC-006 is respected: no new screen-reader, live-region, shortcut, keyboard-only, contrast, reduced-motion, audit-surface or accessibility-review work is requested. Existing target-page accessibility fields and functional step-N focus are product behavior. A11Y5/6/7 remain descoped, neither passed nor waived.

## RBR-01…19 content review

Each ID occurs exactly once as a runbook row and has source/input traceability. “Supported draft” below concerns the proposed documentation only, not implementation, live evidence or task completion.

| Row | Review result / retained requirement |
|---|---|
| RBR-01 | Supported draft: CSI/environment/test-scoped provisioning; create-only; whole-origin trust; fresh secret-use authority and G2/U3/U5 remain open. |
| RBR-02 | Supported draft: same-reference rotation preserves artifact hashes; actual versions differ; Vault history remains; real rotation proof owed. |
| RBR-03 | Supported draft: one poll including request/queue time plus in-flight step; unlearned-control-loss carry retained; no instant revocation/false cancellation origin. |
| RBR-04 | Supported draft: 12-month partition window distinct from 30-day observations/video and indefinite stores; SIEM/Q3 and ADJ-1 remain open; audit UNKNOWN_OUTCOME is not wire status. |
| RBR-05 | Supported draft: one 4096 UTF-16 bound, no truncation, distinct oversize errors and transport-cap caveat. |
| RBR-06 | Supported draft: password/multi-password/non-password GA limit, no fallback, memory/session-cache/page-echo residuals. |
| RBR-07 | Supported draft: source/render dump controls distinguished from actual backend/host/operator restrictions. Add VIDEO-LOGGING cross-reference per DOC-010-02. |
| RBR-08 | Supported draft: scoped create/read/metadata-list; worker read-only; no runtime delete authority; KVv2 history and skipped real policy proof remain open. |
| RBR-09 | Supported draft: exact Secret/pin/cert/issuer/token rotation inputs and quiet drain; U23 corrects historical issuer label; real hop/rotation proof remains open. |
| RBR-10 | Supported draft: disposable dev-only reset command quoted as unrun, D-B approval/recreation owed, V1–V18 plus forward-only head, no repair of history. |
| RBR-11 | Supported draft: current governed policy and independent approver; OI12/U24 open; learning-governed/replay-TrustedPolicy interim and F02 conditions retained. |
| RBR-12 | **Revise per DOC-010-01:** normal incremental path lacks supported earlier drift switch and uses misleading blanket refusal wording. |
| RBR-13 | Supported draft: distinct secret G1/G2/G3 and GA C2/C3 retained, no schedule activation/real credential permission. |
| RBR-14 | Supported draft: runner/API/worker/DB synchronization, Platform/SRE bound owed, 409 symptom and no tolerance/longer-window remedy. |
| RBR-15 | Supported draft: lost-terminal log alert specification, no metrics endpoint, real render/fire/routing and companion settlement still owed. |
| RBR-16 | Supported draft: exactly one guided pod, protected topology, U20/provisional-R1 and deployed/PID1/orphan proof remain explicit; D4 timing launch-only. |
| RBR-17 | Supported draft: fresh CSI read, actual recording status vs run outcome, logical vs physical expiry and source-frozen UI copy. Add VIDEO-LOGGING cross-reference per DOC-010-02. |
| RBR-18 | Supported draft: correct e5c58fa5… list, 729 IDs/671 protected, start-path acceptance only, post-Done remeasurement/stale-fields/AX5…8 and separate PM acceptance owed. |
| RBR-19 | Supported pending disclosure: exact e1 text, same-pass update, unestimated T4 p95, arithmetic not measured capacity, T6 rule and no chunking commitment. |

## Staging Groups A–N and all 33 criteria

All Groups A–N and AC-1…33 have individual proposal dispositions. All original 10.34 bytes, including checkbox/lifecycle and dissent history, are an exact prefix of the preview. No criterion is marked passed or waived. Current tags and important non-overlap requirements are preserved: AC-4/8/26 separately own seek measurement, the 10.16 release claim and readiness-to-first-frame; AC-27/29 jointly carry 10.12 AC-6b; AC-1/31 split the real-store positive/negative halves; AC-33 retains gateway-level forged-header denial and already-open SSE revocation rather than substituting a new-request denial.

A/AC1…7 are re-cut to the single path with external identity/store/sandbox/recovery/concurrency proof; B/8 remains separate; C/9 re-points to the retained gateway; D/10 is legacy-only proposal, never PASS. E/11 and F/12…17 retain ingress/auth/CSRF/SSE/kill/drain/recovery/overload. G/18 and H/19…22 retain real service identity, isolation, destination and transport proof. I/23 remains external federated transport, while AC24 is superseded with **PM carrier decision pending**, no automatic OBS008 transfer. J/25 keeps all six in-image PID1 paths. K/26 stays distinct. L/27…33 retains every distinct residue above, real seccomp, sandbox, network positives/negatives and physical retention. M is withdrawn legacy-only planned material, never a new criterion. N is an external rollback/drain reference with registration shape pending PO; there is no invented AC34. The proposal is suitable for register-owner consideration, not evidence of accepted re-registration or completed staging execution.

## Apply and completion boundary

No complete runbook/combined-patch acceptance is given while DOC-010-01 remains. The complete runbook/documentary-carry claim requires DOC-010-02; it creates no additional release or 009 Done gate. The remaining scoped draft content can support preparation after corrections and independent PM review, but only root may open quoted inputs after reconciling the original live B1 and baseline gates. Recheck base/input hashes and review the regenerated exact patches before applying accepted local T2 work. This review does not authorize T3/T4 application, 10.34 register changes, pilot/contact, PR/push/release or lifecycle edits.

010 still requires 009 independent Done plus actual D-C pass, post-Done Live-list remeasurement/PM acceptance, real authorized consented users/access/per-app probes, actual pilot/remediation/denominators, all applicable external approvals/proofs, PM product gate, independent story QA and formal devops checklist/handoff. The full original all-story goal remains unachieved.

Reviewed package manifest SHA256: `a1a5dcb58294e17cf25318800c5c0092657e196fe47a531470da1cdb7ceb382b`.
Reviewed combined patch SHA256: `7bf734351645eacef8674df73acb8e97bd16e2f67aae7f905d3e050c1b4d0111`.
