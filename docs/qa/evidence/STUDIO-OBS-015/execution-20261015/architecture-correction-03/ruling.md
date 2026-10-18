# STUDIO-OBS-015 ARCH015-03: governed prefix confirmation and measured timing ties

Aria. These are integration corrections under the original six ACs, T0's one frozen governed policy, OBS-014's current-session action safety and OBS-013's measured recording evidence. Original frozen designs and corrections 01/02 remain historical exact bytes. No application, SQL, browser or build command is run by this ruling.

## P1 — Current policy applies to every fresh prefix action

The current prefix branch obtains a fresh PREPARED proposal and then reserves an obligation/admission without invoking the suffix's `guardAction`. That bypasses grounding, destructive-verb and sideEffectStance checks. Replaying a verified operation from a base revision does not transfer the base session's authorization or side-effect confirmation to the new run.

Factor or reuse the existing `GuidedActionGuard` evaluation on the fresh prepared prefix proposal and current acknowledged sanitized observation, current step's authored text and allowed saved-input source, under this session's immutable frozen governed policy. Its order and rules remain identical: missing/ungrounded target, destructive verb, grounding, then side-effect stance. A governed refusal ends FAILED/POLICY_DENIED with the existing private audit reason; it never emits target-drift authority or switches to learning. DENY must stop, ALLOW may proceed, and default CLARIFY_FIRST must ask the existing current-session confirmation before the first side-effecting prefix dispatch. Do not deny that ordinary default-policy case merely to avoid waiting, treat Run as consent, or omit guards because there is no model in the prefix.

Call the guard BEFORE reserveObligation, storePreparation, action admission, native fence/dispatch or any action budget charge. A verified PREPARED prefix-request row may already exist; no actionable backend preparation/admission is stored for the proposal awaiting consent. An admission-level shared evaluation also prevents an internal caller from bypassing confirmation: an unconfirmed confirm-first decision refuses admission with the existing stale/state refusal and no action, while the normal coordinator creates the question. A real policy refusal keeps its existing terminal mapping. Confirmation skips only the once-per-session stance question; it never bypasses fresh grounding/destructive/origin/secret checks.

## Existing question and state; durable prefix mode remains pending

Use the existing public state AWAITING_CLARIFICATION and the existing closed observed-phase v3 question:

- reason SIDE_EFFECT_CONFIRMATION, promptCode CONFIRM_ACTION;
- current session/scope/coordinate, acknowledged documentId and generation;
- exactly one AUTHORED choice, safeLabel from the authored step truncated as OBS-014 specifies, actual nodeId or null, bindingId null, no PAGE role/region fields;
- expiresAt remains the hard session deadline, not the volatile preparation deadline or the initial 30-second lease.

The existing clarify request is unchanged: `{schemaVersion:3,clarificationId,choiceId,generation}` with the existing Idempotency-Key. No public field, operation, enum state, prepare result kind, confirmation boolean or model response is added. The backend produces this question after normal prefix PREPARED; it does not invent a runner `CONFIRM` response.

Keep private translation continuation REPLAYING_PREFIX throughout the wait. `studio_015_prefix_pending` remains exactly initialIndex>0 and no switch; the predicate is independent of the public display state. Both gateway reservation entrypoints, model-attempt INSERT and all model counters stay fenced for PREPARING, REPLAYING_PREFIX and AWAITING_CLARIFICATION while that predicate holds. No SOURCE_PLAN/NEXT_ACTION, generic model clarification, OBSERVING/PROPOSING/ACTING continuation or implicit suffix switch is allowed during the wait.

The minimal private progress extension is:

```
sideEffectConfirmation = {
  clarificationId: <existing question id>,
  status: "PENDING" | "CONFIRMED",
  prefixRequestDigest: <sha256 of the exact immutable PREPARED prefix request>
}
```

This prefix-only closed marker links the existing question to current worker/fence, context/input version, source/configuration, program/coordinate and evidence through the existing request document. Ordinary suffix confirmation keeps its existing two-field marker and flow. This is private progress JSON, not a wire schema extension or publication witness. The marker remains under the existing pruned sideEffectConfirmation key; do not broaden retention or disclose private reasons.

Creation requires a live original session/owner, pending prefix, REPLAYING_PREFIX state, exact next program coordinate, request status PREPARED, matching current evidence/scope/source/config/context/input identity, no live admitted/dispatching action, no native operation, no pending delivery and no pending observation refresh. The model cannot create this marker or provide confirmation authority. The frozen policy row/context hash remains unchanged.

## Waiting, answer and recovery

`runnable()` excludes the existing AWAITING_CLARIFICATION session state as well as its existing continuation exclusions. The prefix plans/advance entrypoint also returns the current question/state before bootstrap, prepare, refresh or admission when waiting. That protects direct controller calls and stale scheduler envelopes. The worker keeps the same recorded browser, values/observations, recorder and clock; ownership maintenance continues through the existing same-owner lease renewal. No new worker/browser or clock origin is acquired.

The existing public clarify authority remains: current authenticated original principal, current CSI execute/source/policy/secret entitlement, matching question/choice/generation/document and unexpired question/session. Prefix confirmation additionally checks the marker's immutable PREPARED request against the live current owner/fence/context/input version and current source/configuration/evidence. It does NOT require the old volatile preparation to remain unexpired during a long human wait. The browser owner may renew its lease; the old proposal is discarded and a fresh proof is required afterwards.

Acceptance atomically sets status CONFIRMED, removes the question, returns public state REPLAYING_PREFIX, and leaves continuation REPLAYING_PREFIX. It does not admit or dispatch an action. Do not use the existing unconditional REFRESH continuation, which would violate the durable mode guard.

Derive the necessary prefix refresh from the existing marker/request: while the current evidenceHash still equals the confirmed request's old evidenceHash, run the existing durable observation-refresh protocol under a key bound to this question. The runner's existing refresh clears volatile preparations and keeps the same browser/clock. Commit the acknowledged fresh generation before issuing a new prefix request and preparation. The old PREPARED request remains immutable history. No new `needsRefresh` wire flag is needed. A process restart retries/reconciles the same refresh intent; it cannot dispatch the pre-confirmation proposal. Admission rejects that old evidenceHash until refresh, and reruns the shared current policy guard on the fresh proposal. The once-per-current-session CONFIRMED stance then applies to later prefix and suffix operations, without a second stance question.

Declining uses the existing cancel path; question expiry uses the existing EXPIRED outcome. Cancellation, hard expiry, source/entitlement revocation or UNKNOWN_OUTCOME cannot accept a late answer, switch modes or restart native work. Duplicate clarify keys remain idempotent and never reapply the grant or mutate a terminal session; clients read current session/result truth. A controller restart while the same worker/browser and lease remain live recovers this durable question. A changed owner/fence/context cannot reuse it; existing lost-context/ownership handling stops fail-closed (UNKNOWN_OUTCOME where required, hard expiry EXPIRED) instead of acquiring another browser or porting consent. No possibly effected action is repeated.

Late observations or new prepare/admit requests may not advance the waiting coordinate or generation. The old request already has PREPARED status, so it cannot become a PRE_ADMISSION drift receipt (which requires ISSUED); no admitted action exists to support an admitted receipt either. Preserve those existing guards, and reject callbacks that would mutate the wait outside the exact answer/cancel/expiry/renewal rules.

## Narrow data amendment

Dara confirmed V21 is unshipped and has not touched a user/dev/shared database. Its old a4e0c441 SQL was actually exercised by owned PostgreSQL15.19 migration attempt03: 48 executed, 41 PASS, 7 FAIL, zero skips. Those seven failures are fixture paired-receipt FK insertion order, not authorization to relax the V15 FK. Previous compile-only zero-case attempts remain failed history, not the current execution state.

After independent review, Dara amends the unshipped V21 only, archives the prior exact SQL/manifests/evidence, and freezes the new hash. There is no arbitrary V22 compatibility path or old migration edit. V1–V20 remain byte-exact. Existing owned test containers may be replaced for fresh/upgrade tests; no user database recreation is authorized.

Add a narrowly scoped helper, conceptually `studio_015_prefix_confirmation_wait(sessionId, document, progress)`, validating the NEW row's exact private marker/question/request/live-identity conditions above. A BEFORE trigger must use NEW values, not look up the old row's progress and miss an atomically created question. The helper recognizes only this already existing side-effect confirmation, not an arbitrary clarification.

Amend session mode guards to permit REPLAYING_PREFIX → AWAITING_CLARIFICATION only for that exact pending proof and to permit its valid CONFIRMED answer back to REPLAYING_PREFIX. Same-owner live renewal preserves the proof. Existing terminal stop transitions remain allowed. While waiting, disallow escape into generic proposal/observation/acting modes or an unvalidated changed owner/context. The deferred mode check validates both REPLAYING_PREFIX and this exact waiting state against pending program plus continuation REPLAYING_PREFIX. Counter/model guards continue using the unchanged pending predicate. The continuation guard can remain prefix-only; it must not start accepting REFRESH or generic AWAITING_CLARIFICATION for a pending prefix. Add an explicit action INSERT gate requiring REPLAYING_PREFIX, so the legitimate public waiting state cannot admit an action through SQL. Application prepare/advance gates also prohibit work during the wait. Existing prepare/no-invocation/switch/attempt/ACK guards stay strict.

All original 48 migration methods plus the new confirmation delta must run on actual PostgreSQL15 fresh and populated-V20 upgrade paths with byte-preserved old rows/guards. The old 41/48 run is historical evidence only and cannot validate amended V21 bytes. Independent QA must recheck the exact amended SQL and actual new execution evidence before this correction receives integration credit.

## T1 — Extend the total order with the existing admission identity

Current Java ORDER is `(startMs,kindRank,ordinal-null-first,stepId-codepoint)` and requires strict increase. Two legitimate measured readings can share all those keys while naming different admitted attempts at one semantic coordinate. `seen(admissionId)` already independently prevents duplicates, but the incomplete ORDER still rejects the tie.

Append admissionId as the FINAL scalar/code-point tie-break, null first for non-action derived items. The full order becomes `(startMs,kindRank,ordinal-null-first,stepId-codepoint,admissionId-null-first-codepoint)`. Use the same scalar comparator in Java and runner TS; avoid locale sorting or UTF-16 ordering for non-ASCII identifiers. Runner sends action items only, so its effective tuple is startMs, ordinal, stepId, admissionId. Java continues requiring strict increase under this complete order.

Keep every existing acceptance check: one timing per admission ID, actual session ledger admission with dispatchCount1 and exact stepId/ordinal, original integer/time bounds, unchanged endMs/null meaning and output six-field shape. A duplicate admission remains invalid even at a different measured time. An unknown or undispatched admission remains invalid. This is not permission to accept repeated readings or collapse attempt 0/1 into one coordinate entry.

Do not fabricate +1 ms, change the clock origin, alter readings, erase an attempt, add attemptOrdinal to the timing wire or infer native invocation from timing metadata. Current runtime starts a stamp at native dispatch; if a pre-native refusal has no measured reading, leave it absent rather than inventing one merely to create a tie. The synthetic counterexample is a legal input pair, not a claim that current runtime emitted both readings in an observed run.

Step derivation remains selection over actual readings: minimum start and the endMs of the last action in the now-complete existing ORDER among the maximum-start readings. When old keys tie, admission identity makes that selection deterministic; preserve the selected actual end/null without calibration. Admission lexicographic order does not assert a chronological order inside an equal measured millisecond. Per-action seek keeps both distinct admission identities and exact equal offsets. Existing unavailable/partial/retention/authorization behavior and reserved timing kinds are unchanged.
