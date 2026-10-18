# Studio evaluation harness

Two layers live here. The observed-authoring benchmark (STUDIO-OBS-009 AC-7 to AC-10) is the live one. The compile-era oracle and report layer is kept only as far as it still applies.

## Observed-authoring benchmark (`observed-authoring/`)

The compile-era driver `lifecycle.mjs` is gone: under the single path (ADR-SC-005) there is no `/compile` or `/confirm-compile`, so a driver for them was dead code. `observed-authoring/evaluate.mjs` replaces it and talks to the **public** Studio API only: create a draft, start a guided session, poll it, answer a clarification only when the case script names the choice (otherwise count it and cancel), finalize exactly once, replay, read the result. It scores each run against an oracle that is independent of the model, the learned plan and the runner.

What is committed, and what it is not:

| File | Purpose |
|---|---|
| `observed-authoring/manifest.json` | 25 workflows: 19 class P, 1 class F, 5 class N. Frozen (`manifestFrozenAt`, `manifestSha256`). Pins the sha256 of every step text, page, expected outcome, fixture server and the 2026-10-04 `results.jsonl`. |
| `observed-authoring/pages/<case>/` | Re-authored fixture pages (loopback, ephemeral port), the step text and the expected outcome of each case, and `pages/server.mjs`, the host that logs page views and posted events itself. |
| `observed-authoring/cases/*.json` | The two STUDIO-OBS-015 incremental cases. Owned by 015, consumed unchanged. |
| `observed-authoring/evaluate.mjs` | Manifest validator and freezer, outcome oracle and its four mutation controls, canary scan, isolation check, run driver, scoring and accounting, replay-stability scoring, B7 measurement, budget-admission ledger, start guard and stop rule. |

Rules the harness enforces:

- **Ported means re-authored.** Each of the 13 ported cases carries a fidelity record: what is known from the 2026-10-04 record (cited by `results.jsonl` row lines and the file's sha256), what was re-authored, and an `invented` list that must be empty. `comparisonClaim` is `NONE_NO_COMPARISON_TO_20261004`; no 2026-10-04 number is a baseline.
- **Independent oracle per case.** The oracle is the fixture's own record (page views logged by the host, events the page posts, or the existing fixtures' receipts), never the runner's DOM check and never the system's own PASSED. Class F and N cases expect no side effect at all. Expected outcomes are written and hashed before any run; a run that starts before `manifestFrozenAt` is refused.
- **Mutation controls.** Wrong target, reversed assertion, dropped submit and literal substitution are each injected against every oracle and must be rejected.
- **RS-1.** Every case has an explicit RS-1 mark (`[]` when it reads no value). Pages are not edited to dodge it. `rs1NonScalarReadGaps`, `authoredEchoUnobservableTargets` and `focusMutationRefusedFills` are present as integers on every run record, 0 when none.
- **Gate arithmetic is computed, not typed.** Class P only: 19 x 3 = 57 runs, at least 52 completions (51 of 57 fails), at most 5 failed. With the two staging cases unrun it is 51 runs, at least 46, and the result is `PARTIAL`, never a pass. The class-P denominator and the iframe-as-class-N reading are recommendations (T0 B2, B3), not rulings; the manifest says so.
- **Budget admission before any provider call.** `budget-admission.json` is an append-only, hash-chained ledger. A `D_C` run starts only if its latest entry is `ADMITTED` for exactly this manifest digest. With the price or the headroom unknown the status reads `ADMISSION_REFUSED_PRICE_UNKNOWN` or `ADMISSION_REFUSED_HEADROOM_UNKNOWN` and the harness makes zero provider calls. The token caps and the cost bound come from an explicit proposal plan (planned proposals x contingency x the per-call ceiling for output; x bytes per call, or one named cap, for input), not from sessions x session totals (MODEL-SIZING, 2026-10-18). The stop rule halts after the session that crosses 80 percent of the allocation, or at the first false pass or leak; a session without reported usage is charged what it recorded as reserved, and only a session with nothing recorded is charged the session totals.
- **Self-tests are not evidence.** Runs driven by a scripted client are labelled `HARNESS_SELF_TEST_NOT_D_C_EVIDENCE` and their verdict is `NOT_EVIDENCE`.

Commands, from `studio-runner/` (Node 24):

```sh
node evaluation/cli.mjs validate-corpus                 # structure, arithmetic, every pin re-read from disk
node evaluation/cli.mjs freeze-corpus                   # fills the pins, stamps manifestFrozenAt / manifestSha256
node evaluation/cli.mjs corpus-mutation-control         # positive control plus four mutants per oracle
node evaluation/cli.mjs admission-record LEDGER --create --planned-proposals N --contingency F (--input-bytes-per-call N | --input-token-cap N) --plan-basis TEXT [--price-in --price-out --price-source --headroom --headroom-source --allocation]
node evaluation/cli.mjs admission-guard LEDGER          # exit 0 only when the latest entry is ADMITTED for this manifest
node evaluation/cli.mjs b7 EVIDENCE.json...             # proposals per session from fixture-provider budget evidence
node evaluation/cli.mjs benchmark CONFIG NEW_DIR        # live D_C run; refused without an ADMITTED ledger entry
pnpm --config.package-manager-strict=false exec vitest run test/evaluation --coverage.enabled=false
```

What cannot be done from here, and who owns it: any model call, the AC-8 gateway probe (ED-01 owner), the deployed stack and internal image (U4), the staging login and SSO cases D2 and E1 (U3, application owner), the budget figures (user: headroom; ED-01 owner: price list), the AUTHORED-ECHO-01 and FOCUS-MUTATION-01 landings before the first real call, and the human C-17 masked-video reviewer. The HTTP binding `createPublicApiClient` was written from the OpenAPI text and has not been run against a live backend. The incremental case checks only what the public API shows (per-step `learnedFromThisRun` and `reusedFrom`, counters around finalize); backend reservations per prefix step and merged-revision replay model calls stay with the backend integration tests.

## Compile-era oracle and report layer

`oracle.mjs`, `report.mjs`, `fixture-server.mjs`, `example-manifest.json` and `oracle.test.mjs` belong to Story 10.26. `node evaluation/cli.mjs validate-manifest FILE`, `oracle-self-test` (now `oracle.test.mjs` only) and `summarize FILE [OUT_JSON] [OUT_MD]` still work. The `run` command went with `lifecycle.mjs`. `browser-oracle.test.mjs` imports `dist/validator`, which no longer exists after the compile retirement, so it fails at the baseline before this change and is no longer run by `oracle-self-test`.
