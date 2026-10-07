# VAL-012 / VAL-014 / VAL-017 — architect rulings

Author: @architect (Aria) · 2026-10-04 · branch `brunobuger/ui-studio` @ 13ec11d1c · read-only analysis.
`openapi.yaml` sha256 at analysis time: `96d54cae…9687b`, which equals `BASE_SHA256` in `confinement.test.ts`.
This file doesn't touch VAL-011/013 (failure text) or VAL-015 (synthetic `atMs`). Those are @dev's, in flight.

## VAL-012 — `stepIndex` on runner log lines · **DO NOW** · Class B (ADR-002 §12)

**What I found in the code.** `RunnerLogEntry` is closed. The schema sets `additionalProperties: false`, and the record
sets `@JsonIgnoreProperties(ignoreUnknown = false)`. `RunnerReportProjection.projectLogs` (l.374) hard-codes `null`.
The public `ExecutionLogEntry.stepIndex` exists, and its description (openapi l.2393) says *"no runner-side
source today … null for runner-produced lines"*. Runner producers are `reportingStepReporter.ts`
`stepStarted`/`stepFinished`, and both hold `event.stepIndex`. `bounds.ts:163` rebuilds each retained entry field by field.

**Class.** Adding a field to a closed runner-produced body is Class B by §12's own wording. Under §19 the architect
authorizes and a named story lands it. The public `ExecutionLogEntry` keeps its shape (`integer, nullable`). Only its description
changes meaning, from "always null for runner lines" to "the step the line is about". That edit rides on this ruling. It needs no
separate Class C decision because no route, status or schema shape moves. **Permitted, authorized here.**

**Exact shape**
- openapi `RunnerLogEntry.properties.stepIndex: { type: integer, minimum: 0, nullable: true }`, with a description.
  **Not added to `required`.** This follows the `RunnerEvidence.partial` precedent (§17/§20, O-14): the field is optional
  first, and it can be promoted to `required` (nullable) after every producer emits it. Recorded as **O-17**, owner: the
  first story that touches `RunnerLogEntry` after this one lands.
- Runner TS `LogEntry` (`src/reporting/bounds.ts`): `readonly stepIndex?: number | null`. The new `bounds.ts:163`
  retention must copy it (`stepIndex: entry.stepIndex ?? null`). `redactLogEntry` and `withoutReading` already spread.
- Java `RunnerLogEntry(Double atMs, String level, String message, Integer stepIndex)`, plus a 3-arg secondary constructor
  that delegates `null`. That keeps the 24 existing `new RunnerLogEntry(…)` call sites (mostly tests) compiling unchanged.
- Semantics: the 0-based position of the step the line is **about**, the same index space as `RunnerStepState.stepIndex`.
  It is set on `step N started` and `step N PASS|FAIL|SKIPPED[: …]`. It is `null` on run-level lines (`browser started`, `run …`,
  deadline, upload, evidence). The runner never infers it from message text.
- Validation in `RunnerReportProjection.validate`/`projectSteps`: if `stepIndex` is non-null, it must satisfy `0 ≤ i <
  original.size()`. Otherwise the report fails with `INVALID_REPORT`. This mirrors the existing step rule (l.293: *"a step index the
  revision does not have is a divergence"*). `null` is always valid. Logs need no cross-check against `report.steps`.
- Projection: `new ExecutionLogEntry(at, LEVEL, message, entry.stepIndex())`. API-produced lines
  (`ProgressReportService:437`) stay `null`. Persisted log JSON already has the column, so there is **no migration**.

**Backward compatibility, and the trap**
- Old runner with a new backend: the field is absent, deserializes to `null`, and projects to `null`. The behaviour today is unchanged.
- **New runner with an old backend: rejected.** The closed record refuses the unknown property, so every progress/final
  report would be refused and the run would end up reaped. I inferred this from `ignoreUnknown = false`; I didn't run it. **Deploy order is a
  hard requirement: backend first, or both in one release with the backend rolled out before `studio-runner`.** Don't use a
  feature flag. Order is enough, and a flag would be a second contract.

**Anchors, all in the same PR:** re-anchor `BASE_SHA256` in `studio-runner/test/run/confinement.test.ts` from
`shasum -a 256` (never transcribe it). Add an ADR-002 **§33** plus a §13 row (`B`, "AUTHORIZED, NOT YET LANDED" until it lands). Rewrite the
`ExecutionLogEntry` description sentence. Check `StudioContractTest` schema-to-record parity, if it covers this body.
Op-count pins don't change because no route is added.

**Files:** `docs/specs/studio/openapi.yaml`, `docs/architecture/ADR-002-internal-contract-surface.md`,
`studio-runner/src/reporting/{bounds.ts,reportingStepReporter.ts}`, `backend/.../internal/dto/RunnerLogEntry.java`,
`backend/.../internal/RunnerReportProjection.java`, `studio-runner/test/run/confinement.test.ts`.
FE log-to-step linking is a **separate FE story**. Nothing in the FE has to change for the data to flow.

**Tests (each must be red without the change)**
- `RunnerReportProjectionTest`: step lines project their index; run-level `null` stays `null`; a JSON body without the
  field deserializes to `null` (old-runner case); `stepIndex = original.size()` gives `INVALID_REPORT`; `-1` gives `INVALID_REPORT`.
- Runner `test/reporting/reporting.test.ts`: started/finished lines carry `stepIndex`, while `browser started` and `run …` carry `null`.
  Also check that bounded retention preserves it. `test/contract.test.ts` should validate a step line against the amended schema.
- `ProgressCallbackIT`: one end-to-end report whose log has `stepIndex: 1` shows up on the public snapshot.

**Risks:** merge conflicts in `reportingStepReporter.ts` with VAL-011/013/015, so land this **after** those merge. The deploy-order
trap above. Messages say `step N` with a 0-based N while the UI shows 1-based. That's for VAL-011/013 to settle, not this ruling.

## VAL-014 — locator-preference guidance · **DEFER** (batch with the next `PROMPT_VERSION` bump)

**Cost, from the code.** Two homes are possible, and their costs are very different:
- `syntax-reference.md` is versioned by `SYNTAX_REFERENCE_VERSION` 2.1.0, and the runner compares it **`exact`**
  (`studio-runner/src/compat/compatibility.ts` rule table). A bump makes **every confirmed revision**
  `RUNTIME_INCOMPATIBLE` until it is recompiled and re-confirmed, scheduled checks included. **Ruled out as the home for this.**
- `output-contract.md` is covered by `PROMPT_VERSION` 2.2.0. It is provenance-only and not part of runner compatibility. It *is*
  an input to `CompilePipeline.compilationFingerprint`, so a bump makes `CompilationPlanner` return `FULL /
  FINGERPRINT_CHANGE` once per test. Confirmed artifacts stay runnable. There's also churn: about 9 test files pin `2.2.0`, and
  the validation-plan row 3 baseline expects 2.2.0.

**Why defer.** We have one observation (exec `d303251d`), it's LOW severity, and the author fixed it by rephrasing.
Story 10.45 bumped to 2.2.0 days ago and VAL-006 didn't bump. Spending a version on one sentence that hasn't been measured breaks
the "≥2 real scenarios" rule, and compile time has no DOM, so the guidance can't be checked offline. Note that the reference itself
teaches `getByLabel(...).fill` (l.104, 125–126, 151–152), which may bias the model. That's a reason to word the
guidance carefully, not to touch the corpus.
**Trigger to land it:** the next `PROMPT_VERSION` bump for any reason, or a second strict-mode/ambiguous-locator
instance during validation. Whichever comes first. Then it goes to 2.3.0, as new rule 7 in `output-contract.md`, with exactly this text:

> 7. Prefer the most specific locator the step's wording supports. For inputs, buttons, links and
>    other interactive controls, use `getByRole(role, { name })` with the control's accessible name
>    (for example `combobox`/`textbox`/`searchbox` for search fields). Use `getByLabel` only when the
>    step names a form label, and `getByText` only for non-interactive text. Add `exact: true` when
>    the name is a short common word that may also appear elsewhere on the page.

**Tests when it lands:** `PromptAssemblyTest` asserts that the rule is in the static prefix. `CompileFingerprintTest` already covers
the version input. Update the `2.2.0` literals and leave `SYNTAX_REFERENCE_VERSION` alone.
**Risk:** a role guess can be wrong as well, for example `textbox` vs `combobox`. The rule says "prefer", it doesn't forbid, so nothing that currently
validates becomes invalid.

## VAL-017 — separate assertion timeout · **NO CHANGE to the contract or default now** · decision for the user

**Existing decision (verified):** `studio-execution.md` l.158 and §8.2 l.254 say *"Default step timeout is 30 seconds"* and
*"a step locator/assertion timeout is FAIL"*. One per-step budget covers both. openapi l.1765 marks
`configuration.timeoutSeconds` as the per-step timeout (1–120). The runner's `timeoutOf(given ?? defaultTimeoutMs)`
(`playwrightAdapter.ts`) applies that budget to actions and assertions alike.

**Why not shorten it.** These are health checks. A slow page that then passes is a correct PASS, and a 5 s assertion
default would turn it into a false FAIL that pages someone. Waiting 30 s on a wrong expectation costs authoring time, not
correctness. There are already two escape hatches: (1) the language allows `timeout` on every `expect`
(syntax-reference l.85–89), so a step like "…within 5 seconds" can compile to `{ timeout: 5000 }`. I haven't verified that the model
does this. (2) `configuration.timeoutSeconds` can go down to 1, but the FE hardcodes 30 (`studioTypes.ts:556`,
`legacyTestIr.ts:133`). **The cheapest real fix is an FE story that exposes `timeoutSeconds`. That needs no contract change.**

**Options if the user wants a distinct default anyway**
| Option | Contract | Trade-off |
|---|---|---|
| A. Keep as is, plus FE exposes `timeoutSeconds` (**recommended**) | none | Lowest cost. Authors trade speed for tolerance on purpose. |
| B. Optional `configuration.assertionTimeoutSeconds` (1–120); absent means `timeoutSeconds` | **Class C** (public request body) + **Class B** (runner job protocol field) | Faster feedback, with no behaviour change for existing tests. Touches openapi, persistence, dispatcher, runner protocol and adapter. |
| C. Runner constant (e.g. 5 s) for `expect*` | executor semantics | **Rejected.** It silently changes outcomes of confirmed checks and has no source (Article IV). |

**Recommended default if B is chosen:** absent, meaning the assertion timeout equals `timeoutSeconds`. Opt-in only. The FE may offer
10 s as an authoring suggestion.

## Decisions for the user
1. VAL-012: accept the deploy order (backend before runner) as a release constraint.
2. VAL-014: defer with the trigger above, or pay a 2.3.0 bump now (one-time FULL recompiles, about 9 test literals).
3. VAL-017: option A (FE story) or option B (new public field, Class C + B).

[AUTO-DECISION] Log `stepIndex` out of range → reject or null out? → reject, `INVALID_REPORT` (reason: same as the existing step rule; a
silent null would hide a runner bug, and loosening is never the safe default under §12).
[AUTO-DECISION] `required` or optional? → optional, nullable (reason: an old runner stays valid; O-14 precedent; promotion is O-17).
