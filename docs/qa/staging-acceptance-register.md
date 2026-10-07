---
# Machine-read by docs/qa/scripts/verify-staging-registration.mjs (story 10.19, AC-15).
# `blocked`  — this register asserts the id is still gating. The script requires its source of
#              truth to read `open` / `OPEN`. If the gate has opened and nobody updated this file,
#              the script fails. That is the failure that hid ED-02's ownership gap for five waves.
# `resolved` — this register asserts the id no longer gates. The script requires its source of
#              truth to NOT read `open` / `OPEN`. A false green fails here.
# Sources of truth: docs/epics/EPIC-10-EXECUTION.yaml (external_dependencies[].status)
#                   docs/architecture/studio-staging-spikes.md (each section's `**Result.**` line)
gate_registration:
  ED-01: blocked
  ED-02: blocked
  ED-03: blocked
  ED-04: blocked
  ED-05: blocked
  ED-06: blocked
  SPK-01: blocked
  SPK-02: blocked
  SPK-03: blocked
  SPK-04: blocked
  SPK-05: blocked
  SPK-06: blocked
# Owner anchors. Each string must still appear in that id's `owner:` line in the manifest.
# ED-02's ownership gap sat unnoticed for five waves; a guard that compares only status would not
# have caught it. Restricted to ED ids: the manifest states each on one checkable line.
gate_owner:
  ED-01: "TBD — not assigned in sources"
  ED-02: "PUT Core platform (Core BFF)"
  ED-03: "Platform/SRE (storage controls"
  ED-04: "Platform/SRE (egress/DNS mechanism"
  ED-05: "Platform/SRE (cluster/sandbox"
  ED-06: "Platform/SRE (ingress"
blocked_criteria:
  AC-1: [ED-01, ED-02, ED-03, ED-04, ED-05, ED-06, SPK-01, SPK-02, SPK-03, SPK-04, SPK-05, SPK-06]
  AC-2: [ED-01, ED-02, ED-03, ED-04, ED-05, ED-06, SPK-01, SPK-02, SPK-03, SPK-04, SPK-05, SPK-06]
  AC-3: [ED-04, ED-05, SPK-04, SPK-05]
  AC-4: [ED-06, SPK-02, SPK-06]
  AC-5: [ED-02]
  AC-6: [ED-02, ED-03, ED-05]
  AC-7: [ED-02]
story: docs/stories/10.19.story.md
---

# Epic 10 — staging acceptance and open-items register

| Field | Value |
|---|---|
| **Owner of this document** | @po (Pax), as the epic's backlog owner. Created by @dev (Dex) under story [10.19](../stories/10.19.story.md) AC-10/AC-11. |
| **Created** | 2026-09-17, on branch `story/10.19` at integration head `d3700f23d`. |
| **Sources** | ADR-002 §9, §23.4, §28.5; `docs/epics/EPIC-10-RUN-LOG.md`; `docs/epics/EPIC-10-EXECUTION.yaml` (`external_dependencies`, `integration_defects`, `file_ownership_conflicts`, `not_in_this_backlog`); `docs/architecture/studio-staging-spikes.md`; `docs/qa/carry-forward-2026-09-16.md`; `studio-runner/ci/stages.md`; the merged story files. **The manifest has no `spikes` block** — the spike register is the only source for spike status. |
| **Guard** | `node docs/qa/scripts/verify-staging-registration.mjs` fails if this register and its sources disagree. |

> **This document records staging technical acceptance. It does not assert that Security & Compliance, Platform/Infra, or Business Sponsor sign-off (BRD §11) has occurred.**

**No status below is invented.** Every row cites the source that already records it. Where a source
is silent — an owner that is genuinely not named anywhere, a ticket that does not exist — the row
says so in those words rather than supplying a plausible name.

---

## 1. External dependencies — `ED-01` … `ED-06`

Read from `EPIC-10-EXECUTION.yaml` `external_dependencies` (2026-09-17). **All six read
`status: open`.**

| ID | Name | Owner | Status | Gates | What it blocks in 10.19 |
|---|---|---|---|---|---|
| `ED-01` | LLM gateway access (R2D2, Vertex-compatible proxy) | **TBD — not assigned in sources.** The manifest's own `owner` field reads exactly that. | open | 10.5, 10.8, 10.19 | AC-1, AC-2 |
| `ED-02` | Real trusted identity + vault (replacing stubs) | **PUT Core platform (the Core BFF)** — identity *and* vault. User decision 2026-09-16, recorded by @pm in `owner_decision`; the manifest's own `traceability` field states this is **not** traceable to the BRD or the architecture. The **vault stays mocked** (`SecretsService` REDACTED/plaintext stub remains). Delivery is outside Epic 10 as a linked external ticket: **`external_ticket: "to be linked — no ticket ID exists yet (2026-09-16)"`**. | open | 10.7, 10.17, 10.18, 10.19 | AC-1, AC-2, AC-5, AC-6, AC-7 |
| `ED-03` | Sonic write/read credentials and lifecycle behavior | Platform/SRE (storage controls — BRD §4) | open | 10.14, 10.15, 10.18, 10.19 | AC-1, AC-2, AC-6 |
| `ED-04` | Approved target and auth-provider destinations | Platform/SRE (egress/DNS mechanism — BRD §4); **application/auth-provider approval owner not named in sources** (the manifest's own wording) | open | 10.17, 10.18, 10.19 | AC-1, AC-2, AC-3 |
| `ED-05` | Internal Playwright image | Platform/SRE (cluster/sandbox — BRD §4) | open | 10.3, 10.18, 10.19 | AC-1, AC-2, AC-3, AC-6 |
| `ED-06` | Real ingress SSE + media route | Platform/SRE (ingress — BRD §4) | open | 10.11, 10.15, 10.18, 10.19 | AC-1, AC-2, AC-4 |

**`ED-02`'s three bypass paths are code that still exists**, closed by configuration rather than
removed: (1) client-supplied `X-User-*` headers trusted in `resolveIdentity` **before** anything
else, (2) the formerly hardcoded core-service bypass, (3) `applyTemporaryCsiReadBypass` appending
`checks-admin` on `GET`s under `/api/v1/csi`. Story 10.18b made all three configuration-driven and
default-closed; the trusted gateway that `ED-02` *is* remains undelivered. See runbook §9.

---

## 2. Spikes — `SPK-01` … `SPK-06`

Read from `docs/architecture/studio-staging-spikes.md` (2026-09-17). **All six read `Result. OPEN`.**

| ID | Question | Accountable owner | Executes | Gates | Result | Evidence scaffold |
|---|---|---|---|---|---|---|
| `SPK-01` | LLM gateway capability (R2D2 via the Vertex SDK) | Architecture (BRD §8 risk owner) with R2D2 gateway owners | Backend dev | 10.5, 10.8, 10.19 | **OPEN** | [`docs/qa/spikes/SPK-01/`](spikes/SPK-01/README.md) (story 10.5) |
| `SPK-02` | Authenticated SSE + media through the real ingress | Platform/SRE (ingress) | Backend + frontend dev; @qa records | 10.18, 10.19 | **OPEN** | [`SPK-02/`](spikes/SPK-02/README.md) (story 10.19 AC-16) |
| `SPK-03` | Sonic manifest/lifecycle/versioning | Platform/SRE (storage) with Sonic owners | Runner dev | 10.14, 10.15, 10.18, 10.19 | **OPEN** | [`SPK-03/`](spikes/SPK-03/README.md) (story 10.19 AC-16) |
| `SPK-04` | Chromium sandbox in-cluster | Platform/SRE (cluster policy) | Runner dev + @devops | 10.18, 10.19 | **OPEN** | [`SPK-04/`](spikes/SPK-04/README.md) (story 10.19 AC-16) |
| `SPK-05` | Destination/DNS egress enforcement mechanism | Platform/SRE (network) with Security & Compliance | @devops + runner dev | 10.18, 10.19 | **OPEN** | [`SPK-05/`](spikes/SPK-05/README.md) (story 10.19 AC-16) |
| `SPK-06` | Measured video step-seek accuracy vs 500 ms | @architect (register owner) | Runner dev (phase A — ran, story 10.12); **@qa (phase B — has not run)** | 10.16 (release claim), 10.19 | **OPEN** | [`SPK-06/`](spikes/SPK-06/README.md) (story 10.19 AC-16) |

**Closure rule** (`studio-staging-spikes.md`, verbatim in substance): a spike is closed when its
evidence record is committed under `docs/qa/spikes/SPK-0N/`, the owner has **signed** the record,
the `Result` line is updated, and the matching `ED-0N` entry in EPIC-10 is updated. A negative result
is a valid closure. **Creating the scaffolds under AC-16 closed nothing**; it gave the signature a
committed place to go.

---

## 3. Story 10.19's blocked criteria, by gating id

Recorded **skipped, never passed**. No partial credit is claimed for any of them.

| Criterion | Subject | Blocked on |
|---|---|---|
| **AC-1** | The credentialed pilot itself: write → compile → review → confirm → run → live SSE → seek/download, against an approved internal workflow, with real identity, real Chromium pod, real video. Also carries **the real Sonic client swap** (10.18 open question 3, routed here by @po). | All twelve: `ED-01`…`ED-06`, `SPK-01`…`SPK-06` |
| **AC-2** | Every failure state in that same flow visible and truthful in the UI. Closes 10.9 AC-15b (translation-quality measurement). | All twelve |
| **AC-3** | Deployed-environment facts: sandbox active from launch logs, the 28-page corpus inside the pinned image, unapproved destinations unreachable, image `node --version` vs `.nvmrc`. Re-verifies HIGH-1 and MED-1 in the deployed configuration. Closes 10.17 AC-16b. | `ED-04`, `ED-05`, `SPK-04`, `SPK-05` |
| **AC-4** | SSE through the real ingress; `<video>` Range/download HAR; SPK-06 phase B seek accuracy; bounded-overload evidence against the deployed configuration. | `ED-06`, `SPK-02`, `SPK-06` |
| **AC-5** | Concurrency guard under a real credentialed identity and real concurrent load. | `ED-02` |
| **AC-6** | Restart/duplicate/delayed-manifest recovery against real pods and a real Sonic-backed manifest. Closes 10.13 AC-5b. | `ED-02`, `ED-03`, `ED-05` |
| **AC-7** | Authorization ledger against a real non-bypassed identity and the real vault's policy, including the **principal** dimension the fake vault cannot express. Asserts ADR-002 §27's ruled `403 STUDIO_FORBIDDEN` on the `/tests/{id}` family. | `ED-02` |

### Prior stories' deferred halves that these criteria carry

Collected from the merged story files. Each is still **skipped, never passed** and is closed only by
the 10.19 criterion named beside it.

| Deferred half | Carried by |
|---|---|
| 10.8 AC-11b (real R2D2 pipeline) | AC-1 |
| 10.9 AC-10b (repair loop against the real gateway) | AC-1 |
| 10.9 AC-15b (translation-quality measurement) | AC-2 |
| 10.11 AC-15(b) (SSE through the real ingress) | AC-4(a) |
| 10.12 AC-12b / AC-12c (measured seek accuracy) | AC-4(c) via SPK-06 phase B |
| 10.12 AC-18b (28-page corpus inside the pinned image) | AC-3 |
| 10.13 AC-5b (runtime cap + margins inside the recovery deadline, deployed configuration) | AC-6 |
| 10.13 AC-7b / 10.17 AC-13b (secret canary through the integrated path with real vault material) | AC-7 |
| 10.14 AC-18b (real Sonic write/read, credential scoping) | AC-1 |
| 10.15 AC-18b (real Sonic ranged reads) | AC-1 |
| 10.17 AC-5b (three authorization properties against the real vault's policy) | AC-7 |
| 10.17 AC-7b (real revocation and real vault deletion) | AC-7 |
| 10.17 AC-16b (destination-misuse negatives through the real mechanism) | AC-3 |
| 10.18 AC-17 (video Range/download HAR through the real ingress) — **moved to 10.19** at wave-6 validation | AC-4(b) |
| 10.18 open question 3 (the real Sonic client swap) — routed to 10.19 by @po | AC-1 |

---

## 4. Open items

### 4.1 Contract open items (ADR-002 §9, §23.4, §28.5)

| Item | Status | Owner | Notes and citation |
|---|---|---|---|
| `O-6` | **Open** | 10.18 → **SPK-05** | Destination policy on the job envelope versus egress-layer enforcement. ADR-002 §9 and §28.5 (*"Unchanged; 10.18's (SPK-05)"*). 10.18 has merged; the question is settled by SPK-05 question 1, which is open. Recorded in `docs/qa/spikes/SPK-05/README.md`. |
| `O-9` | **Open** | "next story on the internal callbacks" (ADR-002 §9, verbatim) | `x-conflict-codes` on the three internal `409`s: `POST /v1/runs`, the admission callback and the progress callback. **Re-verified on this tree, not inherited**: all three `409` descriptions in `docs/specs/studio/openapi.yaml` still say in so many words that they carry no `x-conflict-codes`. §14.7's pre-ruling stands. **Not touched by story 10.19.** |
| `O-10` | **Closed** | @architect → story 10.30 | Ruled in ADR-002 §27: an unknown, soft-deleted or quarantined draft, and a draft on a CSI the caller may not use, all answer **`403 STUDIO_FORBIDDEN`** on `GET`/`PUT`/`DELETE /tests/{id}`; never `400`, never `404`. Prose landed with story 10.30 (`160e218bf`), fix at `3b245079b`, merged `72e95cbbd`. Verified on this tree in `openapi.yaml`. |
| `O-11` | **Closed** | — (needs none) | `ui_test_executions.error_code` CHECK constraint. Landed by story 10.14 as `V17__studio_execution_error_code_check.sql` at `ded3d45fb`; ADR-002 §18.2 re-pointed it there and §23.4 records it closed. **Listed here explicitly because ADR-002 §9's original table still shows it open**, and a reader of that table alone would think it still is. |
| `O-12` | **Closed** | story 10.11 | ADR-002 §28.5: by reading, landed — `studioContract.test.ts:456-465` checks `ExecutionErrorCode` against the document in both directions. |
| `O-18` | **Closed** | story 10.30 | CSI write authorization on `POST`/`PUT`/`DELETE /tests`. Demonstrated red by @qa (`a8379128d`), fixed by @dev (`3b245079b`), gate CONCERNS (merge-safe), merged `72e95cbbd`. |
| `O-19` | **Open — explicitly outside Epic 10** | @architect with @pm (`CON-API-03`) and the frontend consumer | ADR-003, the backend-wide API error envelope. The application has two envelopes split by layer: filters write `{"error":{…}}`, handlers write `{"error":"CODE",…}`. Also covers the filter-written `429`, `503 AUTH_TEMPORARILY_UNAVAILABLE` and idempotency errors, which no Studio operation declares. ADR-002 §25.2, §28.5. **Does not block Epic 10** — no Studio client parses a `401` body (§25.3). Story 10.31 landed the Studio-side half (`SessionUnauthorized` / `PlatformErrorResponse`); the backend-wide decision remains. |
| `O-20` | **Substance landed; the routing question is closed** | @po routed → story 10.32 | The runner calibration setting, the signed-lead diagnostic, and F-4's corrected comments (ADR-002 §26.4, §26.5). Story 10.32 shipped `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS` (default `0`), the chart allowlist entry and `values.yaml "0"`; gate CONCERNS (merge-safe), merged `ef41314f1`. **No real calibration value is set anywhere, and none may be set — see `ESC-3`.** |
| `O-17` | **Closed (routed)** | @po | Story 10.10's AC-11(b)/AC-16(b), *skipped, never passed* in a merged story. Routed by @po to story 10.11c (ADR-002 §13's 10.11c row), which merged at `35104ee6e`. |

### 4.2 Escalations and epic findings

| Item | Severity | Status | Owner | Notes |
|---|---|---|---|---|
| `ESC-3` | — | **Open** | @architect (the ADR assigns the O-number); raised by @po 2026-09-16 | Applying **any non-zero** seek calibration is blocked. Two consequences ADR-002 §26 does not address: a run-clock reading taken within the constant of recording-context readiness becomes **negative**, against the document's declared `minimum: 0`; and `browserStartedAt` stays the wall instant at readiness, so the §11 wall/zero pairing moves apart by the constant and the API's `at = browserStartedAt + atMs` becomes early by the same amount. The manifest marks this **inferred from reading**, not measured. A third piece (`CFG-1`, low, routed by @po 2026-09-17): the key has no upper bound, and the chart validates key *names* only. **10.32's implementation is not blocked at the default of `0`.** Manifest `escalation_esc3`; carried in 10.32 AC-6. |
| `HIGH-1` | HIGH | **Open — re-verification is 10.19 AC-3's, in the deployed configuration** | story 10.18 (raised by its own QA gate) | The chart and the SEC-2 evidence tiers fail open unless wired into a CI stage that actually runs them. 10.18's gate recommended re-verification *"before 10.19's staging pilot"* rather than before merge. 10.19 does **not** re-derive the control; AC-3 re-runs 10.18's own attack ledger (A4/A5, the shim re-exec) against the actual staging pod. Blocked with AC-3. |
| `MED-1` | MEDIUM | **Open — same treatment as HIGH-1** | story 10.18 | `shareProcessNamespace: true` beside a mounted store Secret. Same 10.18 gate recommendation, same AC-3 treatment. Blocked with AC-3. |
| `MED-2` | — | **Open; fix not scheduled** | **@devops**, assigned by user decision 2026-09-16 | Testcontainers' `ContainerDatabaseDriver` holds a process-wide monitor through a stale connection-adder, which **hangs** a `./gradlew check` run rather than failing it. **Standing mitigation, epic-wide and in force**: narrow `--rerun-tasks` runs; every full-suite run records wall-clock elapsed and the test count reached; **a run short of its baseline count is a hang, never a pass.** Carried by 10.11's gate task, 10.15 AC-26, 10.18 AC-22 and 10.19 AC-17. |
| `O-2a` (Node-major mismatch) | — | **Open** | **Platform/SRE with @architect** (`studio-runner/ci/stages.md:301`) | The Playwright base image ships Node 24; `.nvmrc` pins 22. `.nvmrc` was deliberately **not** widened to make the check pass — `check:pins` fails loudly and directs the fix at the image. Either the internal image ships the pinned major (under `ED-05`), or ADR-001 §4.2 is amended. **10.19 owns only the verification in the deployed image** (AC-3, blocked). Recorded in `docs/qa/spikes/SPK-04/README.md`. |
| `PROD-1` | — | **Closed 2026-10-07 (@po). Story 10.33 is `Done`, gate PASS** (`docs/qa/gates/10.33-refuse-malformed-store-bootstrap-payloads.yml`, Quinn, `reviewed_revision` `829a56f02`). The guard landed at `51ade0f1f` (folded at `ec94e9585`/`b22055dda`). @qa saw red-first with the guard reverted (the exact `reading 'find'` crash) and green at HEAD. FOC-08 held with no `setup.ts` edit. *Previous status text, kept for audit:* Open — routed to story 10.33, which is `Draft` | @po routed; the **fix** is deferred to the other session's uncommitted work (run log, wave 8) | Unchecked store-bootstrap payloads: `fetchSources`/`fetchFeatures` do not validate the response shape, so a non-conforming response (an expired session redirected to HTML) crashes the page rather than failing over to the `.rejected` branch. Story 10.33 is merged **as a draft acceptance spec only** (`85fa14fda`); no fix has landed on this line. **@qa gates that fix against 10.33's ACs when it lands.** The production consequence is @qa's **inference**; only its test-harness reproduction was measured (`docs/qa/carry-forward-2026-09-16.md`). |
| `F-2` | — | **Open, unrouted** | **@po** | Story 10.16b's captured seek-measurement recordings lived only in a temporary directory and have expired. Listed here so it is not closed by silence. No story carries it. |
| `F-3` | — | **OPEN AGAIN. Confirmed on this tree 2026-09-17 — see §6.** | **@po**, per AC-19(c)'s own instruction | The `studio-runner/test/reporting/httpClient.test.ts` timeout race. Our QA-gated fix (`a2d3acddc`) was **reverted on the epic line at `7357082e3`** by user decision, in favour of the studio-inference program's equivalent uncommitted fix. **That fix has not landed**: the file on this branch is the reverted base (`git log` shows `7357082e3` as its last commit; digest `444a785d…`), so AC-19(c)'s first bullet applies verbatim — *"If the base file is still what has landed, F-3 is open again."* **Story 10.19 does not re-fix it**; that would make this story a third writer on the file. Measurements in §6. |
| `DISCLOSURE-PIN-1` | LOW–MEDIUM | **Closed 2026-09-17** | — | `studio-runner/test/disclosure.test.ts` now pins the live claim: PUT Core/Core BFF owns `ED-02`, no ticket is linked, ownership is not delivery, and the item remains open. It no longer depends on quotations of the retracted TBD wording. |
| `REF-DANGLE-1` | MEDIUM | **Open — the finding outlives its story** | not assigned in sources | **Nothing in this repository resolves an OpenAPI `$ref`.** Demonstrated during 10.31's gate: both sides of the `403` `$ref` comparison were pointed at a component that does not exist (`NoSuchForbidden`) and the whole estate stayed green — backend 98/0, frontend mocks unchanged, runner `contract.test.ts` 15/15. This bounds what 10.31's comparison guard is worth: real against a route-local copy, blind to a dangling target, because it compares two strings. Scope: **measured** against the backend window, the frontend studio mocks and the runner contract test; **inferred** elsewhere from there being no `$ref` resolver. |
| `EXAMPLE-UNGUARDED-1` | — | **Open** | not assigned in sources | The document's examples are validated by nothing on an ongoing basis. Proven by mutation during 10.31's gate: an example was broken against its own declared schema and the backend stayed 98/0. |
| `EXAMPLE-DRIFT-1` | — | **Open** | not assigned in sources | An assertion reads a transcribed copy under a message claiming it comes from the document. Same family, same gate. |
| `RECON-1` | — | **Open — reconciliation, not a defect in either tree** | @pm / @architect / @po (the reconciliation owners named by the run log) | The other session's `StudioService.java` merges textually clean but authorizes through the **withheld** read, before the revision check, and leaves `delete` unchecked. Renaming its `requireCompile` call is not a reconciliation. |
| Gateway-client reconciliation seam | — | **Resolved 2026-09-17 — there is no breakage.** No owner decision is outstanding | ruled by **@architect** in `docs/architecture/gateway-client-seam.md` (`7bed47129`) | **This row previously read “Open — needs an owner decision” and asserted that `wt/epic` *deletes* `VertexLlmGatewayClient.java` and `VertexAiClientFactory.java`, so that four of this line's test files — `VertexLlmGatewayClientTest.java`, `GatewayAuditTest.java`, `GatewayTestSupport.java`, `StudioGatewayConfigTest.java` — would not compile once both trees met. That claim is retracted. It is kept visible rather than scrubbed, because the error and its cause are more useful than a clean page.** Its source was the run log's *“Reconciliation — the fold is now blocked much harder than before”* section, which **the run log itself retracted in the `CORRECTION` immediately below it** (`3e3d42d34`): the orchestrator had read a `git status` truncated to the first 30 of 263 paths, seen the two ` D ` lines and never reached the matching `??` additions further down. **The entry as first written hedged correctly** — it recorded the changed path count (241, not 263), noted the untracked test-tree copies, and said plainly that whether the breakage held *“was not determined.”* What was missing was the determination, not the honesty. **Determined now.** The two classes are **demoted, not deleted**: moved into `backend/src/test/java/com/citi/put/checks/studio/compile/gateway/` under the same package (`package com.citi.put.checks.studio.compile.gateway;`), with `google-cloud-vertexai` moved from `implementation` to `testImplementation` (`backend/build.gradle.kts:69`) under their tree's own comment, *“Legacy Vertex classes below are test-only historical regression fixtures.”* Their `GenAiLlmGatewayClient` implements the same `LlmGatewayClient` interface. **Verified independently four times, each read-only in `wt/epic`:** by **@architect** (which is how the error was caught), by the **orchestrator**, by **@dev**, and by **@po on 2026-09-17** — who additionally measured the byte-identity the other three asserted: `shasum -a 256` of each demoted file equals `git show HEAD:…/src/main/…` for the same file (`VertexAiClientFactory` `bf810bf9…`, `VertexLlmGatewayClient` `f4211436…`). `grep -rl 'com.google.cloud.vertexai' backend/src/main/java` in their tree returns nothing; the one surviving `implementation` mention of that coordinate (`backend/build.gradle.kts:124`) is inside a `constraints { }` block — a version pin, not a dependency. **The four tests compile. There is no source-set breakage to reconcile.** Ruling and fold procedure: `docs/architecture/gateway-client-seam.md` — the behavioural contract belongs to `LlmGatewayClient` and *“replacing a client does not delete its tests, it demotes them”*; at the fold **verify, don't fix** (the two greps; seam note §5, closure plan step 2.6). **Still open and untouched by this resolution:** their tree is uncommitted, so if they delete rather than demote before committing, the breakage becomes real after all — which is why the fold step is a *verification* and not a formality; and `docs/architecture/studio-execution.md:78` still names the Vertex SDK, which is wrong for their tree — flag to @architect at the fold, **not** edited here (that file is dirty in `wt/epic` and an edit would create a new fold blocker). |
| `DEF-03` / `DEF-04` | LOW / MEDIUM | **Open (backlog, NOT scheduled in Epic 10)** | @po owns the routing; the fix belongs to the first story that adds a `@Version` column to `UITest` | Merged by @po as one item: the authorized delete takes no lock and can revert a concurrent save (`DELETE-RACE-1`), and the dirty-caller stale overwrite (`DIRTY-CALLER-STALE-1`). Same root cause. Deferred past the pilot under DEF-03's two conditions, with its operating note extended to cover save-vs-save. |
| `DEF-01` / `DEF-02` | HIGH / HIGH | `status: open` in the manifest, **but both were fixed by their carrying stories** | 10.17 (DEF-01), 10.14 (DEF-02) | Recorded here exactly as the tension it is: the manifest's `status` field still reads `open` for both, while its own `carried_by` / `owner` fields name the merged stories that fixed them (10.17 AC-2; 10.14 AC-10, *"landed at the head of wave 5"*). **This register does not change the manifest** — the manifest is @pm's. Flagged for @pm to close both fields, or to say why they stay open. |
| `DEF-05` | HIGH | **Closed 2026-10-07 (@po) — fixed by `a19112afb` (identity) + `e79178666` (runner logs one redacted `runs.refused` line per refused `/v1/runs` body).** @qa ruled it closable at the 10.35 re-gate: PASS at `0d93a9bf1`, `docs/qa/gates/10.35-dispatch-service-identity-def-05.yml` (`re_reviews[0].def_05_closure`). All of AC-1 to AC-7 were executed and passed **by running**: co-run legs 0, 2 and 3 green, `admission_id` written, and a malformed body gives a third refusal shape. One low caveat, OBS-H5: an uncommitted V28 was in `build/resources`. The manifest now reads `status: fixed`. OBS-1 is not closed by this. *Previous status text, kept for audit:* Open. Fix present in tree at `a19112afb`, pending gate by 10.35 (row added by @po 2026-10-06) | Story **10.35** (acceptance spec), gated by **@qa** and now dispatchable. @po owns routing. | The dispatch path presented no service identity: the runner refused `POST /v1/runs` with `IDENTITY_MISSING`, so the API had never dispatched a run. That also made DEF-01's defect class unobservable and left DEF-02's path unexercised. This register previously had no row for it, though the manifest (`integration_defects.DEF-05`) did. **Fix in tree, read-verified, not run:** `a19112afb` (2026-09-18, Studio v1 WP1, ancestor of HEAD `e2179f50b`). `HttpRunnerDispatchClient.java:108,149` send `Authorization: Bearer`, and `:55,180` refuse with `SERVICE_IDENTITY_NOT_CONFIGURED` when no token is configured. **Not closed:** it closes only when 10.35's co-run legs (`tools/corun.sh`, `StudioCoRunIT`) and its AC-5 unit test pass on the tree, with the gated SHA recorded. |
| CSRF on cookie-authenticated mutations | — | **Open — an unmet architecture prerequisite, not a solved problem** | closed by **SPK-02 question 7** (`ED-06`, OPEN). The runbook names no individual owner and neither does this register | Architecture §9.1 requires a documented CSRF control for cookie-authenticated mutations. Two facts bound the gap, both read on this branch: the browser's credential is a **cookie** (`put_session`, via `BffSessionAuthenticationFilter.extractSessionCookie`), and CORS is **credentialed** (`SecurityConfig.buildCorsSource` sets `setAllowCredentials(true)` for `/api/**`) while the chart deploys the MFE and the API on **different hosts**. `SecurityConfig.filterChain` opens with `http.csrf(csrf -> csrf.disable())`. `SameSite` would bound it, but **this application does not set the cookie — Core does**, and what Core sets is not established anywhere in this repository. Story 10.18b deliberately did **not** "fix" it: enabling Spring's CSRF filter or dropping CORS credentials changes the public request contract of every existing Checks route. Runbook §10. |
| `configOverrides` never reaches a process | — | **Closed 2026-09-21** | **@devops (Gage)** | `templates/configmap.yaml` now converts dotted/hyphenated properties to Spring Boot's uppercase underscore relaxed-binding form before `envFrom` consumption and fails closed on invalid or colliding names. The rendered-manifest gate is green for all four value sets and mutation-tests both conversion and collision refusal. Runbook §11. |
| `FOC-08` | — | **Standing constraint, not a defect** | @po recorded 2026-09-17 | `frontend/src/test/setup.ts` imports the store and waits up to 10 s for **both** import-time fetches (`fetchSources`, `fetchFeatures`) to settle. Three kinds of product change break that wait and make **every jsdom test file** fail after 10 s: a lazy store bootstrap, dropping either fetch, or leaving `fetched` false on some outcome. `setup.ts` must change in the same commit. Relevant to story 10.33, which edits both reducers. |

### 4.3 Environment findings

| Item | Status | Owner | Notes |
|---|---|---|---|
| `ENV-1(a)` | **Open** | **@devops**, as a documented worktree bootstrap step | `@put/core-components` is declared as a relative symlink (`../../../../put-core-components`) that resolves from the main checkout and **not** from any worktree. Environment setup, **not** a repository defect: `node_modules` is gitignored and `package.json` must not be "fixed". **Consequence, measured on this tree (2026-09-17):** `ChecksLayout.a11y.test.tsx` fails at **file level** — it cannot load, so it contributes no counted test — and `npm run type-check` reports exactly **2** pre-existing `TS2307` errors. |
| `ENV-1(b)` | **Open** | **@devops**, raised to @pm as separate work | `frontend/.eslintrc.json` extends `"@typescript-eslint/recommended"` without the `plugin:` prefix, so ESLint 8 rejects the configuration and **zero files are linted**. A real repository defect and **not Epic 10's**. **Binding rule, still in force: no story may report `npm run lint` as passed.** The "191 errors and 333 warnings" figure this epic once carried is withdrawn — there was no run, therefore no count. |
| `ENV-1(c)` | **Fixed in the studio-inference worktree; not yet committed on this line** | the other session, by the user's decision of 2026-09-16 (*"10.19 verifies what lands rather than re-fixing it"*) | The missing skip link in `ChecksLayout`. Story 10.19 AC-14 names the fix; the user placed `ChecksLayout.tsx` and `ChecksLayout.a11y.test.tsx` inside the other session's frontend-cleanup ownership. **Read-only verification on 2026-09-17** found the fix present and uncommitted in `wt/epic`: a `<Box component="a" href="#checks-main">Skip to main content</Box>` as the first child of the outer layout `Box` (before `PlatformSidebar`), hidden by `transform: translateY(-150%)` and revealed by `&:focus`; `id="checks-main"` and `tabIndex={-1}` moved onto the `<main>` `Box`; the orphaned absolutely-positioned `<Box component="div" id="checks-main">` deleted. **Divergence from AC-14's stated test, recorded rather than silently accepted:** the other tree's `ChecksLayout.a11y.test.tsx` asserts the link's `role`/`href` and that a **click** moves focus to `main`. It does **not** assert the skip link is reachable by the **first `Tab` press**, which is what AC-14 names. That assertion is still missing. **For @po**: whether it is added by the other session, by a follow-up, or waived. |
| `ENV-3` — **`axe-core` declared but not installed in the integration worktree** | **Open** | **@devops**, as the same documented worktree bootstrap step as `ENV-1(a)` | Story 10.19 added `axe-core` to `frontend/package.json` and to the lockfile for AC-12's WCAG scan. **`npm ci` has not been re-run in the `wt/w7` integration worktree since**, so the package is absent from that tree's `node_modules` and `frontend/src/test/studioWcagAudit.test.tsx` **cannot load** — it contributes no counted test, the same file-level failure mode as `ENV-1(a)`. **Consequence, measured by the orchestrator in `wt/w7` on 2026-09-17: the frontend suite there reads `541 passed / 2 failed` of 543 across 3 failed files, not the `548 / 2` story 10.19 reports**, and `npm run type-check` reports **5** errors rather than `ENV-1(a)`'s 2 — the extra three being one `TS2307` and two `TS7006` from the missing package. The `548 / 2` baseline is reproducible only where `npm install` / `npm ci` ran after 10.19 merged, which is where 10.19's own gate ran (`wt/10.19`); **that it ran there with `axe-core` installed is inferred from the number, not observed.** **Not a repository defect and not story 10.19's** — `node_modules` is gitignored and `package.json` is correct. **The step this makes mandatory:** `npm ci` in `frontend/` and in `studio-runner/` after any merge that touches a `package.json`, *before* any suite figure is reported; a figure short of baseline from an unbootstrapped worktree is an environment artefact, not a regression — the same class of trap as `MED-2` and the backend host-contention rule above. Carried as closure-plan step 0.7 (@devops). **Not verified by @po:** the 541/2 and the five type errors are the orchestrator's measurements, recorded here on their authority; @po ran neither suite — this phase is documents-only and another agent holds Gradle. |
| `ENV-2` | **Closed** | — | The shared `setup.ts` imported the store under a single-purpose MSW server. Reproduced red→green with a stand-in on another port; the real `:3000` process was never touched. Folded in wave 8 (run log, *Carry-forward test fixes*). |
| Backend host contention | **Standing operational rule, not a defect** | — | On this host, concurrent `./gradlew test` invocations manufacture timing failures. **Run backend suites sequentially; a package failure under load is not a result until it has been reproduced at rest.** Three EOF-family failures were observed on 2026-09-17 alone: `CompilePipelineIT` contention, a `ResourceAccessException` during mutation (`PHANTOM-1`, closed as an environment artifact), and an embedded-Postgres `EOFException` at Spring context startup. Sits beside `MED-2`: between the two, an unqualified backend "red" or "hang" is never reportable on its own. |
| Gradle input declaration | **Open** | **@devops** | `:test` is `UP-TO-DATE` against an input set that excludes `docs/specs/studio/openapi.yaml`, so a contract-reading test can return a false green against a stale document (it did, in wave 5). Mitigation in force: every contract-reading test runs with `--rerun-tasks`. |

### 4.4 Accessibility findings (story 10.19 AC-12)

Measured 2026-09-17 with `axe-core` 4.13.0 over the seven named Studio surfaces. Full detail and the
per-surface counts: [`accessibility/studio-wcag-audit.md`](accessibility/studio-wcag-audit.md);
machine-readable: [`accessibility/axe-results.json`](accessibility/axe-results.json).

**AC-12(a) permits either zero critical/serious violations or every one ticketed with a named owner
and a severity. Every surface carried at least one, so these are the tickets.** They are pinned in
`frontend/src/test/a11y/studioWcagAudit.test.tsx`, which fails if any grows, shrinks, disappears or
is joined by a new one.

| Ticket | Severity | Status | Owner | Finding |
|---|---|---|---|---|
| `A11Y-1` | **critical** (`button-name`, WCAG 4.1.2 A) | **Closed in automated scan 2026-10-04** | **@po routes; @ux-design-expert advises.** | The compact Tests list names its Delete action, resolving the final unnamed list action. Tests and Runs both have zero critical/serious violations; the Tests-page pins are empty. Manual assistive-technology validation remains tracked by A11Y-5. |
| `A11Y-2` | **serious** (`aria-prohibited-attr`, WCAG 4.1.2 A) | **Closed in automated scan 2026-10-04** | as `A11Y-1` | Tooltip wrappers now use `describeChild`, and names live on the actual buttons. Tests and Runs both have zero critical/serious violations; the prohibited-wrapper pin is removed. |
| `A11Y-3` | **critical** (`label`, WCAG 1.3.1 / 3.3.2 A) | **Closed 2026-09-20** | — | Every Studio editor field now has a programmatic label. Re-scan: zero `label` violations across all five `ChecksStudioPage` states. |
| `A11Y-4` | **serious** (`aria-progressbar-name`, WCAG 4.1.2 A) | **Closed 2026-09-20** | — | Execution progress and the active-step spinner now have accessible names. Re-scan: zero `aria-progressbar-name` violations. |
| `A11Y-5` | — (process, not a defect) | **Open — outstanding work, never "blocked"** | **@ux-design-expert (Uma)** runs it; **@qa (Quinn)** records the divergences | **AC-12(b), the manual assistive-technology pass, has not been performed.** No screen reader was run, no transcript exists. Nothing external gates it; it needs a human and a calendar slot, like AC-13. Story 10.19's AC-12 is **PARTIAL** for this reason and its checkbox stays unticked. |
| `A11Y-6` | — (unmeasured area) | **Open** | as `A11Y-5` | `color-contrast` and `target-size` were **disabled** in the scan: jsdom has no layout engine and neither rule can be answered without computed geometry and colour. Their absence from the results is an **unmeasured** area, not a clean one. Closing it needs a browser-driven run (Playwright + `@axe-core/playwright`) or a manual check. |
| `A11Y-7` | — (measurement limit) | **Open — depends on `ENV-1(a)`** | **@devops** for the unblock; re-measurement is whoever next audits | `ChecksLayout` could not be scanned at all (`ENV-1(a)`, the dangling `@put/core-components` symlink), so the `moderate` `region` counts are inflated by the harness rendering pages without the `<main>` landmark the layout supplies, and **the skip link is unscanned**. Re-measure once the worktree bootstrap lands. |

---

## 5. What this epic does **not** deliver

Literal, not summarized. Each line names the thing and where it is recorded.

1. **`ADR-003` / `O-19`** — the backend-wide API error envelope. @architect with @pm; @pm and @po place its implementation **outside Epic 10** (ADR-002 §25.2, §28.5; manifest `not_in_this_backlog`).
2. **The scheduling integration** — BRD §9 marks it **"Post-V1"**. Studio executions are dispatched on demand; no scheduler drives them.
3. **Compile-result caching** — not built, not designed here.
4. **Presigned video redirects** — post-V1 (`studio-staging-spikes.md`, SPK-02 *Fallback if negative*). Video is served through the authorized API route.
5. **Larger runner pools and autoscaling** — the runner runs at its configured slot count; capacity growth is not this epic's.
6. **Stories 10.20–10.26, the studio-inference program** — drafted outside this validated backlog. Not depended on, not blocked by, not absorbed. See §7.
7. **The three BRD §11 GA sign-offs — named explicitly, because a reader must not be able to infer otherwise:**
   - **Security & Compliance** sign-off — not obtained, not simulated, not marked complete;
   - **Platform/Infra** sign-off — not obtained, not simulated, not marked complete;
   - **Business Sponsor** sign-off — not obtained, not simulated, not marked complete.

> **This document records staging technical acceptance. It does not assert that Security & Compliance, Platform/Infra, or Business Sponsor sign-off (BRD §11) has occurred.**

Architecture §10 states the boundary this register keeps: *"Staging technical acceptance is separate
from GA. Security, Platform/Infra and Business Sponsor sign-offs remain governed by the BRD;
documentation adoption does not assert that tests or approvals have occurred."*

---

## 6. Technical acceptance — the reserved row (AC-11)

The verdict this row will hold cannot be written until the pilot runs. The row exists now, with its
value recorded honestly, because a blank row is indistinguishable from an oversight and a row that
says why it is empty is not.

| Item | Pointer | Value today |
|---|---|---|
| **Staging pilot technical acceptance: @qa gate verdict, @po validation record** | `docs/qa/gates/10.19-*.yml` (this story's own gate, not yet written) and story 10.19's Change Log validation row | **not yet run — Blocked, see AC-1.** All twelve of `ED-01`…`ED-06` and `SPK-01`…`SPK-06` are open; no credentialed pilot has been attempted, scheduled or staffed. |

### 6.1 `F-3` — the AC-19(c) reading, measured on this tree

**Which version is present: the reverted base.** `git log -- studio-runner/test/reporting/httpClient.test.ts`
ends at `7357082e3` ("revert(epic-10): drop the carry-forward F-3 edit"); the file is clean in the
working tree at `sha256 444a785d450cf0c44ba331f9f9f91fe5b0dd00672794f3e2f1f6afc5092ae5a0`. The
studio-inference program's equivalent fix has not landed. **F-3 is therefore open again.**

| Measurement | Result |
|---|---|
| The file alone, **20 runs under CPU load** (8 spinner processes; 1-minute load 11.8 → 14.4) | **20 / 20 passed**, 6 tests executed on every run — counts checked per run, not inferred from a silent exit |
| The **full default tier** (50 files, 1013 tests) | Failed **once in five runs**: `reports a timeout as ambiguous, not as a failure to send` — `expected [] to have a length of 1`. The other four runs were 984 / 0 / 29 |
| The **deterministic squeeze** — a 100 ms recording pause on **that test's own responder only**, against the client's 25 ms deadline, on a scratch copy | **1 failed / 5 passed.** Exactly the F-3 test, and nothing else |

**Both were supposed to be green and neither is.** The correction to AC-19(c)'s own protocol, stated
rather than buried: **the 20-runs-under-load recipe does not reproduce this race.** It was designed
for the carry-forward investigation and it passes cleanly here. What reproduces it is the **full
suite's own parallelism** — fifty test files competing — and the squeeze, which reproduces it every
time. Anyone re-checking F-3 with the 20-run recipe alone would conclude it is fixed. It is not.

**An F-3 failure is not story 10.19's regression and is not reported as a pass.** It returns to @po.

### 6.2 Wiring the guard into CI

**This is @devops's decision and it is open.** There is no CI definition for
`docs/` in this repository — verified 2026-09-17: no `.github/workflows`, no `.gitlab-ci.yml`, no
`Jenkinsfile`. The script therefore runs as a named step of story 10.19's build gate (AC-19(b)) and
its result is recorded there. **This register does not claim it runs in CI.**

---

## 7. Stories 10.20–10.26 — recorded, not resolved

The manifest's `not_in_this_backlog` entry, which is @pm's: those ids *"were drafted outside the
validated backlog, the manifest is @pm's, and the run log bars merging across that line until the
program's owner, @architect, @po and @pm have reconciled."*

Story 10.19 does not depend on, block or absorb any of them. Its `Depends on` and `Blocks` header
rows contain none of them, and `verify-staging-registration.mjs` check (iii) fails if that changes.

**Left open for @po/@pm, unresolved here:**

1. Whether 10.20–10.26 join this manifest, get their own, or stay outside.
2. Whether the uncommitted real-Sonic-backed object store observed in `wt/epic` — confirmed present
   by path on 2026-09-17, read-only: `backend/…/studio/storage/{S3VideoObjectStore,
   FilesystemVideoObjectStore, MountedAwsCredentials}.java` and `studio-runner/src/run/s3ObjectStore.ts`
   — is ever the mechanism AC-1's real Sonic client swap adopts. **It is not adopted here.** Whoever implements
   AC-1 writes or adopts a real Sonic-backed client through the normal SDC cycle, reconciled if
   @pm/@architect/@po so rule — **not by silent copy.**
3. ~~The gateway-client reconciliation breakage in §4.2, which is not a defect in either tree and
   needs an owner decision before the fold.~~ **Resolved 2026-09-17 — there is nothing here to decide.**
   The two classes are demoted into the test source set, not deleted, and the four tests compile; verified
   four times read-only, most recently by @po with a byte-identity check. See §4.2's *Gateway-client
   reconciliation seam* row and `docs/architecture/gateway-client-seam.md` (`7bed47129`). Struck rather than
   deleted so a reader who was told a decision was owed here can see that it was made, and on what evidence.
   What remains for the fold is a **verification**, not a decision: the two greps at closure-plan step 2.6.

---

## 8. How to keep this register true

`node docs/qa/scripts/verify-staging-registration.mjs`

It fails, naming the id and the direction of the mismatch, when:

- an id this register calls `blocked` no longer reads `open`/`OPEN` in its source of truth — the gate
  may have opened and nobody updated this document;
- an id this register calls `resolved` still reads `open`/`OPEN` — a false green;
- an id exists in a source of truth and is missing from this register's front matter entirely;
- the GA-sign-off disclaimer sentence above is absent;
- any of `docs/qa/spikes/SPK-02/README.md` … `SPK-06/README.md` is missing;
- story 10.19's `Depends on` or `Blocks` row names any id the manifest lists as not in this backlog;
- the runbook's rollback section has lost one of its four named sub-parts;
- `docs/qa/research/studio-user-trial.md` has lost AC-13(f)'s structure.

The last two are **presence checks, not truth checks**, and are labelled as such in the script's own
output.
