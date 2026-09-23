# Spec: Full UI Studio Validation with Three Public-Site E2E Tests

> **Story ID:** UI-VALIDATION-20260921  
> **Generated:** 2026-09-21T23:30:00Z  
> **Complexity:** STANDARD (score 9)  
> **Pipeline Phases:** gather, assess, research, spec, critique, plan  
> **Status:** Validated

---

## 1. Overview

### 1.1 Summary

Validate the existing Checks UI Studio workflow by creating exactly three distinct tests through the visible interface, targeting public unauthenticated non-Citi sites, and running every created test through an observable terminal result. One test must declare a non-sensitive plain variable, reference it in an authored step, and exercise its resolved value. The final validation record must identify every test, target, variable usage, and outcome. No product source file may be modified. *(Trace: FR-1–FR-5, CON-1–CON-5.)*

### 1.2 Goals

- Create exactly three distinct UI Studio tests through the visible authoring workflow. *(Trace: FR-1, NFR-2, CON-1, CON-5.)*
- Use three currently reachable public targets that require no authentication and do not use `citi.com` or a `citi.com` subdomain. *(Trace: FR-2, NFR-1, CON-2; research: Public validation targets.)*
- Prove plain-variable declaration, reference, and runtime resolution in at least one test. *(Trace: FR-3, CON-3; research: Studio plain-variable resolution.)*
- Run all three created tests end to end and retain their observable terminal outcomes. *(Trace: FR-4, CON-1; research: visible authoring-to-terminal flow.)*
- Produce reviewable evidence covering test identity, target, variable usage, and final result. *(Trace: FR-5, AC-6; research: auditable run identity.)*

### 1.3 Non-Goals

- Changing product source, dependencies, services, database state, deployment configuration, or infrastructure. *(Trace: CON-4; complexity: scope and infrastructure.)*
- Replacing the visible UI Studio workflow with unit, component, API-only, or source-level testing. Supporting API snapshots may only supplement visible UI execution. *(Trace: CON-5; research: API compatibility conflict and recommendation.)*
- Using Citi targets, authenticated targets, submissions, secret references, credentials, personal data, or production data. *(Trace: FR-2, NFR-1, NFR-3, CON-2, CON-3; research recommendation to avoid.)*
- Introducing a new compiler, runner, browser library, or test framework. *(Trace: CON-4; research: no new library, API, infrastructure, or source change required.)*

---

## 2. Requirements Summary

### 2.1 Functional Requirements

| ID | Description | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-1 | Create exactly three distinct UI tests through the Checks UI Studio user interface as one full E2E validation run. | P0 | AC-1, AC-2 |
| FR-2 | Configure all three tests against accessible public websites outside `citi.com`. | P0 | AC-3 |
| FR-3 | Declare and reference a plain Studio variable in at least one test and exercise the resolved value during execution. | P0 | AC-4 |
| FR-4 | Execute all three newly created tests from UI Studio and retain an observable terminal result for each. | P0 | AC-5, AC-6 |
| FR-5 | Report the test identities, target URLs, variable usage, and final execution outcomes. | P1 | AC-6 |

### 2.2 Non-Functional Requirements

| ID | Category | Requirement | Target |
| --- | --- | --- | --- |
| NFR-1 | Reliability | Targets are reachable without authentication, private-network access, or user-specific state. | All three target pages load without credentials before their Studio runs are accepted as evidence. |
| NFR-2 | Usability | The visible authoring and run workflow uses clear, reviewable names and steps. | Exactly three newly created tests are identifiable in Studio and each has an observable result. |
| NFR-3 | Security | Validation uses only non-sensitive plain values and no credentials, secrets, personal data, or Citi production data. | Zero sensitive or production values appear in the three definitions or their evidence. |

### 2.3 Constraints

| ID | Type | Constraint | Impact |
| --- | --- | --- | --- |
| CON-1 | Business | The scope is exactly three newly created tests, all executed end to end. | A different count or an unexecuted created test fails the scope. |
| CON-2 | Business | No target may use `citi.com` or any `citi.com` subdomain. | Inspect target and final redirect hosts before accepting evidence. |
| CON-3 | Technical | At least one test uses a non-sensitive variable of kind `plain`. | The exact declared name must be referenced with Studio-supported syntax. |
| CON-4 | Technical | Preserve the dirty working tree and do not modify product source. | Only story specification and validation evidence artifacts may be added. |
| CON-5 | Technical | Creation and execution must occur through the Checks UI Studio E2E workflow. | Lower-level checks are diagnostic or supporting evidence only. |

### 2.4 Assumptions

- The local Studio environment supports test creation, persistence, compilation or confirmation, execution, and terminal outcomes. *(Trace: ASM-1.)*
- The selected public sites permit the small, non-destructive interactions in the three scenarios. *(Trace: ASM-2.)*
- A terminal outcome remains acceptable evidence if optional video evidence is unavailable. *(Trace: ASM-3; research: terminal result vocabulary.)*

---

## 3. Technical Approach

### 3.1 Architecture Overview

Use the existing Studio authoring-to-terminal path without product changes: create and save each test in the visible UI, compile the current draft, confirm the exact candidate when required, start execution from Studio, and observe the run until it reaches `PASSED`, `FAILED`, or `ERROR`. Read-only execution snapshots may supplement the visible result with stable test IDs, execution IDs, per-step outcomes, and evidence state. *(Trace: FR-1, FR-4, FR-5, CON-4, CON-5; research: Checks UI Studio authoring and execution APIs, visible authoring-to-terminal flow, auditable run identity.)*

The local passthrough compiler requires each authored step to be an accepted Playwright statement beginning with `await `. The pinned runner validates absolute HTTP(S) navigation, accepted locators/actions/assertions, and declared references before dispatching the real browser run. *(Trace: CON-5; research: Local passthrough compilation and Studio runner and Playwright.)*

### 3.2 Scenario Design

| Test | Public target | Authored behavior | Variable use | Trace |
| --- | --- | --- | --- | --- |
| Wikipedia navigation | `https://www.wikipedia.org/` | Navigate to the public landing page and assert the URL. | None | FR-1, FR-2, FR-4; research: Public validation targets |
| SauceDemo variable input | `https://www.saucedemo.com/` | Navigate to the public demo page, fill the username input without submitting, and assert the URL. | Declare plain `FORM_TEXT` with value `pipeline-variable-ok`; fill with `vars.get('FORM_TEXT')`. | FR-1–FR-4, CON-3; research: declare-reference-resolve and variable proof |
| Example Domain navigation | `https://example.com/` | Navigate to Example Domain and assert the URL. | None | FR-1, FR-2, FR-4; research: Public validation targets |

These interactions are intentionally non-destructive: navigation, URL assertions, and a fill on a public demo form without submission. *(Trace: NFR-1, NFR-3; research: low-risk interaction selection.)*

### 3.3 Key Decisions

- **Use the current local passthrough compiler and pinned runner:** this exercises validation, confirmation, dispatch, Chromium, reporting, and evidence without adding a dependency or editing product source. *(Trace: CON-4, CON-5; research recommendation.)*
- **Use `FORM_TEXT` on the SauceDemo test:** the public username input accepts the supported `fill(vars.get('FORM_TEXT'))` pattern and provides runtime proof of variable resolution without submitting the form. *(Trace: FR-3, CON-3; research recommendation.)*
- **Treat terminal API snapshots as supporting evidence only:** stable identifiers and step outcomes improve auditability, while creation and execution remain visible Studio actions. *(Trace: FR-5, CON-5; research recommendation.)*
- **Correct and rerun an existing created test instead of adding a replacement:** this preserves the exactly-three scope and retains any failure history. *(Trace: CON-1; complexity flag; research recommendation.)*

### 3.4 Patterns to Use

- **Visible authoring-to-terminal flow:** create, save, compile, confirm when required, execute, and observe a terminal state. *(Trace: FR-1, FR-4; research pattern.)*
- **Verbatim local compile:** author each step as an accepted Playwright statement beginning with `await `. *(Trace: research pattern: verbatim local compile.)*
- **Default-deny authored steps:** use only accepted awaited navigation, locator, action, and assertion calls with absolute HTTP(S) URLs. *(Trace: NFR-1; research pattern: default-deny authored steps.)*
- **Declare-reference-resolve:** declare the plain variable, use the exact name in `vars.get`, and prove the fill step passes during execution. *(Trace: FR-3, CON-3; research patterns: declare-reference-resolve and variable proof.)*
- **Auditable run identity:** retain test ID, execution ID, terminal status, per-step results, and evidence state for all three runs. *(Trace: FR-5, AC-6; research pattern.)*

### 3.5 Execution Strategy

1. Preflight the three researched HTTPS URLs immediately before authoring; reject authentication, an unreachable page, or a final `citi.com` host. *(Trace: FR-2, NFR-1, CON-2; complexity flag; research: current reachability preflight.)*
2. Create and save exactly the three scenarios above through the visible Studio interface, preserving existing workspace changes. *(Trace: FR-1, NFR-2, CON-1, CON-4, CON-5.)*
3. Configure `FORM_TEXT` as a non-sensitive plain variable on the SauceDemo test and reference it from the fill step. *(Trace: FR-3, NFR-3, CON-3.)*
4. Compile or confirm each saved draft as required, then start each execution from Studio and observe its terminal outcome. *(Trace: FR-4, AC-5; research: visible authoring-to-terminal flow.)*
5. If a scenario needs correction, edit and rerun the same created test; retain both the issue and final result. *(Trace: edge cases for variable resolution and execution failure; complexity flag.)*
6. Record exactly three test identities, target URLs, variable usage, execution IDs, terminal outcomes, step results, and evidence state. *(Trace: FR-5, AC-6; research: auditable run identity.)*

---

## 4. Dependencies

### 4.1 External Dependencies

| Name | Version | Purpose | Verified |
| --- | --- | --- | --- |
| Wikipedia public landing page | Live preflight 2026-09-21T23:20Z | Public unauthenticated navigation target | ✅ Research-time HTTP 200 |
| SauceDemo public demo page | Live validation 2026-09-21T23:43Z | Public username input for plain-variable resolution | ✅ Studio execution passed |
| Example Domain | Live preflight 2026-09-21T23:20Z | Public unauthenticated navigation target | ✅ Research-time HTTP 200 |

### 4.2 Internal Dependencies

| Name | Version | Purpose | Verified |
| --- | --- | --- | --- |
| Checks UI Studio authoring and execution contracts | Repository-local | Visible create/save/compile/confirm/execute flow and supporting execution snapshots | ✅ Codebase |
| Local passthrough compilation | `local-passthrough` | Verbatim local compilation of `await` statements | ✅ Codebase |
| Studio runner and Playwright | Playwright 1.63.0; Node >=22.11.0 <25.0.0 | Validation and real browser execution | ✅ Codebase |
| Studio plain-variable resolution | Repository-local | Persist, authorize, snapshot, and resolve `vars.get('FORM_TEXT')` | ✅ Codebase |

### 4.3 Unverified Claims

- ⚠️ The three public targets will remain reachable and structurally compatible during every Studio execution. Third-party availability and markup are outside repository control; re-preflight immediately before authoring. *(Trace: research unverified claim 1.)*
- ⚠️ Every newly authored test will reach a terminal outcome in the active local environment. This requires runtime execution evidence. *(Trace: research unverified claim 2.)*
- ⚠️ The variable value will resolve in the real browser run rather than only persist. This requires a passing variable-backed fill step. *(Trace: research unverified claim 3.)*

---

## 5. Files to Modify/Create

### 5.1 New Files

- `docs/stories/UI-VALIDATION-20260921/spec/spec.md` — formal specification generated from the three upstream pipeline artifacts. *(Trace: spec-write-spec required output.)*
- Validation evidence artifact(s) within `docs/stories/UI-VALIDATION-20260921/` — reviewable record of the exactly three test identities, targets, variable use, and outcomes; the plan phase determines the precise artifact name. *(Trace: FR-5, CON-4, AC-6.)*

### 5.2 Modified Files

_No product source or pre-existing user file may be modified._ *(Trace: CON-4.)*

### 5.3 Deleted Files

_No files may be deleted._ *(Trace: CON-4 and edge case for preserving unrelated working-tree changes.)*

---

## 6. Testing Strategy

### 6.1 Unit Tests

No new unit test is required because no product source changes are in scope, and unit tests cannot substitute for the three required UI Studio executions. *(Trace: CON-4, CON-5; complexity: validation-only scope.)*

### 6.2 Integration Checks

- Confirm each visible Studio save proceeds through the existing compile and exact-candidate confirmation contract as required. *(Trace: FR-1, AC-2; research: visible authoring-to-terminal flow.)*
- Use read-only execution snapshots after visible UI execution to corroborate test IDs, execution IDs, terminal states, per-step results, and evidence state. *(Trace: FR-5, AC-6; research recommendation.)*
- Confirm the SauceDemo definition persists a plain `FORM_TEXT` declaration and the accepted artifact contains `vars.get('FORM_TEXT')`. *(Trace: FR-3, AC-4; research: variable proof.)*

### 6.3 E2E Tests

| Scenario | Expected result | Covers |
| --- | --- | --- |
| Wikipedia navigation | The visible Studio-authored test loads the public URL, passes the URL assertion, and reaches a terminal outcome. | FR-1, FR-2, FR-4; NFR-1, NFR-2 |
| SauceDemo variable-backed fill | The visible Studio-authored test resolves `FORM_TEXT`, passes the username-input fill step and URL assertion, and reaches a terminal outcome. | FR-1–FR-4; NFR-1–NFR-3; CON-3 |
| Example Domain navigation | The visible Studio-authored test loads the public URL, passes the URL assertion, and reaches a terminal outcome. | FR-1, FR-2, FR-4; NFR-1, NFR-2 |

### 6.4 Acceptance Tests

```gherkin
Feature: Full UI Studio validation

  Scenario: Exactly three visible Studio tests are created
    Given the existing Checks UI Studio environment and preserved working tree
    When validation authoring finishes through the visible interface
    Then exactly three distinct new tests exist
    And no product source file is modified

  Scenario: Every definition is executable
    Given each of the three newly created tests
    When its saved ordered steps are reviewed
    Then it contains an end-to-end browser scenario suitable for Studio execution

  Scenario: Every target is accessible and outside Citi
    Given the three saved test definitions
    When their target and final redirect hosts are inspected and loaded
    Then all three are public and require no authentication
    And no host is citi.com or ends in .citi.com

  Scenario: A plain variable resolves in execution
    Given the SauceDemo test declares plain variable FORM_TEXT
    And an authored step references vars.get('FORM_TEXT')
    When that test executes
    Then the username-input fill step passes with the resolved value

  Scenario: All created tests reach terminal outcomes
    Given the three newly created tests
    When each is started through Checks UI Studio
    Then each reaches an observable PASSED, FAILED, or ERROR result

  Scenario: The validation record is auditable
    Given all three executions are complete
    When the validation summary is produced
    Then it records exactly three test identities and target URLs
    And it records variable usage and each final execution outcome
    And it includes any corrected-and-rerun failure history
```

*(Trace: AC-1–AC-6; terminal vocabulary from research.)*

### 6.5 Manual Verification

- [x] Exactly three distinct new tests are visible in Studio. *(Trace: AC-1.)*
- [x] All definitions contain ordered executable browser steps. *(Trace: AC-2.)*
- [x] All target pages load without credentials and remain outside `citi.com`. *(Trace: AC-3, NFR-1.)*
- [x] `FORM_TEXT` is plain, non-sensitive, referenced, and used by a passing browser step. *(Trace: AC-4, NFR-3.)*
- [x] Every test was started through Studio and has an observable terminal result. *(Trace: AC-5.)*
- [x] Evidence identifies all three tests, targets, variable usage, outcomes, and any rerun history. *(Trace: AC-6.)*

---

## 7. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| A public target becomes unreachable, changes markup, requires authentication, or redirects to Citi. | Not quantified | High | Preflight immediately before authoring; reject the target and select another public non-Citi target while keeping the counted set at exactly three. *(Trace: edge case 1; complexity flag; research unverified claim 1.)* |
| `FORM_TEXT` is undeclared, misspelled, unvalued, treated as secret, or not resolved. | Not quantified | High | Correct the same test so the exact plain declaration and `vars.get('FORM_TEXT')` reference validate, then rerun it and retain evidence. *(Trace: edge case 2; research variable conflicts.)* |
| A Studio execution fails or does not reach a terminal state. | Not quantified | High | Capture the visible error, correct only Studio test data/configuration, rerun the same test, and report both the issue and final outcome. *(Trace: edge case 3; research unverified claim 2.)* |
| Existing dirty or untracked workspace changes are disturbed. | Not quantified | Critical | Restrict filesystem additions to story specification/evidence artifacts and leave all product and unrelated files untouched. *(Trace: edge case 4, CON-4.)* |
| A correctable error leads to a fourth created test. | Not quantified | High | Edit and rerun the existing test instead of creating a replacement. *(Trace: CON-1; complexity flag; research recommendation.)* |

---

## 8. Open Questions

_No open questions were recorded in `requirements.json`; the remaining runtime claims are validation risks rather than specification questions._ *(Trace: requirements.openQuestions; research.unverifiedClaims.)*

---

## 9. Implementation Checklist

- [x] Validate Wikipedia, SauceDemo, and Example Domain through Studio. *(Trace: FR-2, NFR-1, CON-2.)*
- [x] Create and save exactly the three specified tests through visible Studio authoring. *(Trace: FR-1, CON-1, CON-5.)*
- [x] Declare plain `FORM_TEXT` and reference it as `vars.get('FORM_TEXT')` in the SauceDemo fill step. *(Trace: FR-3, NFR-3, CON-3.)*
- [x] Compile or confirm and execute all three tests through Studio. *(Trace: FR-4, CON-1, CON-5.)*
- [x] Retain terminal results and supporting per-step evidence for every execution. *(Trace: FR-4, FR-5, AC-5, AC-6.)*
- [x] Produce the validation record without modifying product source or unrelated working-tree files. *(Trace: FR-5, CON-4.)*
- [x] Submit this spec and its upstream inputs to the QA critique phase. *(Trace: spec-write-spec handoff.)*

---

## 10. Traceability Matrix

| Input | Covered by |
| --- | --- |
| FR-1 | §§1.2, 3.2, 3.5, 6.3–6.5, 9 |
| FR-2 | §§1.2, 3.2, 3.5, 6.3–6.5, 9 |
| FR-3 | §§1.2, 3.2–3.5, 6.2–6.5, 9 |
| FR-4 | §§1.2, 3.1–3.5, 6.3–6.5, 9 |
| FR-5 | §§1.2, 3.1, 3.3–3.5, 5.1, 6.2, 6.4–6.5, 9 |
| NFR-1 | §§1.3, 3.2, 3.4–3.5, 6.3–6.5, 9 |
| NFR-2 | §§1.2, 3.5, 6.3–6.5 |
| NFR-3 | §§1.3, 3.2, 3.5, 6.3–6.5, 9 |
| CON-1 | §§1.1–1.3, 3.3, 3.5, 6.4–6.5, 7, 9 |
| CON-2 | §§1.1–1.3, 3.5, 6.4–6.5, 7, 9 |
| CON-3 | §§1.1–1.3, 3.2–3.5, 6.2–6.5, 7, 9 |
| CON-4 | §§1.1, 1.3, 3.1, 3.3, 3.5, 5, 6.1, 6.4–6.5, 7, 9 |
| CON-5 | §§1.1–1.3, 3.1, 3.3, 3.5, 6.1–6.5, 9 |

---

## Metadata

```yaml
spec:
  version: '1.0'
  generatedBy: '@pm via spec-write-spec'
  generatedAt: '2026-09-21T23:30:00Z'
  iteration: 1

inputs:
  requirements: docs/stories/UI-VALIDATION-20260921/spec/requirements.json
  complexity: docs/stories/UI-VALIDATION-20260921/spec/complexity.json
  research: docs/stories/UI-VALIDATION-20260921/spec/research.json

status: Draft
nextPhase: critique
```

---

_Generated by AIOX Spec Pipeline._
