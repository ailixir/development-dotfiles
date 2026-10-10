# Story STUDIO-OBS-002 — Trusted page observation and sanitization

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-002 |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-001 |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio user, I want to provide current page structure to translation without exposing raw snapshots or sensitive fields, so that the approved plain-language experience works with verifiable execution evidence.

## Acceptance Criteria

1. **AC-1:** Implement a fixed trusted read-only collector inside the existing browser boundary. Collect bounded current-state semantic/accessibility records joined with DOM field types, approved attributes, regions and relationships. No model-authored evaluation is accepted. [§5]
2. **AC-2:** Export session/document/state generation, immutable observation identity, coverage and truncation metadata. Replaced documents invalidate node handles. Element count/depth/byte/time budgets apply before unlimited whole-document serialization. [§§5,8]
3. **AC-3:** Remove input values, password/hidden fields, sensitive regions, script/handler content, authentication storage and unapproved attributes before export. Dynamic candidate data is represented by opaque local slots; labels/descriptions receive sensitivity checks and known-secret scrubbing. Raw ARIA is not exportable. [§5; snapshot-feasibility.json]
4. **AC-4:** Provide a bounded relevant-DOM fallback when accessibility records are insufficient. Withheld or ambiguous regions stay explicit; no full HTML dump, first-match selection or claimed observation of a future page. [§5]
5. **AC-5:** Expose node identity plus stable selector hints sufficient for later trusted locator-to-node equivalence checks. Do not persist ephemeral handles as replay selectors. [§6]
6. **AC-6:** Real Chromium canary tests cover password values and labels, ordinary input data, visible echoes, injection text, hidden elements, DOM fallback, Unicode bounds and document replacement. Assert serialized exported payload bytes, not only an intermediate sanitizer object. [§11]

## Tasks / Subtasks

- [x] Review the approved plan, dependencies and current source; resolve contract details through the designated expert before code.
- [x] Implement and verify AC-1; record exact files, commands and evidence.
- [x] Implement and verify AC-2; record exact files, commands and evidence.
- [x] Implement and verify AC-3; record exact files, commands and evidence.
- [x] Implement and verify AC-4; record exact files, commands and evidence.
- [x] Implement and verify AC-5; record exact files, commands and evidence.
- [x] Implement and verify AC-6; record exact files, commands and evidence.

- [x] Run applicable quality checks and update File List / Dev Agent Record.
- [x] Submit to independent @qa; only QA can set Done.

## Dev Notes

- Source of requirements: [consensus plan](../../specs/studio-observed-authoring/consensus-plan.md), cited sections per AC. Expert consensus is in [review-record.json](../../specs/studio-observed-authoring/review-record.json).
- Initial real-browser observation evidence: [snapshot-feasibility.json](../../specs/studio-observed-authoring/snapshot-feasibility.json). Raw ARIA included a synthetic password: do not forward it to the gateway.
- Use existing React/MUI/central API/MSW, Java 21/Spring/PostgreSQL, and typed Playwright runner boundaries. No new infrastructure/library is implied by this draft.
- Current authoring evidence DTOs are not a live observation service. ADR-SC-003 removed the English regex intent grammar. Do not restore it or require capture tokens.
- Proposed file names below reserve ownership; confirm exact seams and migration numbering during PO/architecture review. Update the story before crossing another story's owned files; replan overlaps before parallel dispatch.
- Core config points at generic framework docs absent from this app. Use actual AGENTS.md, ARCH.md, docs/architecture/studio-execution.md, ADR-SC-003, and the approved plan as the repository-specific sources.
- Preserve unrelated working-tree changes. Never mark an unavailable service, account, model call, browser run or human pilot as passed.

### Frozen contract and implementation seams

- OBS-001 is Done with independent QA PASS and root-verified SDC completion. Use [ADR-SC-004](../../architecture/ADR-SC-004-observed-authoring.md), the normative [contracts README](../../specs/studio-observed-authoring/contracts/README.md), [observation schema](../../specs/studio-observed-authoring/contracts/observation.schema.json), [limits schema](../../specs/studio-observed-authoring/contracts/limits.schema.json), [shared fixtures](../../specs/studio-observed-authoring/contracts/fixtures.json) and [OpenAPI](../../specs/studio-observed-authoring/openapi.yaml). The ADR's historical pending-QA header does not override OBS-001's completed QA/SDC records.
- The closed observation v1 shape contains `schemaVersion`, `sessionId`, `documentId`, `generation`, `origin`, `scopeHash`, `observedAt`, `coverage` and `nodes`. Immutable observation identity is the canonical-v1 SHA-256 of the full sanitized observation; do not add an undeclared observation-ID/value/slot field. Opaque local candidate handles and DOM element identity remain runner-local. Server-issued dataflow bindings are integrated in OBS-004.
- Export each node's schema-defined role/name, actual element/control type, trusted `classification`/`policyRuleId`, visibility/actionability, depth, sanitized relationships and exact `locatorHints`. Sensitive fields/labels normally disappear from nodes and increment withheld coverage. Relationships cannot export raw IDs or values as a shortcut. Positive configured field/region policy determines eligible business-data/nonsecret controls; absence of a password type is insufficient. Coverage distinguishes `semantic`/`boundedDom` and `complete`/`budget`/`sensitivity`/`unsupportedSurface`; unsafe or incomplete evidence cannot authorize a guessed target.
- `documentId` changes on document replacement; `generation` is monotonic across the entire session and never resets on navigation. Relevant mutation invalidates prior evidence; reusing a generation for an unchanged read/assert needs trusted unchanged-state evidence. Preserve actual local DOM identity so OBS-004 can check unique durable-locator equivalence before dispatch; matching hint text is not identity proof.
- Current Playwright pin is `1.63.0`. `src/run/browser.ts` is the sole permitted Playwright importer; `BrowserHandle` in `browserFactory.ts` currently exposes the structural page seam and lifecycle methods. Extend that trusted seam for fixed observation operations; keep collector/sanitizer/types independent of Playwright imports and preserve sandboxed launch, one-page isolation, cleanup and browser-free unit tests. No model-supplied evaluation or traversal is accepted.
- Initial observation ceilings are 500 nodes, depth 8 and 32768 UTF-8 serialized bytes; configured limits may lower them. Apply traversal/time/byte budgets during collection, not only after full serialization. Reject malformed Unicode and account for the full outgoing JSON bytes. Broader session counters, transport/authentication, proposal admission and gateway integration belong to OBS-003/004/005; this story supplies their trusted bounded observation boundary.

## Testing

Runner typecheck/lint; collector unit tests; actual Chromium fixture tests; browser-confinement and no-dynamic-evaluation checks. Preserve the raw-canary probe as a regression baseline; no external account data in fixtures.

Run from `studio-runner/`: `npm run type-check`, `npm run lint`, `npm run build`, focused collector/sanitizer unit tests, `npm test -- test/run/confinement.test.ts test/no-dynamic-evaluation.test.ts test/lint-boundary.test.ts test/run/sandbox.test.ts`, and `npm run test:fixtures -- test/fixtures-tier/observed-authoring-snapshot.test.ts`. The fixture configuration builds the child runtime and runs real Chromium serially. Add the AC-6 fixture under the reserved path; unit tests remain outside the fixtures tier and import only structural interfaces/pure collection policy code. Validate serialized observations against the frozen schema/shared fixture shape; `node tools/check-studio-observed-contracts.cjs` from repository root is the shared contract regression command.

For AC-2/5/6 include document replacement and same-document node replacement/mutation with identical locator text, budget truncation before whole-document traversal, multi-byte Unicode limits, relationships to withheld nodes and safe explicit fallback coverage. Inspect exact exported JSON bytes for planted input/password/visible-echo/label/description/attribute canaries. Injection text remains untrusted data and cannot alter collector policy. OBS-005/009 still own actual gateway-wire integration proof; a passing collector fixture must not be reported as that later gate.

## CodeRabbit Integration

### Story Type Analysis

Primary: Feature/integration. Complexity: high, derived from the approved cross-layer plan.

### Specialized Agents

@dev supports code checks; @dev owns execution; @architect provides the assigned technical/product gate; independent @qa owns the SDC verdict and Done transition. Database changes additionally require @data-engineer; user-facing flows require @ux-design-expert.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push/deployment is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations and 30 minutes per configured review loop; CRITICAL/HIGH findings must be remediated, lower findings recorded according to config. Focus: immutable scope, real DOM evidence, same-session dataflow, no hidden replay, and confidentiality. For API/DB work include authorization, concurrency and migration tests; frontend work includes a11y, responsive layout and centralized transport.

Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`. Check actual availability during review; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

- `studio-runner/src/run/browser.ts`
- `studio-runner/src/run/browserFactory.ts`
- `studio-runner/src/run/observationCollector.ts`
- `studio-runner/src/run/observationSanitizer.ts`
- `studio-runner/src/run/observationTypes.ts`
- `studio-runner/test/run/observation.test.ts`
- `docs/qa/evidence/STUDIO-OBS-002-dev-fixes-verification.json`
- `docs/specs/studio-observed-authoring/contracts/README.md` (coordinated architect clarification)
- `docs/specs/studio-observed-authoring/contracts/fixtures.json` (coordinated architect clarification)
- `docs/specs/studio-observed-authoring/openapi.yaml` (coordinated architect clarification)
- `tools/check-studio-observed-contracts.cjs` (coordinated architect clarification)
- `studio-runner/test/fixtures-tier/observed-authoring-snapshot.test.ts`
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-002.story.md`

## Dev Agent Record

### Executor and architecture decisions

- Executor: @dev, delegated SDC develop phase, interactive mode; no commit, remote git, backend build or sub-agent dispatch performed.
- Followed `develop-story` and its full task. Root-owned architect rulings confirmed generic application-policy discovery (optional per-control overrides) and a dedicated Chromium isolated world. Initial implementation preserved the OBS-001 schema/API shapes; the root-coordinated reserved-v1 semantic-tree clarification is recorded in the combined correction below.
- Additional owned unit-test seam was declared in File List before editing. Existing unrelated work was preserved.

### Implementation and AC evidence

- **AC-1:** `browser.ts` confines all Playwright/CDP access, installs only the fixed closure-free collector through public CDP APIs and structured trusted arguments, and disables universal access. `BrowserHandle.createObservationSession` adds the observation seam without requiring browser-free legacy fakes to launch a browser. Generic structural discovery uses one approved application policy; optional positive field rules alone may classify data reads as approved.
- **AC-2:** Session generation increments on every collection; document replacement changes document identity while same-document navigation retains it. Remote Element maps, MutationObserver records, current field-value checks and CSSOM/style signatures invalidate stale evidence. Canonical-v1 SHA-256 identifies the entire immutable export. Traversal/stack, text-neighborhood, depth, UTF-8 byte and elapsed-time budgets are applied during collection. Initial ceilings: 500 visited elements, depth 8, 32768 outgoing bytes and 50ms; configuration can only lower them. Incomplete traversal clears nodes because unscanned input echoes cannot be excluded.
- **AC-3:** Isolated-world policy/known-secret handling cannot be intercepted by main-world Array/DOM/observer patches. Input values remain local and scrub all exported names/hints, including late values and visible echoes. Password/hidden controls and their labels, hidden/sensitive regions, scripts/handlers, storage/cookies and unapproved attributes are absent from exported JSON. Opaque node identities retain dynamic candidates locally; no value/slot field was added to the closed wire shape.
- **AC-4:** Generic native semantics, associated/nested labels, bounded resolvable ARIA and placeholders work without control rules or testIds. The actual bounded DOM fallback inspects adjacent `dt`/`dd` and `th`/`td` neighborhoods, exports only safe terms/relationships and retains value-node identities locally. Coverage explicitly records sensitivity, unsupported surfaces and budgets. A future dialog is absent until actually observed.
- **AC-5:** Exact hints use observed role/name, associated labels, placeholders or existing testIds. The isolated resolver accepts only supported emitted hints, counts bounded duplicate candidates and compares strict live Element identity. Hidden matches, unsupported name semantics and stale documents/nodes refuse equivalence. Unrepresentable relational value nodes expose empty hints, not fabricated replay selectors. OBS-004 still owns pin/recheck at actual execution dispatch and positive local read admission.
- **AC-6:** Twelve real Chromium fixtures inspect the final canonical JSON bytes and validate them against the frozen observation JSON Schema. They preserve the raw-ARIA password/input leak baseline and cover generic discovery, private canaries, hostile main-world prototypes, differential Playwright locator behavior, hidden duplicates, ambiguous names, CSSOM changes, Unicode/count/depth/byte limits, same-document/full-document/node replacement and future-page exclusion. Browser-free unit tests cover policy validation, frozen canonical vectors, immutable exports, structural collection, local masking and count/time budgets.

### Fresh verification

All commands below ran from the repository root on 2026-10-08 UTC against the implemented files:

| Command | Result |
|---|---|
| `npm run type-check --prefix studio-runner` | PASS |
| `npm run lint --prefix studio-runner` | PASS |
| `npm run build --prefix studio-runner` | PASS; child runtime and runtime version manifest emitted |
| `npm test --prefix studio-runner` | PASS: 61 test files passed, 1 pre-existing skipped; 1217 tests passed, 29 pre-existing skipped |
| Full unit coverage gates | PASS: overall lines/statements 93.06%, branches 88.03%; run-package lines/statements 88.85%, branches 85.29%; no threshold lowered |
| `npm run test:fixtures --prefix studio-runner -- test/fixtures-tier/observed-authoring-snapshot.test.ts` | PASS: 12/12 real sandboxed Chromium tests |
| Full unit suite's confinement, no-dynamic-evaluation, lint-boundary and sandbox checks | PASS within the full suite; existing deferred/image-only checks remain skipped |
| `node tools/check-studio-observed-contracts.cjs` | PASS: 114 fixture cases, 109 OpenAPI examples, all schemas and canonical vector |
| `git diff --check` | PASS |

Initial focused runs exposed a conservative nested-label expectation and the unit coverage gate; both were corrected through actual generic-label handling and browser-free collector coverage. The differential fixture also exposed hidden unsupported names being counted against visible-role proof; the resolver now excludes those from that ambiguity decision while retaining them for label/testId/placeholder matching. Final runs above passed.

### Review fallback, DoD and limitations

- Checked CodeRabbit availability using `command -v coderabbit`, `command -v wsl` and `test -x ~/.local/bin/coderabbit`: all unavailable. The configured graceful-degradation fallback is independent architect/QA review owned by the root SDC coordinator; **no CodeRabbit PASS is claimed**.
- Story DoD self-assessment: requirements/code standards, exact contracts, tests/coverage, actual browser verification, build/lint/types, documentation and File List addressed. No dependencies, UI flows, database changes or public API writes were introduced. Independent QA/lifecycle closure remains pending; this executor sets only InReview.
- Application-level permission to share structural metadata remains required. Unknown sensitive text inside otherwise approved labels is a documented policy limitation, not universal PII detection. Unsupported semantic names and relational locators are refused rather than guessed. Raw snapshots are never persisted/exported by this collector.
- No gateway/model wire integration, real external account authentication, observed replay publication, human pilot or production enablement was performed; those remain OBS-004/005/009/010 gates. Existing process-level run deadlines remain the outer protection against an unresponsive renderer; the fixed collector's own budgets bound its traversal work.
- Submitted the implemented files and fresh evidence to the root coordinator for independent @architect/@qa review. No Done transition or SDC completion claim is made here.

### QA-fix inventory (iteration 1)

All gate findings inventoried before implementation: **SEC-001 / HIGH** (four referenced-label source leaks); **SEC-002 / HIGH** (normalization bypass of current-value redaction); **REL-001 / HIGH** (five false locator-equivalence positives). No lower-priority or deferred gate finding exists. Fix plan: unify bounded source/ancestor sensitivity eligibility; track every normalization used in exported metadata when scrubbing local values; correct supported native/ARIA/label names and deny equivalence on incomplete candidate universes. Preserve generic application-policy discovery, isolated execution, frozen schemas and all QA-owned artifacts. Add owned browser regressions and record unchanged-probe reruns separately in the reserved developer evidence file. Status remains InProgress until root fixes verification and independent re-review.

### QA fixes applied — ready for independent re-review

- **SEC-001 — FIXED:** Every text source now uses bounded ancestor eligibility, including referenced/native labels, inline text and DOM fallback terms. Label controls inherit password/hidden/sensitive-field exclusions. Host and slot ancestry remain part of the check across open shadow roots; ARIA references resolve within their own document/shadow root. The four exact independent leak cases plus inline/fallback, shadow-host, slot and cross-root cases are covered without per-control mappings.
- **SEC-002 — FIXED:** Private current values and configured secrets are scrubbed using both their original strings and the exact whitespace/zero-width/soft-hyphen transformations used by exported metadata. Late values still scrub earlier nodes. Added byte assertions for repeated spaces, newlines, tabs, nonbreaking/em spaces, zero-width/soft-hyphen variants and normalized configured secrets; ordinary `Continue` discovery stays intact.
- **REL-001 — FIXED:** Native submit/reset defaults, title fallback, repeated ARIA-reference deduplication, individual referenced labels and non-input ARIA-labelled candidates now follow the supported exact semantics. Unmodeled native/name competitors, zero-area accessibility candidates and unsafe mixtures cannot manufacture uniqueness. Differential cases include title/content precedence, default buttons, non-input labels, SVG competitors, exact placeholder whitespace, search combobox competitors and block-separated button names.
- **Open-shadow scope correction:** Open roots are traversed under the same element/depth/byte/time budgets and registered with the private MutationObserver. Actual local Elements and root-scoped label relationships are retained. Unique light-DOM and shadow controls continue to prove identity; shadow duplicates count, late root attachment invalidates old evidence, inner replacement invalidates references, and unslotted light-DOM nodes follow accessibility visibility. No global open-shadow refusal, DOM markers, events, private Playwright API or contract amendment was introduced.
- **Unchanged independent probe:** Reproduced the original **4 pass / 10 fail** baseline, then reran `node docs/qa/evidence/STUDIO-OBS-002-independent-review.mjs` unchanged against the final built runtime: **14/14 PASS**, exit 0. Because that script automatically writes its QA report, original report bytes were restored in `finally`; SHA-256 verification confirms the QA script, report and gate are unchanged. Corrected outputs, checks and source hashes are stored separately in [`STUDIO-OBS-002-dev-fixes-verification.json`](../../qa/evidence/STUDIO-OBS-002-dev-fixes-verification.json).
- **Fresh gates (2026-10-08 UTC):** `npm run type-check --prefix studio-runner`, `npm run lint --prefix studio-runner` and `npm run build --prefix studio-runner` PASS. `npm test --prefix studio-runner` PASS: **1217 passed / 29 pre-existing skipped**, 61 passed files / 1 skipped; overall lines 93.00%, branches 87.02%, run lines 88.77%, branches 83.07%; thresholds unchanged. The owned Chromium fixture command PASS: **41/41**, including all prior 12 cases and 29 added regressions. Shared contract checker PASS: **114 cases / 109 API examples**. `git diff --check` PASS.
- No finding is deferred or marked WON'T_FIX. These are developer remediation results, not a replacement QA verdict. Status deliberately remains **InProgress**, QA Results and the existing FAIL gate remain unchanged, and root verification/independent re-review are required. No backend Gradle, dependency, frozen-contract, commit, agent-spawn or remote-git operation occurred.

### Combined privacy, usability and contract correction — 2026-10-08

Root's unchanged usability probe reproduced four ordinary-form failures (checkbox default `on`, Quantity value `1`, 12 layout wrappers and 550 unrelated paragraphs). The unchanged action-usability probe additionally reproduced an unrelated `role=alert` blocking the Search-button identity proof. Both problems were corrected without control mappings, skipped private-value inventory or increased outgoing/session ceilings.

- **Source-aware masking:** Scrubbing examines page-derived names and hint values; protocol keys, structural enums, policy IDs and opaque identities are not treated as copied form data. Per the architect's ruling, configured secrets and password/hidden/sensitive/ordinary values retain substring masking at every length, including normalized aliases. Only eligible implicit checkbox/radio `on` without a value attribute uses Unicode whole-token matching; strict provenance from any later or shadow source dominates. Eligible real native button/submit/reset values may provide structural captions and remain in freshness state, but do not independently classify all equal action names as private data. ARIA roles cannot grant that exemption.
- **Separate work and output bounds:** Raw inventory is bounded independently at **4096 elements / 64 DOM edges**, with lower-only internal configuration. It still covers current form values, all multi-select selections, open-shadow structures and every possible supported locator competitor. Only relevant semantic candidates receive expensive name/relationship processing. The outgoing ceilings remain **500 nodes / depth 8 / 32768 UTF-8 bytes**, within **50ms**. All internal exhaustion still clears usable nodes/refuses proof. Late private echoes after 550 unrelated paragraphs are tested; raw-work, output-node, output-depth and byte bounds each have independent negative coverage.
- **Retained semantic tree:** After redaction, nodes reconnect to their nearest retained parents and depth is recomputed (roots 0; child depth = retained-parent depth + 1) before outgoing limits are checked. All real exported observations are tested for these depth/reference invariants. Root's architect coordinated the explicit reserved-v1 clarification in the four support files listed above; this executor preserved those edits. Schema shapes/IDs, canonical algorithm/vector, numeric outgoing/session caps and OBS-003 BFF-cookie wording are unchanged.
- **Role-specific uncertainty:** The fixed resolver recognizes the pinned role vocabulary and first-valid-token behavior. Unhandled `alert`/`progressbar` semantics cannot block an unrelated button. Invalid-role native fallback, native presentation conflicts and genuinely possible duplicate roles still refuse unsafe proofs. Positive Search identity, corresponding duplicate negatives, protected password competitors and native label competitors are exercised against real Playwright.
- **Final unchanged probes:** independent privacy/identity **14/14 PASS**; ordinary usability **5/5 PASS**; action usability **7/7 PASS**. All probe sources, initial reports and the existing QA gate were hash-checked and preserved; auto-written reports were restored/removed according to their prior existence. Corrected results are recorded only in the separate developer evidence artifact.
- **Final combined gates:** type-check, lint and build PASS. Full units **1217 passed / 29 pre-existing skipped**, 61 passed files / 1 skipped; overall lines **93.08%**, branches **86.54%**, run lines **89.08%**, branches **82.05%**, with thresholds unchanged. Actual sandboxed Chromium **71/71 PASS**. Coordinated shared oracle **124 fixture/read-policy cases, 109 API examples and 20 schemas PASS**. `git diff --check` PASS.
- [`STUDIO-OBS-002-dev-fixes-verification.json`](../../qa/evidence/STUDIO-OBS-002-dev-fixes-verification.json) contains final source hashes (including all four coordinated support files), protected-artifact hashes, probe outcomes and gate evidence. Status remains **InProgress** for root verification and independent review. The existing QA FAIL/results remain historical and untouched; no self-approval, backend work, agent spawn or commit occurred.

## QA Results

### Independent review — 2026-10-08 UTC

Reviewer: Quinn (@qa), independent agent /root/sdc_obs002_qa; architecture/security scrutiny

Reviewed Revision: sha256:19339dfbe80bee0514d68a62db4cb93ef6f4fecc2ddbaefe8f7694c550a58b7e

Gate: FAIL → docs/qa/gates/STUDIO-OBS-002-trusted-page-observation-and-sanitization.yml

Blocking findings: **SEC-001** referenced labels bypass ancestor/password sensitivity (four exported-byte leaks); **SEC-002** normalized input echoes evade raw-value scrubbing (one leak); **REL-001** five false locator equivalence proofs against actual Playwright semantics. Apply fixes and return to independent review; no implementation was changed by QA.

Independent verification: existing 12 Chromium fixtures passed; focused observation/confinement/evaluation/lint-boundary/sandbox checks passed 133 tests with one pre-existing skip; shared contracts passed 114 cases and 109 API examples. The independent 14-case Chromium reproducer passed 4 and failed 10 (5 privacy leaks, 5 false locator accepts). CodeRabbit is unavailable; configured independent deep-review fallback used, no CodeRabbit PASS claimed.

Reproduction: `node docs/qa/evidence/STUDIO-OBS-002-independent-review.mjs` after the normal runner build. Exact canaries, locator counts and observations are recorded in [independent report](../../qa/evidence/STUDIO-OBS-002-independent-review.json); reviewed-source hashes are in [provenance](../../qa/evidence/STUDIO-OBS-002-reviewed-revision.json). The gate includes AC-by-AC traceability and required corrections. No gateway/capture/dispatch/replay proof is claimed.

### Independent re-review 1 — 2026-10-08 UTC

Reviewer: Quinn (@qa), independent agent /root/sdc_obs002_qa_r1

Reviewed Revision: sha256:b4c3161462c8a716ca2118ede0a0a196cdd6450c8a97affd8feb8f949907517f

Gate: PASS → docs/qa/gates/STUDIO-OBS-002-trusted-page-observation-and-sanitization.yml

SEC-001, SEC-002 and REL-001 are resolved. Independent unchanged probes passed **14/14 privacy/identity**, **5/5 usability** and **7/7 action usability**. Fresh sandboxed Chromium passed **71/71**; full units passed **1217 with 29 pre-existing skips**, including confinement/no-dynamic-evaluation/lint-boundary/sandbox checks. Build, types, lint and diff checks passed; the shared oracle passed **124 cases / 109 examples / 20 schemas**, with coverage thresholds unchanged.

Deep source review verified source-aware strict secret masking, narrow implicit-toggle/native-caption behavior, generic no-control-rule discovery, isolated-world secrecy, full bounded open-shadow identity/freshness, separate private-work/outgoing limits and retained-parent depth after redaction. The coordinated four support files are in the reviewed manifest; all 20 schemas still match OBS-001. No implementation or backend files were changed by QA. CodeRabbit remains unavailable; configured independent deep-review fallback used, without claiming CodeRabbit PASS.

Fresh [verification](../../qa/evidence/STUDIO-OBS-002-rereview1-verification.json), [probe results](../../qa/evidence/STUDIO-OBS-002-rereview1-probes.json) and [source provenance](../../qa/evidence/STUDIO-OBS-002-rereview1-reviewed-revision.json) identify this review. Original probe reports and the [initial FAIL gate](../../qa/evidence/STUDIO-OBS-002-initial-fail-gate.yml) remain historical. This PASS covers the collector foundation only; gateway-wire, actual dispatch/dataflow, auth, replay and pilot gates remain outside this story.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-08 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready; frozen-contract/seam and test-command references clarified; PO report: `.ai/STUDIO-OBS-002-validation.json` | @po |
| 2026-10-08 | 0.2.0 | Implemented isolated bounded observation/sanitization, automatic structural discovery and exact local identity checks; 1217 unit tests and 12 Chromium fixtures passed; Ready → InProgress → InReview, independent review pending | @dev |
| 2026-10-08 | 0.2.1 | QA Gate FAIL — Status: InReview → InProgress — sensitive-label/input-echo export leaks and false exact-locator identity proofs; SEC-001, SEC-002, REL-001 | @qa |
| 2026-10-08 | 0.2.2 | Applied SEC-001, SEC-002 and REL-001 fixes; bounded open-shadow discovery/identity preserved; unchanged independent probe 14/14 and owned Chromium regressions 41/41 passed; status stays InProgress for root verification and independent re-review | @dev |
| 2026-10-08 | 0.2.3 | Completed combined source-aware masking, bounded semantic discovery, retained-tree clarification and role-scoped identity fixes; unchanged probes 14/14, 5/5 and 7/7 plus Chromium 71/71 passed; coordinated four support files included; InProgress pending independent re-review | @dev |
| 2026-10-08 | 0.2.4 | Executor handoff: InProgress → InReview after root verified apply_qa_fixes; final evidence: `docs/qa/evidence/STUDIO-OBS-002-dev-fixes-verification.json`; existing QA FAIL preserved pending independent re-review | @dev |
| 2026-10-08 | 0.2.5 | QA Gate PASS — Status: InReview → Done — independent re-review resolves SEC-001/SEC-002/REL-001; unchanged probes 14/14, 5/5, 7/7, Chromium 71/71, full units and shared contracts pass | @qa |
| 2026-10-08 | 0.2.6 | Administrative closure after independent QA PASS; verified 38-file reviewed-source manifest and four evidence-log hashes, AC-1–6 and all tasks complete; SEC-001/SEC-002/REL-001 resolved. Status Done preserved; wave index updated. [closure-key: STUDIO-OBS-002:digest:sha256:b4c3161462c8a716ca2118ede0a0a196cdd6450c8a97affd8feb8f949907517f] | @po |
