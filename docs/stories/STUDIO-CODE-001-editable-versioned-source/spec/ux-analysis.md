# UI Studio Code tab: UX analysis and proposal

Owner: Uma / UX expert. Status: proposal for the spec pipeline; no application changes. Evidence reviewed on 2026-10-04 through repository inspection; no browser or live backend verification was performed.

## Requirement boundary

The user explicitly requests editing and downloading code from the Code tab, with a coherent execution-version model. Treat this as a product scope amendment. The current PRD promises readable actions/source and confirmation of the exact generated immutable revision, but does not explicitly promise source editing or source download. Its explicit download requirement concerns video. Python export is retired.

| Evidence | What it establishes |
|---|---|
| `PRD.md:84-99` | Checklist-first experience for users with varied technical skill; readable actions and expandable source; exact generated revision confirmation. |
| `PRD.md:104-113` | Video download; immutable confirmation and reconfirmation after relevant edits; no silent regeneration. |
| `PRD.md:128-131` | Playwright TypeScript source, Python retirement, keyboard navigation and accessibility. |
| `docs/architecture/studio-execution.md:84-89` | Source/configuration revisions, optimistic conflicts, immutable candidates, exact confirmation, configuration reconfirmation. |
| `docs/architecture/studio-execution.md:112-128` | Index-aligned step artifacts and bounded validated Playwright operations; unrestricted JavaScript is excluded. |
| `docs/architecture/studio-execution.md:134-136` | Current confirmed revision readiness; runtime incompatibility blocks execution without rewriting history. |

The labels, interactions and criteria below are recommendations derived from that request and these constraints, not claims that they already exist.

## Current behavior and gaps

1. **Read-only confirmed source.** `frontend/src/components/studio/CodeTab.tsx:60-79` reads only `confirmedRevisionArtifact` and compares it with saved English steps. Lines 170-197 render numbered English beside `<pre>` code. There is no editable field or download action.
2. **A bounded artifact, not a standalone file.** `CodeTab.tsx:9-25,44-47` explains the runner-supplied browser/assertion/value bindings. `studio-runner/src/validator/ast.ts:40-44,128-139` actually permits bounded sequences of awaited calls per artifact step, rather than requiring exactly one statement. `studio-runner/src/validator/schema.ts:106-121,152-163` enforces one artifact entry per English step, aligned index and identical `originalText`. Preserve this mapping in an editor.
3. **No source until a confirmed revision exists.** `CodeTab.tsx:203-217` tells the user to press Run to prepare source. It cannot offer code editing before generation without a new candidate/draft surface.
4. **The dirty state omits code.** `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx:273-281` tracks steps, variables and environment. Lines 312-329 protect navigation/unload using that state; lines 559-577 save only the current draft fields and expected revisions. Source editing requires joining these protections, not independent ephemeral editor state.
5. **The tab fetches independently.** `CodeTab.tsx:238-278` reloads confirmed source when active, and `ChecksStudioPage.tsx:1175-1180` supplies only test identity/activity/refresh token. A future editable draft must survive tab changes and background reads without being overwritten.
6. **PRD confirmation differs from the active Run implementation.** `frontend/src/components/studio/run/runEnablement.ts:35-40` maps unconfirmed/stale source to compilation; `useRunGate.ts:289-296,333-350` waits for READY and dispatches. The production compile path calls `publishAcceptedCandidate` (`backend/src/main/java/com/citi/put/checks/studio/compile/CompilePipeline.java:361-370`); that method stamps confirmation identity/time and READY (`compile/CompileStateService.java:281-303`) without a post-generation UI review. `CompileReviewPanel.tsx:29,156-159,217-223` contains an explicit review/confirmation surface, but the current page mounts RunControl and CodeTab, rather than this panel. This is a static-code finding; reconcile the intended Run policy with product/architecture before implementing source editing. A readiness gate that requires confirmation metadata does not itself prove the user reviewed the resulting bytes.

## Recommended interaction model

Keep English Steps as the starting point. Add explicit advanced source editing within the Code tab, backed by the same immutable execution-artifact lifecycle. Users edit a draft derived from a saved candidate or confirmed revision; they never mutate that revision in place. The backend validates manual source using the existing bounded-language policy, without sending manual text to the LLM for silent rewriting.

The Code tab needs a compact identity/status strip and three clearly named views: **Draft**, **Confirmed**, and **Last run** when a run exists. These are visibility choices, not alternate execution targets. Draft is the working source; Confirmed shows the exact immutable accepted artifact; Last run shows the artifact pinned to the selected run, even if subsequent edits changed the test. Default to Draft when work needs attention and Confirmed otherwise. Switching views or existing Studio tabs preserves the working buffer.

Show the origin (**Generated** or **Edited**), the base revision, saved/unsaved state, validation state and execution readiness. Prefer a short revision identifier with accessible full identity/details; do not call an eight-character content hash a unique revision number. Configuration changes can require a different execution revision while artifact code/hash remains identical. Present a sentence such as “Run will use confirmed revision …” only when the current server readiness says so.

### Flow A: inspect and download

1. Open Code; view confirmed source with English step labels and its immutable identity.
2. **Download revision** exports the selected persisted artifact and nonsecret provenance, explicitly identifying whether it is a candidate, confirmed revision or run revision. Downloading does not save, validate, confirm or run it.
3. Recommend a native Studio revision export for the initial release: the exact canonical artifact plus a manifest identifying ordered step mapping, artifact hash, revision identity and policy/runtime compatibility provenance, excluding secret values and credential-bearing execution data. Explain “Studio step source; runs in Studio.” This answers downloading accurately without inventing a runnable `.spec.ts` wrapper the service never executed.
4. Unsaved text must not download under a confirmed revision's identity. Initial release can require Save before downloading Draft; if a separate local export is later introduced, label it “Unvalidated draft,” not executable source. A portable Playwright project export would be a separately specified capability.

### Flow B: edit a locator or assertion

1. Select **Edit source** on a compatible saved candidate/confirmed artifact. Show brief capability guidance and the artifact being copied.
2. Show one editable code block per English step. The user may change permitted awaited operations inside a block. Label frozen English as **Original checklist context** after manual editing, and derive the current **Executed behavior** summary from validated operations. Step identities/order/English are context, not editable structural JSON. Structural English edits remain in Steps. Validation checks permitted syntax, references and policy; it does not prove equivalence to that original English.
3. Typing immediately marks **Unsaved source changes** and prevents execution of these changes. Page Save includes the source draft; tab switching keeps it. Cancel source edits restores the buffer's saved baseline after protecting unsaved content.
4. **Validate source** saves if needed, validates exact bytes/step mapping/references/policy through the server and returns actionable diagnostics on the affected block. Validation neither launches a browser nor invokes the model to repair text.
5. Valid source creates a new immutable manual candidate. Display changed code and derived operation summaries against the base revision; show the English beside the changes so users can judge intent.
6. **Confirm this exact revision** approves that candidate plus execution-affecting settings. Only then does Run execute that same artifact. Any later code, English, relevant context, settings or reference-policy change clears readiness. Keep the last confirmed/run source inspectable.

### Flow C: edit English after manual source exists

Recommendation for the initial release: invalidate the manual artifact as a whole after a generation-affecting English/context or structural change, and keep its previous code accessible for review/copy. Do not guess which positional edits preserve manually changed operations. Context-v2 identities can improve this in a later, explicitly designed merge policy.

Show “Steps changed after this source was edited. Review the changes or generate new source before running.” A deliberate **Generate from Steps** action creates a separate generated candidate; it never replaces confirmed history. If unsaved manual edits would be discarded, require an explicit choice to save them, discard them, or keep editing. Preserve the previous saved manual draft/history when regenerating; do not automatically translate code edits back into English. Confirmation review must make an English/code discrepancy visible; validation cannot prove that the revised assertion still represents the intended business condition.

### Flow D: Run with unconfirmed or invalid source

To align with the present PRD, Run on a generated source needing preparation performs preparation and then presents review; it does not dispatch newly produced bytes before exact revision confirmation. Run on manual source performs save/validation/review as needed, without returning to AI compilation. A clear **Confirm and Run** action can combine explicit approval of the displayed immutable candidate with dispatch after the server accepts that approval; preserve the candidate identity across both actions. This is a proposed lifecycle correction, not current behavior.

An already confirmed, compatible, unchanged revision runs directly. A stale/runtime-incompatible revision shows the server reason and required action. Avoid choosing an older revision silently to make Run work. Historical revisions are inspection/download targets in this scope; restore/re-execute history requires a separately reviewed action that creates a new current draft and reconfirmation.

### Flow E: conflicts and permissions

Source Save/Validate/Confirm races require expected draft, source and configuration identities. On conflict, preserve the buffer and show that a newer version exists; expose reload/compare before discarding local work. Do not repeat confirmation automatically against a new candidate. Readers can inspect/download authorized persisted revisions; edit/save/validate/confirm/execute affordances follow server-provided owner/admin permissions. A denied export must fail through the same CSI authorization as the revision read.

## State and action matrix

| State | Code tab | Available next action | Run behavior |
|---|---|---|---|
| Saved English; no source | Honest empty state | Generate from Steps | Prepare, then review |
| Editable source with local changes | Unsaved badge; existing confirmed source separately inspectable | Save or discard | Save and validate; stop for exact review |
| Saved source; validation pending/failed | Draft status; per-step diagnostics | Validate or correct | Explain blocker; never execute draft |
| Valid immutable candidate | Source and settings diff against base | Confirm exact revision | Show review / explicit Confirm and Run |
| Current confirmed compatible revision | Immutable identity and readiness | Edit source, download, Run | Dispatch pinned confirmed revision |
| Source changed since confirmation | Draft and earlier confirmed clearly distinguished | Validate or deliberate regeneration | No implicit fallback or overwrite |
| Run already in progress | Last run remains pinned | Inspect/download permitted source | Editing future drafts cannot change accepted execution |

## Proposed UX acceptance criteria

- **UX-01 — Honest editable surface:** authorized editors can edit bounded code for a saved artifact; immutable candidates, confirmed revisions and execution snapshots remain unchanged. Imports, arbitrary JS and unsupported Playwright operations receive server diagnostics.
- **UX-02 — Step mapping:** each editor block preserves its English/step identity; multiple permitted calls per step remain supported within existing limits. Reordering/adding/removing English steps makes stale mapping visible and prevents unnoticed index reuse.
- **UX-03 — Unified draft protection:** code changes participate in Save, unsaved badges, route/unload protection and save-before-validation. Changing tabs, refreshing a read or changing status does not erase local code edits.
- **UX-04 — Version visibility:** candidate/confirmed/last-run source identity and origin are separately inspectable. Users can determine what Run will execute and what the selected historical run actually executed, including after configuration-only changes with an unchanged artifact hash.
- **UX-05 — Exact review:** generated and manual candidates show source/settings changes and operation summaries before explicit confirmation. After manual editing, frozen English is labeled Original checklist context and the current behavior is derived from validated operations; it is not presented as an updated semantic explanation. Save, Validate, Compile and Download do not grant implicit confirmation.
- **UX-06 — Manual run authority:** a confirmed manual artifact executes its saved validated bytes/operations without LLM regeneration. All entry points, including rerun and autorun, honor the same identity and approval gate.
- **UX-07 — Regeneration protection:** generation-affecting Steps/context edits mark manual code stale; Regenerate is explicit, identifies potential replacement and protects unsaved edits. No reverse synchronization claims that English was updated from code.
- **UX-08 — Accurate download:** export carries the selected persisted revision identity, exact canonical artifact/hash and safe provenance; no resolved secrets. A file downloaded as confirmed/last-run source matches that revision, never the mutable draft or a locally fabricated script. Unsaved draft download is disabled or separately identified.
- **UX-09 — Race recovery:** stale Save/Validate/Confirm preserves local work and displays a specific conflict; a failed server approval cannot make Run appear ready. Reloading newer content requires protecting unsaved edits.
- **UX-10 — Accessible controls:** existing MUI/token conventions, keyboard access, visible focus, labeled per-step editors, announcements for save/validation/readiness, diagnostics linked to their block and status conveyed with text as well as color. Code editors provide a documented keyboard escape so Tab navigation does not trap users.
- **UX-11 — Intent limits:** confirmation explains that valid source may still implement the wrong locator/business assertion. Download does not imply portability or guarantee identical outcomes. Unsupported workflow guidance reflects the actual bounded runner.
- **UX-12 — Permissions and failure:** reader mode remains useful for inspect/export, owner actions fail authoritatively on unauthorized access, loading/export/validation errors do not replace confirmed source with misleading empty or fabricated content.

## Handoff decisions

Architect/product owners should settle the additive manual-draft API and provenance model; independent code-vs-English revision identity; the context-v2 reference policy used to validate manual arguments; and the PRD-versus-current-Run approval discrepancy. This document recommends the smallest honest export (exact artifact plus revision manifest) and whole-artifact invalidation for generation-affecting changes. A portable Playwright project, automatic bidirectional synchronization, per-step override merging and historical restore are outside this initial UX proposal.
