# STUDIO-OBS-009 ADJ-1: @qa security co-sign (option (a), as implemented)

- **Signed:** Quinn (@qa), 2026-10-18. Read-only review during the G9 hold window. I ran no Gradle, vitest, docker, Playwright or other test.
- **Not a gate decision.** This is the co-sign that `w1.5/ruling-part2.md` §2.3 asks for "at the B gate". It carries no PASS/CONCERNS/FAIL/WAIVED and changes no story status.
- **Legend:** [V] verified today by reading the named file or receipt. [I] inference, with its basis.

## Verdict: SIGN-WITH-NOTES

I sign the security analysis of ruling part 2 §2.2 as implemented. Four notes follow. None is a condition on the signature. Note 2 is a correction to the ruling's wording, and note 3 is the acceptance of SEC-AUDIT-PREREADY-01 that I was asked to give.

## 1. What I checked, and what it showed

| # | Question | Finding | Mark |
|---|---|---|---|
| 1 | Is the widening exactly one disjunct, on the one statement? | `StudioDispatchLedgerStatements.applyFinal` owner CTE (`:643`): `OR (state = 'ADMITTED' AND revoked_at IS NOT NULL AND CAST(? AS boolean))`. No other statement changed. The reaper, deadlines, TTLs and `applyObservedPreReadyFailure` are untouched. | [V] |
| 2 | Is the boolean the API's own projection and not a runner value? | Bound at `:690` as `ExecutionErrorCode.AUTHORIZATION_REVOKED.equals(errorCode)`, where `errorCode` is the method's API-projected argument. `RunnerOutcomeCodes.errorCodeFor` maps only `TIMEOUT` unconditionally and `CANCELLED` conditionally (recorded cancel gives `CANCELLED`, else recorded revocation gives `AUTHORIZATION_REVOKED`, else null). `isApiAssigned` refuses any runner that names an API-owned code. So a runner cannot obtain this path by naming `AUTHORIZATION_REVOKED`. | [V] |
| 3 | Does the path need a backend-recorded fact? | Yes. `revoked_at` is written only by `SecretRevocationSweep` (`UPDATE ... SET revoked_at=? WHERE ... AND revoked_at IS NULL`). `grep revoked_at backend/src/main` shows no other writer. `ProgressReportService.apply` calls `executionRevoked` first (`:147-149`), so a revocation first discovered in the report transaction is visible to the read at `:164-165` in the same transaction. | [V] |
| 4 | Is the OBS-006 reviewed reason set bypassed? | No. `ProgressReportService:166-172` still excludes revoked rows from the OBS-006 pre-Ready branch, which is the existing behaviour. A launch failure (`RUN_ERROR`) on a revoked row projects a null code, so the bound boolean is false and the FINAL is refused `409 TRANSITION_REJECTED`. The pin is `PreReadyRevocationProbeIT.aRevokedRowsOtherPreReadyFinalIsStillRefusedAndTheReaperSettlesIt`, which asserts `409 TRANSITION_REJECTED`, ledger `ADMITTED`, then `START_TIMEOUT` by the reaper and `isNotEqualTo(AUTHORIZATION_REVOKED)`. | [V] |
| 5 | Does cancel keep precedence? | Yes: `RunnerOutcomeCodes` (`cancelRequested ? CANCELLED : revoked ? AUTHORIZATION_REVOKED`). A3 asserts it. | [V] |
| 6 | Does the unrecorded outer `CANCELLED` stay refused? | Yes. A4 asserts `400 INVALID_REPORT` with the ledger still `ADMITTED`. | [V] |
| 7 | Does the real runner do what the report-boundary tests assume? | `PreReadyRevocationJoinedIT` runs the real backend, the real dispatch client over TLS, the real `dist/main.js` (D_F `4add1307...`) and a real Chromium child held before Ready. The real sweep writes `revoked_at` while the row is `ADMITTED` and `cancel_requested_at` stays null. The runner stops on `source=control recorded=true`. Its FINAL is accepted at the first attempt (`report.terminal_delivered attempts 1`). Result: `ERROR / AUTHORIZATION_REVOKED`, no browser start recorded, ledger `FINALIZING` then `DONE`, `reapOnce()` returns 0 after the start deadline, and the runner log has neither `report.ownership_lost` nor the secret value. Credited run `obs009-b-w3-04`, 15/15, `sourceStable` and `distStable` true. | [V receipt `b/w3/receipt.md` §3; test body read] |
| 8 | Do the mutations show the assertions bite? | W2: dropping the `AND ?` binding turned A2 red and left A1 green. W3: making the revocation disjunct unreachable left the run `ADMITTED` for 63 s and the real runner logged `report.ownership_lost` (the 409). Both restored with sha asserted. I have not re-run them (hold window). C10 does, on the final tree (`c10-plan.md`, B2 and B3). | [V receipts; not re-run] |
| 9 | Is the narrowness mutation visible at the joined level? | No, and the receipt says so: a real runner's FINAL carries `AUTHORIZATION_REVOKED` by construction. The narrowness proof therefore rests on report-boundary A2 plus the A-M mutation, not on the joined IT. That is the right split, and C10-B3 re-checks it. | [V] |
| 10 | Is the ADR wording correct? | `ADR-002 §29.2 item 7` and the §13 row say "`revoked_at`, write-once". See note 2. | [V] |

## 2. Notes

### Note 1: the reaper still labels a dead-runner case `START_TIMEOUT` [I, accepted]

If a revocation is recorded and the runner is dead or silent, no FINAL ever arrives. The reaper settles the row `START_TIMEOUT`, as before. That is true as a statement that the start timed out, and the revocation is still on the ledger row. Option (a) never claimed otherwise. It is not an "invented cause": the backend does not know that the runner would have stopped on the revocation. No action.

### Note 2: "write-once by trigger" is not verified for the ledger column [V], correction owed to the ruling text

Ruling part 2 §2.1 cites `V13__executions_ledger.sql:387-390` and `V14__guided_sessions.sql:410-419` for "write-once by trigger". I read both.

- `V14` installs a write-once trigger on `studio_guided_sessions.revoked_at`.
- `V13:387-390` only adds `studio_dispatch_ledger.revoked_at`. I found no trigger on that column in any migration. A grep over all migrations finds `revoked_at` only in `V13`, `V14`, `V15` (a read) and `V17` (a read in the retry-authority trigger).
- For the ledger column, write-once holds by statement discipline (`AND revoked_at IS NULL`) and a single writer (`SecretRevocationSweep`), not by a database constraint.

This does not change the verdict. ADJ-1 only reads the column, the cancel path (`cancel_requested_at`) has the same trust level, and the ADR text says "write-once" without claiming a trigger. I ask only that nobody repeat "by trigger" for the ledger table in a later document. Optional hardening, not for 009: a ledger-side write-once trigger for `revoked_at`, owner @data-engineer. I record it and ask for nothing.

### Note 3: SEC-AUDIT-PREREADY-01 is accepted (pre-Ready audit = `UNKNOWN_OUTCOME`)

I accept the ruling in `w3/pre-g9-rulings.md` §2. Basis:

- [V] The observed fact is `ADJ1-USAGE [UNKNOWN_OUTCOME]`, exactly one USAGE row for the secret.
- [V] `SecretAuditLifecycle.replayTerminal` maps every declared secret that is absent from the runner's map to `UNKNOWN_OUTCOME`. The runner's pre-Ready FINAL carries no `secretUse` (`runCoordinator.ts` builds the outcome without it on the `RunFailure` path).
- `UNKNOWN_OUTCOME` means "the runner did not attest to use". It never under-reports use, so it fails closed. It is imprecise, not wrong.
- [I] Nothing was typed. `Launch3` has no secret, and the runner log does not contain the value (asserted).

Conditions on my acceptance, all already in the ruling and restated so the G9 record carries them:

1. The G9 and D2 wording credits ADJ-1 c on the **observed** fact `UNKNOWN_OUTCOME` with the `AUTHORIZATION_REVOKED` label. It does not say or imply `NOT_USED`.
2. The joined IT's either-value assertion (`isIn("NOT_USED", "UNKNOWN_OUTCOME")`, B-W3 deviation 4) is named **weak** in the record. It is accepted for 009 only. The carry tightens it to the single value.
3. Carry `SEC-AUDIT-PREREADY-01`: owner @dev (runner), option A (the runner sends `NOT_USED` for every declared secret on every `RunFailure` raised before `Execute3` was sent). @po must place it as a 009 residue. It is not a G9 blocker.
4. [I, not checkable here] No downstream consumer may read `UNKNOWN_OUTCOME` as "the secret was used". I found no such consumer in the files I read, but I did not search every reader of `studio_secret_use_audit`. If SIEM or a report treats `UNKNOWN_OUTCOME` as use, the carry becomes more urgent.
5. The W2 A1 case asserts `NOT_USED` only because its synthetic report said so. It proves the backend mapping of a runner-supplied value and says nothing about the real runner. The record must not cite it as evidence of real-runner behaviour.

### Note 4: residual that predates ADJ-1 [I]

A pre-Ready FINAL with outer `CANCELLED` is accepted by the cancel path with whatever step results the runner sent. ADJ-1 adds a second recorded fact that reaches the same statement, so it inherits that. I did not check whether step results are validated as all `SKIPPED` for a pre-start FINAL. This is not a regression and I do not ask for a change. If someone owns the pre-Ready report validation, it is a question for them.

## 3. What this signature does not cover

- The post-Ready revocation path (REVOKED_MID_RUN): not exercised by ADJ-1 and unchanged.
- ED-02 / TF-5 live revocation: external, owed.
- Whether the ADR-002 text is consistent with every other document: I read §29.2 item 7 and the §13 row only.

## 4. What stays open for the record

- C10-B2 and C10-B3 must be red on the final tree, then green after revert.
- `SEC-AUDIT-PREREADY-01` placed by @po.
- Optional: a database write-once trigger for the ledger's `revoked_at` (note 2).

Signed: Quinn (@qa), 2026-10-18.
