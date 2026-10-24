# STUDIO-OBS-010 login-workflow pilot protocol

Protocol draft, Atlas (@analyst), 2026-10-18 EDT. **NOT STARTED. No participant recruited/contacted/enrolled, no consent obtained, no session or observation recorded.** This off-tree preparation does not open T0/T1. Real sessions require at least five real nontechnical participants; simulated users and agent walkthroughs cannot satisfy AC2.

## Entry sheet — complete before booking or using a real credential

| Gate | Owner | Current state / missing input |
|---|---|---|
| OBS009 independent Done plus D-C pass |009QA / benchmark executor |Pending; actual>=90% success, zero false-pass, zero leak report absent. Local-validation MET opens only T2/011. |
| U9 explicit authorization for participant contact |User |Not supplied; no invitations sent. YOLO implementation authority is not participant-contact permission. |
| >=5 real nontechnical people + individual consent |User / analyst |Five unassigned slots P01…P05 only. Recruit operational users who do not routinely write selectors/browser tests; capture eligibility privately, not names in repository. |
| U3 app/account/origins/test secret and oracle |User / app owner / Platform-SRE |No approved app, access, account, secret, exact origin list or protected-page oracle identified. No fabricated example is a staging proof. |
| G1/G2, U4/U5/U23/U24 |Platform-SRE / ED02 / user / devops |Shared authenticated TLS chain, production secret-use authorization, Vault/provider inputs, issuer tokens, policy owner/content/approval and deployed supported image/catalog are owed. No real credential enters Vault before G2. |
| F04 before deployed pilot |Platform-SRE / Security & Compliance / PM |F04 not landed; E1…8 unconfirmed. Need landed evidence or explicit external security acceptance of absence as named residual with owner. |
| FOCUS-MUTATION-01 |Analyst + dev + QA |Per-app/per-target real-Chromium probe on intended pinned dist/isolated collector unrun. See below. Every target passes before session. |
| MODEL-SIZING disclosure/re-rule |PM /009T4 |Actual p95 pendingT4; ifT6<15, PM must re-decide before pilot. No estimated value. |
| Shipped008 copy freeze |Analyst / PM / QA |Source-bound copy appendix below prepared; re-hash and PM-review before using the script. No new policy-denied sentence or pre-Ready drift wording. |
| Recording/observation handling |Analyst / Security & Compliance |Consent/storage/access/retention approval not obtained. No names, credentials or page-derived sensitive values in repo; participant ID and value-free observations only. |

Do not book/contact people or run the workflow until applicable gates have dated evidence. After009Done, the dated Live list is remeasured/reaccepted before formal T3/T4. This pilot does not itself close deployment, Security or GA staging rows.

## Task card preparation

After the app owner supplies the real workflow, the analyst freezes a participant-facing card with these fields filled from approved evidence: application name; start/protected page purpose; username saved-input name USER; secret name PASS; safe action labels and a grounded pair of ambiguous choices; the middle-step number k and its benign alternative; actual expected protected-page outcome; cleanup/reset owner; app release ID; intended runner dist/image/catalog; time limit agreed by PM. These are currently **unfilled**, not generic URLs or assumed accounts.

The approved workflow includes: visit the login-protected page; enter USER using the reference picker; fill PASS using the secret picker; submit; verify the protected-page state using a visible assertion; make a genuine ambiguous request grounded in two reachable visible controls; finish with a benign observation; edit one middle step k, then Run to repeat the prefix and learn only the suffix. Choose harmless approved actions; a side-effect confirmation must remain truthful and, if declined, cancel and focus stepN. The workflow must retain AC1's login, ambiguity and incremental re-learn, without selectors, capture syntax or developer help. PM approves any later removal/substitution of a target, including a focus-incompatible field.

For blocked-login recovery, prepare an additional initial state on the same approved app: a protected-page instruction with missing login steps, reached by the product's authentic login detection. The participant adds login steps through the picker after reading guidance. Never forge a server state or tell a participant that an infrastructure error was LOGIN_REQUIRED. Record the unexpected path as a failed/blocked attempt.

## Facilitator script

Read the following introduction after consent and eligibility are documented: “We are checking how clear Studio is for people who describe operational checks in ordinary language. We are testing the product, and difficulties are useful findings. Please describe what you are trying to do as you work. You can stop at any time. Use only the approved test account and the saved inputs supplied for this session. Do not say or paste the password into your instructions.”

1. **Author and first Run.** Hand over the frozen card: “Create a check that opens the protected page and verifies the result on your card. Write the steps in your own words. Run it when you think it is ready.” Start first-Run timer when the card is handed over; stop at the first actual Run activation, not when the run completes. Let the authentic blocked-by-login guidance appear in the prepared initial state. Observe whether the participant finds and uses the saved-input/secret picker to add login steps, returns to the relevant step, and runs again without coaching. Record actual first-Run time, steps authored and each attempt outcome. The task does not succeed merely because the UI says published; verify the real app-side oracle.
2. **Ambiguity.** Continue with the genuine ambiguous instruction from the card: “Now ask the check to use the choice described on the card.” When a real clarification appears, ask “What is this asking you to decide?” Record yes/no understanding before correction, choice, outcome and any help. A fabricated clarification, technical selector explanation or page-meaning instruction is not acceptable. If no clarification appears, preserve the attempt and route the mismatch; do not silently count the task as complete.
3. **Incremental re-learn.** “Change the middle instruction indicated on the card to its alternative, then run the check again.” Before they run, ask “What do you expect Studio to do with the earlier steps?” Record yes/no understanding of `Steps changed — next Run learns from step {k}` independently of whether the run passes. After Run, record the actual replayed-prefix/learned-suffix boundary and completion; require the backend/recording evidence for technical semantics, not participant belief alone.
4. **Evidence comprehension.** “Show where you would check what happened at one step.” Record whether the participant uses the recording/step linkage and distinguishes a run outcome from recording availability. This is a usability observation, not a new a11y requirement or replacement staging seek proof.
5. **Debrief.** “Which wording or action was unclear? What would you expect next time?” Keep value-free paraphrases. Do not solicit the password, account identifier or sensitive page text. Thank the participant only when contact is authorized; this draft sends nothing.

Neutral probes such as “What are you trying next?” are allowed and recorded. Before any directional coaching mark needed_help. Record the exact neutral/help prompt and its timestamp. If unsafe, unauthorized, leaking, destructive or irrecoverably blocked, stop the attempt and preserve its actual cause. Do not fix source/live app mid-session and erase the failed attempt. A participant may abandon; withdrawal and technical interruption stay distinguishable.

## Shipped008 copy freeze

Use templates below verbatim, substituting only the real N/k/step text. They were read from `frontend/src/components/studio/guided/guidedNarratives.ts`; the package manifest binds the source hash. Their existence is source evidence, not proof any participant saw them.

| State | Shipped text / behavior |
|---|---|
| Clarification |`Step {N} says: '{<step text>}'. Which one did you mean?` |
| Reject clarification / decline side-effect |`None of these — I'll edit step {N}`; cancels, then focuses stepN. |
| Continue |`Continue` |
| Repeating learned prefix |`Repeating saved steps 1–(k-1)…` |
| Learning suffix |`Learning from step {k}` |
| Save original Run learning |`Saving what this run learned…` |
| Edit warning |`Steps changed — next Run learns from step {k}` |
| Deliberate learn again |`Learn again from step {N}` |
| Missing login steps |`This page asks you to sign in. Add login steps before step {N} using your secrets (`<secret NAME>`), then Run again` |
| Login steps failed |`Your login steps did not sign you in; check the secret and the steps before step {N}` |

The missing-login row's literal backticks around `<secret NAME>` are part of the shipped string; the Markdown source retains them. The script does not teach participants to type tokens. The picker inserts `<var USER>` / `<secret PASS>`; observer verifies those references internally. Replay login/drift uses actual `replayFailure`; pre-Ready drift has no drift copy (KL-A1-1). The struck secret-fill POLICY_DENIED sentence is not reintroduced. Step-less variants come from the same source when the step was removed. Recording states retain `videoEvidenceNarratives.ts` wording and endpoint truth; unavailable/expired is never a test failure by inference. ADR-SC-006 applies: no screen-reader, shortcut, keyboard-only, contrast or other new a11y study.

## Observation and denominator rules

Use one row per participant × task × attempt in `pilot-attempts.csv`, preserving failed attempts. IDs P01…P05 in `participant-slots.csv` are **UNASSIGNED**, not people; do not prefill timestamps, consent, success, yes/no or elapsed time. Keep the private eligibility/consent locator outside the repo; use a value-free reference if approved. Store only actual observed facts after authorization.

For each assigned primary task, record exactlyone outcome per first attempt: completed_unaided, needed_help (whether ultimately completed or not), abandoned or blocked_technical. Define “completed” as the card's real outcome reached; the final summary shows completed_total as a separate column because help and completion are different dimensions. Preserve completed/help/abandoned counts together and report technical blocks, not silently remove them. Distinct participant denominators count real consented users who attempted; task-attempt denominators count actual started attempts. No rates are reported now; all are undefined (N=0), not0% or100%.

| Measure | Numerator | Denominator / missing-data handling |
|---|---|---|
| Participants eligible/consented/started |Distinct actual IDs at each phase |Recruitment count; separately report withdrawal and exclusion reason, never invent replacements. Need>=5 actual nontechnical users for AC1/2. |
| Completed/help/abandoned |Count each first-attempt outcome and completed_total |All started primary-task first attempts; blocked_technical shown separately. Report task-level and participant-level counts without merging retries. |
| Time to first Run |Elapsed seconds card handed over→first actual Run |Participants with both timestamps; show not_reached/missing counts against all started participants; no completion-time substitution. |
| Clarification understood |Yes before coaching |Actual participants exposed to the genuine clarification; no/not_exposed/missing shown. Never use all5 by assumption. |
| Edit/re-learn message understood |Yes before coaching |Actual participants exposed to edit warning; no/not_exposed/missing shown. Technical prefix correctness recorded separately. |
| Unaided blocked-login recovery |Recovered to real protected-page oracle with no directional help |Participants actually exposed to authentic blocked-login guidance; no/not_exposed/missing shown. |
| Rerun improvement |Actual corrected affected-task result |Same task/remediation cohort, separately from first attempts; retain original failed denominator/evidence. |

## FOCUS-MUTATION-01 preflight form

Before every application's first session, list **every authored fill target**, app release, actual test account locator and intended dist/image. A dev/QA specialist copies the D5 `probe/probe.mjs` pattern from the015 diagnosis evidence, uses runner-pinned Playwright/Chromium and that dist's collector in the isolated world as `browser.ts` does, performs focus/fill on the approved real page and records outcome plus **value-free mutation record types and attribute names**. Password fields use a non-secret placeholder on the approved test account only; otherwise “not probed, reason” is a block. Do not submit a real password or log account/page values for this probe. Attach the actual probe script copy and result under `pilot-focus-compatibility/` only when approved execution occurs.

Any POST_FOCUS_CHANGED target blocks **that application**. Lift only after a passing rerun on a dist carrying009AC7's actual focus change; if still failing, retain block and send evidence to architect through the coordinator. No tolerance, app edit or target deletion shortcut. Repeat when app release or dist changes. No probe is run by this preparation; `pilot-focus-targets.csv` has header only.

## Remediation and closeout

For each usability failure preserve participant/task/attempt/evidence locator, observed behavior, expected plain-language behavior, help supplied and severity. Analyst/PM routes a scoped remediation to the authorized story owner; QA reviews the corrected behavior and affected task is rerun, with original failure retained. No selectors, technical syntax or smaller workflow is substituted to improve results. Final pilot report must include original and rerun denominators, actual consented-user count, all blocks, actual copy/source/dist/app identities, insights and linked remediation. PM's product gate and independent QA traceability remain pending. No passing result, benchmark or release readiness is supplied here.
