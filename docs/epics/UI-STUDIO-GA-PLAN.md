# UI Studio — Production-Readiness Plan (GA)

**Date:** 2026-10-09 · **Prepared by:** @aiox-master (Orion), synthesizing six read-only expert reviews run on Fable: @architect, @qa (quality + test runs), @qa (security), @ux-design-expert, @devops, @po.
**Inputs:** working tree of `brunobuger/ui-studio` at `c767efbe7` plus 56 modified / 593 untracked files.
**Binding decision applied:** 2026-10-09: guided runs log in through author-written steps that use `<secret ID>` references. There is no external account provider, and EXT-001 is dropped.

> **Update 2026-10-09: single path.** The user decided that UI Studio ships **one** authoring path, observed/guided, and that the compile-to-READY path is removed. There is no legacy path and no backward compatibility, because nothing is released. Other decisions:
> - Studio migrations V12+ are re-baselined; core V1–V11 are unchanged.
> - The pilot is gated on a real-model benchmark: ≥90% on 20 workflows × 3 runs, with zero false passes and zero leaks.
> - Re-learn from step N ships after GA.
>
> These are recorded in [ADR-SC-005](../architecture/ADR-SC-005-single-path-observed-authoring.md). Below, anything framed as "legacy path for GA, guided for GA+1" is superseded. Path-independent items still apply: §4.A repo/CI/images, §4.B external gates, §4.D CSRF and transport, §4.E schedule authorization, §4.F evidence storage, §4.G operability and §4.J sign-off. Story scope is re-cut in the STUDIO-OBSERVED wave.

Severity: **P0** blocks the GA release · **P1** must land before pilot users depend on it · **P2** hardening/polish.
Effort: S / M / L as the reviewers estimated it. Owner is the AIOX agent unless a team outside the repo is named.

---

## 1. Verdict

The **legacy compile-to-READY path** (author → R2D2 compile → Run → runner → video/step seek → lists → schedule) is functionally complete and correctly authorized. Its local quality evidence is green:
- Frontend: 956/956 Vitest tests, type-check, lint 0 errors.
- Runner: 1546 default-tier, 306 real-Chromium and 313 deployment tests.
- Backend: the Studio suite reached 1350 passed / 0 failed before it was stopped, incomplete, at 14.5 minutes.
- API+runner co-run: 11/11.

What stops a release is everything **around** the code:
- No CI, no backend/frontend image build, and a personal git remote.
- Twelve open external platform gates.
- Secrets switched off in three places: the frontend flag, the Vault provider and the secret-use policy.
- No production policy for scheduled runs.
- CSRF disabled on a cookie-authenticated API.
- About 50k lines of "Done" guided-authoring work that is not committed.

The **observed/guided path** is reachable from no screen, cannot start, cannot replay, cannot be scheduled and is untracked in git. It is a GA+1 track.

## 2. Decisions needed from the user

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D-1 | Does GA ship guided authoring, or legacy only? | **Decided 2026-10-09: observed/guided is the only path, and compile is removed (ADR-SC-005).** Original recommendation, superseded: legacy only, guided GA+1. | Legacy already supports `<secret ID>` login steps (10.17/10.44), schedules and video. Guided has zero frontend, an unwired replay verifier, a broken worker profile split and needs an mTLS chain no environment has. Shipping both doubles the surface to test and secure (@architect, @ux, @po concur). |
| D-2 | Where is the Citi repository/registry/pipeline? | Name it, then mirror this line there. | The only remote is `github.com:ailixir/development-dotfiles` (verified). Nothing connects this code to `registry.citi.com`. |
| D-3 | Who owns ED-01 (R2D2 gateway access)? | Assign a named owner this week. | It's on the critical path for 10.50, 10.5, 10.8, 10.26 and 10.34. The manifest says `owner: "TBD"`. |
| D-4 | Commit the uncommitted STUDIO-OBSERVED work to git now? **Done 2026-10-09: `d954a21c5`** (local only; evidence binaries ignored). | **Yes**: a local commit on this branch with flags staying default-off. | 593 untracked files include `studio/guided/**`, runner `guided/**`, Flyway V30–V33, six QA gates and tools. One bad reset loses OBS-001…006. |

## 3. Do now (no external dependency)

1. **Commit the work at risk (OPS-4, QA-13).** Commit the guided backend/runner/migrations/tests/gates/tools and decide on `.ai/` (ignore it or track it).
   - Revert or explain the modified L1 framework file `.aiox-core/core/permissions/dispatch-governance.js`.
   - Re-tag: the `ui-studio-v1.0.0` tag no longer describes the tree, and `Chart.yaml` says `0.1.0` (OPS-13). Owner: @devops, with @dev for commit content.
2. **Backlog bookkeeping (@po, S).**
   - Close **10.5, 10.6, 10.7, 10.8, 10.11, 10.12, 10.15, 10.16, 10.18**. Their gates ruled merge, and their residual criteria are carried by 10.34 Groups A–L.
   - Exception: 10.11 AC-3(b) has no carrier and needs an @architect ADR-002 Class C ruling first.
   - Add **10.23 AC-5** to 10.34 as Group M. Move the **10.26 AC-3** live half into Group C, then close both.
   - Name a post-GA carrier story for the T-INC halves of **10.24 / 10.25**. Neither has a gate file.
   - **10.34 Task 1:** the register front matter carries 7 of 33 criteria, so the guard is blind to 26 (QA-10).
   - Remove the stale "fold" blocker from 10.34. The fold is merged (verified by @devops).
   - Drop **STUDIO-CODE-001** (pipeline state `discarded`). Defer **STUDIO-INC-001** (T-INC).
   - Close **UX-001** as superseded: `CompileReviewPanel` is no longer mounted. Remove or quarantine `CompileReviewPanel` / `useCompileReview` / `InferenceStudio` (UX-10).
   - **Dispositioned 2026-10-10 (@po) under ADR-SC-005 — this list is superseded in part.** Per-item outcome (leave / superseded / re-cut), carriers and recommended @qa/@pm actions are in `docs/epics/EPIC-10-SINGLE-PATH-DISPOSITION.md`. In short: 10.5, 10.6, 10.7, 10.12, 10.15, 10.16, 10.18 and 10.19 are left `InReview`/not Done with their criteria carried by 10.34, which STUDIO-OBS-010 re-registers against the single path; 10.8, 10.23, 10.24, 10.25 and 10.26 are superseded (compile-only remaining criteria); 10.50 is re-cut into STUDIO-OBS-009; 10.11 is mixed (AC-3(b) superseded, transport halves carried); "Group M", "10.26 AC-3 into Group C" and "post-GA carrier for 10.24/10.25" are withdrawn (OBS-015 carries the requirement in GA); UX-001 superseded, STUDIO-INC-001 superseded as a compile spec, STUDIO-CODE-001 discarded. No status field was changed: `Done` is @qa's transition.
3. **Rewrite STUDIO-OBS-007** to the 2026-10-09 decision (§7) so the guided track is ready when D-1 allows it. The story file still describes approved accounts (`grep '<secret'` = 0 hits).

## 4. GA workstreams (legacy path)

### A. Repository, CI and build — critical path, P0

| ID | Gap | Sev | Effort | Owner | Story |
|---|---|---|---|---|---|
| A-1 (OPS-3) | Move or mirror the repo to Citi GHE; registry access | P0 | S (admin) | user + @devops | NEW |
| A-2 (OPS-1, QA-1) | No CI anywhere. Contract pin, auth ITs, register guard and all test tiers run only on laptops. | P0 | M | @devops | NEW **CI-001** |
| A-3 (OPS-2, OPS-11) | No backend image (no jib/bootBuildImage) and no frontend image/nginx config. The chart expects both. Frontend delivery route and cross-origin to `checks-api` are undecided. | P0 | M | @devops + @architect | NEW |
| A-4 (QA-9) | Backend `studio.*` suite exceeds 10 minutes. The `./gradlew check` hang (MED-2) has never been re-verified, and no gate records a completed `check`. | P1 | S–M | @devops / @dev | NEW (ties to SCHED TEST-002) |
| A-5 (OPS-13, OPS-14) | Release management: image-tag scheme, changelog, gitleaks/Trivy/SBOM | P1/P2 | S | @devops | NEW |

### B. External platform gates — critical path, P0 (owners outside this repo)

| Gate | Needed for | Owner | Notes |
|---|---|---|---|
| ED-01 + SPK-01 → **10.50** | Every production compile | **TBD** (D-3) | If R2D2 rejects the per-status `anyOf` schema, every compile fails, and no fallback switch exists (QA-2). Probe first. If it fails, add a fallback story. |
| ED-02 | Vault + secret-use authorization + background (schedule) grants | PUT Core / BFF; ticket "to be linked" | See C-2, E-1 |
| ED-03 + SPK-03 | Video/manifest store (Sonic), lifecycle deletion | Platform/SRE storage | Prod currently uses a 10Gi local PVC with logical-only expiry (OPS-6, SEC-8) |
| ED-04 + SPK-05 | Runner egress to target apps; enterprise CA | Platform/SRE + Security | `approvedTargets` empty = default-deny; no `NODE_EXTRA_CA_CERTS` handling (OPS-7) |
| ED-05 + SPK-04 | Internal Playwright image, sandbox under seccomp; `studioRunner.enabled` in prod | Platform/SRE | Prod values ship the runner disabled (ARCH-1, OPS-8); ~~Node 24 vs `.nvmrc` 22 conflict~~ **2026-10-17 (@po): Node-pin sub-item (O-2a) resolved in source, ~~in-image re-verification pending (015 gate run)~~ in-image verified 2026-10-17: final-gates07 check-pins --require-image exit 0, node v24.20.0, nodeMajorPin 24, chromiumBuild 1243 (final-gates07/receipt.json).** *(Later 2026-10-17, @po: the image is the local gate build `put-checks-studio-runner:obs015-final07-local`; the deployed internal image is not measured. Path: `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates07/receipt.json`, `image-final07-check-pins.json`.)* STUDIO-OBS-015 writer window W9 moved the runner pins to the image's Node 24 (`.nvmrc` `24`, `engines.node` `>=24.11.0 <25.0.0`; the Playwright 1.63 image ships Node 24.20.0; ADR-001 §4.2 amendment). Evidence: `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/ed05-pin-fix01/analysis.md`. **ED-05 stays open**: internal image, non-root user, seccomp and CA bundle remain Platform/SRE's. **Open item:** the external CI pipeline must move to Node 24 (@devops, outside the repo). |
| ED-06 + SPK-02 | SSE + `<video>` through real ingress with cookies | Platform/SRE ingress | GET-polling fallback exists; accepting it removes SSE from the GA blocker list (UX-3) |
| SPK-06 | 500 ms seek accuracy | @architect | **Not GA-blocking**: disclose the measured tolerance |
| **10.34** | Staging acceptance (33 criteria, Groups A–M) | @qa + platform teams | The production-ready gate per `10.43/spec/requirements.json` |

### C. Secrets and login (the 2026-10-09 decision, legacy path) — P0

| ID | Gap | Sev | Effort | Owner |
|---|---|---|---|---|
| C-1 (UX-1, ARCH-3) | Frontend hard-codes `STUDIO_CAPABILITIES.vaultSecrets = false` (`frontend/src/utils/config/studioCapabilities.ts:3`). The Secret type is hidden, and the copy says "alpha". Replace it with a server-provided runtime capability (VAL-001 ruling 2026-10-04, no story yet). | P0 | M | @architect → @dev, @ux copy |
| C-2 (SEC-2) | Secret-use authorization has only a dev-config source (`ConfiguredSecretUseAuthorization.java`). A production policy source is needed (Core entitlement or a CSI-owner rule). | P0 | L | @architect + Core (ED-02) |
| C-3 (SEC-3, OPS-5) | Vault provider `none` in every value set, so saving a secret returns 503 | P0 | M | @devops (ED-02) |
| C-4 (SEC-7) | A secret filled into a non-password field is visible in the recording. Restrict secret fills to `type=password` controls, or disclose it and get Security's acceptance. | P1 | S–M | @dev |
| C-5 (UX-2) | No "blocked by login" outcome. A run that hits a sign-in page without login steps ends as a generic timeout. Add a detected code plus "Add login steps using your secrets" with "Go to step N". | P1 (UX rated P0; the run still fails safely) | M | @architect → @dev → @ux |
| C-6 (QA-6) | No end-to-end test of secret → Vault → runner → login form → protected page | P1 | M | @qa / @dev |
| C-7 (UX-4) | Authors type `<var NAME>` / `<secret NAME>` by hand; no insert or autocomplete. Templates and onboarding mention secrets that are disabled. | P1 | M | @ux → @dev |

### D. Web/API security — P0/P1

| ID | Gap | Sev | Effort | Owner |
|---|---|---|---|---|
| D-1 (SEC-1) | CSRF disabled (`SecurityConfig.java:145`) with credentialed CORS and cookie auth. Body-less `POST …/execute`, `/compile`, `/cancel` are forgeable unless `put_session` is `SameSite=Lax/Strict` (unknown). Require a custom header or token from the central `apiClient`. | P0 (P1 if SameSite is confirmed) | S | @dev / @architect |
| D-2 (SEC-5) | Legacy runner↔API hop is plaintext with static shared bearers, and resolved secrets cross it. Only NetworkPolicy compensates. **Compliance gate (user requirement 2026-10-09: secrets safe, used only at the right moment, never logged):** no real credential may be stored in Vault for any environment until every secret-bearing hop is TLS with an authenticated peer. | **P0 gate** before C-3 | M | @devops + @architect |
| D-2b (QA final) | `IdempotencyFilter` (10.48) replays a cached 2xx response without re-authorizing the caller. Security review needed. | P1 (pending review) | S | @qa security → @dev |
| D-3 (SEC-9) | No structured audit of secret create, execute, delete or cancel by principal | P2 | M | @dev |
| D-4 (SEC-10/11/12/14, SEC-13) | Security headers/HSTS/CSP; `local` default profile injects a real SOEID; bypass code paths compiled in; `/actuator/info` and `/v3/api-docs` public; no navigation origin allowlist on the legacy path | P2 | S each | @devops / @dev |

Verified good (security review): no unguarded public Studio route. CSI checks cover read/write/execute/video/SSE/secrets/schedules. Runner callbacks are replay-safe and fail closed. The Chromium sandbox is on, downloads are off, and the runner runs non-root with a read-only filesystem and a default-deny NetworkPolicy.

### E. Scheduling production activation — P0 (the baseline says "on schedule")

| ID | Gap | Sev | Effort | Owner | Story |
|---|---|---|---|---|---|
| E-1 (SEC-2) | Background grants deny outside `local`/`test` profiles (`ConfiguredBackgroundAuthorization.java:51-55`). There's no production policy for whose authority a scheduled run uses. | P0 | L | @architect + Core | NEW **STUDIO-SCHED-003** |
| E-2 | `studio.scheduling.enabled` defaults false and appears in no Helm values file, so scheduling is off in every environment | P0 | S | @devops | SCHED-003 |
| E-3 (QA-5) | Schedule → run has never crossed a real seam (WireMock/recording client only) | P1 | M | @qa / @dev | SCHED-003 |
| E-4 (UX-7) | Schedule dialog is engineer-facing: raw cron, "Execution identity" principal select, raw ISO timestamps | P1 | S–M | @ux → @dev | SCHED-003 |

### F. Evidence storage and retention — P0/P1

- **F-1 (OPS-6, SEC-8):** move to Sonic (ED-03), with a lifecycle rule or deletion job that enforces `videoExpiresAt`. Today expiry is logical only.
- **F-2:** get Security & Compliance's written acceptance of the video retention period and of the on-screen-secret residual risk (feeds GA sign-off).

### G. Operability — P1

| ID | Gap | Effort | Owner |
|---|---|---|---|
| G-1 (OPS-9) | No alerts, dashboards or SLOs. Only `studio.dispatch.backlog/refusals` metrics exist; no ServiceMonitor or PrometheusRule. | M | @devops |
| G-2 (OPS-10) | Rollback runbook written but never rehearsed; forward-only Flyway; V19 cutover is manual (T-INC, not GA) | M | @devops + @data-engineer (10.34 Group N) |
| G-3 (OPS-12) | Capacity: 2 pods × pool 1 = 2 concurrent browsers for on-demand **and** scheduled runs; KEDA off | S (values) / M | @devops + @architect |
| G-4 (PB-2) | Operators can't tell dispatch failures from compile failures (open, no story) | S–M | @pm → @dev |
| G-5 (OPS-15) | No startupProbe on JVM pods | S | @devops |

### H. Test gaps on critical flows — P1

- **H-1 (QA-7):** kill the runner mid-run in the co-run. Today recovery is proven only against fakes.
- **H-2 (QA-8, QA-9 final):** the UI has no browser E2E at all. `test:e2e` points at a Playwright config that doesn't exist, so author → compile → run → video has never been driven through the real frontend and API. The co-run also reads SSE `/events` zero times.
- **H-3 (QA-11):** real-model compile quality is NEEDS_WORK and has no held-out corpus (10.26). Size it during the pilot.
- **Watch-list flakes**, none reproduced today: `StudioTestsPage`, `pageRunGate`, `seek-measurement` (~5%), `CompilePipelineIT` under concurrent Gradle.

### I. UX and accessibility — P1/P2

> **2026-10-17:** Superseded by ADR-SC-006 (user decision 2026-10-17): accessibility limited to functional must-haves; no WCAG target. The accessibility items in this section are struck below. The UX items (I-1 nontechnical-user trial, I-2, I-3) still apply.

- **I-1:** ~~10.19 AC-12(b) screen-reader pass and~~ AC-13 nontechnical-user trial. These are not externally blocked and have no carrier. ~~Add a11y debt from 10.46 AC6: dialog labelling, live region for "Running step N of M", and contrast/target-size rules disabled in the only scan (UX-6).~~ Severity P1. *(2026-10-17: Superseded by ADR-SC-006 (user decision 2026-10-17): accessibility limited to functional must-haves; no WCAG target. The screen-reader pass and the 10.46 AC6 a11y debt are removed. They are descoped to a post-GA backlog, which is not a pass or a waiver. The AC-13 nontechnical-user trial is usability, not accessibility, and stays.)*
- **I-2 (UX-5):** the editor environment list lacks UAT, so a UAT test shows a blank select. Severity P1, effort S.
- **I-3 (UX-8/9):** `/checks/studio` opens the first test instead of the list; logs aren't linked to steps. Severity P2.

### J. Release sign-off and onboarding — P0 for GA

- **J-1 GA-SIGNOFF-001 (NEW):** BRD §11 package.
  - Security & Compliance acceptance of the secrets model and video retention.
  - Platform/Infra on-call ownership.
  - Business Sponsor go/no-go.
  - Register §5 item 7: "not obtained".
- **J-2 CSI-ONB-001 (NEW):** pilot CSI onboarding. Covers approved origins per CSI/environment (input to ED-04), Vault secret provisioning and a first-test checklist.
- **J-3:** fix stale docs. `studio-execution.md` names the Vertex SDK; the code uses `com.google.genai`. The ED-01 wording also needs updating (ARCH-11).

## 5. Critical path and parallel lanes

```
Lane R (repo/CI, now)      A-1 Citi repo ─► A-2 CI-001 ─► A-3 images ─┐
Lane E (external)          ED-01 owner ─► SPK-01 ─► 10.50 probe ───────┤
                           ED-02 ─► {C-2, C-3, E-1} ───────────────────┤
                           ED-05/SPK-04 · ED-03/SPK-03 · ED-04/SPK-05 · ED-06/SPK-02 ─┤
Lane C (code, now)         C-1 · D-1 · C-4 · C-5 · E-2 · E-4 · G-4 · I-2 ─┤
Lane T (tests, now)        C-6 · E-3 · H-1 · H-2 · A-4 ───────────────────┤
Lane P (bookkeeping, now)  §3 items 1–3 · 10.34 Task 1 ───────────────────┤
                                                                       ▼
                     10.34 staging acceptance (Groups A–N) ─► pilot (CSI-ONB-001, I-1) ─► GA-SIGNOFF-001 ─► GA
Lane G (GA+1)        OBS-007r ─► OBS-008 (cut) ─► OBS-009 (cut) ─► OBS-010 merged with pilot evidence
```

The critical path is **outside the repository**: ED-01's owner, ED-02 (Vault + entitlement policy) and the Citi repo/CI. Everything in Lanes C, T and P can start today and finish before the external gates close.

## 6. Guided track (GA+1, after D-1)

Prerequisites the architecture and security reviews found, beyond OBS-007:
- **ARCH-6 (corrected 2026-10-09 by @architect):** `installObservedVerifier` is an optional `@Autowired(required=false)` setter (`ExecutionReadinessService.java:124-128`). Spring calls it on `!worker` pods, so the gap is on `worker` pods only (`StudioScheduleProcessor.java:258`), where guided revisions refuse replay. Same root cause as ARCH-7.
- **ARCH-7:** `ObservedReplayConfiguration` and `GuidedPublicationConfiguration` are `@Profile("!worker")`, but the dispatcher runs on `worker`. Observed dispatch in split deployments therefore falls back to `/v1/runs` (annotations verified, consequence inferred). Both are now placed in OBS-007 (`secret-login-design.md`).
- **ARCH-8:** the guided worker (`dist/run/guidedMain.js`) has no Dockerfile command and no Helm template.
- **ARCH-9:** observed schedules are refused by design. Lift that once secrets resolve by reference.
- **SEC-4:** the guided internal chain requires mTLS + a pinned RSA key + issuer; no profile or chart provides them. It fails closed today.
- **ARCH-10:** retire guided internal v1 routes, `observedAccount.ts`, and the `AccountAccess`/`ReplayAccountAccess` ports (dropped by the decision).
- **Frontend:** no guided UI exists. OBS-008 is the first guided screen, so it is larger than drafted.

## 7. Rescoped STUDIO-OBS-007 — "Login steps with secret references in guided runs"

**Acceptance criteria (drafted by @po, hardened by security):**
1. A declared `<secret ID>` classifies to a new input kind `secretRef`: ID only, slot `fill.value` only. Gateway bytes carry the masked span and the ID, never a value. An undeclared ID returns `FORBIDDEN_SCOPE`.
2. The runner resolves the secret only at the fill, through the same Vault resolution and per-secret `mayUse` check as legacy (at prepare **and** dispatch). A fill outside `secretOrigins[id] ∩ approvedOrigins` returns `POLICY_DENIED`. The value never appears in the ledger, proposal, observation, journal or callbacks, and is wiped at stop.
3. Resolved secrets populate `knownSecrets`/`withhold` before the first fill (`guided/runtime.ts:77`, `run/observedReplayAdapter.ts:17`). A canary secret appears in no observation, evidence, gateway request, manifest or journal.
4. After the login steps, the next observation is of the newly reached document. Login-page evidence is never reused for protected-page controls. A failed login surfaces on the next step.
5. The learned plan and lowered artifact carry only `secretRef` / `vars.secret('ID')`. Replay re-resolves per run with the same origin check. The artifact hash is stable across secret rotation.
6. Starting a session needs no account: `accountRef`/`authConnection`, `AUTH_CONNECTION_REQUIRED` and `AWAITING_AUTH` are removed; contract versions are bumped.
7. A different CSI/principal cannot resolve the test's secret. Revocation mid-session ends with a named code and no exposure.
8. Controlled proof: a local login form + protected page using `<var USER>` / `<secret PASS>`. The guided Run completes, publishes, and passes two replays. Wire canary and video disclosure are recorded.

**Dropped from the current draft:** D0 (EXT-001 and the 108-path reconciliation), D1 (account/authority contracts), D2 (V34 authority store), D3 (BFF/Core account discovery), D4 (provider adapters), D6 (same-session handoff). `account-provider-readiness-design.md` R3 becomes historical.
**Knock-on changes:**
- **OBS-008** loses the account/sign-in states and gains a secret picker plus a "blocked by login" message.
- **OBS-009** cuts the 30-workflow × 3-rep benchmark to the pilot and keeps the secret canary and fault injection.
- **OBS-010** merges with the pilot/10.34 evidence.

## 8. Where reviewers disagreed, and the resolution

| Topic | Positions | Resolution |
|---|---|---|
| UX-001 | @po: defer · @architect: post-GA polish · @ux: superseded | **Superseded.** @ux verified by grep that the component it changes is no longer mounted. |
| "Blocked by login" severity | @ux P0 | **P1.** The run fails safely; the message is clarity, not correctness. |
| Guided account provider | @devops listed it as a GA+1 prerequisite | **Superseded by the 2026-10-09 decision.** @devops wasn't briefed on it. |
| Untracked volume | @architect: ~61 guided paths · @devops/@qa: 593 untracked | Both are correct. 593 (verified) includes `.ai/`, gates, tools and tests. 0 guided source files are tracked (verified). |

## 9. Unknowns

- **`SameSite` attribute of Core's `put_session` cookie.** It sets D-1's severity.
- **Whether the full backend suite is green on this tree.** The QA run stopped at 1350/0 failures, incomplete. OBS-006's record claims 2048 passing, but that was read, not re-run.
- **Whether `./gradlew check` still hangs (MED-2).** Not run.
- **Whether the BFF will front `checks-api.*` same-origin.** This affects cookies, SSE and video.
- **Production PostgreSQL major version.** The V28 trigger needs PG13+.
- **Whether KEDA is available on the cluster.**
- **Whether the GenAI SDK endpoint override works against R2D2.** That's SPK-01.
- **Actual spend on the OBS wave against its USD 500 ceiling.** Not exposed anywhere.
- **Why the deployment-tier AC-18 expected failures turned green** (184/4 in September → 313/0 now). Confirm the escalation was resolved and the assertion wasn't weakened.
- **Whether @po accepts 10.34's registration as the Definition-of-Done carrier.** That decides the nine closures in §3.
