# UI Studio test execution — end-to-end validation

- Story: `UI-STUDIO-E2E-20260922`
- Executed: 2026-09-22
- Scope: the four gaps raised against Studio test execution, plus the local path needed to run them
- Method: real backend, real `studio-runner`, real Chromium, real public sites. No MSW at runtime.
- Translation provider: `recorded-fixture` (no model call). See **Limits** — this is not evidence
  that free-form English translates.

## What was wrong, and what changed

### 1. Saving compiled the test

`PUT /tests/{id}` registered an after-commit hook that ran the LLM compile and auto-accepted it, so
every save spent a gateway call on work the author had not asked for. Worse, when that attempt
failed the draft sat at `STALE` with no way out of the editor: re-saving identical content is not a
change, so it enqueued nothing.

Saving now persists the draft and nothing else. `POST /tests/{id}/compile` is the only compile
trigger, and it accepts a valid candidate for the requesting principal in the same transaction that
publishes it — the author asked for the revision to be prepared by pressing Run, and a separate
confirmation step asked the same question twice.

Run is now one action with three phases: save if dirty → compile if the saved revision has no fresh
artifact → execute. The server's readiness gate does not read `compile_status` (it compares the
confirmed revision's revisions and hashes against the draft's), so `READY` is treated as a hint and
a `409 COMPILE_REQUIRED` as the authority: Run answers it with one compile-then-execute retry,
carrying a fresh `Idempotency-Key` so the retry cannot start a second run.

### 2. The execution video did not cover the whole run

`StudioDispatcher` computed the job's whole-run budget as `configuration.timeoutSeconds * 1000`,
and the runner derives the **per-step** timeout from that same value. With the frontend's
hardcoded `timeoutSeconds: 30`, every run was stopped at 30 seconds. Because the stop was orderly
the recording flushed cleanly and was marked `partial: false` — a video that looks fine and simply
stops mid-test. Architecture §5.2 had always specified 120 seconds.

The two budgets are now separate: `studio.execution.total-runtime` (default 120s) travels on
`deadlines.totalRuntimeMs`, and `timeoutSeconds` stays the per-step value the runner already
treated it as.

Second cause: the runner closed the browser context the instant the last operation resolved.
Playwright's click waits for a navigation to *commit*, not to paint, and the recorder pads the tail
with the last frame it received — so the final action's result was frequently absent. A bounded tail
settle (≤750ms, abandoned the moment a stop is ordered) now lets the last frame composite.

A stopped run is also narrated now: when the outcome is `TIMEOUT` or `CANCELLED` the evidence panel
says the recording ends where the run was stopped, keyed off the outcome rather than off `partial`,
and step seeks beyond the media duration are clamped instead of silently landing in the wrong place.

### 3. The download button duplicated the player

`VideoEvidencePanel` rendered a "Download recording" link pointing at the same route and bytes the
`<video controls>` element already streams. It is removed, along with its URL builder and label.
The backend's `?download=true` parameter stays — it is in the frozen contract — but nothing in the
UI composes it.

**Trade-off, for the record:** downloading through the browser's native control loses the
server-supplied filename `execution-{id}-attempt-{id}.webm`, and Safari's native controls offer no
download at all.

### 4. The code did not look complete

There is no standalone script anywhere in this system, by design: an artifact step is one awaited
call in Studio's bounded step language, the runner parses each into a typed operation, and its child
protocol refuses any message carrying source text. `page`, `expect` and `vars` are runner-supplied
bindings.

The Code tab was rendering `steps[].code` joined by newlines — N bare `await` lines with no
numbering, no English and no revision identity, which reads as a fragment of an unfinished file. It
now shows every step index-aligned with the English it was translated from, the step count, a
short revision hash, and a caption saying plainly that this is what runs rather than a file you can
run elsewhere. No `import`/`test(...)` wrapper is synthesized: that would be client-generated source
the server never produced and never ran.

It also now says when the draft has moved on since the artifact was translated, and when the last
attempt to prepare it was refused — previously it showed a stale artifact silently.

**A real defect behind this:** authoring accepted step lines up to 1024 characters while the artifact
schema capped `originalText` at 500, so a 501–1024 character line failed schema validation on every
attempt, with no repair possible, and stuck the draft at `STALE` forever. The schema bound now
matches the authoring bound. Two adjacent mismatches were aligned at the same time (the runner's
`maxCodeLength` to the schema's 2000, and the gateway's `max-output-bytes` to the runner's 64KiB
artifact cap) so nothing can pass one layer and be refused by the next.

`maxOutputTokens` was never sent to the model, and the SDK returns a truncated body for a
`MAX_TOKENS` finish without signalling it. It is now set explicitly, and a truncated answer is
recorded as truncation rather than as a generic parse failure.

### 0. The local path that made any of this runnable

`LocalPassthroughGatewayClient` had been deleted on this branch and `application-local.yml` now
defaults the provider to `vertex`, whose startup validation fails without an endpoint, project and
location. **This worktree could not boot.**

A `recorded-fixture` provider now answers sources recorded verbatim from a corpus shipped at
`studio/recorded-fixtures/*.json`, in the same document shape as the runner's reference corpus. It
opens no socket, its provenance records the model as `recorded-fixture` so an audit can never read a
local run as a Vertex call, and an unrecorded source is reported as `GATEWAY_UNAVAILABLE` —
translation being honestly unavailable — never as an author mistake or a model refusal. A deployed
profile refuses the provider outright through the existing readiness guard.

## Evidence

Three services from this worktree: `studio-runner` on :8090, backend on :8080 (`local,dev`), Vite on
:5173. Startup line: `studio translation provider is a recorded fixture corpus, not a model: 3
recorded sources [example-domain-url, wikipedia-home-url, wikipedia-search-variable]`.

### Saving does not compile

| Point | `compileStatus` |
|---|---|
| after `POST /tests` | `STALE` |
| after `PUT /tests/{id}` with two steps | `STALE` |
| 3 seconds later | `STALE` |

Under the previous behaviour the after-commit hook had moved it to `COMPILING` and then `READY`.

### Run's compile step

`POST /tests/{id}/compile` → `202 COMPILING` → `READY` within one 600ms poll, with
`confirmedRevisionId` set and no confirmation call. Artifact for the Example Domain scenario:

```
step 0 | Go to "https://example.com/"              -> await page.goto('https://example.com/');
step 1 | Check that the URL contains "example.com" -> await expect(page).toHaveURL(/.*example\.com.*/);
```

### Execution and recording

Both scenarios reached `PASSED` in real Chromium with `video.status: AVAILABLE`, `partial: false`.

| | Example Domain | Wikipedia search (variable-backed) |
|---|---|---|
| steps | 2/2 PASS | 3/3 PASS |
| run duration | ~2.5s | 1485ms |
| last step ends at | — | 1081ms |
| video duration | 2480ms | 2080ms |
| covers last step | yes | yes, by 999ms |

`runtimeCapMs: 120000` in the runner log for the dispatched job — the whole-run budget is no longer
the 30-second per-step timeout. Video served `200`/`206` with `Accept-Ranges: bytes` and
`Content-Range`, and no `Content-Disposition` on the playback path.

The variable-backed scenario proves a reference is translated while its value stays outside the
translation boundary: the author wrote `Type "<var SEARCH_TERM>" in the "Search Wikipedia" field`,
the artifact carries `vars.get('SEARCH_TERM')`, and the run filled the real page.

### The UI

Driven in Chrome against :5173. Pressing **Run Test** on a saved draft carried the whole flow: all
three steps went green with live logs and `Time 1.3s`. The **CODE** tab showed `3 steps`,
`revision 40061e66`, the language caption, and each step's English above its code. The **PROOF** tab
showed the player with native controls and **no "Download recording" button**.

## Verification

| Surface | Command | Result |
|---|---|---|
| frontend types | `npx tsc --noEmit` | pass |
| frontend tests | `npx vitest run` | **665 passed, 54 files** |
| frontend lint (changed files) | `npx eslint <changed paths>` | 0 errors, 14 pre-existing `any` warnings |
| runner types | `npm run type-check` | pass |
| runner lint | `npm run lint` | pass |
| runner unit tests | `npx vitest run test/run test/validator` | 19 files passed |
| backend compile | `./gradlew compileJava compileTestJava` | pass |
| backend compile suites | `./gradlew test --tests '*CompilePipeline*' '*NoAutoConfirm*' '*CompileBounds*' '*ArtifactSchemaDrift*'` | BUILD SUCCESSFUL |
| backend gateway suites | `./gradlew test --tests '*StudioGateway*' '*RecordedFixture*'` | BUILD SUCCESSFUL |

Repo-wide frontend lint reports 122 errors; all are in files untouched by this work
(`commsBridge.ts`, `appConfig.ts`, `utils/studio/ir/parseSteps.ts`).

### Backend full suite

`./gradlew test` — **1206 tests, 21 failed, 18 skipped** after the changes above (measured, not derived). None of the
remaining failures is caused by this work, and each was attributed rather than assumed:

| Failing | Attribution | How it was established |
|---|---|---|
| `CheckCrudIT` (2) | pre-existing | fails identically at `HEAD` in a clean throwaway worktree |
| `ReportDeliveryDispatcherIT`, `Reports*IT` (8), `WorkerProfileIT`, `SeededStartPartitionHealthIT`, `BffFilterHappyPathIT`, `GatewayHeadersTrustIT` | environment | `ReportDeliveryDispatcherIT` binds GreenMail on port 3025, already held by an unrelated `node` process |
| `RateLimitFilterIT` (4) | branch's in-flight work | passes at `HEAD`; driven by `SecurityConfig.java`, already modified in the session-start `git status` |
| `StudioKillSwitchWiringTest`, `VideoStoreProviderDefaultTest`, `EvidencePartialCallbackIT` | branch's in-flight work | pass at `HEAD`; driven by `StudioAcceptanceService.java` and `StudioEvidenceConfig.java` (+173/−1), both already modified before this session |
| `ExecutionVideoEvidenceIT` | intermittent | failed in one full-suite run, passed in the next; not reproduced in isolation |

The working tree carries 231 changed files, the large majority of which are an uncommitted
refactor of the evidence stores, the vault providers and the Gen AI SDK migration that predates
this session. That unfinished work is the reason four Studio suites are red against `HEAD`, and it
should be finished or reverted before this branch is considered releasable.

## Limits

- **The recorded corpus is not evidence that free-form English translates.** It answers three exact
  sources. The product premise — a nontechnical author writing their own English — can only be
  proven against the real provider, and that gate has not run. It needs the environment-owned Vertex
  project, endpoint, location and workload identity.
- The 120-second budget is proven by the dispatched `runtimeCapMs` and by `DispatcherIT`, not by a
  run that actually exceeds 30 seconds; every recorded scenario finishes in about two seconds.
- The tail settle is proven by a unit test over a fake page, a fixtures-tier coverage assertion, and
  the 999ms margin measured above — not by a case where the final action's paint was known to be
  missing before the change.
- The removed download button's replacement is the browser's own control; behaviour under a managed
  enterprise browser policy that disables native media download was not tested.
- `confirm-compile` is deprecated rather than removed, and `AWAITING_CONFIRMATION` is now
  unreachable through the product flow. The state remains in the contract and in the run-action
  mapping, where it routes to a compile.

## Departure from the earlier proposal

`docs/stories/UI-VALIDATION-20260921/spec/plain-english-fix-proposal.md` §3 asked for the opposite
of the flow implemented here: an explicit *Translate → Review → Confirm this exact revision → Run*
chain, with human confirmation of the precise revision as an audit control. The product owner asked
for compile to be folded into Run as a single action, and that is what was built.

What is lost is the human review of a candidate before it executes. What is gained is that a failed
preparation is always retryable, saving is free, and there is no state in which the author is told to
save again and wait. If the audit control is required, the place to restore it is inside the Run
phase machine — between the compile and the execute — rather than by making saving compile again.
