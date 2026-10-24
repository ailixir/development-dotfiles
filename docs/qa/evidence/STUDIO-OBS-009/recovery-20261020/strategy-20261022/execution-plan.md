# Recommended execution strategy — 22 October 2026

Planning only. Implementation remains paused. This recommendation replaces the scheduling approach for the next execution phase; it does not issue runtime authority, waive gates, change story status or supersede historical evidence.

Use the coordinator plus **three concurrent expert workers**, all **gpt-6.1-sol / high**, with no nested workers. Dispatch independent work immediately; refill each settled slot from the ready queue instead of waiting for an entire wave. Allocate work by component and evidence boundary, rather than one worker per story. OBS009 and OBS010 remain InProgress; OBS011 stays Done.

## Findings that change the plan

1. **Investigate the timeout before another complete attempt.** UI420 answered a genuine clarification and published once, then stopped at `FILE_GATE_TIMEOUT`; its cause remains unknown. The source sequence suggests the postlearn evidence handoff as a candidate, not an established cause. Publication success is not evidence that edit, incremental learning, saved replay or video seeks passed. Split consumer and producer investigation across disjoint interfaces; patch only a demonstrated defect.
2. **The unchanged local journey cannot close 010.** Its login uses only a password reference. The required username-variable plus password-secret workflow on the approved application remains missing. Saved replay verifies step seek but has no action-seek proof. Determine whether the shipped capability already provides the required timing/control; add the missing test coverage or record the concrete capability gap. Do not infer an action offset from a step offset.
3. **010 preparation and human review can overlap 009.** Prepare the runbook, readiness mapping, review script and owner-evidence checklist independently. An authentic user review may support both 009 C17 and 010; no duplicate review or five-person pilot is required. Final 010 closure still waits for 009 Done, D-C PASS, final Live-list remeasurement and PM/QA acceptance.
4. **Most accepted implementation is reusable.** Reuse accepted MAIN, corpus cases, local source/test results, six reviewed masked screenshots, completed schedule work and 011 cleanup. Verify changes and invalidated evidence; do not rebuild accepted work or repeat broad suites without a new concern. A seventh broad backend gate remains outside the current plan.

## Work queue and exclusive ownership

The entries are future assignments after execution is resumed. Preparation can proceed without satisfying the completion gates. Historical407/417/420 source/evidence stays immutable; any correction uses one successor source set. A task is finished only with its concrete output and named next consumer.

| ID | Expert and work | Ownership / completion output | Prerequisites |
|---|---|---|---|
| E1 | Harness developer: isolate the gate consumer failure | Successor driver and its focused controls only. Distinguish absent result, rejected binding and accepted result using finite closed metadata; preserve once-only requests and deadlines. | Ready after resumption; any historical private projection needs exact admission. |
| E2 | Backend/evidence developer: isolate producer and ledger failure branches | Successor bridge/ledger and focused controls only. Distinguish producer start/exit/refusal/result commit; report demonstrated cause or explicit unknown. No speculative product patch. | Parallel with E1 after agreeing the few correlation/outcome fields. |
| E3 | Analyst/PO: reconcile 010 and external evidence | Candidate runbook/readiness and one owner-evidence checklist; PO alone integrates story/register changes. Preserve actual dates, pending gates and accepted local content. | Independent of E1/E2 and 009 Done. No external contact. |
| E4 | UX/frontend test expert: close workflow coverage gaps | Own the successor journey spec and review-sheet template. Use the shipped USER/PASS picker flow, genuine clarification, middle edit, actual incremental boundary, and replay step/action joins. Derive step numbers from the actual workflow. | Script/source preparation can overlap E1/E2. Approved app, fill probes and owner facts required before relevant execution. |
| E5 | Independent QA: scoped verification and corpus/fault readiness | Review E1/E2/E4 changes; freeze corpus/oracles, exact denominators, fill-target checks, remaining fault coverage and evidence mapping. Consume existing incremental cases unchanged. | Corpus/fault preparation is independent; source acceptance waits for its producers. QA does not approve its own changes. |
| E6 | DevOps: deployment/security evidence and runtime ownership | Sole build/deployment/stack operator. Integrate genuine owner-supplied TLS/Vault/DB-role/SIEM/NTP/image/policy/application evidence; prepare exact fresh bindings and owned cleanup. | Checklist preparation can overlap. Actual setup waits for accepted frozen source and applicable authorizations/owner inputs. |
| E7 | Benchmark/test expert: remaining 009 technical proof | Execute approved real-Vertex benchmark, faults and required scoped regression; publish denominators, pinned identities and failed attempts. D-C remains >=20 workflows x3 plus100 same-artifact replays and its existing hard gates. | E5 readiness and E6 environment/owner/admission gates. Never compete with E8 on the same runner. |
| E8 | UX visual-test expert: final real UI journey and human pack | Sole browser operator. Prove login -> first learn -> genuine clarification -> first publication -> middle edit -> incremental prefix/suffix -> second publication -> saved replay, with playable recordings and actual step/action seeks. Produce source-bound human review links and gaps. | Reviewed timeout disposition, E4/E5 acceptance, E6 runtime and applicable recording controls. User supplies actual C17/010 decision. |
| E9 | Independent QA, PM and DevOps: final acceptance | QA evaluates009 evidence and lifecycle; then final010 Live-list remeasurement/date, paired measured p95/runbook/readiness update, PM acceptance, findings resolution, QA traceability and exact-path DevOps handoff. | Applicable009/010 technical, security, deployment and human gates actually met. No push/deploy/schedule activation implied. |

Detailed definitions of done for **all eleven remaining parent tasks** are in [acceptance.md](acceptance.md). The nine packages group those obligations; they do not remove open subtasks or turn preparation into acceptance.

## Scheduling

**First execution wave:** E1 consumer investigation, E2 producer investigation and E3 readiness/owner preparation run concurrently. The coordinator fixes their exact write sets and arbitrates the shared diagnostic fields. If existing admitted evidence settles a branch, stop that investigation rather than implement redundant instrumentation.

**Refill settled slots:** start E4 workflow/seek preparation and E5 corpus/fault preparation as slots open. Independent QA reviews completed technical changes while DevOps prepares E6 owner prerequisites. No phase-wide barrier: only the affected task waits for its dependency. Do not occupy a worker with passive waiting for a human or outside owner.

**Freeze and execute:** once the necessary source changes are independently accepted, use one source/dist baseline and one runtime owner. E6 setup -> one authorized E7 or E8 operation -> terminal settlement -> owned cleanup. Build outputs, secret-enabled runner capacity, live browser mutation and authoritative evidence publication are exclusive resources. Independent documentation and closed-evidence review continue in the other slots.

**Final visual test:** schedule E8 after known engineering corrections on the frozen baseline, preferably after benchmark-driven corrections, so it is the final automated UI validation. Human review need not wait for009Done or D-C PASS. If external benchmark evidence is pending, authentic applicable video review may proceed earlier; it cannot substitute for the benchmark or complete missing approved-application coverage. Any later change invalidates only the affected evidence and requires the corresponding verification/review.

**Close in order:** collect the requesting user's dated accept/request-changes decision against authentic first-learn/incremental/replay evidence; resolve findings and re-review affected coverage. Complete009's real gates and independent QA, then010's final Live/PM/QA handoff gates. Preserve the missed runbook deadline and obtain its explicit disposition; never backdate it or reopen011 to manufacture compliance.

## Controls that prevent wasted work

- One writer per file set. E1 owns driver; E2 owns bridge/ledger; E4 owns journey spec. Split only after their interfaces are clear. Source freeze precedes live collection.
- No blind full reruns, automatic retries, new orchestration framework, duplicate harness forks or speculative frontend/backend fixes. A failed attempt produces a bounded finding and affects only dependent tasks.
- Direct Vertex remains the route. An optional gateway is a transparent proxy input supplied by its owner. Gateway operations and budget management are outside this team's scope; actual owner-supplied admission/security inputs remain gates for the runs that require them.
- Models never inspect native videos, frames, crops or OCR. UX inspects only individually verified masked Studio screenshots; the requesting human reviews the authentic quarantined recordings. Metadata collection is not visual acceptance.
- Use one current task board and evidence map. Keep historical attempts and qualified results intact; update outcomes at meaningful task boundaries. Reuse a small metadata handoff where necessary; no additional server or scanner.

## Remaining non-engineering decisions and inputs

The concrete owner checklist must distinguish missing approved app/origins/account/secret/oracle and recording permission from already supplied local facts. Preserve U13/U14, actual Vault/background authorization, deployment/TLS/SIEM/NTP/internal-image/policy facts, F04/D-B and existing release gates with their real owners. Preparing the checklist does not authorize contact or supply their evidence.

The runbook timing proposal remains unanswered. Recommendation: accept the delivered late content through an explicit product disposition, retain the missed18October deadline and actual20October delivery history, and keep the final Live/PM checks. This recommendation is not a waiver or an answer on the user's behalf.

## Review provenance and stop state

Three read-only experts ran concurrently in Orca Run `run_30c78cd27a3c`; all three launch receipts confirmed effective `gpt-6.1-sol`, effort `high`:

| Review | Task / Dispatch | Result |
|---|---|---|
| Technical architect | `task_0df4aea9282c` / `ctx_2670b2945b00` | [technical.md](technical.md); succeeded, worker released. |
| PO/acceptance | `task_9e39c905760d` / `ctx_8ace8c416ffd` | [acceptance.md](acceptance.md); succeeded, worker released. |
| UX/visual execution | `task_a3d433ab7a1a` / `ctx_a74298726220` | [visual-execution.md](visual-execution.md); succeeded, worker released. |

The coordinator checked the password-only login and missing replay action-seek coverage directly against public407 source. Only planning reports were added. No product/story edits, tests, runtime/model/browser operation, private actual-input access, native-media inspection, contact or goal-status change occurred. The prior [paused checkpoint](../resumed-ui420-partial-cleanup421-user-stop-root-checkpoint.json) remains the execution state; this plan is ready for the next resumption.
