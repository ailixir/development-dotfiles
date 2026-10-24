Source-only009 business-logic proposal under Astra decisionf43637d95b85516074d2bb2227637ab570f14652c0d7a77743640f0ca7cedb70. No runtime/application/compiler/parser/test/browser/seed ran. Actual source/dist and all original RT/diagnostic trees are untouched. This is not neutralRT7 and is not a historical-cause claim.

For an existing secret renewal, captureP=D+1000 once from stored nextRenewalD in renew. MissingD fails closed; there is no Date.now fallback/rearm. Initial acquisition and nonsecret renewals pass no phase. requestClaim samples N once for both existing lease budgetB=L-N-100 and new remaining phaseR=P-N. R<=0 throws ordinaryLEASE_LOST before any request. Otherwise timeout=min(existingcap,B,R); cap stays1000 for secret,10000 otherwise. Existing controller/timer/single-inflight/epoch/fence/grant validation/finally code is byte-identical.

After the awaited requestClaim has validated the complete grant, renew performs the original live check and then checks Date.now()<the same capturedP immediately before applyAcknowledgedLease/entry.grant installation. The guard is deliberately in the caller after await: requestClaim's finally clearing its timer cannot let a delayed caller continuation install stale authority. No endpoint is derived from the response/current time or updated cadence. Successful within-phase work retains the original nextRenewal+=1000 and scheduling; partial response/repeated context cannot resetP.

Limiting cause/ties are an explicit architecture/security review item:

| Condition | Proposed outcome |
| --- | --- |
| Phase already ended at capturedN | LEASE_LOST, no request, even inside session margin |
| Phase is earliest or tied with lease margin/cap | LEASE_LOST at that phase; no C1 suppression |
| Session-tied lease margin strictly earlier than cap and phase | Existing ClaimMarginExhausted only while phase remains open; existing session timer reportsEXPIRED |
| That originally margin-bound callback is not observed until phase has ended | LEASE_LOST; margin exception cannot suppress an already-ended phase |
| Cap tied with lease margin | Existing cap precedence: LEASE_LOST (budget<cap remains strict) |
| Lease ends before session expiry | Existing LEASE_LOST; no margin exception |
| No phase (initial/nonsecret) | Existing cap/lease-margin behavior exactly; Infinity adds no new bound and lost() adds no clock sample |

Cadence wins a new cadence/lease-margin tie intentionally. This is fail-closed at the newly ruled phase endpoint; it is not a waiver of session expiry. Existing expires<=lease timer reason, genuine strictly-earlier-margin C1, exact-cap, early-timer session tie, ordinary failure/REVOKED, stopped/epoch/fence/no-revival and owned cleanup stay unchanged. Independent review must explicitly accept this tie choice before runtime. No new error vocabulary/field, reserve, faster cadence, larger cap, clock service, tolerance or fixture-oracle change is introduced. This cannot guarantee callback dispatch under arbitrary suspension or repair every native timing run.

Four appended controls use existing setup/fake timers; all24 original ownership cases remain an exact byte prefix. Real report identities, not AST counts, give28future ownership cases plus26unchanged stopReason cases=54focused cases. All numbers are unexecuted predictions.

1. Defining old-product assertion-red: delayed callback atB+1500 from originalD=B+1000, valid grant deliveredB+2100 afterP=B+2000 but inside old fresh1000. First behavior assertion is runtime.accepting===false; old must reportactualtrue/expectedfalse plus closed acknowledged-lease-install count1. Complete valid prepared navigation is then denied on green, with no browser dispatch, no installation or assignment/context revival. Finally settles pending work, closes ownership, checks zero timers and restores the spy. Cap-value or setup/fence/expiry/finalizer failures do not count as red.
2. Post-await/pre-install precision: valid grant finishes original checkGrant atB+1600; one case-local original-method spy queues fake wallB+2100 before renew's continuation. A check located only inside requestClaim would pass too early. Correct caller guard rejects before installation. No product hook or derived promise is added.
3. Already-ended callback atN=P=B+2000 with session/leaseE=B+2050: no new claim and LEASE_LOST, not C1 deferral while the session itself is still live.
4. DelayedN=B+1500 withE=B+2100 makes remaining phase and lease-margin both500. Timely-before-bound499ms remains live; atP the tie must stop asLEASE_LOST. Existing26stopReason controls provide genuine strictly-earlier-margin/EXPIRED and all original session/lease controls without a new matrix.

The pre-code counterexample record is preserved, with explicit later refinements for caller-continuation and margin priority. Installed Vitest setSystemTime updates pending timers'callAt/createdAt while the stored product epoch remains unchanged; it supplies a controlled delay relative toD, not a claim about historical clock jumps. The original native four modes,41expect calls, strict2000ms/t0 observer,1500ms partial-body delay,850ms slow response and10000ms native stall remain byte-identical.

Future proof is bounded and separately authorized: fresh current private COPY seed; tests-only semantic types/coherent old-product private build; one primary assertion-red; only then product-only overlay with identical tests; complete28+26unit controls, green types/changed-file lint/coherent private build; then four original native modes once through the reviewed direct capture/nativeJSON shape. Any defining/setup/native/cleanup failure stops without retry, reserve adjustment or full tier. Root/independent execution QA must accept actual evidence before actual source application or a changed-composition full fixture successor. No executionGO is inferred from this package.

Both proposed focused Vitest commands explicitly select the unchanged vitest.config.ts with private coverage=false; this prevents the existing collector from attaching unrelated actual-root coverage-summary data. The native proof uses the reviewed direct route and never invokes the artifact-backup branch. No collector/config/source policy is changed.
