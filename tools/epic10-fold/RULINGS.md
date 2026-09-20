# Epic 10 fold — per-file rulings and the fold sequence

Evidence read 2026-09-18T03:39:09Z–03:46:45Z (UTC) from `wt/epic` (branch `epic/EPIC-10`, HEAD
`ff0513385`, 263 dirty paths, read-only) against the integration tip `epic/EPIC-10-w7` at
`c025422bb` (47 ahead, 0 behind: a pure fast-forward in git's terms). Their side is uncommitted,
so nothing of theirs can be merged until they commit; every ruling below is for that merge.
Rerun `preview.sh` before acting — it recomputes from the live tree and prints the same table.

Legend: **AUTO** = different regions, `git merge-file` rc 0, semantics checked · **MECH** = textual
conflict with a mechanical resolution written below · **RULING** = needs a human with the named
authority · **RECONCILED** = both sides made the same substantive change.

| # | File | Decision | Evidence | If decided the other way |
|---|------|----------|----------|--------------------------|
| 1 | `backend/.../studio/StudioService.java` | **RULING, ours wins on authorization; keep their additive overloads** (textually rc 0 but does **not compile**: merged L200/L323 call `requireCompile`, which ours renamed to `requireWrite` at L133) | Theirs: `requireCompile(auth, request.csiId())` in `createTest`; `requireCompile(auth, findCsiIdIncludingWithheld(id))` first line of the 5-arg `updateTest`; **no hunk near `softDeleteTest`**. Their `StudioController.java` is clean, i.e. base: `deleteTest(@PathVariable UUID id)` → `softDeleteTest(id)` (base L133–135) with no `Authentication`. Their `StudioAuthoringService.java:207` authorizes only its own routes. | **Taking theirs wholesale silently reopens DELETE for any authenticated principal** (compiles: their file still defines `requireCompile`), and re-authorizes save through the withheld read, which lets a withheld draft's owner distinguish "withheld" from "absent" (ADR-002 §14.5), and drops the post-lock `flush()`/`refresh()` (10.30 QA DETACH-1, REFRESH-FLUSH-1). Taking ours wholesale breaks their untracked `StudioAuthoringService` at compile time — loud, not silent. |
| 2 | `backend/.../studio/StudioContractTest.java` | **RECONCILED** (rc 2, cosmetic) | Both change the video row to `200,206,401,403,404,410,416,503`. Conflicts are a comment line, the test-method name, and the `.as()` message (10.27 vs 10.31 attribution). | None functional. Pick one wording; recommend ours (the landing in the integration branch is 10.31's `113948325`, ADR-002 register). |
| 3 | `backend/.../evidence/ExecutionVideoContractTest.java` | **OURS WINS** (rc 1) | Theirs: same status set + method rename + string reflows (16/13). Ours: same status set + ~200 lines of 10.31 AC-5/AC-2 tests (245/3). | Theirs wins → 10.31's `$ref`-equality and 401-partition tests are lost. |
| 4 | `docs/architecture/ADR-002-internal-contract-surface.md` | **AUTO textually, RULING semantically (@architect)** (rc 0) | Ours: 3 register rows → "LANDED by story 10.31 at `113948325`". Theirs: +1 register row (L321) "Land video 401/403/503 … story 10.27", plus new §29 (confirmed artifact pair) and §30, which says *"Unlike §24.6's earlier proposed 503 schema, the landed schema declares `oneOf`"*. | Merged as-is the register records the same amendment landed twice under two stories with two different 503 schemas. @architect must add the reconciling sentence once #6 is decided. |
| 5 | `docs/runbooks/studio-runner.md` | **MECH** (rc 1) | Theirs rewrote §11 as resolved (`SPRING_CONFIG_ADDITIONAL_LOCATION`, 41/29, hunks @1 and @454). Ours kept §11 and appended §12 Rollback plus ED-02 truths (8 hunks). | Resolve: their §11, then our §12. Then fix three of our sentences their §11 falsifies: L42 "has never reached a process (§11)", L638 "It never applied anything in the first place — §11", L643 "`V12` through `V17`" (their untracked `V18__studio_inference_capture.sql`). `guards.sh` checks all three. Disclosure needles are consistent both ways (theirs only in §11, ours only in our regions — counted). |
| 6 | `docs/specs/studio/openapi.yaml` | **RULING (@architect)** (rc 5, all same-region) | Both amended the video route: refusal-order prose, the **503 schema** (theirs `oneOf` ErrorResponse\|PlatformErrorResponse + `Retry-After` + `authenticationUnavailable` example; ours single `ErrorResponse`), `SessionUnauthorized` and `PlatformErrorResponse` descriptions, example formatting. Their non-conflicting `confirmedRevisionArtifact*` additions (4 hits) merge clean. No test on our side pins the 503 schema (grep of `backend/src/test/.../studio` for `"503"` with ref/schema: none); our 401/403 `$ref`-equality test is satisfied by their text per their §30. | Ours wins → contract says every video 503 is `ErrorResponse`; their §30 claims `BffSessionAuthenticationFilter.write503` emits a nested body before authorization (**not verified by me**). Theirs wins → our §24-as-landed prose is replaced; no test impact found. Either way: **re-pin (#17) in the same commit.** |
| 7 | `frontend/src/services/mocks/studio/handlers.ts` | **AUTO** | Ours @77/@120/@126 (video serving). Theirs @1/@52/@57/@177/@185/@342 (inference handlers import — their untracked `inferenceHandlers.ts` — and `confirmedRevisionArtifact*` fields). | — |
| 8 | `helm-chart/put-checks/templates/_helpers.tpl` | **MECH** (rc 1) | One line, both add keys: ours `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS` (+prose "thirty-one"→"thirty-two"); theirs `OBJECT_STORE_{PROVIDER,BUCKET,REGION,CREDENTIALS_DIRECTORY}`. Union = 32 words on the line; merged loader = **36** `KEY_SPECS`. Their other hunks (@138 managed-key `fail`, @224 +77 lines) merge clean. | Resolve: union the line (each key once — our `chart.test.ts` falsification (ii) requires the SEEK key exactly once), set prose to "thirty-six". Guarded. |
| 9 | `helm-chart/put-checks/values-prod.yaml` | **AUTO** | Ours L50–76 ED-02 comment block (no rendered value). Theirs L158 `callbackBaseUrl: ""`. | Their blank value is only valid with their `_helpers.tpl` derivation (@224); lands together in their commit. No test pins the literal URL (grep). |
| 10 | `helm-chart/put-checks/values-uat.yaml` | **AUTO** | Same shape: ours L44–70, theirs L140. | Same. |
| 11 | `helm-chart/put-checks/values.yaml` | **AUTO** | Ours +4 @526 (runnerEnv SEEK key). Theirs @150/@237/@477/@484/@536. | — |
| 12 | `studio-runner/src/server/config.ts` | **AUTO** | 31 → ours 32 / theirs 35 → merged **36** `KEY_SPECS`, no duplicates; ours ~L95/L281, theirs ~L1/L41/L140/L417. | — |
| 13 | `studio-runner/test/deployment/chart.test.ts` | **AUTO** | Theirs @523 probe assertions (`httpGet` → `exec node dist/probe.js`; depends on their template change). Ours: appended 10.32 AC-5 block. | — |
| 14 | `studio-runner/test/disclosure.test.ts` | **AUTO** | Theirs @129 AC-18 needles → their §11. Ours @93/@95/@174/@194 ED-02 needles. Confirmed earlier today; re-verified. | — |
| 15 | `studio-runner/test/fixtures-tier/deadline-cleanup.test.ts` | **AUTO** | Theirs @1/@550 (`createRedactor`, their `src/executor/redaction.js`). Ours +2 at @174/@264/@387/@421. | — |
| 16 | `studio-runner/test/isolation.test.ts` | **AUTO** | Theirs @47/@116 AWS SDK allowlist + deps list. Ours @216 +43 (AC-22c). | — |
| 17 | `studio-runner/test/run/confinement.test.ts` | **MECH** (rc 1) | The `BASE_SHA256` line. Ours `d9f5f2a2…` = sha256 of our `openapi.yaml`; theirs `c877d6dd…` = sha256 of theirs (both verified; test hashes raw bytes, L227). Their +2 comment lines. | Neither pin is right for a merged contract. Run `pin-contract.sh` after #6, **same commit**. Guarded. |

## Sequence

**Today (their work uncommitted): nothing can be folded.** `precheck.sh` exits 1 with the 17.
Do not stage, stash, checkout or merge in `wt/epic`.

### Path A — the tree becomes fold-clean without a commit on `epic/EPIC-10`
(they move their work to another branch, or the 17 are reverted there)
1. `tools/epic10-fold/precheck.sh` → must print `OK`.
2. `tools/epic10-fold/fold.sh --execute` (ff inside `wt/epic`; ref and tree move together).
3. `tools/epic10-fold/guards.sh /Users/brunobuger/orca/workspaces/put-checks/wt/epic` → green.

### Path B — their work is committed on `epic/EPIC-10` (expected)
`precheck.sh` will say "no longer a fast-forward". Then, in a worktree of `epic/EPIC-10-w7`
(this branch, `chore/epic10-fold-prep`, is fine):
1. `git merge epic/EPIC-10` — expect conflicts in #2, #3, #5, #6, #8, #17. **#1 merges without
   a conflict and must be opened anyway** (see the table).
2. Resolve per the table. For #1, edit the merged `StudioService.java`: delete both `requireCompile(`
   lines, keep ours' `requireWrite` calls and the visible-read/locked-read/flush/refresh block inside
   the 5-arg `updateTest`, keep `softDeleteTest(UUID, Authentication)`, keep their overloads.
3. `tools/epic10-fold/pin-contract.sh .` (after #6 is resolved; refuses if markers remain).
4. `tools/epic10-fold/guards.sh .` → must be green.
5. Targeted verification, sequentially (check `uptime` first; never `./gradlew check`):
   - `cd studio-runner && npx vitest run test/run/confinement.test.ts test/disclosure.test.ts test/isolation.test.ts && npx vitest run --config vitest.deployment.config.ts test/deployment/chart.test.ts`
   - `cd backend && ./gradlew spotlessCheck test --tests '*StudioServiceWriteAuthorizationTest' --tests '*StudioContractTest' --tests '*ExecutionVideoContractTest' --tests '*StudioAuthorizationIT'`
6. Commit (the contract change and the pin move in the **same** commit). Then, in `wt/epic`
   (now clean): `git merge --ff-only <that commit>`.
7. Hand the remote push to @devops (exclusive authority).

## Not verified here
- Their `BffSessionAuthenticationFilter.write503` behaviour (basis of their 503 `oneOf` ruling).
- Whether their string reflows in #3 and the merged #1 pass `spotless` (googleJavaFormat 1.22.0) — no Gradle run was made.
- Anything about the 246 dirty paths outside the 17; they are theirs to commit.
