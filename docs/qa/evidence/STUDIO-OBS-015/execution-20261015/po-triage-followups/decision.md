# PO placement: STUDIO-OBS-015 full-suite triage follow-ups

Owner: Pax (@po). Date: 2026-10-16. Machine record: `decision.json` (same folder).
Authority: the coordinator relayed the task. No user decision is claimed. ADR-SC-005 is the placement map.
Method: @po read the working tree and `git show HEAD:<path>` (HEAD `734ad704f`). No build or test was run.
[V] = verified by reading. [I] = inferred.

## Summary

| Item | Introduced | Placement | Blocks 015? |
|---|---|---|---|
| TF-1. `findAuthoringV2ById` takes the row lock before `requireRead` | **015 working tree** (HEAD was compliant) | **015, fix now** | Yes, for the 015 gate |
| TF-2. S2: dead `auth != null` guards in `lockForAuthoringWrite` | **015 working tree** | **015, fix now** | Yes, for the 015 gate (QA asked for the 015 sweep) |
| TF-3. S1: GET `readAuthoringDraft` takes the row lock before `requireRead` | **Pre-existing at HEAD** | **OBS-009 AC-9 obligation**, ruling first | No |
| TF-4. Historical V18 fixture adapter | **015 working tree** (by design) | **OBS-011 AC-1 candidate CLN-F2**, class C, ruling first | No |
| TF-5. Runtime DB role grant on `studio_guided_materialization_snapshots` | **015 working tree (V21)** | **OBS-009 AC-4 obligation**; 015 known limitation **KL-015-GRANT** | No |

## 1. S1 and S2: the authorization order

**Rule.** ADR-002 §27.2 sets the order: read through visibility, then `canRead`/`canWrite`, then (PUT only) the locked read.

**What HEAD did [V].**
- `readAuthoringDraft` (HEAD `StudioService:325-335`) called `findByIdForUpdate` (`:328`) before `requireRead` (`:329`). This is S1 and it predates 015. `StudioController` HEAD `:93` routed GET v2 to it.
- `findAuthoringV2ById` (HEAD `:385-393`) called `findById` (`:386`), then `requireRead` (`:387`), with no lock. This was compliant.
- `lockForAuthoringWrite` (HEAD `:729-747`) locked (`:732`) before `requireWrite` (`:733`). The working tree fixed this.

**What the working tree does [V]** (`StudioService.java` sha256 `aeacda85…`).
- `readAuthoringDraft` `:291-300`: the order is unchanged from HEAD (lock `:294`, `requireRead` `:295`). S1 is pre-existing, so 015 did not cause it.
- `findAuthoringV2ById` `:343-347`: it now delegates to `readAuthoringDraft`. It also carries the cluster C `@Transactional` that triage BC added. **This makes the method lock before it authorizes, which is a regression against HEAD.** It has no `src/main` caller, so the regression is latent and only tests reach it [V by grep]. Under the lead's rule, a regression that 015 introduced is fixed in 015. That is TF-1.
- `lockForAuthoringWrite` `:464-475`: the visible read and `requireWrite` sit under `if (auth != null)` (`:466`). The refresh sits under `auth != null && entityManager != null` (`:471`). `requireWrite` at `:475` is unconditional. With a null `auth` the method would take the lock before it denies. No caller passes null [V, QA final02 §2], so this is a dead branch that 015 introduced (HEAD had no guard). That is TF-2.

**TF-1 (015, required).** `findAuthoringV2ById` must never take a row lock before `requireRead`. Either of these satisfies it, and @dev chooses:
- (a) delete the method. It has zero `src/main` callers, which follows the single-path rule. Its test callers are ported by name to the controller or `readAuthoringDraft` path, with counts recorded.
- (b) restore the HEAD order with no lock: `findById`, then `requireRead`, then project the canonical authoring.

The cluster C `@Transactional` alone does not satisfy TF-1. It cures SQLState 25006 but keeps the lock-first order. The 11 cluster C tests must pass after the change.

**TF-2 (015, required, behaviour-neutral).**
- Make the visible read and `requireWrite` unconditional (remove `auth != null` at `:466`), and drop `auth != null` from `:471`.
- The `entityManager != null` part is out of scope unless @dev shows it is also dead.
- Proof: `StudioServiceWriteAuthorizationTest` and `StudioAuthorizationIT` pass unchanged, and a grep for `auth != null` inside `lockForAuthoringWrite` returns 0.

**TF-3 (S1, pre-existing): OBS-009 AC-9 obligation a–e, @architect rules first.**
- Why OBS-009 and not 011: the fix changes behaviour on a public route (it removes or moves a lock on GET), so it is not behaviour-neutral, and OBS-011 is not a valid home.
- Why AC-9: AC-9 is the cross-principal isolation gate. An unauthorized principal can block a writer and get a timing signal, and that is cross-principal interference.
- @po does not pick between the options. Option (i) is a visible non-locking read, then `requireRead`. Option (ii) is a visible read, then `requireRead`, then a locked read, used only if a lock is truly needed.
- It must land before the first human pilot. It is not a 015 blocker. QA rated it advisory, the lock is brief and returns no data, and the ordering is pre-existing.

## 2. Historical V18 fixture adapter (TF-4 → OBS-011 AC-1 CLN-F2)

**Facts [V].**
- `support/GuidedPublicationEvidenceFixture.java` is untracked, so it is absent at HEAD. `GuidedPublicationMigrationTest` at HEAD has 0 hits for `HistoricalV18|requireV18`.
- The 015 final design kept the adapter on purpose: `interface-and-test-spec.json` says "InferenceMigrationIT … historical V18 target stays".
- Sites:
  - fixture `:43-44` (`freezeHistoricalV18Source`), `:140`, `:313-321` (`requireV18`);
  - `GuidedPublicationMigrationTest` `:1064`, `:1298` (`publishHistoricalV18Observed`, javadoc "current runtime compatibility is not claimed"), `:1428`, `:1570`, `:1607-1662` (`commitHistoricalV18`);
  - `InferenceMigrationIT` `:187`, `:190` (`prepareHistoricalV18Observed`), `:299`.

**Classification.**
- This is test-only and behaviour-neutral, so it goes to OBS-011, the home for behaviour-neutral cleanup.
- AC-1 already takes "new candidates created by OBS-007…015 … orphaned fixtures". The entry is CLN-F2, class C.
- It needs a ruling, because retiring the adapter removes upgrade-with-data coverage at the V18 boundary.
- [I] No environment holds a re-baselined V18 population. Studio is unreleased, and ADR-SC-005 "Operations" says "Dev databases recreated after D-B". The adapter is therefore a second, legacy write path, kept only for a history no deployment will traverse.
- @architect rules with @data-engineer, and @po does not pick. If the ruling is to retire it, the V18 cases are ported to the head writer or retired by name with a covering test cited (ADR-SC-005 "Tests": ported, not dropped). If the ruling is to keep it, the adapter is listed as a named AC-7 exception with its reason.
- It is not release-blocking. If it is not done, it goes to the "Carried forward" table and is never dropped silently.

## 3. Runtime DB role grant on the snapshots view (TF-5 → OBS-009 AC-4; KL-015-GRANT)

**Facts.**
- [V] V21 creates `studio_guided_materialization_snapshots` (`:114`). It redefines the audit functions `studio_secret_guided_input_reference` and `_consumed` to read that view (`:837-880`).
- [V] There is no `GRANT` and no `SECURITY DEFINER` under `backend/src/main/resources/db` or `backend/db`, in either the working tree or HEAD.
- [V] `application.yml` `spring.flyway` sets no separate user. `helm-chart` passes only `SPRING_DATASOURCE_*` and has no Flyway setting.
- [I] With the repository's configuration, the runtime user runs the migrations and owns every object, so no grant is needed.
- [V by test, triage A §3.1] The view runs with its owner's rights, so a non-owner role needs SELECT on the view only. It does not need the base tables.
- Unknown: whether any real environment provisions a DBA-owned schema with a separate, non-owner runtime role.

**Placement.**
- This is a deployment and roles concern, so it goes to OBS-009, next to AC-4's least-privilege controls (ADR-SC-005 "Operations").
- The obligation steps:
  - (a) record the role model for each environment;
  - (b) if the runtime role is not the owner, grant SELECT on the view and check the privilege delta for the objects that V19–V21 created;
  - (c) prove it live: a secret-referencing guided terminal writes its audit row under the runtime role;
  - (d) if the runtime role is the owner, record "not applicable" with evidence;
  - (e) if the role model is unconfirmed, report it as "unrun, owner Platform DBA / @devops", never as a skip.
- 015 gets known limitation KL-015-GRANT, with no AC, task, ledger or Status change. `SecretUseAuditIT` (triage A fix) already documents the requirement in a test.

## Story edits (append-only; Status unchanged)
- `STUDIO-OBS-015.story.md`: "PO placement — full-suite triage follow-ups" block in Known limitations (TF-1/TF-2 required; KL-015-GRANT; pointers for S1 and the V18 adapter); Change Log 0.1.10.
- `STUDIO-OBS-009.story.md`: AC-4 obligation TF-5 a–e; AC-9 obligation TF-3 a–e; T2/T5 sub-items; Change Log 0.3.14.
- `STUDIO-OBS-011.story.md`: AC-1 candidate CLN-F2 a–d; T1 sub-item; Change Log 0.2.6.

Not placed: an OBS-010 runbook row for the DB role model. It was not asked for. If @devops confirms a non-owner role, @po will add the row then.
