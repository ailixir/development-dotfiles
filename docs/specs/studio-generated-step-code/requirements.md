# Requirements v2: UI Studio generated step code

- **Version:** v2. **Date:** 2026-10-29. **Author:** Morgan (@pm). **Status:** active for AIOX Lean run SC008 (work item SC008-E21). Design record: `docs/architecture/ADR-SC-008-generated-step-code.md`.
- **Supersedes:** the 2026-10-29 draft (v1). Where an older document disagrees, this one governs for run SC008.
- **Precedence:** the user decisions X-1 to X-7 of 2026-10-29 (section 0) override everything else, including the PO defaults D-1 to D-18.
- **Owner column.** Every item below is either **active** and names the SC008 work item(s) that deliver it (E1 to E22), or **DEFERRED** and names the descoped effort. The in-scope work items are E1 to E8, E12, E16, E18, E21 and E22. The descoped efforts are E9, E10, E11, E13, E14, E15, E17, E19 and E20.

| WI | Name | WI | Name |
|---|---|---|---|
| E1 | Code-execution module (`runStep`, binding, syntax admission) | E12 | Learned only after a model-free proof (backend lifecycle and Studio) |
| E2 | Inference rewrite (reference generator, STEP_CODE prompt) | E16 | Example store and retrieval |
| E3 | Planner and validators (S-min) | E18 | Prompt tuning and re-validation |
| E4 | Plan builder, lowering, authorization, SQL | E21 | ADR, requirements, doc notes (this document) |
| E5 | Contract v3 in place, reseal | E22 | Gate run and fix loop |
| E6 | Shared driver rewire and removals | E9 | DEFERRED: one time policy, asynchronous dispatch |
| E7 | Deletions and test rewrite | E10 | DEFERRED: one learning environment |
| E8 | Secrets substitution | E11 | DEFERRED: parity harness |
| E13 | DEFERRED: static pre-scan (syntax check only remains) | E14 | DEFERRED: wrong-target tripwire |
| E15 | DEFERRED: learning in a forked child | E17 | DEFERRED: prompt-cache ordering |
| E19 | DEFERRED: frontend code view | E20 | DEFERRED: full planner (S-min stays) |

## 0. Source keys

| Key | Source |
|---|---|
| U-C1, U-C2, U-C3, U-DEL | PLAN-v3 "User requirements": C1, C2, C3, delivery constraint |
| U-DIR, U-LRN, U-UNV, U-GATE, U-WF, U-SEC, U-WA, U-PO1..3, U-INF1..3, U-KEEP | the matching headings of PLAN-v3 "User decisions (binding)" |
| **X-1** | **Step validation is execution only.** A step is learned when its frozen code runs without error in the model-free proof replay. No assertion is required, including for steps that state an outcome. Playwright's auto-wait and actionability errors are the check |
| **X-2** | Leak and network channels the wrapper does not cover are accepted as named risks: console, cookies, request bodies, Node-side `page.request` (bypasses the domain check), `exposeFunction`, Playwright error text |
| **X-3** | The allow-all domain switch stays ON for the gate and the release. The domain policy restricts nothing |
| **X-4** | No learn-vs-proof divergence check |
| **X-5** | D-1: the fifth smoke flow is the "navigation wording" real-site flow from the 2026-10-29 next-four batch |
| **X-6** | PO defaults apply for D-3, D-4 and D-6 to D-18 (section 11) |
| **X-7** | N1 to N3 stay release-blocking hard zeros, protected by prompt rules only (E18): write an `expect` for any step whose text states an outcome; return a clarification instead of code when the target is ambiguous |
| E-005DD, E-005N | ADR-SC-005 D-D (incremental re-learn from the first changed step); ADR-SC-005 note 2026-10-25 (proof video from the final validated script) |
| E-006 | ADR-SC-006 (functional scope only) |
| E-007G, E-007D1, E-007D7, E-007D8 | ADR-SC-007 release gate (with the 2026-10-28 amendment) and `frontend/e2e/realsite-gate/`; D1 input caps; D7 engine pin; D8 contracts changed in place |
| E-PRD, E-CLAUDE, E-MEM | PRD.md 5.2; CLAUDE.md (pnpm only); user decisions in project memory (single path, remove a gate rather than flag it, text plus variables in one value) |

---

## 1. Problem and goal

**User requirements (U-C1, U-C2, U-C3):**
- **C1:** "the engine is flexible for any web test. There is no hard-coded operation list or command, even for control: Gemini generates the right Playwright code for each step from the step text and the live page."
- **C2:** "learning and replay execute identically."
- **C3:** "a step can be called learned only once it is validated deterministically, without a model." Under X-1 "validated" means the frozen code ran without error in the model-free proof.

**Problem:** the baseline has a fixed typed operation set (C1 cannot hold), confirms a revision at publish before its proof, and carries per-case workarounds (`focusedSuccessor`, `replacedFocusedField`, `PAGE_STALE_RETRIES`, `CERTIFICATE_ATTEMPTS`).

**Goal:**
- At learning time the model writes Playwright code for each step, and that code is frozen into the revision.
- Replay runs exactly that code without a model.
- A step is learned when its frozen code runs without error in a model-free proof replay, and the test is confirmed when every step has done so.

**Delivery (U-DEL):** first production-ready release, high quality but pragmatic: keep most of the current implementation and refactor only the core.

## 2. Definitions

| Term | Meaning |
|---|---|
| **Step code** | The Playwright code the model generated for one authored step during learning |
| **Frozen** | Stored byte-exact in the published revision with a content hash. It is the only executable form of the step |
| **Recorded revision** | A published revision whose proof has not yet passed for every step. UI label: "Recorded, not verified (step N)" |
| **Proof** | The model-free replay of a recorded revision that runs right after learning (trigger `AFTER_LEARN`) |
| **Learned step** | A step whose frozen code ran without error in the proof (X-1) |
| **Confirmed revision** | A revision in which every step is learned in the proof of that same revision. It is promoted atomically and is the only kind that can be scheduled |
| **Prefix replay** | The model-free replay of steps 1 to k-1 that precedes re-learning from step k |

---

## 3. Functional requirements

| ID | Requirement | Acceptance | Owner |
|---|---|---|---|
| **FR-1** | **Generated step code.** For each authored step, Gemini on Vertex (`gemini-3.8-flash`, thinking LOW) generates Playwright code from the step text and the sanitized live-page observation. No hard-coded operation list or command, control flow included, decides which code may be generated. | (a) No operation allow-list admits code. The run-integrity denial (7 members) and the effect classes are run control and never refuse an operation (D-13). A source review and a grep cite the admission code. (b) At fixture tier at least one step whose code uses a Playwright API outside the baseline's 10 operation kinds learns and confirms. | E1, E2, E3 |
| **FR-2** | **Playwright reference.** The prompt carries a reference generated from the pinned Playwright 1.63.0 type definitions and their doc comments. It is guidance, not an allow-list. | (a) Two builds from the same pin are byte-identical. (b) Its hash (`referenceHash`) is in the run's environment record. (c) Code that calls an API absent from the reference is not refused for that reason alone. | E2 |
| **FR-3** | **Freezing.** The code of every learned step is stored in the published revision byte-exact with a per-step hash. Secret values are never part of it (FR-17). Replay re-admission is the hash check plus the syntax check only; the artifact HMAC is not in this release (ADR-SC-005 P2, D-9, pre-pilot). | A read returns code whose hash equals the hash recorded at learning. A one-byte tamper is refused before any action with a closed code and zero effects (joined test). | E4, E1, E5 |
| **FR-4** | **Model-free replay.** Proof, manual, scheduled and prefix replay execute exactly the frozen code. They make no model call, no example retrieval and no regeneration. | The authenticated gateway and model-attempt counters stay unchanged across proof, manual, scheduled and prefix replay, in joined tests and in the gate (G4). | E6, E1 |
| **FR-5** | **One execution path.** Learning, proof, manual, scheduled and prefix replay run a step through the same `runStep` on the same frozen code. Checks that run only during learning may accept or reject a proposal; they never change how the step executes. | The import-boundary test shows every mode calls `runStep`. G3 and G4 pass. *DEFERRED: same browser environment and time policy in both modes (E9, E10) and the parity-harness acceptance (E11); see L-8 to L-10.* | E1, E6 |
| **FR-6** | **Time policy. DEFERRED (E9).** Today's behaviour stays: the two `actionBudget.ts` profiles, the 15 s transport, a 12 s learn dispatch window, and a 30 s replay navigation. `actionBudget.ts` is not changed in this release. | None. The v1 navigation-timing test is not run. If a gate positive fails only on the 12 s learn window, it escalates to the user as an E9 re-scope (D-14). | E9 |
| **FR-7** | **Learned state.** A step is "learned" only when its frozen code ran without error in the model-free proof of its revision (X-1). Until then it is "recorded". | A step with no PASSED proof result bound to that revision is never shown or stored as learned (joined test plus frontend test). The learned-state copy states L-1 and L-16. | E12, E5 |
| **FR-8** | **Validation is execution.** The proof's error-free execution is the validation. A step passes in the proof when its frozen code completes without error; no assertion is required, including for steps that state an outcome (X-1). Playwright's auto-wait and actionability errors, and any `expect` the model wrote, are the check, and a failing `expect` fails the step. Protection of N1 to N3 is by prompt rules (X-7): the model writes an `expect` for any step whose text states an outcome, and returns a clarification instead of code when the target is ambiguous. | (a) A step whose code throws in the proof is FAILED, and a step whose code completes is PASSED, with no assertion count. (b) A step whose `expect` fails is FAILED. (c) Promotion keys only on the per-step PASS from the proof. (d) The two prompt rules are in the tuned contract text, checked in E18 and by G6. | E1, E12, E18 |
| **FR-9** | **Atomic promotion.** When every step of revision R is PASSED in the proof of R, R becomes the confirmed revision in one compare-and-set transaction that checks R is still the current candidate. Proof that is pending, refused, cancelled, timed out, failed, or missing step results never promotes. | (a) A late passing proof of an older revision A does not confirm the newer B. (b) A duplicate callback counts once. (c) Each non-passing state is tested and never promotes. (d) The confirm-before-proof assertions in `GuidedPublicationProofIT` are reversed. | E12 |
| **FR-10** | **Unverified revisions.** (a) A recorded revision shows "Recorded, not verified (step N)", N being the first step without a PASSED result. (b) Manual Run is allowed on it as a labelled diagnostic that never counts as verification, never promotes and never produces a proof. (c) Only confirmed revisions are scheduled. (d) The previous confirmed revision keeps its schedules until the new one is promoted. | Joined tests: the scheduler keeps firing the old confirmed revision while the new proof is pending and fires the new one after promotion. A diagnostic run leaves the confirmed pointer unchanged. The frontend renders the label with the right N. | E12 |
| **FR-11** | **Re-learn from step N.** (a) After an edit, the first changed step k is computed as in ADR-SC-005 D-D: steps 1 to k-1 replay model-free from frozen code with freshly captured values, and steps k to n are learned again. (b) After a failed proof at step N, Studio offers "Re-learn from step N". The base is the recorded candidate, whose steps 1 to N-1 hold PASSED results (D-3). Steps 1 to N-1 replay model-free and learning restarts at N. (c) D-D's conditions stay: only target or observation drift in the prefix may switch to learning; a failed assertion or policy refusal in the prefix stops the run. | (a) Editing step 4 of 10: zero model calls for steps 1 to 3, steps 4 to 10 re-learned, prefix hashes unchanged. (b) A proof failure at step N: zero gateway calls during steps 1 to N-1. | E12, E6 |
| **FR-12** | **Verify again.** For a proof that was refused, cancelled or timed out, Studio offers "Verify again": it re-runs the proof of the same recorded revision with zero model calls. It is not offered after a FAILED proof, which offers "Re-learn from step N" (D-4). | The model-attempt count is unchanged. A pass promotes under FR-9. A crash while a proof is pending leaves the test recoverable through Verify again. | E12 |
| **FR-13** | **Example retrieval.** Inference receives a curated example set plus at most 3 sanitized step-code examples, retrieved only from steps whose frozen code passed a model-free proof, same CSI only. | (a) Inserting an example with no PASSED proof id is rejected. (b) Retrieval returns at most 3 and is deterministic for the same input and store snapshot. (c) Retrieval never runs during replay (static test plus counter). (d) The canary scan of stored and assembled examples finds 0. | E16, E2 **Dropped 2026-10-30:** example retrieval was dropped by user decision after the E18 eval (R-T within noise, -0.4 pp); the example store and recorder stay with no reader. |
| **FR-14** | **Frozen example store for gate runs.** Gate runs use a frozen snapshot that excludes every gate step (the 14 positives and N1 to N3) and the smoke steps (D-1). | The snapshot hash is in the gate environment record. Seeding any gate step makes the environment check refuse to start. | E16, E22 **Dropped 2026-10-30:** example retrieval was dropped by user decision after the E18 eval (R-T within noise, -0.4 pp); the example store and recorder stay with no reader. |
| **FR-15** | **Two-stage inference, re-validated.** The carried design is two stages: plan the test, then generate code for one step with only the relevant reference sections. Before the counted run, the team records a comparison against single-stage-with-full-reference, and a keep-or-drop decision for retrieval, under the D-10 criterion (two-stage kept if its per-step first-attempt success on the tuning corpus with gate steps held out is at least single-stage minus 5 points and its p95 learn time is no worse; retrieval kept only if success is not lower and repair attempts are not higher). | The comparison is recorded against D-10, thresholds written before the first run, and the decision is written into ADR-SC-008. | E18, E2 **Dropped 2026-10-30:** example retrieval was dropped by user decision after the E18 eval (R-T within noise, -0.4 pp); the example store and recorder stay with no reader. |
| **FR-16** | **Full expected text.** When generated code asserts the authored expected text of a "contains text" check, the assertion uses the complete authored text, never a shortened span. This is a prompt rule only (X-1); no runtime check refuses a shortened span. | The rule is in the tuned contract text (E18), and N2 is measured in the gate (G6). | E18 |
| **FR-17** | **Secrets.** `<secret ID>` references resolve from Vault at dispatch. Secret values never reach the model, the frozen code, examples, prompts, logs or artifacts. Generated code reaches a secret only through an opaque handle that is substituted only into the fill of the single password control; any other use is `POLICY_DENIED`. On a secret-bearing document the `evaluate` family, `addScriptTag` and `waitForFunction` are refused. | Canary secret: the leak scan (G5) finds 0 across all sinks, frozen code and the example store included. A secret-fill fixture learns and replays. | E8, E1 |
| **FR-18** | **Run-time values.** `<var NAME>` values (alone or mixed with text) and values captured by an earlier step are bound when the step runs, never copied into the frozen code. | A fixture whose captured value changes between runs passes in proof and manual replay with the fresh value; the learn-time value does not appear in the replay record. | E1, E6 |
| **FR-19** | **Certificate invalidation.** Generated code that can change the page invalidates that page's source certificates; the next observation recertifies within the remaining time. Frames: the outline carries an iframe line and the cross-frame refusal is kept (ADR-SC-008 D7). The bounded pseudo-element privacy check runs on every fresh capture. | At fixture tier a step that mutates the page is followed by recertification, and reuse of a pre-mutation certificate is refused. The pseudo-element negative and positive fixtures pass. | E6 |
| **FR-20** | **Workaround removal.** `focusedSuccessor`, `replacedFocusedField`, `PAGE_STALE_RETRIES`, `CERTIFICATE_ATTEMPTS`, `FILL_FIRST_ATTEMPT_MS`, `KEY_FIRST_ATTEMPT_MS`, `ACQUISITION_LIMITS` and `ReplayAcquisitionBudget` are deleted with no flag, kill switch or renamed equivalent. | A grep of `studio-runner/src` for the eight names returns 0. The unmodified `fillReplacedField` and `fillPressSuccessor` fixtures pass or fail with a closed code. | E6, E7 |
| **FR-21** | **Per-step results.** Per-step results stay in `ui_test_executions`; each proof result is bound to its proof execution id and revision id. | A joined test reads the per-step PASSED, FAILED or NOT_RUN status with both ids. | E5, E6, E12 |
| **FR-22** | **Proof video.** The proof video is the recording of the proof replay of the exact frozen revision; each revision has one. Popup recordings are deleted when the run closes. | A joined test: the result's `proof` references the `AFTER_LEARN` execution and its video is AVAILABLE. | E6, E12 |
| **FR-23** | **Honest failure.** A step for which learning cannot produce code that runs ends with a closed error code. No confirmed revision results and the step is never silently skipped. | N1 to N3 (G6) and the fixture negatives end with their closed codes or a clarification. | E3, E1 |

---

## 4. Non-functional requirements

| ID | Requirement | Acceptance | Owner |
|---|---|---|---|
| **NFR-1** | **Determinism and parity. DEFERRED (E10, E11).** Replaced by named limit L-10. C2 evidence is the same frozen code through the same `runStep` (FR-5), plus G3 and G4. | None. | E10, E11 |
| **NFR-2** | **Retries never repeat an effect.** A retry never re-executes code that may already have dispatched an effect. The fence sits at the first effectful call (unknown counts as effectful). A locator with zero or several matches gives `TARGET_DRIFT` with 0 effects. Unknown outcome, cancellation, lost authority and policy refusal are terminal. | At fixture tier the server-side effect counter equals exactly 1 for a lost response after a click, a cancellation mid-step and a timeout after the fence. | E1, E3 |
| **NFR-3** | **Security boundary as is.** These layers apply unchanged to generated code: (1) the navigation domain policy; (2) `<secret ID>` resolution at dispatch, never sent to the model; (3) the sanitizer on everything sent to the model; (4) the Chromium sandbox; (5) closed error codes. No new sandbox layer. The only boundary change is the smallest evaluation primitive (ADR-SC-008 D3.1, answering R-1): the four D3.1 guard changes, with `no-dynamic-evaluation.test.ts` and the ADR-SC-007 `evaluate` ban amended only as D3.1 states. Accepted residuals: L-13 (learning code runs with server privileges), L-17 (uncovered channels), L-18 (allow-all ON). | (a) With allow-all OFF in a fixture, generated code that navigates to a non-whitelisted domain is refused before any effect. (b) The ADR records every guard it changes. (c) The boundary tests are amended, never deleted silently. | E1, E8 |
| **NFR-4** | **Privacy and the sanitizer.** Every model-bound input passes the sanitizer: the observation outline, step text, retrieved examples, and earlier code or error text sent back for repair. | The canary suite gives 0 hits in assembled prompts and recorded gateway bodies. | E2, E8, E16 |
| **NFR-5** | **Learning latency.** Each authored step finishes learning within **120,000 ms**, covering queue and startup, acquisition, model calls, retries and backoff, and the repair loop (3 attempts inside the step clock). The clock never resets on a retry or clarification. | Measured by the gate (G2). | E3, E18, E22 |
| **NFR-6** | **Cost.** Per-session model budgets stay as configured at the baseline (D-11); no new ceiling. Calls, tokens and cached-token share are reported per test. The cached share is expected to be about 0 (E17 deferred, L-14). | The gate report (G8) carries them. A test over budget fails with `BUDGET_EXCEEDED`. | E18, E22 |
| **NFR-7** | **Model input caps.** Prompts, including reference sections and examples, fit 98,304 bytes for translation input and 262,144 bytes for the gateway. No silent truncation. | An offline build over the tuning corpus reports maximum and p95, and no prompt exceeds a cap. | E2, E18 |
| **NFR-8** | **Observability.** Each gate run records git SHA, model id, contract hash, `promptHash`, `referenceHash`, example-store snapshot hash, Playwright version and bundle sha256 (the engine pin), and gateway settings. Every step failure carries a closed code. | Gate environment record and report (G8). | E2, E16, E22 **Dropped 2026-10-30:** example retrieval was dropped by user decision after the E18 eval (R-T within noise, -0.4 pp); the example store and recorder stay with no reader. |

---

## 5. Constraints

| ID | Constraint | Owner |
|---|---|---|
| **CON-1** | Replay is model-free: no runtime AI and no silent regeneration. | E1, E6 |
| **CON-2** | One observed authoring path. No compatibility layer, legacy path, old route, redirect, flag or kill switch. A removed gate is deleted. Contracts change in place in v3 (no `contracts/v4`); after E5 is accepted, any contract change is an E5 revision and a full reseal. | All WIs; E5 |
| **CON-3** | Functional scope only (ADR-SC-006): no ACs or tasks beyond functional behaviour. | All WIs |
| **CON-4** | Vertex AI is the only provider: `gemini-3.8-flash`, thinking LOW. | E2 |
| **CON-5** | pnpm only, never npm or yarn. | All WIs |
| **CON-6** | Playwright stays pinned at 1.63.0 with the `coreBundle` sha pin and `ENGINE_PIN_MISMATCH` refusal. | E1 |
| **CON-7** | Keep most of the current implementation and refactor only the core. Kept: AI-snapshot perception with the sanitized outline, guided session and backend orchestration, publication, proof launcher, partial re-learn, recorder and video, Vault resolution, domain policy, SSE, per-step results. | All WIs |
| **CON-8** | The ADR-SC-007 Lean run is closed as superseded, by record, with nothing more done on it. Its tree is the baseline: commit `f3b4783b1`. | E21 |
| **CON-9** | The security boundary is kept as is, with no new sandbox layer (NFR-3). | E1, E8 |

---

## 6. Out of scope

1. The 20-workflows by 3-repetitions pilot benchmark (ADR-SC-005 D-C) is not a gate for this release. It stays a pre-pilot gate (D-7); the gate report says so.
2. 24-hour or next-day replay and the L1 secret-login canary (removed 2026-10-28).
3. A new sandbox layer.
4. State reset or an isolated baseline for side effects (L-1).
5. The typed operation registry as an allow-list. Its data feeds the reference (FR-2).
6. Any further work on the ADR-SC-007 Lean run.
7. `.claude/settings.json` changes (intended; not part of this run).
8. Anything excluded by ADR-SC-006 (CON-3).
9. Browser engines other than Chromium.
10. ADR-SC-007 WI-5 supplementary probes (edit/relearn canary, two captured values, wording probes); re-learn is covered at fixture and joined-test tier by FR-11.
11. **DEFERRED, E9:** one time policy and asynchronous dispatch (FR-6).
12. **DEFERRED, E10:** one learning environment (viewport and settings).
13. **DEFERRED, E11:** parity harness (NFR-1, FR-5 acceptance).
14. **DEFERRED, E13:** full static pre-scan; only the syntax check remains.
15. **DEFERRED, E14:** wrong-target tripwire (same-element check, identity witness).
16. **DEFERRED, E15:** learning in a forked child.
17. **DEFERRED, E17:** prompt-cache ordering.
18. **DEFERRED, E19:** frontend code view; authors see step status only.
19. **DEFERRED, E20:** full planner; the S-min single open `step` kind stays.
20. **DEFERRED:** artifact HMAC (ADR-SC-005 P2); pre-pilot (D-9).
21. Learn-vs-proof divergence check (X-4, L-19).
22. Iframe content in perception (D-17): a follow-up that needs compliance.

---

## 7. Assumptions and named limits

| ID | Statement | Source |
|---|---|---|
| **L-1** | **The proof repeats side effects without a reset.** "Learned" means the frozen code ran once without error in a model-free replay from the same prefix. It does not mean the step is safe to repeat. Studio states this in the learned-state copy. | U-LRN |
| **L-2** | Literally "any web test" is not achievable by any design. C1 means no hard-coded operation list, not a guarantee for every application. | consensus review |
| **L-3** | Nothing proves generated code deterministic. The evidence is the proof plus two model-free replays on the same day. No durability claim beyond the same day. | E-007G |
| **L-4** | The 14 gate positives exercise navigation, select, radio, checkbox, field, search, read, table, disclosure and menu. Popups, multi-page flows and iframes (and dialogs, uploads, page scripts) are supported **at fixture tier only** and are not verified on real sites (D-12). The verdict says so. | D-12 |
| **L-5** | The allow-all domain switch is ON, so the domain policy restricts nothing. Detail and decision: L-18. | X-3 |
| **L-6** | The baseline is not green: Kernel learning failed in run 5126 and GitHub's first manual replay failed. Every "no regression" statement is measured against a baseline run id recorded before the build. | E-007G |
| **L-7** | A result that page code computes is untrusted evidence. No check in this release bounds it (see L-16). | ADR-SC-007 D7 |
| **L-8** | Learning and replay timing differ: the 12 s learn dispatch window stays (E9 deferred); replay navigation waits 30 s. A slow first navigation can fail learning where replay would pass (GitHub risk). | E9 |
| **L-9** | The learning viewport differs from the proof's (E10 deferred). A step can pass learning and fail the proof; the proof then fails that step and never passes silently. | E10 |
| **L-10** | No per-step parity evidence between modes (E11 deferred). C2 rests on one `runStep`, the same frozen code, and G3 and G4. | E11 |
| **L-11** | No static pre-scan (E13 deferred): no free-identifier, member or provenance rules, and the "no invented literal bytes" input policy is enforced only for secrets. | E13 |
| **L-12** | No wrong-target tripwire (E14 deferred): a wrong-but-unique target or an unrequested side-effecting click is caught only afterwards, by Playwright errors, a model-written `expect` or the proof. | E14 |
| **L-13** | During learning, generated code runs with the runner server's privileges (E15 deferred). "Boundary as is" holds for replay in the killable child. | E15 |
| **L-14** | No prompt caching (E17 deferred): cost and latency rise. | E17 |
| **L-15** | An S-min planner vocabulary remains: one open `step` kind (E20 deferred). | E20 |
| **L-16** | **Validation is execution only (X-1).** A step with no assertion whose code runs without error is learned, even if the outcome is wrong. Playwright's auto-wait and actionability errors and any `expect` the model wrote are the only checks. Learned does not mean correct. The learned-state copy says so. | X-1 |
| **L-17** | **Uncovered channels are accepted (X-2).** Console output, cookies, request bodies, Node-side `page.request` (which bypasses the domain check), `exposeFunction` and Playwright error text are not covered by the wrapper. The leak scan (G5) still scans the sinks it names, and a hit fails the gate. | X-2 |
| **L-18** | **Allow-all domain switch ON (X-3)** for the counted gate and the release. The domain policy restricts nothing, while generated code can navigate anywhere. This supersedes the PO default D-5 (OFF). | X-3 |
| **L-19** | **No learn-vs-proof divergence check (X-4).** A step whose learning run and proof differ is found only when the proof fails. | X-4 |

---

## 8. Rulings (answered by ADR-SC-008)

| ID | Ruling | Answer |
|---|---|---|
| R-1 | Evaluation primitive and boundary changes | ADR-SC-008 D3.1 (NFR-3) |
| R-2 | Frames, cross-frame refusal, certificate invalidation | ADR-SC-008 D7 (FR-19) |
| R-3 | Navigation wait outside the dispatch window | Moot: deferred with E9; the per-mode clamp in D3.4 applies |
| R-4 | Retries and effect classes for arbitrary code | ADR-SC-008 D3.3 (NFR-2) |

---

## 9. Release acceptance gate

**Rule:** acceptance and "production-ready" mean G1 to G7, executed on the final frozen stack by E22. G0 is a smoke test. The gate is binary: after any product fix the whole suite re-runs under a new run id (`rg-YYYYMMDD-N`) and earlier results stay in the report. Dry runs (`dry-...`) are never evidence. The corpus `verify.mjs` must pass the same day. Three consecutive whole-suite failures of the same class escalate to the user. Fixes go through `SC008-FIX-n` work items (D-18).

| ID | Item | Threshold | Owner |
|---|---|---|---|
| **G0** | **Smoke (not acceptance):** Wikipedia, IANA, Kernel, GitHub, and the "navigation wording" flow (X-5). | Each flow learns, confirms and replays once before the counted run; a smoke failure blocks the counted run. Smoke steps are excluded from the gate example store. | E22 |
| **G1** | **14 public-site positives** from `frontend/e2e/realsite-gate/gate-table.json`, steps verbatim (alpha: wikipedia, govuk, hackernews, pythondocs, mdn, github; fresh: debian-form, debian-reuse, kernel-table, kernel-releases, iana-registry, iana-home, datatracker-reuse, datatracker-filters). Flow: All Checks, Create Check, UI Test, author, Save, Run Test (learn), proof, two manual Runs, detail page. | **14 of 14** reach the **confirmed** state with no clarification. One retry only, for a classified infrastructure failure (`TRANSPORT_*`, HTTP 429/5xx, `MODEL_UNAVAILABLE`). Any other closed code fails the test. | E22 |
| **G2** | **At most 120 s per learning step** | Every authored step of every positive is at most 120,000 ms by monotonic receipts. Missing or crossed timing fails the test. | E22, E3 |
| **G3** | **Proof** | The `AFTER_LEARN` proof is PASSED for every step, with video AVAILABLE, for all 14. | E22, E12, E6 |
| **G4** | **Two model-free replays** | For each positive, 2 of 2 manual replays PASSED with the model-attempt count unchanged. | E22, E6 |
| **G5** | **Leak scan** | 0 occurrences of any canary (raw, URL-encoded, `+`-encoded, split) across sessions, model attempts, runner logs, artifacts, recorded gateway bodies, frozen step code, the example store and assembled prompts. A scan with zero declared canaries fails. | E22, E8, E16 |
| **G6** | **False-pass controls N1 to N3. Hard zeros (X-7).** **N1** (python docs, select "3.99"): ends at step 2 with no option selected. **N2** (kernel, wrong RSYNC literal): never passes. **N3** (debian, absent "Install" button): clarification or refusal, no click dispatched. | For all three: no revision published or confirmed and no action on a wrong element. Any publication, proof or pass is a hard zero. N1 and N2 closed codes are not pinned; `TARGET_MISMATCH` is no longer emitted. The protection is the E18 prompt rules; the E22 evaluator is rebuilt on effect receipts. If the model does not comply, the gate fix loop runs further prompt-tuning rounds. | E22, E18 |
| **G7** | **Same-day integrity** | Working-tree digests at start and end match, the corpus `verify.mjs` passes the same day, and a clean dry-run scan exists within 24 h. | E22 |
| **G8** | **Reported with the verdict** | Per test: learn and replay duration, calls and tokens, clarifications, refusal counts, p50/p95 model time. The environment record (NFR-8), L-1 to L-19 and the deferred-item consequences are stated. The report says this gate is not the D-C benchmark. | E22 |

---

## 10. Superseded clauses in older documents (dated notes added by E21)

| Document | Clause | Driven by |
|---|---|---|
| ADR-001 | "Generated source is never evaluated" | NFR-3 |
| ADR-SC-004 | paragraphs 1 and 2 (typed operations, no generated code) | FR-1 |
| ADR-SC-005 | D-A; the 2026-10-25 note ("a revision never exists without its proof"); D-C for this release | FR-7, FR-9, FR-10, D-7 |
| ADR-SC-007 | D2, D3, D4, D7 item 2, the D4 verification line, the release-gate state string; status "Superseded in part by ADR-SC-008" | FR-1, NFR-3, G1 |
| `docs/architecture/studio-execution.md` | section 4.5 | NFR-3 |
| PLAN-v3 | "Time policy" bullet | FR-6 (deferred) |
| PRD.md | 5.2 lifecycle, scope for multi-page, popups and iframes | FR-7, FR-10, D-12 |

Export-shape disclosure (frozen step code, retrieved examples, repair text): ADR-002 section 13 and `docs/specs/studio-observed-authoring/guided-data-flow.md` section 3.4. Compliance re-confirmation request: `compliance-request.md` (D-6).

## 11. Decisions record

Open questions OQ-1 to OQ-12 of v1 are closed or moved:

| Item | Resolution |
|---|---|
| OQ-1, OQ-2 | Closed by ADR-SC-008 D4: the model writes locators and the target gates leave admission |
| OQ-4 | Closed by X-1 |
| OQ-12 | Closed: status only (E19 deferred) |
| OQ-3, OQ-5 to OQ-11 | Moved to D-1 to D-12 below |

PO decisions D-1 to D-18 (SC008 backlog section 5), as resolved on 2026-10-29:

| # | Decision | Resolution |
|---|---|---|
| D-1 | Smoke flows | **= X-5.** The fifth flow is the "navigation wording" real-site flow. Rule in G0 |
| D-2 | Unchecked witness counts as learned | **Superseded by X-1.** There is no verify block; execution alone validates |
| D-3 | Re-learn base after a failed proof | PO default (X-6): the recorded candidate (FR-11) |
| D-4 | Verify again after FAILED | PO default (X-6): no (FR-12) |
| D-5 | Allow-all switch | **Superseded by X-3.** ON for gate and release (L-18) |
| D-6 | Compliance re-confirmation of the export shape | PO default (X-6): before production enablement with real CSI data, not before the build or the public-site gate. Request draft: `compliance-request.md` |
| D-7 | 20x3 benchmark | PO default (X-6): not a release gate; kept as a pre-pilot gate |
| D-8 | Security P1 review (R-1, D3.4 residual, pseudo-element privacy) | PO default (X-6): required after E1, E6 and E8 freeze and before the counted gate; blocks release acceptance, not the build |
| D-9 | Artifact HMAC | PO default (X-6): deferred to before a pilot |
| D-10 | Two-stage and retrieval criterion | PO default (X-6): as in FR-15 |
| D-11 | Cost ceiling | PO default (X-6): none; budgets unchanged; reported per test |
| D-12 | Popups, multi-page, iframes in PRD | PO default (X-6): supported at fixture tier only, not verified on real sites (L-4, PRD 5.2) |
| D-13 | Run-integrity denial plus effect classes; S-min single `step` kind | PO default (X-6): accepted (FR-1, L-15) |
| D-14 | PLAN-v3 time policy vs E9 descope | PO default (X-6): deferred (FR-6) |
| D-15 | Checkpoint content | Done: baseline `f3b4783b1` (CON-8) |
| D-16 | Durable Lean state root, closure by record | PO default (X-6): applied |
| D-17 | Iframe content in perception | PO default (X-6): follow-up, not this release |
| D-18 | Gate-loop fixes | PO default (X-6): new `SC008-FIX-n` work items |

Lean scope for the product work items: FR-1 to FR-5, FR-7 to FR-23 and NFR-2 to NFR-8. FR-6 and NFR-1 are DEFERRED.
