# Spec: Checks Studio translation review consolidation

> **Story ID:** UX-001-studio-review-consolidation  
> **Complexity:** STANDARD  
> **Generated:** 2026-09-20  
> **Status:** ~~Approved for implementation~~ **SUPERSEDED by ADR-SC-005 (2026-10-09) — never implemented**

> ### Disposition — ADR-SC-005 (2026-10-09)
>
> **Recorded 2026-10-10 by @po (Pax).** On 2026-10-09 the user decided that observed/guided is the only UI Studio authoring path and that the compile-to-READY path is removed entirely (`docs/architecture/ADR-SC-005-single-path-observed-authoring.md`). The ADR's "Supersedes" section names this spec directly: *"UX-001 (`CompileReviewPanel`): dropped; the component is deleted."* The surface this spec consolidates — the compile-review list in the Control Tower, `CompileReviewPanel`, `useCompileReview`, the Code tab's artifact summary and the translation/readiness decision — is deleted by **STUDIO-OBS-012B** (`components/studio/review/**`, `CodeTab`, `inference/**`), and the single-path UI (states, copy, plan explanation replacing the Code tab, learned-vs-replayed evidence) is **STUDIO-OBS-008**. This spec was approved (critique verdict APPROVED) and **never implemented**; no story was cut from it; nothing is removed from the product by closing it. Its one surviving idea — the Steps panel is the canonical checklist and the operational surface is outcome-first — is already the premise of the OBS-008 UX split (states/copy, reference picker, plan explanation). **Disposition: SUPERSEDED.** `requirements.json`, `research.json`, `complexity.json` and `critique.json` are left as history. Summary: `docs/epics/EPIC-10-SINGLE-PATH-DISPOSITION.md`.

---

## 1. Overview

Checks Studio currently presents the full natural-language checklist in the left **Steps** editor and repeats every same source line in the Control Tower's compile-review list. The duplicate list occupies the operational surface before Logs, Code, and Proof, even though its new information is the validated artifact summary, diagnostics, and optional code.

This change makes the operational experience outcome-first. The **Steps** panel stays the canonical checklist. The Control Tower presents a compact translation/readiness decision, with an intentional **Review translation details** disclosure for evidence needed to confirm a candidate.

### 1.1 Goals

- Remove the second default rendering of the authored source checklist (FR-1, FR-2).
- Preserve trustworthy, artifact-derived translation evidence and exact-revision confirmation (FR-3, FR-5).
- Make revision problems direct users to the affected source work (FR-4).
- Keep state-specific action, accessibility, and responsive behavior coherent with the existing Studio surface (FR-6, FR-7).

### 1.2 Non-goals

- Changing compiler behavior, revision protocol, API contracts, or server artifact shapes.
- Changing the existing checklist editor's editing, reordering, or validation behavior.
- Redesigning the Logs, Code, Proof, or the overall two-panel layout.
- Inferring translated meaning or regenerating source from authored English in the browser.

## 2. UX decision

### 2.1 Information ownership

| Information | Default home | Reason |
| --- | --- | --- |
| Full authored natural-language steps | Steps panel | It is the single canonical authoring checklist. |
| Compile state, readiness, revision identity, next action | Control Tower compact review | It is the decision a daily user needs before running or correcting. |
| Validated action/target/assertion, diagnostics, candidate code | Review translation details, on demand | It is evidence for review, not a second checklist. |
| Execution progress, logs, code/proof | Existing Control Tower views | They remain execution evidence and are out of scope. |

### 2.2 Default and detail behavior

1. The compact review card is visible ahead of Logs, Code, and Proof.
2. It uses the existing state narratives, then adds factual, compact metadata: candidate/confirmed revision identity where supplied, translated-step count, and diagnostic attention count.
3. It has a clearly named **Review translation details** control. The detail content is not rendered initially.
4. Opening the control reveals the existing ordered review evidence. Within this deliberate view, the source line is a secondary cross-reference and must not visually resemble a second editor/list of test steps. The translated summary, diagnostics, and optional code are its purpose.
5. Closing the disclosure returns focus to its trigger and retains the review data already loaded by `useCompileReview`.

### 2.3 State behavior

| Compile state | Default content and action |
| --- | --- |
| `COMPILING` | Compact progress/status; Steps remains available. No expanded source duplicate. |
| `AWAITING_CONFIRMATION` | Candidate identity, translated-step count, attention count, review-details control, and the existing exact-revision confirm action. |
| `READY` | Compact confirmed identity and run readiness. Translation details remain optional; the full candidate review is not shown by default. |
| `NEEDS_REVISION` | Compact failure summary and affected-step count. Offer an action that focuses the first affected left-panel step; detail disclosure exposes exact evidence. No confirmation affordance is implied. |
| `STALE` | Compact interrupted-translation state and existing recompile action. Preserve the stated behavior for an earlier confirmed revision. |

## 3. Requirements traceability

| Requirement | Design response |
| --- | --- |
| FR-1 | Steps remains the only default full source-step list. |
| FR-2, FR-6, FR-7 | CompileReviewPanel starts with an outcome-first summary and state-appropriate action. |
| FR-3, FR-4 | Details are progressive disclosure of candidate-artifact evidence; revision issues link/focus the editor row. |
| FR-5 | Existing `useCompileReview` confirmation, hash, conflict, stale, and in-flight transaction semantics remain unchanged. |
| NFR-1 | Compact review does not render a second full authored-source list; tests assert its absence until the explicit disclosure is activated. |
| NFR-2 | Disclosure has name, `aria-expanded`, `aria-controls`, focus restoration, and preserves state/diagnostic semantics. |
| NFR-3 | Presentation uses existing review state; it does not create a new polling or request lifecycle. |
| NFR-4 | Summaries/code remain candidate-artifact-derived; no client English parser is introduced. |
| NFR-5 | Existing wrapping/`UNCLAMPED_TEXT_SX` applies to long source, diagnostics, and code; the two-panel responsive order remains usable at narrow widths. |

## 4. Technical approach

### 4.1 Component design

- `CompileReviewPanel` remains owner of `useCompileReview`, polling, recompile, confirmation, conflicts, and in-flight status.
- Introduce a compact review summary within that component, plus a controlled details disclosure. The disclosure should use the existing MUI Button + Collapse pattern already used by `StepReviewList`, or an equivalent MUI Accordion with the same accessibility behavior.
- Render `StepReviewList` only inside the disclosure. It remains the sole detailed source-to-artifact mapping and retains alignment-defect, divergence, diagnostics, unavailable-artifact, and opt-in-code behavior.
- Expose affected-step navigation from the review presentation to `ChecksStudioPage` through a narrow callback/prop contract only. Keep transport and confirm mutations inside `CompileReviewPanel`.
- Make each source-row text input identifiable and focusable in `ChecksStudioPage` with a stable `id`/ref keyed by its current index. A targeted revision action calls `scrollIntoView({ block: 'center' })`, then focuses that input without changing its value.
- Select the lowest affected index only when diagnostics are aligned, the row is not truncated, and it contains at least one step-specific diagnostic. For a global diagnostic, a truncated or misaligned document, or no step-specific diagnostic, direct the user to the labelled **Steps** section heading instead. If the editor is unavailable, retain compact corrective guidance and do not move focus.

### 4.2 Data flow

```text
TestDto.steps ──────────────► Steps editor (canonical source)
TestDto + useCompileReview ─► compact review (state / identity / attention / action)
currentCandidateArtifact ───► Review translation details (on demand only)
compileDiagnostics ─────────► compact attention count + detailed per-step diagnostics
safe affected diagnostic index ► focus/scroll matching Steps editor row
global, truncated, or misaligned ► focus Steps section heading; retain truthful guidance
```

`currentCandidateArtifact` remains the only input for a translated action/target/assertion summary and optional code. `test.steps` is used only as source evidence in the detail review, never to fabricate a translated result. Any positional mismatch must continue to render as an explicit defect.

### 4.3 Interaction and visual rules

- Use the shared labels **Steps**, **Translation**, **Review translation details**, and **Confirm this exact revision**. Do not label a second source list as test/translation steps.
- Keep status meaning visible in text/icons as well as color.
- Keep the review summary compact enough that the next execution-relevant region remains visible in ordinary desktop use.
- In `NEEDS_REVISION`, keep the detail disclosure closed by default. Show the attention summary and targeted edit action first; details remain an explicit choice and must not promote successful source rows over the action the user must take.
- Preserve source order at narrow widths: Steps, compact review/action, then execution detail. Avoid horizontally clipped actions or code controls.

## 5. Files to modify

| File | Change | Risk |
| --- | --- | --- |
| `frontend/src/components/studio/review/CompileReviewPanel.tsx` | Add compact translation summary and accessible progressive disclosure; retain transaction ownership. | High |
| `frontend/src/components/studio/review/StepReviewList.tsx` | Support detail-only visual presentation where needed; retain all truthfulness and mapping guards. | High |
| `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` | Add stable/focusable source-row targeting and receive a focused revision action if needed. | Medium |
| `frontend/src/components/studio/review/*.test.tsx` | Update review, artifact, diagnostics, confirmation, and accessibility assertions. | Medium |
| `frontend/src/pages/ChecksStudioPage/*.test.tsx` | Verify page-level source-to-review interaction and preserved run gate. | Medium |

No API, schema, backend, dependency, or infrastructure files are expected to change.

## 6. Testing strategy

### 6.1 Component and integration tests

| Test | Covers |
| --- | --- |
| Compact awaiting-confirmation review has identity/count/action but no repeated source rows | FR-1, FR-2, AC-1 |
| Detail disclosure opens with mouse/keyboard, shows indexed source + artifact evidence, closes and restores focus without additional fetch | FR-3, NFR-2, NFR-3, AC-2 |
| Needs-revision summary counts affected rows and focuses the first aligned, non-truncated step-specific diagnostic row; global/truncated/misaligned cases focus the Steps heading instead | FR-4, CON-2, AC-3 |
| Compact compiling/ready/stale behavior retains appropriate text and only valid control | FR-6, AC-4 |
| Confirm is still enabled only for the exact valid candidate/hash and has a single in-flight request | FR-5, AC-5 |
| Artifact absence, unreadable artifact, and alignment defects remain explicit | CON-1, CON-2, AC-6 |
| Existing poll, conflict, recompile, run-gate, diagnostics, and artifact-review suites pass | NFR-3, NFR-4, AC-5, AC-9 |

### 6.2 Accessibility tests

- The compact review has a named region and polite compile-state announcement.
- The details trigger exposes its expanded state and controlled content relationship.
- Keyboard users can activate the trigger, read details, close it, and return to the trigger.
- Detail diagnostics preserve their association with their indexed step.
- No status/severity distinction is conveyed by color alone.

### 6.3 Responsive checks

- At the project narrow breakpoint, authoring precedes review/action in reading order.
- Long source, diagnostics, and code do not make controls inaccessible or force horizontal page overflow.

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Compacting the panel removes necessary confirmation evidence | High | Keep the explicit, discoverable detail view and all existing server-backed confirmation gates. |
| An implementation derives meaning from English to fill the summary | High | Use `currentCandidateArtifact` only; preserve unavailable/unrecognized messaging. |
| Focus-to-editor crosses component boundaries unreliably | Medium | Use stable row refs/IDs and assert focus after the revision action. |
| New disclosure causes duplicate polling or refetches | Medium | Keep review state in the existing `CompileReviewPanel` hook lifecycle and test the request count. |
| Accessibility regression from hiding detail | High | Preserve named regions, keyboard behavior, state announcement, diagnostic association, and focus restoration. |

## 8. Open questions

| ID | Question | Blocking | Assigned to |
| --- | --- | --- |
| OQ-1 | Should detailed review be an inline disclosure (recommended), an accordion, or a separate inspector/drawer? | No | @ux-design-expert / product owner |
| OQ-2 | Should the compact candidate state show only aggregate counts plus exceptions (recommended), or a compact list of all semantic operations? | No | @ux-design-expert / product owner |
| OQ-3 | Are product metrics such as detail-open rate, candidate-to-confirm time, and recompile rate desired? | No | @pm |

## 9. Implementation checklist

- [ ] Add compact review summary and accessible detail disclosure.
- [ ] Ensure `StepReviewList` is not rendered in compact review.
- [ ] Preserve artifact-only summary/code derivation and honest alignment/unavailable states.
- [ ] Add affected-step focus behavior for revision state.
- [ ] Preserve confirmation/recompile/poll/conflict semantics and their tests.
- [ ] Add absence/presence, keyboard/focus, state, responsive, and regression coverage.

## Metadata

- **Generated by:** @pm with @architect, @analyst, @ux-design-expert, and @qa review inputs
- **Inputs:** `requirements.json`, `complexity.json`, `research.json`, current Checks Studio source, BRD
- **Iteration:** 1
