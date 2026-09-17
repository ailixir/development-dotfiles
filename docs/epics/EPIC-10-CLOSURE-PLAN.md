# EPIC-10 Closure Plan — independent review and the sequence to close

| Field | Value |
|---|---|
| Reviewed tree | `epic/EPIC-10-w7` at `f34eb4d23`, worktree `wt/w7`, clean before and after this review |
| Review date | 2026-09-17, 19:15–19:30 EDT (host load 5–12 throughout) |
| Reviewer | independent senior review, not the epic's orchestrator |
| Also read, strictly read-only | `wt/epic` (`epic/EPIC-10` at `ff0513385`, 263 dirty paths at 19:18 EDT — every fact cited from it is dated, because it moves) |
| Standard | Constitution Article IV. Every claim below names its source. **Measured** means I ran it in this session; **read** means I read the file; **inferred** is marked as such. |

This document is the only artifact this review produces. It does not modify code, tests, the
manifest, the register or the run log; it tells their owners what to change and in which order.

---

## 0. Verdict

The orchestrator's headline — *"locally complete and locally proven, but never run end-to-end
against a real environment, and no work in this repository can change that"* — is **right about the
external half and wrong about the local half, in both directions.**

- It **overstates** local completeness. "Locally proven" is true of each component against a stub
  of its neighbours and the contract document. It is not true of the system: nothing in this
  repository has ever run the real API and the real runner together, not even on a laptop (§7). The
  two HIGH integration defects this epic found (DEF-01 *"the API has never been able to dispatch a
  run"*, DEF-02 *"every FINAL the merged runner sends is refused by the merged API"*) were found by
  a drafter reading, not by a test, precisely because no such run exists — and nothing structural has
  changed since.
- It **understates** what the repository can still do. A local co-run of the three components with
  fixtures, a filesystem store and the stub gateway would exercise DoD items 2–6 minus identity,
  ingress, Sonic and the LLM, and would turn the first staging run from "three components meet for
  the first time, behind six external gates, in a merged tree that does not exist yet" into a
  verification of the four things that genuinely need staging.
- It **omits** that the epic is not administratively closed by its own records: the manifest's
  `status` is `planning`; seventeen of twenty-three story files are not `Done`; and the register
  shipped by 10.19 carries, as an *open item needing an owner decision*, a claim the run log had
  retracted forty minutes before the register was committed (§2.2).

The capability is **not shippable** (§3b) and **not validated** (§3c). Both are correct outcomes at
this point and neither is a failure of the epic. The failure would be to fold the two lines by
recency, which reopens the security hole 10.30 closed (§4), or to let the first co-run happen in
staging (§7).

---

## 1. What this review measured, and what it only read

| Claim (orchestrator) | This review | Basis |
|---|---|---|
| `epic/EPIC-10-w7` is 30 commits ahead of `epic/EPIC-10` | **31** | measured: `git rev-list --count epic/EPIC-10..HEAD` = 31, 0 behind |
| Backend `studio.*` 709 passed / 0 failed / 7 skipped | **709 / 0 / 0 errors / 7, 716 total, 94 XML files, none zero-length** | measured by aggregating `backend/build/test-results/test/*.xml` in `wt/w7`; files stamped 2026-09-17 17:25, and `git diff d3700f23d..HEAD -- backend` is empty, so the figure applies to the tip's bytes. **Not re-run** by me: load was 8–12 and the epic's own rule forbids a backend run under contention; `./gradlew check` was not run (MED-2). |
| Frontend 548 / 2 | **541 / 2 of 543, 3 files failed** | measured in `wt/w7` at load ~9: the two deliberate AC-32 reds in `confirmedRevisionEscalation.test.ts`; `ChecksLayout.a11y.test.tsx` unloadable (ENV-1); **`studioWcagAudit.test.tsx` unloadable — `axe-core` is absent from `wt/w7/frontend/node_modules`**. 10.19 added it to `package.json:58` and the lockfile; nothing reinstalled in this worktree. The claimed 548 is reproducible only where `npm install`/`npm ci` ran after 10.19. |
| Frontend type-check: "the 2 known TS2307" | **5 errors** | measured: the two ENV-1 `TS2307`s plus one `TS2307` and two `TS7006` caused by the missing `axe-core` |
| Runner default 984 / 29 | **984 / 29** | measured (`npm test`, 4.9 s) |
| Runner deployment 184 / 4 | **184 / 4**, the four being `AC-18 — EXPECTED RED` in `envfrom-keys.test.ts` | measured (35 s) |
| Runner fixtures 90 / 10 | not measured | skipped: Chromium tier with a known ~5% seek flake, under load; nothing I could conclude from one run |
| Fold blocked by 13 paths | **14** at 19:18 EDT | measured: `comm -12` of files changed on w7 against `git status -uall` in `wt/epic`. The 14th is a real drift, not a miscount: the other tree moved between the seam note's snapshot (17:52) and mine. |
| Twelve external gates open, none ours | confirmed | read: manifest `external_dependencies[].status` all `open`; `studio-staging-spikes.md` all six `**Result.** OPEN.` |
| ED-01 owner "TBD"; ED-02 ticket unlinked | confirmed | read: manifest ED-01 `owner: TBD — not assigned in sources`; ED-02 `external_ticket: to be linked — no ticket ID exists yet (2026-09-16)` |
| DEF-01 / DEF-02 fixed in code, stale in manifest | confirmed | read: `HttpRunnerDispatchClient.java:136-155` writes all ten once-missing keys; `RunnerEvidence.java:25` is `record RunnerEvidence(String videoKey, String manifestKey, String state, Boolean partial)`; `InternalBodyContractConformanceTest.java:79` exists and is in the 94 XML suites. Manifest still `status: open` for both. |
| Contract pin green | confirmed | measured: `shasum -a 256 docs/specs/studio/openapi.yaml` = `d9f5f2a2…af6a` = `confinement.test.ts:217` |
| ENV-1: dangling `file:` symlink; lint has never run | confirmed | measured: `frontend/node_modules/@put/core-components -> ../../../../put-core-components` resolves to `wt/put-core-components`, which does not exist; the real package is at `/Users/brunobuger/workspace/citi/put/put-core-components` |
| Register guard reads only front matter | confirmed | read: `verify-staging-registration.mjs:139-161` (`readRegisterFrontMatter` matches `^---\n…\n---\n` and parses only `gate_registration`, `gate_owner`, `blocked_criteria`) |
| "Nothing in this repository resolves an OpenAPI `$ref`" (REF-DANGLE-1) | **false as stated; true narrowly** | read: `studio-runner/test/helpers/openapi.ts:63-76` is `resolveRef`, and it throws `` `$ref does not resolve: ${pointer}` `` on a dangling pointer. It is applied only to the runner's own routes (`contract.test.ts:74`: `/v1/validate`, `/v1/runs`, `/health`, `/ready`). The `NoSuchForbidden` mutation on `getExecutionVideo`'s `403` stayed green because nothing walks the public routes — not because no resolver exists. See §5. |
| Gateway classes deleted in the other tree | **demoted, not deleted** — the CORRECTION stands | measured read-only at 19:18: `?? backend/src/test/java/.../gateway/{VertexAiClientFactory,VertexLlmGatewayClient}.java`; `grep -rl com.google.cloud.vertexai backend/src/main/java` empty; `build.gradle.kts:69` `testImplementation("com.google.cloud:google-cloud-vertexai:1.52.0")` |
| Other tree = stories 10.20–10.26, contract re-pinned to `09720ae2…` | **stale** | measured read-only at 19:19–19:20: a **10.27** story exists (`InReview`, "Resolve verification failures and finish the Studio read contract"); their `openapi.yaml` hash and pin are now **`c877d6dd…0187`**, not `09720ae2…`. The run log's merge-line conflict table (wave 8) is out of date on that row, and the manifest's "ids start at 10.30 to leave 10.27–10.29 to the other program" has already been taken up. |
| Security facts the runbook states | confirmed in code | read: `SecurityConfig.java:144` `http.csrf(csrf -> csrf.disable())`, `:191` `setAllowCredentials(true)`, cookie `put_session` (`:127`, `OpenApiConfig.java:32`); `values-uat.yaml:51-53` and `values-prod.yaml:57-59` render all three bypass keys `false` |

Nothing in the tree was modified by any run: `git status --short` was empty after each.

---

## 2. Where the orchestrator's framing is wrong, with evidence

### 2.1 "Locally complete and locally proven"

**Verified by absence, and I state it as such:** no backend test starts the runner (the 15 studio
test files that mock HTTP use WireMock; `grep -rln 'studio-runner\|ProcessBuilder' backend/src/test`
returns no test that launches it); no runner test calls the API (`grep -rln 'localhost:8080\|spring'
studio-runner/test` hits only a values-file assertion); there is no compose file; `dev.sh` on this
line starts `gradlew bootRun` (`dev.sh:240`) and the frontend (`:274`) and never the runner; and
`frontend/package.json:19` declares `"test:e2e": "playwright test"` but there is no
`playwright.config.*` and no `e2e/` directory — the project `CLAUDE.md`'s "Playwright (E2E tests)"
is aspiration, not estate.

So "locally proven" means: *each component conforms to the document; the document is the only
shared truth; and the document's own self-consistency is not guarded* (REF-DANGLE-1,
EXAMPLE-UNGUARDED-1, EXAMPLE-DRIFT-1, all proven green by mutation in the 10.31 gate). That is a
weaker claim than the words suggest, and the epic's own history shows what it costs: DEF-01 and
DEF-02 were both HIGH, both invisible to every green suite, both found by reading.

### 2.2 The register is stale on arrival, in exactly the way its guard cannot see

`docs/qa/staging-acceptance-register.md:176` reads *"The run log records that `wt/epic` **deletes**
`VertexLlmGatewayClient.java` and `VertexAiClientFactory.java` …"* and lists it under
**"Open — needs an owner decision"**; `:298` repeats it as item 3 of what is left open. The run log's
CORRECTION (`3e3d42d34`, 18:01) retracted that claim; the register was committed at `4b7b7b3b9`,
18:40, and gated at `effaf1ce3`, 19:12. The 10.19 gate's AC-15 finding — *the body can contradict
the sources and the guard stays green* — is therefore not hypothetical; it happened on the register's
first commit, and the gate that named the blind spot did not notice the instance.

### 2.3 The epic is not administratively closed, and nothing records that it is

- `EPIC-10-EXECUTION.yaml` top-level `status: planning` (read; no per-story `status` field exists
  in the manifest at all).
- Story files, by their own `**Status**` row (read, all 23): `Done` — 10.9, 10.10, 10.13, 10.14,
  10.17, 10.31. `InReview` — 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.12, 10.30.
  `InProgress` — 10.15, 10.18. `Ready for Review` — 10.11, 10.19, 10.32. Merged-not-Done — 10.16.
  `Draft` — 10.33. That is 17 of 23 not Done against DoD item 1, *"All stories reach Done via SDC
  cycle."*
- The run log's *"The local half of Epic 10 is closed"* has no counterpart in any status field.

### 2.4 The "required post-merge step on the clean w7 tree" has no record for wave 9

Wave 7 recorded the user's decision that narrow reruns on a clean worktree are a **required**
post-merge step. The wave-9 section reports five suite figures and names no worktree. The 10.19
gate ran in `wt/10.19` at `4b7b7b3b9`; the merge tip differs from that revision in four docs files
only (measured), so the *code* figures transfer — but `wt/w7` itself cannot reproduce the frontend
figure today (§1). The step was either not done in `w7` or not recorded; either way the record is
incomplete on the one step the user made mandatory.

### 2.5 Smaller corrections

- 31 commits ahead, not 30; 14 blocking paths at 19:18, not 13. Both are drift, and both show the
  other tree changes on the hour — which is the argument for §8 Phase 2's first precondition.
- REF-DANGLE-1's remedy is much cheaper than its wording implies (§5).
- The orchestrator's summary calls the fold blockage "13 paths dirty in the other tree", as if it
  were a bookkeeping conflict. One of the 14 is `StudioService.java`, and on it the two trees
  disagree about **who may delete a draft** (§4). That is a security conflict with a bookkeeping
  symptom.

---

## 3. The three things being conflated

### (a) Epic 10's administrative closure — **not done; closable inside this repository in a day**

What it needs (all bookkeeping, all @pm/@po, none of it in the 14 fold-blocked paths — see §8
Phase 0 for the exact list): story statuses moved to what their gates already ruled; DEF-01/02
marked fixed with the SHAs that fixed them; the register's retracted claim removed; the manifest's
`status` changed from `planning`; the run-log's conflict table refreshed; and a decision on how the
two stories that *cannot* reach Done (10.16 on AC-19, 10.19 on AC-1…7) are closed. 10.19's own
Definition of done gives the mechanism: *"superseded by a named follow-up story (10.34+, @pm's
call) that carries it."* Without that story, DoD item 1 is unsatisfiable and the epic stays open
forever on a technicality.

### (b) The UI Studio capability being shippable — **no, and not by any work on this line alone**

Facts read in code, not in prose: the three identity bypass code paths exist and are closed by
configuration (`runbook §9`, values files); the vault is a stub (`ED-02` description); CSRF is
disabled on a cookie-authenticated, credentialed-CORS API (`SecurityConfig.java:144,191`), with the
control expected from the platform (`runbook §10`, SPK-02 q7); the rollback procedure is written and
*"not a rehearsed one"* (`runbook §12`); ED-02's `gate_note` — *"must have linked completed tickets
before a credentialed pilot"* — is unchanged and unlinked. Shippable additionally requires the fold:
what ships is the merged tree, and the merged tree does not exist.

### (c) The capability being validated in a real environment — **no; the orchestrator is right that
no repository work can substitute for it, and wrong that none can reduce its risk**

Every one of ED-01…ED-06 and SPK-01…SPK-06 is open. AC-1…AC-7 of 10.19 are recorded *skipped,
never passed*, and the 10.19 gate checked both directions of that honesty. Nothing here changes it.
What the repository *can* do is make sure that, when the environment arrives, the first failure is
attributable to the environment and not to three components meeting for the first time (§7, §8
Phase 1).

---

## 4. Security posture after 10.30

**On this line: sound on the routes, with named residuals.** Read from `StudioController.java:51-197`
and `StudioService.java:104-149, 150-171, 172-176, 217-219, 283-290, 395-397, 438-441, 514-517,
536-539, 573-578, 590-612`:

| Route | Authorization | Where |
|---|---|---|
| `GET /tests` | scoped in SQL to `readableCsiIds`; admin ⇒ unrestricted by design (`CsiOwnershipEvaluator.java:56-58`: *"An empty Optional means unrestricted — the caller is an administrator"*); no identity ⇒ empty page | `StudioService.java:150-163` |
| `POST /tests` | `requireRegisteredCsi` then `requireWrite` | `:172-176` |
| `GET /tests/{id}` | `requireRead` | `:217-219` |
| `PUT /tests/{id}` | visible read → `requireWrite` → locked read, flush, refresh | `:283-313` |
| `POST …/compile`, `…/confirm-compile` | `requireWrite` through `findCsiIdIncludingWithheld` | `:395-397`, `:438-441` |
| `DELETE /tests/{id}` | `requireWrite` | `:514-517` |
| `POST …/execute` | `requireExecute` | `:536-539` |
| `GET /executions/{id}`, `/executions/{id}/events`, `/executions/{id}/video` | `requireRead` against the execution's immutable CSI, same path for all three | `:573-578`; `ExecutionEventsController.java:27-28,76`; `ExecutionVideoService.java:29` |
| `GET /executions` | scoped like `/tests` | `:590-612` |
| `POST …/validate-variables` | delegates to `findTestById(id, auth)` ⇒ `requireRead` | `StudioController.java:179-184` |
| `POST /validate-steps` | session only; stateless, no data read or written | `:187-194` |

The four `StudioService` overloads that take **no** `Authentication` (`findTestById(UUID)`,
`updateTest(UUID, UITestRequest)`, `softDeleteTest(UUID)`, `findExecutionById(UUID)`) have **no
caller in `backend/src/main` outside `StudioService` itself** (measured by grep). They are a
latent hazard — the next controller to call one reopens O-18 silently — and a reasonable follow-up
is to make them package-private or delete them, but that is not a defect today.

**Residuals, all already named, all correctly outside 10.30:** the bypass paths (ED-02), CSRF
(SPK-02 q7), DEF-03/DEF-04 (`UITest.java` has neither `@Version` nor `@DynamicUpdate` — measured;
not reachable over HTTP per the 10.30 gate), and the built-in `local` default profile trusting
identity headers when `SPRING_PROFILES_ACTIVE` is unset (`runbook §9`, QA SEC-003).

**At the fold: not sound unless someone makes it so.** Read-only in `wt/epic` at 19:20–19:24:
their `StudioService.softDeleteTest(UUID id)` (`:491`) takes no caller and their controller's
`deleteTest(@PathVariable UUID id)` (`StudioController.java:133-134`) takes no `Authentication`;
their create/update/compile/confirm authorize through `requireCompile` (`:174, :284, :384, :428`),
and update authorizes through the withheld read before the revision check. This is RECON-1
(`10.30` gate, `reconciliation_constraints`), and the manifest's FOC-07 already says *"whichever
lands second adopts §27.2's visible read"*. What no record says plainly enough: **a textual merge
that takes their `StudioService.java` and `StudioController.java` reopens O-18 on delete with zero
compile errors.** The only thing that catches it is running `StudioServiceWriteAuthorizationTest`,
`StudioAuthorizationIT`, `OptimisticSaveIT` and `StudioSaveInCallerTransactionIT` on the merged tree
— and they catch it only if run.

---

## 5. Is the contract trustworthy?

The pin is green (§1). What the pin proves is that the bytes have not moved since the last
re-anchor; it proves nothing about the document's internal consistency, and the 10.31 gate showed
three ways it can be wrong while every suite is green (REF-DANGLE-1, EXAMPLE-UNGUARDED-1,
EXAMPLE-DRIFT-1).

The good news the epic has not noticed: the machinery to close two of the three already exists and
is tested. `openapi.ts:63-76` resolves local `$ref`s and throws on a dangling one;
`validateAgainstSchema` (`:107`) validates a value against a schema with `$ref`, `required`,
`additionalProperties`, `enum`, `allOf/anyOf/oneOf`. Two small assertions, both S, both in the
runner's default tier:

1. **Walk every `$ref` in the document** (150 of them, measured) through `resolveRef`; any throw is
   the test's failure. Closes REF-DANGLE-1 as measured, not inferred.
2. **For every `example`/`examples` under a schema or media type, `validateAgainstSchema` it against
   that schema.** Closes EXAMPLE-UNGUARDED-1.

EXAMPLE-DRIFT-1 (an assertion reading a transcribed copy) is a per-test fix and belongs to the
first story that opens that test.

**Caveat, stated as inference:** the runner helper covers the keyword set listed at `openapi.ts:26-27`
and ignores others. A `$ref` walk is complete regardless; the example check is as strong as that
keyword set.

One more fact for the fold: three contracts now exist — ours at `d9f5f2a2…`, theirs at
`c877d6dd…` (19:20 EDT), and the `09720ae2…` the run log still records for them. FOC-07's rule
("re-read from the merged file, never copy a digest") is the only correct procedure, and the run-log
table that a reconciler would reach for first is wrong on that row.

---

## 6. Is the test estate's credibility what its green numbers suggest?

Better than most, with three specific weaknesses, all measured by @qa rather than asserted:

- **Guards drawn from the author's own model.** AC-15's guard: 15+ author falsifications all
  reddened; 6 of 7 reviewer probes survived. The epic's own conclusion is right — *"the author's
  own falsifications are not sufficient"* — and §2.2 shows the consequence in production data.
- **A guard that penalises correction** (DISCLOSURE-PIN-1, HIGH): `disclosure.test.ts:93-98` and
  `:163` pin the literal `TBD — not assigned in sources` for ED-02's owner; the runbook now carries
  that phrase only inside a retraction (`studio-runner.md:451`, *"This item used to read…"*). Making
  the document more accurate makes the suite red. This must be fixed before anyone "cleans up" the
  runbook and is told the build broke.
- **Environment noise indistinguishable from regression, on this host.** Three EOF-family failures
  on 2026-09-17 alone (run log, wave 8); `CompilePipelineIT` produced 11 false reds under
  concurrent Gradle; MED-2 turns a hang into a non-result; the F-3 protocol returns exit 1 on green
  runs. The standing rules (sequential, at rest, JUnit XML, counts not exit codes) are correct and
  must travel into the fold checklist verbatim.

And one weakness this review adds: **none of the guards runs anywhere but on a developer's machine.**
There is no CI definition in the repository (measured: no `.github/workflows`, `.gitlab-ci.yml` or
`Jenkinsfile`; `register §6.2` says so too). Every "guard" in this epic is a guard only when
somebody chooses to run it. The register guard, the contract pin, the disclosure test and the
authorization ITs are all in that position.

---

## 7. The biggest risk nobody has named

**The three components have never met, and the plan has them meet for the first time in staging,
behind six external gates, in a merged tree that does not exist, with an LLM client that is being
replaced.**

Each piece of that sentence is verified above: no co-run (§2.1); twelve open gates (§1); the fold
blocked and unowned (§4, §8 Phase 2); the other program demotes `VertexLlmGatewayClient` to a test
fixture and ships `GenAiLlmGatewayClient` on a different SDK (§1, read-only 19:18). Two
consequences the record does not draw:

1. **ED-01 as written gates the wrong thing.** Its description asks for a *"verified Vertex SDK
   version"* (manifest ED-01 `description`) and `studio-execution.md:78` still says the backend
   *"integrates through the Google Vertex AI SDK"*. If the fold lands their client, the gate's owner
   — once one exists — will be asked to verify an SDK the shipping tree only uses in tests. ED-01
   needs an owner *and* a re-wording, and the re-wording depends on the fold decision.
2. **Compound first failure.** When AC-1 finally runs, a failure could be identity (ED-02),
   ingress buffering (ED-06), a Sonic semantic (ED-03), a sandbox flag (ED-05), a contract mismatch
   nobody's suite can see (§5), a merge that took the wrong `StudioService` (§4), or the new gateway
   client's first real call. With no local co-run, none of those is attributable, and the epic's own
   experience (DEF-01/02) says at least one contract-level mismatch is likely to be waiting. A local
   co-run removes the last three from that list before the environment exists.

This is the one place I disagree with the orchestrator on *what to do next*, not only on what is
true.

---

## 8. The closure plan

Four phases. Phases 0 and 1 are inside this repository and can start now; Phase 2 needs a human
decision and the other program; Phase 3 is external. **Phase 0 must not touch any of the 14
fold-blocked paths** — in particular `ADR-002-internal-contract-surface.md`, `studio-runner.md`
and `openapi.yaml` are dirty in the other tree, and an edit to any of them here adds a blocker.
Every Phase 0 target below was checked against the 19:18 list and is not on it.

### Phase 0 — Make the records true (this repository; @pm and @po; hours; no code)

| # | Action | Owner | Files | Depends on |
|---|---|---|---|---|
| 0.1 | Remove the retracted gateway-breakage claim from the register (`:176` row and `:298` item 3); replace with a pointer to the run-log CORRECTION and the seam note's two fold-time greps | @po (register owner per AC-10) | `docs/qa/staging-acceptance-register.md` | — |
| 0.2 | DEF-01 → `status: fixed` (10.17, conformance test `InternalBodyContractConformanceTest`), DEF-02 → `status: fixed` (10.14 AC-10, `RunnerEvidence.partial`), with the landing SHAs | @pm | `EPIC-10-EXECUTION.yaml` | — |
| 0.3 | Refresh the run-log wave-8 conflict table: their pin is `c877d6dd…` (19:20 EDT), a 10.27 exists, 14 paths block at 19:18 | @pm | `EPIC-10-RUN-LOG.md` | — |
| 0.4 | Story statuses. Move to `Done` every story whose gate ruled merge and whose ACs carry no open blocked criterion: 10.1–10.8, 10.11, 10.12, 10.15, 10.18, 10.30, 10.32 — each with its gate file and merge SHA cited. 10.16 and 10.19 stay non-Done pending 0.6. 10.33 stays `Draft` until Phase 2 step 2.7. | @po (status is @po's under the delegation matrix) | `docs/stories/10.*.story.md` (none are in the other tree's dirty set — theirs are 10.20–10.27) | — |
| 0.5 | Manifest `status`: `planning` → a value that says what is true (`local-half-delivered; staging-half open on ED-01…06/SPK-01…06`) | @pm | `EPIC-10-EXECUTION.yaml` | 0.2 |
| 0.6 | **Decision:** draft story **10.34 — Staging acceptance execution** carrying, by name, 10.19 AC-1…AC-7, 10.16 AC-19, and the fifteen "deferred halves" in register §3. This is the mechanism 10.19's Definition of done names for closing the epic without faking. Without it the epic cannot reach DoD item 1. | user decides; @sm drafts; @po validates | new `docs/stories/10.34.story.md` | 0.4 |
| 0.7 | Record the worktree bootstrap facts as a required step of every post-merge verification: `npm ci` in `frontend/` and `studio-runner/` after any merge that touches a `package.json`; the `@put/core-components` symlink target (ENV-1(a)) | @devops | `EPIC-10-RUN-LOG.md` and, if @devops chooses, a `docs/` note (**not** the runbook — it is fold-blocked) | — |

### Phase 1 — Local de-risking that reduces what staging must discover (this repository; @dev/@qa; days)

Ordered by value per unit of work. Items 1.1–1.3 are the ones I would not skip.

| # | Action | Size | Owner | Files | Fold-safe? |
|---|---|---|---|---|---|
| 1.1 | **Local co-run.** One script or test tier that starts the API (`local` profile, Zonky), the runner (`node`, filesystem object store, fixture corpus) and the stub gateway on one machine, creates a draft against a registered CSI, compiles with the fixture-only path, confirms, executes, observes SSE to a terminal state, and reads the video route with a `Range` header. **@qa writes it first and it must be red against a deliberately wrong dispatch key before it is green** (the epic's standing rule since 10.4). Trace: DoD items 2–6; Architecture §10 *"Exercise the epic's … cases against the integrated stack."* This is a recommendation for @pm/@architect to accept, not a criterion I am inventing; if rejected, §7's compound-failure risk stands as accepted. **Check first (read-only) whether the other program's 63-line `dev.sh` change already starts the runner; if so, adopt at the fold rather than write a second one.** | M | @dev, @qa first | new script/tier under `studio-runner/test/` or a `dev.sh` flag; **`dev.sh` is dirty in the other tree** — prefer a new file | yes if a new file |
| 1.2 | REF-DANGLE-1: walk all 150 `$ref`s through `resolveRef` (§5 item 1) | S | @dev | `studio-runner/test/contract.test.ts` or a new `contract-integrity.test.ts` (**`confinement.test.ts` is fold-blocked — do not touch it**) | yes if a new file |
| 1.3 | DISCLOSURE-PIN-1 (BL-10.19-4, HIGH): re-scope 10.18b AC-20's ED-02 owner pin to assert *the owner is stated and the escalation path is stated*, not the literal `TBD` | S | @po re-scopes the AC text; @dev edits the test | `studio-runner/test/disclosure.test.ts`, `docs/stories/10.18.story.md` | yes |
| 1.4 | EXAMPLE-UNGUARDED-1: validate every example against its schema (§5 item 2) | S | @dev | same file as 1.2 | yes |
| 1.5 | BL-10.19-1/2: the register guard reads the body status column and the owner anchors' strength floor | S | @dev | `docs/qa/scripts/verify-staging-registration.mjs` | yes |
| 1.6 | Make the four auth-less `StudioService` overloads package-private or remove them (§4) | S | @dev, after 2.5 — **not before the fold**, because `StudioService.java` is fold-blocked | `StudioService.java` | **no — Phase 2** |

### Phase 2 — The fold (human decision; @architect/@po/@pm rule; @dev executes; @devops publishes)

**Precondition, non-negotiable: the other program commits.** Reconciling against an uncommitted
tree that moved from 116 to 263 dirty paths in a day and changed its contract hash twice is not
reconciliation. Nothing below starts until `wt/epic`'s work is on a branch with a SHA.

| # | Step | Owner | Rule |
|---|---|---|---|
| 2.1 | **Decision (user):** which line is the base and whether 10.20–10.27 join this manifest. The manifest's `not_in_this_backlog` entry and register §7 both leave this open by name. | user | Article IV: no agent can assign this |
| 2.2 | Fresh reconciliation worktree from the chosen base; merge the other line (no rebase — the epic's practice) | @dev | no bare `git stash`; no `--force` |
| 2.3 | `StudioService.java` / `StudioController.java`: take **10.30's shape** — `requireWrite` on create/save/delete, delete takes `Authentication`, visible read before the revision check, `findByIdForUpdate` → `flush()` → `refresh()` in that order, never detach. Apply the eight RECON-1 constraints from the 10.30 gate verbatim. | @dev | §4 |
| 2.4 | Contract pin: re-read `shasum -a 256` from the merged `openapi.yaml`; re-anchor `confinement.test.ts`; record the amendment rows (theirs and ours) in ADR-002 §13 — the only moment ADR-002 may be edited | @dev; @architect classifies their 10.20 amendment | FOC-07 |
| 2.5 | `_helpers.tpl`: `acceptedEnvKeys` = 27 base + 4 `OBJECT_STORE_*` + 1 `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS`; count comment recomputed from `KEY_SPECS` rows in the merged `config.ts`, never transcribed | @dev | FOC-07 `merged_key_count` |
| 2.6 | Seam greps: `grep -rl com.google.cloud.vertexai backend/src/main/java` empty; `google-cloud-vertexai` is `testImplementation`. Either red ⇒ breakage is real and **theirs** to fix. Flag `studio-execution.md:78` (still names the Vertex SDK) to @architect. | @dev verifies; @architect | seam note §5 |
| 2.7 | Gate 10.33 against their slices guard (all four consumers, FOC-08 rule: `setup.ts` in the same commit). Verify F-3 with the **squeeze instrument** (`1 failed | 5 passed` reproducible), never the 20-run sweep. | @qa | 10.19 AC-19(c) ruling |
| 2.8 | Full verification on the merged tree, **sequentially, at load < 5, one Gradle at a time**, JUnit XML aggregated (94+ suites; corroborate on skipped/failed counts); frontend after `npm ci`; runner default + fixtures + deployment. Baselines: 709/0/7 · 548/2 · 984/29 · 90/10 · 184/4 **plus whatever their suites add** — a count short of baseline is a hang (MED-2), not a pass. | @dev runs; @qa reads | run-log operational rules |
| 2.9 | Run `verify-staging-registration.mjs`; run 1.2's `$ref` walk against the merged document | @qa | — |
| 2.10 | `--ff-only` fold into `epic/EPIC-10`; push; PR | **@devops only** | delegation matrix |

**Failure of any of 2.3, 2.6, 2.8 is a stop, not a note.** 2.3 in particular: if
`StudioServiceWriteAuthorizationTest` or `StudioAuthorizationIT` is red on the merged tree, O-18 is
open again and the merge does not proceed.

### Phase 3 — External gates and the staging run (outside this repository; humans and other teams)

Sequenced by what each gate physically requires, not by id order:

| Order | Gate | Owner | Why here |
|---|---|---|---|
| 3.1 | **ED-01 gets an owner** — and, once 2.1 is decided, a re-worded description naming the SDK the shipping tree actually uses (§7) | **user** (the manifest says no source names one; only the project owner can) | everything about the compile path waits on this and it has waited five waves |
| 3.2 | **ED-02: link the external ticket** to PUT Core platform; confirm what Core's `put_session` cookie sets for `SameSite` (answers `runbook §10` without a code change) | user → Core BFF | `gate_note`: no credentialed pilot before linked completed tickets |
| 3.3 | **ED-05** (cluster/sandbox, internal Playwright image) | Platform/SRE | the root: SPK-04, SPK-05, SPK-06 phase B, AC-3 all need a pod to exist |
| 3.4 | **ED-06** (ingress, unbuffered SSE + media) and **ED-03** (Sonic credentials/lifecycle) | Platform/SRE | SPK-02 and SPK-03; AC-4, AC-6 |
| 3.5 | **ED-04** (approved destinations; the auth-provider approval owner is *still* unnamed in sources — a second unowned item hiding inside an owned one) | Platform/SRE + whoever owns application/auth-provider approval | SPK-05, AC-3 |
| 3.6 | Spikes, in the order their infrastructure arrives: SPK-04/05 (after 3.3), SPK-02/03 (after 3.4), SPK-06 phase B (after 3.3, @qa — *calibrate per image, never widen the bound*, F-5), SPK-01 (after 3.1) | as the register names them | `studio-staging-spikes.md` |
| 3.7 | **Story 10.34** executes AC-1…AC-7 against the merged, deployed tree; each result recorded in the register by id; the register guard flips the id only when the source flips | @qa records; @dev/@devops operate | 10.19 AC-10/AC-15 mechanism |
| 3.8 | The three BRD §11 sign-offs (Security & Compliance, Platform/Infra, Business Sponsor) — **not asserted by anything in this repository** | the named bodies | register §5 item 7 |

### Phase 4 — After the fold, not before (backlog, owners already ruled)

DEF-03/DEF-04 together via `@Version` on `UITest` (the manifest's "before the pilot? NO, with two
conditions" stands); the Tier-1 gateway conformance extraction (seam note §5 item 3, in the merged
tree, its own story); O-19/ADR-003 (outside Epic 10); A11Y-5 screen-reader pass and the user trial
(BL-10.19-6/7); AC-14's first-`Tab` test once ENV-1(a) is resolved; the axe harness writing a
tracked file from `afterAll` (BL-10.19-9); EXAMPLE-DRIFT-1 with the first story that opens that
test.

---

## 9. What to drop rather than do

| Drop | Why |
|---|---|
| The F-3 fix on this line | already dropped (`7357082e3`); theirs lands at the fold; verify with the squeeze, do not re-author |
| 10.33 as an implementation on this line | their 9-line guard exists (read-only, 19:20); 10.33 stays the acceptance spec and is gated at 2.7 |
| ENV-1(b) (eslint preset) and MED-2 on this line | their 10.27 AC-2 and AC-4 claim both (read-only, 19:20); verify at the fold, do not duplicate. **Not verified that their fix works** — their tree cannot be built from here. |
| Rewriting the four Vertex gateway tests | the seam note's ruling: verify, don't fix; a 600-line refactor mid-fold is the worst moment |
| The 20-run F-3 protocol as an instrument | underpowered and exit-code-broken; the squeeze is the instrument |
| Chasing SPK-06's 97.5 ms-against-100 ms locally | F-5: calibrate per image in staging; a local widening would be the loosening @architect forbade |
| Editing ADR-002, the runbook or `openapi.yaml` for any Phase 0 or Phase 1 reason | all three are fold-blocked; every edit is a new conflict |
| Any attempt to assign ED-01 by inference | Article IV; the manifest already refused to |

---

## 10. What this plan must not do — and the failure modes I consider most likely

1. **Fold by recency.** Their `StudioService`/`StudioController` compile clean and reopen O-18 on
   delete. Probability: high if 2.3 is skipped, because nothing red appears until the authorization
   suites are run. Mitigation: 2.3 and 2.8 are stops.
2. **Reconcile against a moving tree.** 116 → 263 dirty paths, 13 → 14 blockers, `09720ae2` →
   `c877d6dd`, 10.26 → 10.27 — all within a day. Any reconciliation plan written against a snapshot
   is wrong by the time it is executed. Mitigation: Phase 2's precondition.
3. **Believe a green suite under load, or a red one.** Three EOF-family failures and eleven false
   reds on 2026-09-17. Mitigation: sequential, at rest, XML-aggregated, count-vs-baseline.
4. **Trust a document guard that is narrower than its name.** §2.2 is the existence proof.
   Mitigation: 1.5, and a human re-read of the register body at every status change until then.
5. **Let bookkeeping create fold blockers.** Phase 0 edits to the runbook or ADR-002 would do it.
   Mitigation: the file lists in Phase 0 were checked against the 19:18 blocker list.
6. **Let the first co-run be the staging run.** §7. Mitigation: 1.1 — or an explicit, recorded
   acceptance of the risk by @pm/@architect if 1.1 is rejected.
7. **Close the epic on the run log's sentence.** "The local half is closed" is true and is
   recorded nowhere that a status reader looks. Mitigation: Phase 0.4–0.6.
8. **Re-verify a worktree with stale `node_modules` and report the old baseline.** §1's 541-vs-548.
   Mitigation: 0.7.

---

## 11. What this review could not verify

- **The backend suite was not re-run.** The 709/0/7 figure is my aggregation of JUnit XML written
  at 17:25 in `wt/w7`; it applies to the tip because `backend/` is byte-identical since, but no
  backend test executed under my hands. Reason: host load 8–12 and the epic's contention rule.
- **The fixtures tier (90/10) was not run.** Chromium tier, known ~5% flake, under load.
- **MED-2 was not reproduced** (`./gradlew check` deliberately not run) and **F-3 was not measured**.
- **The other tree was not compiled or tested.** Every statement about `wt/epic` — the demotion, the
  unauthorized delete, the `c877d6dd` pin, 10.27's ACs, the 9-line slices guard, the 28-line
  `httpClient.test.ts` change — is read-only inspection at the stated minute, not execution.
- **10.30's authorization tests were not mutated by me.** I read the gate's D1/D2/D3/F1/F4 records
  and the code paths; I did not re-falsify them.
- **ED-*/SPK-* statuses are read from documents.** No external system was consulted; no ticket
  system exists to consult.
- **Whether the 10.19 gate's frontend 548 ran with `axe-core` installed in `wt/10.19`** is inferred
  from the number, not observed.
- **The absence of a co-run is verified by absence** — greps and directory listings — which is the
  weakest kind of verification. If a co-run exists somewhere I did not look, §7 weakens accordingly;
  I looked in `backend/src/test`, `studio-runner/test`, `frontend/`, `dev.sh`, and for compose files
  at the repository root.
