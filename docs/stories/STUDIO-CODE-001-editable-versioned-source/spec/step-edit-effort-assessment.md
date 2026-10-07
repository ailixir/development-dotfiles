# Specific code-step editing: smaller effort and risk assessment

Owner: Aria / architect. Scope refinement: source download is withdrawn; this assessment supersedes the broad plan for estimating the requested editing slice. Proposal only; no implementation or deployment verification. Estimates are planning judgment, not measured delivery times.

## Smallest safe slice

Allow an authorized author to select an existing compatible source revision, edit **one step's supported code block**, and choose **Validate change**. The server copies the entire immutable artifact, replaces only that identified block, validates the entire resulting artifact with the existing schema/AST/reference/runtime policy, and produces a new unconfirmed immutable candidate. Show its diff and actual validated behavior; **Confirm change** accepts that exact revision/hash. Run submits that same identity and executes the accepted immutable version.

No step reorder/add/remove, whole-file editing, code download, source import, rich-editor dependency, durable invalid-code draft, checkpoint archive or general history browser is needed. Invalid/unsaved text stays in the local page buffer for correction; tell users it is not saved across page reload. Preserve it across tab changes/background reads, protect navigation/unload and retain it after validation/conflict failure. If durable invalid-work recovery is later required, it becomes additional scope.

Proposed request: `{baseRevisionId, baseArtifactHash, stepId or checked stepIndex, replacementCode, expected source/config/context freshness, expectedPreparationRequestId}`. The server resolves ownership, originalText, step ordering, declarations and actor from persisted data, never from client assertions. The replacement may contain the currently supported bounded sequence of awaited operations; it is not arbitrary TypeScript. Useful locator/assertion changes remain subject to authored required/allowed reference policy; no retired English-equivalence check is restored.

## How much versioning can be deferred?

For this narrow slice, make a patch **a proposed immutable revision**, rather than a newly persisted mutable executable draft. The active confirmed revision remains unchanged until explicit confirmation. This is an intentional lifecycle simplification from the broad design: submitting a candidate does not silently replace the active source. The editor blocks Run while its local change is unresolved; users may explicitly leave the proposal and inspect the currently confirmed source.

Under those semantics, a separate `codeDraftRevision`, mutable code store and append-only invalid checkpoints can be deferred. The necessary concurrency identity is existing source/configuration/context identity **plus exact base revision/hash and persisted preparation-request epoch**. Concurrent patch submissions compare the same expected request identity under the draft lock; only one capture wins. Old generated/manual success, error, timeout or abandonment cannot settle after that request identity is superseded. Confirmation checks current candidate/request/base/freshness; execution checks the explicitly requested current confirmed revision/hash under the existing acceptance lock.

This simplification is safe only if the complete relevant writer/outcome audit confirms those guards, and all generated preparation entry points honor manual authority. Mark each captured attempt/revision with truthful origin/kind and parent revision. Reject ordinary generated preparation while a manual candidate or current confirmed manual revision controls source; **Generate from Steps** is an explicit conditional authority transition. This can derive authority from the protected current request/revision, rather than introducing a mutable-code counter, but every entry point must consult it. Do not use `compileStatus` alone as authority or readiness.

If product semantics instead require Save to persist active editable code **before** validation/confirmation, or require durable invalid-code recovery, retain the broader code counter/mode/checkpoint design. Reusing the old source/config pair alone for saved mutable code is unsafe. The narrow approach does not claim the old 41-task plan can merely drop its export tasks.

## Planning effort

Assumptions: one engineer familiar with the current Studio lifecycle, existing backend/runner/browser test environments work, current dirty changes are stabilized, and the deployed captured-request/revision regime supports an additive patch path.

| Work | Engineer-days | Contents |
|---|---:|---|
| Focused editor and review | 1–2 | Per-step field, local dirty buffer, validation diagnostics/diff, explicit confirmation and exact run request; accessible controls and MSW behavior |
| Backend patch candidate | 2–3 | Authorized conditional capture, copy/replace one block, whole-artifact validator without LLM, truthful lineage, exact confirmation and manual-authority checks |
| Targeted evidence | 1 | Valid/forbidden/reference/mapping cases, patch/compile/confirm/run races, local-buffer/conflict handling and unchanged accepted-run identity |
| **Feature subtotal** | **4–6** | No export, durable checkpoints or arbitrary-source runtime |
| Existing approval/CAS/capture integration | **+1–3** | Keep patch approval explicit, complete manual-authority/late-outcome guards and verify deployed-schema/publisher compatibility; global generated-approval correction is not included |
| **Practical planning allowance** | **5–9 person-days** | Roughly one to two engineering weeks for one engineer, before calendar delays for reviews/deployment |

These bands overlap by design: the additional integration allowance depends on what is already correctly deployed and can be proved. They are not a promise that all broader generated-confirmation or migration debt fits three days. Start with a short applied-schema/publisher audit before committing a delivery date. If captured-request/event insertion is not usable, or old writers cannot be drained safely, re-estimate those prerequisites separately. Unrestricted TypeScript, durable recovery and mixed manual/generated merging are excluded.

The current `publishAcceptedCandidate` path stamps approval during preparation (`CompilePipeline.java:361-370`, `CompileStateService.java:281-303`). A patch must never reuse that auto-approval behavior. **Changing global generated approval is not mandatory for this narrowly staged feature:** generated-only tests may retain current behavior while manual patches always require exact review, provided every automatic generated entry point is blocked from overwriting an active/manual-confirmed source and explicit regeneration is identified as a separate authority transition. The existing PRD mismatch remains known separate product-policy debt. Correcting all generated preparation would affect other authors and needs its own estimate/release decision; it is not hidden in the 5–9-day allowance.

Current source includes both content-based revision uniqueness and a staged V19 request-required cutover. If the deployed regime still supports existing bounded artifact insertion, a patch can use the compatible native candidate path with truthful manual provenance and its own captured attempt. If V19 is applied, every candidate must carry the required immutable request. Equal-content/no-op patches should return no-change, not fabricate authorship through content reuse; changed patches need distinct revision identity and actor. Do not bypass constraints or execute the staged cutover automatically merely to add a field to Code. A migration/drain becomes a prerequisite only where the actual deployed capture/provenance constraints require it.

## Risk and disruption

| Risk | Impact and control |
|---|---|
| Correct syntax, wrong assertion/locator | The bounded validator cannot prove business intent. Show diff/actual operations beside original checklist context and require exact approval. |
| Old compile overwrites manual work | Highest implementation risk. Exact request/base/freshness guards plus manual-authority suppression, including late failure/sweeper paths, are mandatory. |
| Confirm A, accidentally run B | Require expected revision/hash on execute; preserve accepted execution idempotency after later edits. |
| Undeclared references or forbidden code | Reuse full server validation and CSI/secret policy; no raw source reaches the child runner. |
| Lost local invalid edits | First slice deliberately keeps these local. Preserve tab/conflict buffers and warn on navigation; durable recovery is additional scope. |
| Migration/client incompatibility | Feature-gated additive endpoints, matching client/MSW contracts and actual ledger/publisher audit. A required writer drain can briefly pause authoring/preparation. |

Already accepted executions remain pinned to their immutable revision, so later step edits must not change their instructions or evidence. Future runs use a newly confirmed patch only after approval; unrelated checks need no functional change. Ordinary readers/checklist authors can keep their existing workflow with editing disabled until rollout gates pass.

The execution engine and supported language stay the same, which limits runtime disruption. **Zero downtime is not established:** database trigger/constraint state, deployed publisher compatibility and any required drain have not been inspected in a live environment. No global database redesign, arbitrary-code isolation service or broad cleanup is justified solely by this narrower request. The few trust-boundary corrections actually needed for the patch cannot be skipped.
