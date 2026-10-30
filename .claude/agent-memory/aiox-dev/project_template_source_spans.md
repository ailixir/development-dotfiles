---
name: project-template-source-spans
description: 2026-10-26 mixed text + plain <var NAME> in one typed value, done with NO schema change - the sourceSpan is the template; secret-in-text start refusal; UNSUPPORTED_STEP; where each piece lives and what to check when it breaks
metadata:
  type: project
---

User decision 2026-10-26: `Search for "Top 3 banks. is <var BANK>?"` must learn. Design (ADR-002 row 2026-10-26):

- **The span is the template.** The model still emits ONE `sourceSpan` over the whole quoted value (tokens included); the existing `sourceSpan` input recipe (`start,end,sourceHash`) is the stored recipe. Trusted code fills tokens: learn = `GuidedSourceReferenceValidator.resolve` (manifest `configurationValues`, matched by stepId+referenceName+nonsecretText), replay = `ObservedReplayAuthorization.job` (`plainValues` of the revision's declared variables). Helper: `guided/bridge/SourceTemplate`. `Source.approves` accepts a span that is regions + whole `<var>` tokens; a span that is exactly one token stays on the whole-variable `configuration` path (single path, no suggestion offered); half-token, secret overlap and a variable in a destination URL are refused.
- **`references.variables` must list template variables** (`GuidedPublicationRepository` and the check in `ObservedRevisionVerifier`, both via `SourceTemplate.declaredPlainVariables`), otherwise replay gets no value (`StudioAcceptanceService.plainVariableValues` reads only declared names).
- **Withholding**: the runner withholds only `configuration`-provenance values from the model's page view (AUTHORED-ECHO-01). A sourceSpan input would leak the variable value through a page echo, so `GuidedMaterializationService.withholdTemplateVariables` also freezes each named variable as an UNUSED whole-variable input (recipes/basis only keep used inputs, so nothing else moves). Failure redaction in `runtime.ts` already covers every authored input value (existing test uses a sourceSpan input whose value length differs from its span).
- **Secrets**: quoted value holding a `<secret>` plus other text => start refusal `422 INVALID_CONTRACT`, `messageCode SECRET_IN_TEXT` (`GuidedSourceClassifier.requireSecretsWholeValue`; straight/curly single quotes skipped, apostrophes). Frontend: `guidedStartFeedbackView` case INVALID_CONTRACT.
- **Model UNSUPPORTED** (not MISSING_SOURCE) => `progress.errorCode UNSUPPORTED_STEP` (was RUNTIME_INCOMPATIBLE). `errorCode` is an open string, so no error/result schema change; copy `unsupportedStep` + `unsupportedStepRemedy` in `guidedNarratives.ts` (copy quotes must exist in a repo file: `adr002` source added).
- Variable value change = `NEEDS_RELEARN`, `firstChangedStepId` = the step, Run answers 409 LEARN_REQUIRED, next learn is incremental from that step (same as whole variable; checked live).
- Live proof recipe: scratchpad `search-fixture.mjs` on :48731 ("Results for <q>"), `proof/lib.py` (create/learn/replay), frames via `curl .../executions/{id}/video` + `ffmpeg -sseof -0.3`. psql to the embedded PG: `ps aux | grep -o "bin/postgres -D [^ ]* -p [0-9]*"`, user postgres.
- Not proven live: a template in `assert.expected` - on this stack ANY assert step (even with no variable) ends BUDGET_EXCEEDED after 4 model calls (control test), unrelated to this change.
- `ObservedRevisionVerifier` has a dead block reading `recipe.recipeProvenance` (recipes use `provenance`); I left it.

**Why:** the model-facing schema only offers one authoredLiteral/binding/secretRef per value; the SOURCE_PLAN model correctly answered UNSUPPORTED. Avoiding a schema change dodged the whole reseal/epoch/bundle-hash ripple.
**How to apply:** touching sourceSpan, recipes, `references.variables`, or the runner's withhold rule. Related: [[project-google-search-learn-blockers]], [[tooling-scratch-runner-copy-not-symlink]], [[tooling-contract-bundle-hash-reseal]].
