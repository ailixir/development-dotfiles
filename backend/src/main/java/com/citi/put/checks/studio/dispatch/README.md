# Studio dispatch

Stories 10.7 and 10.17; ADR-SC-005. Turns an accepted execution into exactly one `POST /v2/runs`,
or into a terminal error, and never into two of either. There is one execution family: every
accepted execution carries an observed replay binding, and a row without one is closed
`DISPATCH_FAILED` without a send.

```
accept (10.7)
  │  readiness (observed revision only) + quotas
  │  preflight                    typed {variables, secrets} from the LEARNED revision
  │    └─ vault: does this reference exist for this CSI, environment and test?
  └─ PENDING row + ledger row + observed binding

dispatch (10.7 ordering)
  │  claim                        one conditional UPDATE; two dispatchers → exactly one 1
  │  refresh                      observed replay authorization re-checked for this attempt
  │  resolve                      values, here and nowhere else
  │    └─ reference vanished    → REFERENCE_UNAVAILABLE, no send
  │  beginObservedDispatch        fresh attempt, committed before the send
  └─ send                         the observed job, then close() erases everything
```

## What a resolved value may touch

Since story 10.17 a resolved variable or secret value exists in this process for the length of one
`dispatch(...)` call, and this is the complete list of what it is allowed to reach:

| May touch | Why |
|---|---|
| `StudioReferenceResolver.Resolved`'s `char[]`s | The only holder. Erased by `close()` on every exit path, including the two terminal-refusal paths and the four ambiguous ones |
| The serialized `POST /v2/runs` body | §9.2: the runner *"may receive per-run values"*, and holding no vault credential is precisely why the worker must hand them over |

Everything else is a defect, and each of these is asserted rather than assumed (AC-12,
`JobBodyLeakTest`): **no** log line at any level, **no** exception message or cause chain, **no**
`ui_test_executions` or `studio_dispatch_ledger` column, **no** SSE payload, and nothing retained
after `send` returns.

A refusal names the **reference** and never the value — not the value, not its length, not
`lastFour`, not a hash, not a prefix (§9.2, AC-6). A secret saved for another test, CSI or
environment is `UnknownReferenceException`, exactly like one that does not exist.

## The residual, stated rather than claimed away

`Resolved` holds `char[]` so that `close()` can actually erase the bytes. The moment those arrays
are serialized into a JSON body, the platform creates `String`s that **no code can erase**. This is
not fixed here and it is not described as fixed.

The property that *is* claimed, and that is asserted: **nothing in this process retains a path to
the values once `close()` has run.** The JSON serializer's transient buffers are the named
residual.

## The closed body

`RunJob` is the fourteen fields the frozen `docs/specs/studio/openapi.yaml` closes it at, and
`HttpRunnerDispatchClient.body()` writes exactly those. The key set is closed on both sides and
that is a security control rather than tidiness: it is what stops a job naming its own callback
destination. The callback destination is the runner's own deployment configuration
(`STUDIO_RUNNER_CALLBACK_BASE_URL`) and this dispatcher does not hold it at all.

`InternalBodyContractConformanceTest` validates the bytes this package puts on a socket against the
schema read from the contract file. It is paired with — and not substituted by —
`StudioContractTest`'s record-shape gate: a record can match the schema component-for-component
while the producer writes a different map, which is the state this branch was in for a whole wave.

## The two dispatcher-assigned codes

Both mean **the send never happened**, and both are asserted on the recording client's request
count being exactly zero rather than on a log line.

| Code | The condition observed (ADR-002 §15.3) |
|---|---|
| `AUTHORIZATION_REVOKED` | a fact about the **principal** — the dispatch authorization was withdrawn between acceptance and dispatch |
| `REFERENCE_UNAVAILABLE` | a fact about the **draft and its environment** — the reference vanished from the vault, or the confirmed revision's reference declaration is absent, unreadable or of an unrecognised shape |

Neither is reachable from a runner, and `x-runner-error-codes ∩ ExecutionErrorCode.enum = {TIMEOUT}`
stays true.

## What is not here

Real vault integration and the removal of the authentication bypass are `ED-02` and story 10.18.
There is no per-principal secret entitlement: secrets are scoped to the test they were saved for. Approved-destination enforcement is `ED-04`, ADR-002 O-6 and 10.18's
SPK-05; this package records the **policy identity** a dispatch ran under and invents no policy
field on a closed body. Uploading anything is story 10.14 — deriving a key is not writing an
object.
