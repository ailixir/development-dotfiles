# UI Studio plain-English translation fix proposal

## Decision

Restore the required product flow:

```text
Plain-English checklist
  → approved model translation
  → automatic safety validation
  → readable user review
  → explicit confirmation of the exact revision
  → browser execution and evidence
```

The user must never be asked to write browser automation commands. The local pass-through adapter is a runner-plumbing diagnostic and must not be used as the Studio product path or as evidence that plain-English authoring works.

## Evidence

- The BRD defines Studio as a no-code product that translates plain English through an internal AI model and explicitly excludes a hand-written English translation layer.
- Normal local startup silently enables `LocalPassthroughGatewayClient` when the real gateway is disabled.
- That adapter explicitly does not translate English and rejects normal Studio instructions.
- The approved model client and bounded compile/repair/validation pipeline already exist.
- The readable review-and-confirm component already exists, but the product page does not mount it.
- The current Run flow automatically confirms a generated candidate, bypassing the required human review.
- The test list has a separate direct-execution path that can bypass the same lifecycle.

## Proposed changes

### 1. Make translation-provider selection explicit

Replace the current `enabled` plus `local-passthrough` combination with an explicit provider setting:

- `disabled`: saving is allowed; translation and new runs are unavailable with a clear platform message.
- `vertex`: the approved model-backed production path, using Vertex AI with
  `gemini-3.8-flash` as the current deployment model.
- `recorded-fixture`: local/CI only, returning recorded artifacts for exact plain-English test fixtures.
- Keep any precompiled-command adapter behind an explicitly named runner-diagnostic mode that cannot be selected by normal Studio startup.

Relevant code:

- `dev.sh`
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/application-local.yml`
- `backend/src/main/resources/application-staging.yml`
- `backend/src/main/java/com/citi/put/checks/studio/compile/gateway/StudioGatewayConfig.java`
- `backend/src/main/java/com/citi/put/checks/studio/compile/gateway/LocalPassthroughGatewayClient.java`

### 2. Enforce product readiness

When the Studio capability is advertised in staging or production, the approved translation provider must be configured and healthy. Missing configuration must fail deployment readiness instead of waiting for a user to discover it during Run.

In local development without gateway credentials, Studio should remain honest: drafts can save, but translation is visibly unavailable. It must not suggest that users replace English with commands.

Deployment configuration uses `STUDIO_GATEWAY_PROVIDER=vertex` and
`STUDIO_GATEWAY_MODEL=gemini-3.8-flash`. Staging and production source endpoint, project and
location from an environment-owned ConfigMap and use workload application-default credentials;
the repository does not invent those platform identifiers. Helm rejects `disabled` and
`recorded-fixture` in both shared environments and requires `checks.sources.UI_TEST=true` so the
backend exposes Studio and activates its translation-readiness guard. Shared-environment detection
comes from the actual Spring profile; changing a separate label cannot bypass it. The model remains
a value rather than a code constant so a separately reviewed model lifecycle change does not
require an application build.

### 3. Restore review and explicit confirmation

Mount `CompileReviewPanel` in the editor's Run and proof area. Remove automatic confirmation from `useRunGate.prepare()`.

The controls should follow the lifecycle:

- Saved or stale draft: **Translate saved steps**
- Translation running: progress
- Candidate ready: **Review translation**
- Reviewed candidate: **Confirm this exact revision**
- Confirmed revision: **Run test**

The list-page Run action must route through this same lifecycle or be removed. It must not call execution directly.

Relevant code:

- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
- `frontend/src/components/studio/review/CompileReviewPanel.tsx`
- `frontend/src/components/studio/run/useRunGate.ts`
- `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`

### 4. Keep validation roles clear

Immediate editor checks should cover empty steps, length limits, reference syntax, undeclared variables, and helpful phrasing guidance. Prefix matching is advisory, not proof that a step can be translated.

The model proposes the artifact. The existing default-deny runner validator remains the execution safety authority. Unsupported or ambiguous output blocks the candidate with step-specific plain-language guidance.

Do not promote the existing deterministic English parser into the production translator. The BRD explicitly chose model translation to avoid an ever-growing rule table. The parser may remain a bounded intent/safety check if its role is accurately represented.

### 5. Make historical outcomes revision-aware

After a passed test is edited, do not show an unqualified green “Passed” beside the unrun draft. Persist or project the revision used by the last execution and render:

```text
Previous revision passed
Current draft has not run
```

Also distinguish a newly edited `STALE` draft from a translation-service failure.

## Test strategy

### Pull-request tests

- Provider selection cannot silently choose the diagnostic pass-through.
- Translation outage allows Save but blocks translation with platform-owned wording.
- `AWAITING_CONFIRMATION` makes zero confirmation and execution calls when Run is pressed.
- Explicit confirmation makes exactly one confirmation call for the displayed revision and hash.
- Only `READY` can execute.
- The editor and list page share the same lifecycle gate.
- Editing a previously passed test shows revision-qualified history.
- Variable and secret values never appear in prompts, artifacts, logs, or diagnostics.

### Deterministic local/CI orchestration suite

Use a recorded-fixture gateway for exact English fixtures to validate the whole pipeline without pretending to measure model quality:

1. Example Domain navigation and visible-content assertion.
2. Wikipedia search using a plain variable.
3. SauceDemo login using published demo values as plain variables.

Each test must be created through Studio, translated, reviewed, explicitly confirmed, executed in the browser, and produce step results and evidence. Authored steps must remain plain English.

### Staging release gate

Run the same three scenarios against the real approved translation gateway. This is the required proof of the core product premise. Assert:

- exact authored text reaches translation with references still opaque;
- a readable candidate is presented;
- no execution occurs before explicit confirmation;
- the exact confirmed source and configuration revision executes;
- all steps reach honest terminal states;
- evidence is available and logs remain redacted.

## Acceptance criteria

1. A nontechnical user can create, translate, review, confirm, and run a test using plain English only.
2. Normal Studio UI and startup never instruct the user to provide browser automation commands.
3. Translation configuration failures are reported as platform failures, not author mistakes.
4. Every new or edited candidate requires readable review and explicit confirmation.
5. No editor or list-page action can bypass translation, validation, and confirmation.
6. A variable-backed test proves that its named reference is translated while its value remains absent from the translation boundary.
7. The three-scenario staging gate passes through the real translation provider and browser runner.

## Delivery order

1. Remove the silent pass-through default and add explicit provider/readiness behavior.
2. Mount review and remove automatic confirmation and direct-execution bypasses.
3. Add recorded fixtures and lifecycle regression tests.
4. Correct revision-aware status wording.
5. Configure the approved staging provider and rerun the three-scenario release gate.

## Deployment handoff

Before rendering staging or production, Platform/SRE must create the ConfigMap named by
`studioGateway.vertexConfigMap.name` with these non-secret keys:

- `endpoint`: the approved Vertex-compatible endpoint.
- `project`: the Vertex project identifier for the Studio compile workload.
- `location`: the approved Vertex location.

For `gemini-3.8-flash`, Platform/SRE must choose a supported `global`, `us`, or `eu` location.
Because the ConfigMap is pre-provisioned outside this chart, its content is verified by the release
check rather than falsely claimed as Helm validation.

The API service account must have the minimum Vertex prediction permission through workload
identity. A service-account JSON file is an explicit fallback only; no Gemini developer API key is
accepted. Release validation must inspect the rendered API environment and confirm provider
`vertex`, model `gemini-3.8-flash`, ConfigMap references for all three routing values, and
`application-default` credentials before running the three plain-English scenarios.
