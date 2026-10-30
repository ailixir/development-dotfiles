---
name: wi4-plan-critique-20261027
description: ADR-SC-007 WI-4 plan-r2 design critique (hash 60f2dca9) CHANGES_REQUIRED; Playwright 1.63 behaviours probed, joined tests that encode deleted guards, ReplayIT observer coupling
metadata:
  type: project
---

WI-4 (runner cut-over) plan-r2 critique, 2026-10-27, verdict CHANGES_REQUIRED, six blocking items (B1-B6). Critic id aiox-qa-wi4.

Facts worth reusing (verified, not inferred, unless marked):
- Playwright 1.63 action errors embed page content: the covered-click TimeoutError prints the intercepting element outerHTML (attributes and text); a fill timeout prints value="..." of the input and fill("literal"). runtime.ts:525 runs diagnostics.record(error) for every dispatch failure and returns it as BridgeOutcome.errorMessage (bridge.schema.json:1995). Plan never says actions rethrow closed codes only.
- trial:true click dispatches a mousemove (not inert). locator.fill types into whatever has focus: a focus handler that focuses a password input receives the authored literal. selectOption is exact/case-sensitive while G1 (playwrightEngine.ts checkOptionPresent) is NFKC/case-insensitive.
- Two existing joined tests encode guards the plan deletes: GuidedBridgePlannedIT#actualApplicationReplacementAfterPrepareNeverActsOnReplacement and GuidedFocusMutationJoinedIT#aFocusHandlerThatChangesTheTargetItself... (second file is not in WI-4 inputPaths).
- GuidedPublicationReplayIT.p4NativeCloseObserverSdk() imports ../studio-runner/dist/run/observationCollector.js (:36369) and keys C6 revocation observers on the collector install source and world name prefix checks-observation-; every generated child (recorded-child.mjs, ordinary.mjs) includes it.
- HttpRunnerDispatchClient.transportDeadline (15 s) applies to dispatch too (send() at :611), not only observe.
- WI-3 docs/qa/evidence/adr-sc-007/wi-3/tools/test-lane.cjs has a vitest mode (--json, --must-run file::title); WI-4 plan did not use it for the runner tiers.
- joined-long-verify.cjs binds out-of-band XML by input digest + mtime only; a copied XML with fresh mtime passes (suite timestamp unchecked).

**Why:** the user goal is a release unit of WI-3+WI-4 with no wrong-element action and no leak.
**How to apply:** when re-reviewing WI-4 candidate, check B1 canary tests, B2 element binding + the two joined tests' dispositions, B3 ReplayIT observer rewrite, B4 vitest presence, B5 selectOption normalisation, B6 deadline race. Probes are in the scratchpad qa-wi4/probe1-3.mjs (own browser, no repo files).
