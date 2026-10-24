# Actual bounded local visual proof — 2026-10-21

The single actual learn failed with `BUDGET_EXCEEDED`; the requested complete learn → publication → model-free replay proof was not achieved. No retry or replay was started. This records actual current dirty-source behavior, not a story QA pass.

## Scope and authorization

Real UI5177 → API18080 → mTLS guided connector18180 → real runner18090; direct Vertex is the existing configured provider. Independent root acceptance `ACCEPT_BIND_FIX72_AND_BOUNDED_LOCAL_SYNTHETIC_CONFIG` preceded the first Run. The dated architecture amendment permits this synthetic local proof only. Company SSO, Security/Compliance approval, full D-C, human pilot, deployment and story acceptance are not claimed. U13 remains required before merge/shared/sensitive workflows.

One private HttpOnly synthetic author cookie was loaded via Playwright `context.addCookies`; no cookie values were printed or copied here. Browser automation owns one isolated Chromium context and page. Existing demo5173/5174 and all processes/work were preserved. No production source was edited by this lane.

## Actual UI and network

The UI created one synthetic test (`POST /api/v1/studio/tests`201) then saved the three requested authored steps (`PUT /api/v1/studio/tests/{id}`200). Test `9b0b13ab-ef2d-478c-8638-3b9b3cd96d11`, CSI `CSI-LOCAL-71`, Development, Chromium1920×1080, no variables/secrets/context. Saved source revision2/configuration revision1, readinessUNLEARNED. Actual capabilities selected `studio-local-71` and the returned revision pair.

The single UI Run sent exactly one `POST /api/v1/studio/guided-sessions`202. Session `cef6d254-0b33-44b3-b8a2-571e5c656289` progressed PREPARING → PROPOSING → FAILED. Step1 navigation received an actual SUCCEEDED admission and learnedFromThisRun on that step; steps2/3 remained incomplete. Final session counters: actions1, observations26, modelProposals3, modelInputTokens36285, modelOutputTokens12288, sanitizedEvidenceBytes22541. These are runtime accounting/reservation counters; they are not asserted as provider wire calls, actual token consumption or billing totals.

Final result200 reports `BUDGET_EXCEEDED`, publicationREFUSED, receiptnull, currentReadinessNOT_PUBLISHED/readyfalse. Fresh saved-test response remainedUNLEARNED with no confirmed revision/hash. Exactly zero finalize and zero execute requests were observed. Failed learning cannot be finalized or replayed under the required READY condition, so no second Run was clicked.

## Visual evidence and diagnosis

Desktop screenshots show the authored checklist, preparing state, explicit budget-stop notice, partial step1 learning, recording and empty Logs tab. Guided video actually becameAVAILABLE; the authenticated video route returned200 (243064bytes), UI playback readyState4, duration39.56s. At12s the video visibly displays a Python404 error page, which prevents the Reports target from appearing. A separate read-only check of the intended own `/fixture` and `/` paths returns200. Read-only coordinator/DevOps receipts now confirm the causal chain: source-plan span[5,34) resolved to `http://127.0.0.1:18182/fixtur`, dropping the final `e` from the authored `/fixture`; that admitted navigation returned the404 page whose only observed heading was Error response. The subsequent click obligation also retained targetIntent `Click Reports`, selectedLocatornull, instead of the fixture node name `Reports`. Exact target matching would separately fail on that intent even at the correct page. The actual30,000ms target-acquisition allowance expired (window18:52:29.151Z→18:52:56.972Z, reserved/used27,821ms,24extra polls), yielding BUDGET_EXCEEDED before the400-observation or12-proposal ceilings.

Closed attempt receipts show SOURCE_PLAN#1REJECTED, SOURCE_PLAN#2APPLIED and NEXT_ACTION#1APPLIED. Error codes are null in these attempt rows; no specific rejection reason is invented. Numeric receipts report input/output4302/369,4305/525,4953/181, while reservation ceilings total36285/12288. This confirms3×4096 reflected output reservations, without evidence of truncation; no billable usage total is asserted. The copied closed projections and original paths/hashes are in `diagnosis-references.json`.

Minimal proposed correction: strengthen the existing source-plan prompt/contract examples to preserve complete UTF-16 source spans and use exact structural control names as targetIntent, while retaining runtime validation/caps. Root owns its reviewed implementation and any separately bounded successor validation; this failed session is never retried.

The initial immediate390px resize screenshots06/08 capture a transient animated layout. After1000ms settling, actual clientWidth/scrollWidth both390 and main marginLeft0. Screenshots09/10 are the settled narrow evidence. No persistent overflow is found after settling.

## Files and live handles

`network.json` preserves page-observed method/path/status/phase without headers/auth. `network-summary.json` adds counts and separate read-only inspections. `prepared.json`, `session-final.json`, `result.json`, `saved-final.json`, `learn-progress.json`, `source-runtime-pins.json` and `narrow-layout.json` contain closed synthetic metadata. `guided-synthetic.private.webm` is0600; no provider raw errors or private corpus were read. Screenshots05/07 capture the actual404 frame;09/10 capture settled narrow state. The three copied diagnosis receipts contain only root-authorized synthetic URL/structural/closed accounting projections. The private recording stays local.

Browser driver PID86289, exec session54490, loopback control `http://127.0.0.1:18184`; page remains on the same failed test/session and handles are deliberately alive. `browser-driver.mjs` is the preserved automation driver; it loads the cookie privately at runtime. Source hashes and gitHEAD are in source-runtime-pins.json; SHA256 manifest covers owned artifacts. No whole-backend gate was run.
