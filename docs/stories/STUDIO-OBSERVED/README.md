# Studio observed authoring — SDC wave

User authorized implementation through SDC after the expert consensus design. This intake preserves the full outcome: plain English, real sanitized DOM context, first execution learning, fresh multi-step values, deterministic replay and real validation.

Workflow: `full-sdc` for each story, mechanically planned with `aiox wave` and `aiox sdc`. Each story must go through PO validation → designated executor → independent QA → fixes/re-review when needed → administrative close. Story files hold lifecycle status; closure records below track administrative completion.

| Story | Outcome | Dependencies | Executor → quality gate |
|---|---|---|---|
| [STUDIO-OBS-001](STUDIO-OBS-001.story.md) | Contracts and first-run lifecycle | none | architect → pm; SDC qa |
| [STUDIO-OBS-002](STUDIO-OBS-002.story.md) | Trusted page observation and sanitization | STUDIO-OBS-001 | dev → architect; SDC qa |
| [STUDIO-OBS-003](STUDIO-OBS-003.story.md) | Durable guided-session and action ledger | STUDIO-OBS-001 | data-engineer → dev; SDC qa |
| [STUDIO-OBS-004](STUDIO-OBS-004.story.md) | Runner guided control and execution-local dataflow | STUDIO-OBS-001, STUDIO-OBS-002, STUDIO-OBS-003 | dev → architect; SDC qa |
| [STUDIO-OBS-005](STUDIO-OBS-005.story.md) | Grounded translation and implicit dependency planning | STUDIO-OBS-001, STUDIO-OBS-002, STUDIO-OBS-003, STUDIO-OBS-004 | dev → architect; SDC qa |
| [STUDIO-OBS-006](STUDIO-OBS-006.story.md) | Exact-plan publication and deterministic replay | STUDIO-OBS-004, STUDIO-OBS-005 | dev → architect; SDC qa |
| [STUDIO-OBS-007](STUDIO-OBS-007.story.md) | Login steps with secret references on the single observed path (v3 contracts, secretRef path, Vault release/audit, account-provider removal, V34 on the current baseline, ARCH-6/7, single-path flag defaults, `LOGIN_REQUIRED` on learn and replay) | STUDIO-OBS-006 | dev (+ data-engineer for V34) → architect; SDC qa |
| [STUDIO-OBS-012A](STUDIO-OBS-012A.story.md) | Compile-path retirement (backend, runner, contracts) and migration re-baseline V12–V18 (ADR-SC-005 D-A/D-B); one contract generation; guided routes under `/api/v1/studio` | STUDIO-OBS-007 | dev (+ data-engineer for V12–V18) → architect; SDC qa |
| [STUDIO-OBS-012B](STUDIO-OBS-012B.story.md) | Compile-path retirement (frontend) and "learn" vocabulary | STUDIO-OBS-012A | dev → ux-design-expert; SDC qa |
| [STUDIO-OBS-013](STUDIO-OBS-013.story.md) | Record the learning run: guided video, step/action offsets, video route | STUDIO-OBS-012A | dev → architect; SDC qa |
| [STUDIO-OBS-014](STUDIO-OBS-014.story.md) | Action safety and governance (security P0/P1): governed read/discovery policy, semantic grounding, destructive-verb guard, side-effect policy, `labelSource`, EXECUTE class + per-CSI budgets, `Idempotency-Key`, per-action audit, retention, compliance data-flow | STUDIO-OBS-012A | dev (+ data-engineer) → architect; SDC qa (security) |
| [STUDIO-OBS-015](STUDIO-OBS-015.story.md) | Incremental re-learn from the first changed step (ADR-SC-005 D-D): change detection, `REPLAYING_PREFIX`, mixed-mode session, publication merge | STUDIO-OBS-007, STUDIO-OBS-012A, STUDIO-OBS-013 | dev → architect; SDC qa |
| [STUDIO-OBS-008](STUDIO-OBS-008.story.md) | Single-path Studio UI: one Run that learns, repeats and re-learns; states and copy; login notice; reference picker; `vaultSecrets` capability; plan explanation; video with seek; WCAG; Playwright | STUDIO-OBS-012B, STUDIO-OBS-013, STUDIO-OBS-014, STUDIO-OBS-015 | ux-design-expert → dev; SDC qa |
| [STUDIO-OBS-009](STUDIO-OBS-009.story.md) | Deployable single path (one runner process/image, mTLS G-1, TLS hop G-2, dumps, Vault policy, profile gates, schedules G-3), real-model benchmark gate (D-C), live proof, fault injection, E2E | STUDIO-OBS-008 | dev (+ devops) → architect; SDC qa |
| [STUDIO-OBS-010](STUDIO-OBS-010.story.md) | Nontechnical pilot (gated on D-C), single-path runbook, release readiness with external gates (G-1/G-2/G-3, C-2/C-3, OBS-014 compliance approvals, D-B confirmation), 10.34 re-registered, "Live surface" list | STUDIO-OBS-009 | analyst → pm; SDC qa |
| [STUDIO-OBS-011](STUDIO-OBS-011.story.md) | Final sweep: inventory re-run at HEAD, leftovers, `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters, code-health folds/splits, IT flake reduction | STUDIO-OBS-010 | dev → architect; SDC qa |

Parallelism and lane notes (prose kept out of the Dependencies column for the planner): 007 → 012A are one lane, strictly sequential; 012B ∥ 013 ∥ 014 after 012A with no shared File List entries except the contract/pin files edited by one contract owner in sequence; 015 may run parallel to 014 only if one owner holds `GuidedSessionService`/`GuidedTranslationService`, otherwise 014 → 015; 008 follows 012B in the frontend lane with no intermediate release; 011 may start after 009 is Done, parallel to 010, without removing anything on 010's "Live surface" list. Each story's "Dependency notes" row carries the same rules.

**Single-path re-cut 2026-10-09 (OBS-007…OBS-015).** The user decided that UI Studio ships **one** authoring path — observed/guided — and that the compile-to-READY path is removed entirely with no legacy path, no backward compatibility and no versioned fallbacks (nothing is released). Decisions and the canonical story placement map are in [ADR-SC-005](../../architecture/ADR-SC-005-single-path-observed-authoring.md): D-A single path; D-B Checks core V1–V11 byte-identical and Studio migrations re-authored as V12–V18 (absorbing V34); D-C pilot gated on a real-model benchmark (≥ 20 workflows × 3 reps, ≥ 90 %, zero false-pass / zero leak hard gates, latency/cost published); D-D incremental re-learn from the first changed step **in GA**. Order: `007 → 012A → {012B ∥ 013 ∥ 014} → 015 → 008 → 009 → 010`; 011 after 009 Done, parallel to 010. Stories 007–011 were rewritten in place and 012A, 012B, 013, 014, 015 created, all **Draft** pending @po re-validation; the prior PO GO verdicts on the dual-path drafts are kept in each story as superseded history. Inputs: ADR-SC-005; [secret-login-design.md](../../specs/studio-observed-authoring/secret-login-design.md) R3; [secret-login-security-review.md](../../specs/studio-observed-authoring/secret-login-security-review.md); the 2026-10-09 panel findings (summarized in the ADR); [STUDIO-OBS-011-cleanup-inventory.md](STUDIO-OBS-011-cleanup-inventory.md); [UI-STUDIO-GA-PLAN.md](../../epics/UI-STUDIO-GA-PLAN.md) (single-path banner; path-independent items A–J still apply and are listed in the stories as "tracked in the GA plan").

**Rescope 2026-10-09 (OBS-007…OBS-011) — superseded by the single-path re-cut above; kept as history.** The user decided that guided-run login is author-written steps using `<secret ID>` references, exactly like `<var NAME>`; there is no external account/session provider, no same-session handoff and no account-selection UI, and EXT-001 is dropped. Secrets must stay safe for compliance, be used only at the right moment and never be logged; a final story checks the code and removes unused/deprecated UI Studio code. Canonical inputs: [secret-login-design.md](../../specs/studio-observed-authoring/secret-login-design.md) (R2; §10 places every item in exactly one story), [secret-login-security-review.md](../../specs/studio-observed-authoring/secret-login-security-review.md) (PASS-WITH-CONDITIONS; conditions 1–9 → OBS-007, 10–11 → OBS-009/010; "R1 delta check" tightens conditions 1, 2, 5), [STUDIO-OBS-011-cleanup-inventory.md](STUDIO-OBS-011-cleanup-inventory.md) (49 rows, guardrails G1–G12), [UI-STUDIO-GA-PLAN.md](../../epics/UI-STUDIO-GA-PLAN.md) §§3, 6, 7, and consensus-plan.md §8.1. Stories 007–010 were rewritten in place and 011 created, all Draft, pending @po validation. The "Current execution" paragraph below that names an approved account/session provider as OBS-007's prerequisite is historical; the earlier OBS-007 drafts and validations (`.ai/STUDIO-OBS-007-*.json`, `account-provider-readiness-design.md` R3) are retained as history, not deleted.

The canonical scope is [consensus-plan.md](../../specs/studio-observed-authoring/consensus-plan.md). Files listed in stories are proposed ownership, refined during validation. CLI wave planning determines batches; all backend Gradle runs sharing this checkout are serialized. Only verified completed dependencies permit development of dependents.

Current execution: user authorized a $500 ceiling for the entire wave; actual billing totals are not exposed. OBS-001 through OBS-006 have independent QA PASS, Done status and verified administrative closure. After the **single-path re-cut of 2026-10-09 (ADR-SC-005)**, @po re-validated all ten remaining stories on 2026-10-10 and all are **Ready**:

| Story | Score |
|---|---|
| OBS-007 | GO 9/10 |
| OBS-012A | GO 8/10 |
| OBS-012B | GO 8/10 |
| OBS-013 | GO 9/10 |
| OBS-014 | GO 9/10 |
| OBS-015 | GO 9/10 |
| OBS-008 | GO 8/10 |
| OBS-009 | GO 8/10, conditional |
| OBS-010 | GO 8/10 |
| OBS-011 | GO 8/10 |

Reports are in `.ai/STUDIO-OBS-*-po-validation-{r5,sp}.json` and `.ai/STUDIO-OBS-012{A,B}-po-validation.json`. GO conditions are recorded in each story. The wave plan is [wave-plan-single-path.json](wave-plan-single-path.json), wave id `STUDIO-OBS-SINGLE-PATH`:

> 007 → 012A → {012B ∥ 013 ∥ 014} → 015 → 008 → 009 → 010 → 011

It has no DAG errors.

**Coordinator rulings (2026-10-10), resolving @po cross-story findings:**
1. **Migration numbers after the 012A re-baseline.** OBS-014 takes `V19__guided_governance`. OBS-013 takes `V20` if it needs DDL for recording offsets, unless 012A folds it into V14 first. @data-engineer confirms at each story's T0.
2. **OBS-014 and OBS-015 run strictly in sequence (014 → 015)**, with one owner for the whole shared set: `GuidedSessionService`, `GuidedTranslationService`, `GuidedDispatchService`, `GuidedContracts`, `GuidedSessionController` and `StudioController`. The batch order already enforces this.
3. **@architect owns the result, session-view and command contracts** across 013, 014 and 015. Each story's T2 contract edits go through that one owner in batch order.
4. **The canonical UX state model is OBS-008 AC-3/AC-4**, from the UX panel of 2026-10-09. OBS-015 and the other stories reference it rather than transcribing it.

Remaining external owners: ED-01 gateway (TBD), ED-02 Vault and test secret, an approved staging app with a real login, and a SIEM sink. Two confirmations are still owed: that nothing was deployed from an internal remote (D-B), and Q3, the audit retention window (the default applies). The dual-path GO verdicts below are historical and superseded (each story keeps them as a marked-superseded section):

| Story | Historical score (dual-path draft) | Report |
|---|---|---|
| OBS-007 | GO 9/10 | `.ai/STUDIO-OBS-007-po-validation-r4.json` |
| OBS-008 | GO 8/10 | `.ai/STUDIO-OBS-008-po-validation-r2.json` |
| OBS-009 | GO 8/10, conditional | `.ai/STUDIO-OBS-009-po-validation-r2.json` |
| OBS-010 | GO 8/10 | `.ai/STUDIO-OBS-010-po-validation-r2.json` |
| OBS-011 | GO 9/10 | `.ai/STUDIO-OBS-011-po-validation.json` |

The earlier NO-GO assessments of OBS-007 (4/10, 6/10) and their account-provider prerequisite are historical. The wave plan [wave-plan-rescope.json](wave-plan-rescope.json) (`STUDIO-OBS-RESCOPE`, five linear batches 007 → 011) predates the re-cut and must be **regenerated** against the ADR order (`007 → 012A → {012B ∥ 013 ∥ 014} → 015 → 008 → 009 → 010`, 011 after 009) before any dispatch; "Depends on" cells above and in the stories contain story IDs only for the planner. Use `node tools/aiox-local.cjs` for SDC/wave commands.

Bridge replan (2026-10-08): initial PO validation of OBS-004/005 found missing bootstrap, dispatch and input-materialization joins. Architecture and independent QA documented the [concrete bridge design](../../specs/studio-observed-authoring/bridge-design.md); OBS-004 now executes before OBS-005. The [current replan snapshot](wave-plan-bridge.json) has no DAG errors, preserves completed SDC states and includes revised file ownership. OBS-004 completed implementation, independent QA re-review and administrative closure; its common transport sends no model requests. INPUT-POLICY-01 branch A is now approved: deliberately authored nonsecret literals may reach translation, while resolved secrets, saved-variable values and page captures remain excluded. See the [decision record](../../../.aiox/waves/STUDIO-OBSERVED/input-policy-01.json) and [concrete OBS-005 design](../../specs/studio-observed-authoring/translation-design.md). At that replan stage, OBS-005 remained Draft pending independent architecture/QA review, coordinated ownership and a new PO readiness verdict; its later independent QA PASS and administrative closure, followed by OBS-006, are recorded below.

Human pilot participation and any external account/session setup are genuine later prerequisites. They are not silently excluded from completion. Do not send recruitment messages without user authorization. No remote push, production deployment or schedule activation is implied by intake.

Historical intake result: **10 stories / 8 batches**, no DAG errors. The initial next phase was PO validation of STUDIO-OBS-001. Preflight returned exit 5 `DISPATCH_BUDGET_REQUIRED`; no phase agent was invoked. Exact first-dispatch payload is saved under `.aiox/sdc/STUDIO-OBS-001/dispatch/`. All stories remain Draft. See [wave-plan.json](wave-plan.json) and [intake-status.json](intake-status.json).

Budget update: user authorized **$500 USD for the whole wave**. Preflight then returned `DISPATCH_STORY_STATUS` because it incorrectly applies implementation-only statuses to validation (and does not normalize Markdown status emphasis). No specialist phase was dispatched. Proposed [phase-aware correction](sdc-preflight-repair.patch) passed [21 isolated checks](sdc-preflight-repair-evidence.json); it has not been applied.

Correction applied after user approval. Workspace CLI entrypoint: `node tools/aiox-local.cjs` (uses repository SDC/wave commands and avoids unavailable unrelated CLI modules). All 32 preflight regression checks pass. PO validation of OBS-001 is now dispatched. The global CLI installation is unchanged.

## Next session: start here (as of 2026-10-10)

**State.** All ten single-path stories are **Ready**, and their SDC `validate` phase is recorded. No implementation has started. Branch: `brunobuger/ui-studio`, local commits only (no push).

**Read first, in this order:**
1. [ADR-SC-005](../../architecture/ADR-SC-005-single-path-observed-authoring.md): the decisions and the story placement map.
2. This README's wave table and coordinator rulings above.
3. [secret-login-design.md](../../specs/studio-observed-authoring/secret-login-design.md) R3 and [secret-login-security-review.md](../../specs/studio-observed-authoring/secret-login-security-review.md).
4. The story you are about to execute, including its PO GO conditions.

Also useful: [UI-STUDIO-GA-PLAN.md](../../epics/UI-STUDIO-GA-PLAN.md), which covers path-independent GA items, and [EPIC-10-SINGLE-PATH-DISPOSITION.md](../../epics/EPIC-10-SINGLE-PATH-DISPOSITION.md).

**Execution order.** Wave `STUDIO-OBS-SINGLE-PATH`:

> 007 → 012A → {012B ∥ 013 ∥ 014} → 015 → 008 → 009 → 010 → 011

**Commands** (workspace CLI):
```bash
node tools/aiox-local.cjs wave next STUDIO-OBS-SINGLE-PATH         # first incomplete batch
node tools/aiox-local.cjs sdc next docs/stories/STUDIO-OBSERVED/STUDIO-OBS-007.story.md   # → develop
# then run the full-sdc / develop-story skill on that story (executor @dev, + @data-engineer where the story says)
```

If `.aiox/` runtime state is missing, for example in a fresh clone, rebuild it. `.aiox/` is gitignored, and the stories' Ready status is the durable record.
```bash
node tools/aiox-local.cjs wave plan --wave-id STUDIO-OBS-SINGLE-PATH --save --stories <the 10 story paths in the order above>
node tools/aiox-local.cjs sdc plan docs/stories/STUDIO-OBSERVED/STUDIO-OBS-007.story.md
```

**Binding decisions.** Do not re-litigate any of these:
- Observed is the only path, and compile is removed.
- There is no backward compatibility.
- Studio migrations V12+ are re-baselined.
- The pilot gate is a benchmark of ≥90% on 20 workflows × 3 runs.
- Incremental re-learn from the first changed step is in GA.
- Login is author-written `<secret ID>` steps.
- Secrets are used only at the right moment and are never logged.

**Open items owned outside the repo:**
- D-B: confirmation that nothing was deployed from an internal remote.
- External owners: ED-01 gateway (TBD), ED-02 Vault and a test secret, an approved staging app, a SIEM sink.
- Compliance approval of page-metadata export (prepared in OBS-014, gated in OBS-010).
- Q3: the audit retention window. The default applies.

## Administrative closure

- STUDIO-OBS-001: **Done; administratively closed** on 2026-10-08 by @po. QA PASS by Quinn (@qa), review iteration 2; all six ACs and TEST-001–003 resolved. Verified the 28-file normalized manifest at `docs/qa/evidence/STUDIO-OBS-001-reviewed-revision.json`; accepted evidence: 114 shared cases, 109 API examples, 20 schemas and 30/30 independent checks. [closure-key: STUDIO-OBS-001:digest:sha256:30a72a8a5ccef6aab482080668e921e08334ed22fd566bd8efbf9865436b305d]
- STUDIO-OBS-003: **Done; administratively closed** on 2026-10-08 by @po. QA PASS by Quinn (@qa), review iteration 2; AC-1–6 and REQ-001/REL-001/DOC-001 resolved. Verified the 50-file source manifest at `docs/qa/evidence/STUDIO-OBS-003/rereview1/reviewed-revision.json`; 97 regressions plus 2 unchanged PostgreSQL probes passed with zero failures/errors/skips, focused quality gates and 114 shared fixtures / 109 API examples green. Account/model/exact-plan integration remains owned by later stories. [closure-key: STUDIO-OBS-003:digest:sha256:52179031537b4156bf2584b46be07d0000fc41b6cc64f33177e29ff5adf74878]
- STUDIO-OBS-002: **Done; administratively closed** on 2026-10-08 by @po. QA PASS by Quinn (@qa), review iteration 2; AC-1–6 and SEC-001/SEC-002/REL-001 resolved. Verified the 38-file reviewed-source manifest at `docs/qa/evidence/STUDIO-OBS-002-rereview1-reviewed-revision.json` and four evidence-log hashes; unchanged probes 14/14 privacy/identity, 5/5 usability and 7/7 action usability, 71/71 sandboxed Chromium, 1217 units with 29 pre-existing skips, and 124 shared cases / 109 API examples / 20 schemas passed. Build, types, lint and diff gates passed. Collector foundation only; dispatch/dataflow, gateway-wire, authentication, replay and pilot proof remain later-story gates. [closure-key: STUDIO-OBS-002:digest:sha256:b4c3161462c8a716ca2118ede0a0a196cdd6450c8a97affd8feb8f949907517f]
- Batch 2 stories STUDIO-OBS-002 and STUDIO-OBS-003 are Done and administratively closed. The coordinator must verify close-phase completion before advancing OBS-004/005; no future-story gate is completed by these closures.
- STUDIO-OBS-004: **Done; administratively closed** on 2026-10-08 by @po. Independent QA PASS by Quinn (@qa), re-review 1; AC-1–7 and SEC-001/REL-001/SEC-002/REL-002 resolved. Verified the 96-file manifest at `docs/qa/evidence/STUDIO-OBS-004-r1-source-manifest.json` and all 236 tested worker files; 92 backend tests (37 real joined), 1269 runner units and 273 fixtures passed, with documented existing skips and coverage provenance. This closes the bounded runner/bridge foundation only. At closure INPUT-POLICY-01 was pending; its later approved branch A is recorded above. OBS-005–010 remain unfinished. [closure-key: STUDIO-OBS-004:digest:sha256:765212d573673085c38959683862aca11cda58b7f1998c51885a10975455661d]

## OBS-005 readiness amendment

The historical NO-GO remains in the story and `.ai/STUDIO-OBS-005-validation.json`. The translation design addresses its bootstrap/join/input/clarification findings against the actual closed bridge, specifies a separate guided gateway API preserving FULL/PATCH compilation, and reserves additive V32 persistence. Required production source classification, model accounting, clarification semantics and StepVerifier are OBS-005 deliverables. Only OBS-007 account connection and OBS-006 publication remain later ports. Coordinator records exact sequential shared-file ownership before implementation; independent PO revalidation follows review. No status transition or new implementation/test evidence is claimed here. The whole-wave $500 ceiling remains unchanged; actual spend telemetry is unavailable.

- STUDIO-OBS-005: **Done; administratively closed** on 2026-10-09 by @po. QA lifecycle remains owned by Quinn (@qa /root/obs005_peer), independent R2 reviewer. Accepted PASS at `sha256:b0761908eb0eaca411e75fc824dfaa382d9d90d556ee07b296ee19f9ae61ef57`; all six ACs and SEC-001/REL-001/REL-002/TEST-001 resolved. Verified 59-file review binding (only recorded QA story metadata differs), 50 independent passes and current 232-test archive (231 passes, one unavailable live-provider skip), with accepted quality/coverage evidence and CodeRabbit independent fallback. Controlled tests do not claim live-model accuracy or later publication/accounts/benchmark/pilot completion. Next eligible story: STUDIO-OBS-006, still Draft. [closure-key: STUDIO-OBS-005:digest:sha256:b0761908eb0eaca411e75fc824dfaa382d9d90d556ee07b296ee19f9ae61ef57]

- STUDIO-OBS-006: **Done; administratively closed** on 2026-10-09 by @po. Independent QA PASS by Quinn / obs006_qa_61_high and root review verification passed; all seven ACs, reviewed delayed-acquisition/pre-Ready/observed-choice amendments and 20 development tasks complete. Verified the exact 147-source working-tree digest with protected story substance, 148-entry File List, QA gate/report, 77 runtime sources, 256 frozen dist files, 1,115 Java classes and preserved evidence archives. Independent 321 backend / 274 runner unit / 33 Chromium / 5 compiled oracles passed with zero failures or skips; full backend 2,048 PASS / 19 existing skips plus cross-replica 2 PASS, unchanged-threshold JaCoCo 89.876%. Provenance: `docs/qa/evidence/STUDIO-OBS-006/`; report: `.ai/STUDIO-OBS-006-close.json`. Controlled providers and synthetic image catalog do not establish live model/account connectivity or production deployment. Next dependency candidate is STUDIO-OBS-007, still Draft and awaiting identification of approved account-provider configuration; root retains close verification and wave advancement. Shared wave ceiling USD500; actual spend unknown. [closure-key: STUDIO-OBS-006:digest:working-tree-sha256:f068570ddfeeaaa9811ad1b50e29c5ed08ba0afc7d3b99aa23e8f5e78bf020ab]
