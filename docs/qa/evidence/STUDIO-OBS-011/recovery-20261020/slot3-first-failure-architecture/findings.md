# Slot3 first default failure — source architecture assessment

Scope: current public ReplayITe10c162d057c87a906a32e162614d29f3f4ba5a0e7000c52e9f77e46b0cdd616 plus the closed default-task-failure-sites.json, SHAbab410985df28a653e03c25fa7353748f6b3bda8007cc9ea501f0d567b1b016c. No private C5/C212, captures, baseline bodies or raw failure messages were read. No process status/query/signal/attachment, runtime/test/build/parser/compiler/provider/Git operation or source modification occurred.

**The default partition is failed. Historical cause remains unproved. No blanket ignore-gone fix is warranted.** The same original collector continues incremental; this is not a terminal whole-collector assessment or permission to restart it.

## What failed first and what cascaded

The closed record binds fresh default XML212358b566a82314538c6fffa307cf37c7df7c229e5285e11f23690c7270be88:46 tests,31 passed,15 failed,0 errors/skips.

First case: actualGuidedOwnedPrimaryBrowserLossWhileNativePasswordWorldPending, Order31, C6 kind3. The primary is IllegalStateException constructed at p8C6Run:26067, the aggregate “captured browser descendant release unconfirmed” inside the fault-cut body. A retained NoSuchElementException has public frames ownedCommandHash:662 → verifyOwnedDescendant:910 → verifyRecordedOwnedHandle:925 → p8KillRefusedWhileAlive:25557 → residual lambda:26057.

That is the residual-release path after the primary browser's owned-identity verification and forceful cut. At least one residual iteration reached the final helper after its preceding PID/start/status/group checks. The commandLine Optional was absent during that helper's later fresh verification. It does not establish why it was absent, which OS state was then observed, or whether that process was dead.

Additional teardown failures are suppressed, including the p3 cleanup aggregate and p8AwaitC6Closed restoration assertion. The closed record lists throwable types and source frames without complete per-throwable association or state observations. Consequently it does not establish all cleanup causes or prove the final native/descriptor/latch/producer closure verdict. No business/pass assertion beyond that point is credited.

p3Case:24157–24167 attempts actual owned cleanup; failure sets cleanupUnconfirmed=true and preserves/suppresses the cleanup error against the primary. The C6 finalizer preserves failures, restoration/producer obligations and quarantine rather than clearing them. Fourteen later cases fail at beginOwnedSessionTracking:3771–3773 on that sticky bit before their test bodies. They are fourteen guarded cascade failures, not fourteen independent native failure modes. They still remain failed tests.

Do not clear cleanupUnconfirmed, replace the primary, discard suppressed failures, reset latches or relax restoration/drain/firstError predicates to continue. The failed default count cannot be called green even if incremental later passes.

## Existing protections already handle several races

No redundant correction is proposed:

- ownedCommandHash:662 intentionally requires current command metadata. Missing command text is not signal authority.
- verifyOwnedDescendant requires recorded ancestry, nonnull captured start/command, live handle, matching fresh start and matching command hash. verifyRecordedOwnedHandle first matches the pinned identity to a recorded root/descendant; an unrecorded handle remains refused.
- p8KillRefusedWhileAlive already checks dead at entry, catches verification RuntimeException/AssertionError, calls p8TerminatedUnsignalled, and sends no signal for confirmed terminal/dead observations. It rethrows the original verification error for live/unverifiable or unknown state.
- p8TerminatedUnsignalled already recognizes an explicit dead handle and OS X/Z. Its catch returns false on unavailable observations.
- p6Status already handles nonzero ps exit plus a fresh dead handle as X. Its five-second probe bound, owned-tool registration/join, parse assertions and interrupt restoration stay intact.
- p8C6Run's preceding status/identity block already rechecks liveness after a check failure and skips only confirmed gone. That block ends before p8KillRefusedWhileAlive; it is not a catch around the latter helper.
- p6AwaitProcesses(gone=true) remains a separate ten-second genuine-reaping proof with pinned start checks. An X/Z/no-signal classification is not release completion.

None of these paths should be replaced with “metadata missing means gone”, an empty command hash, start-only signal authority, process-group guessing, retry until metadata appears, or a catch-all cleanup success.

## Remaining source-supported window

There is a narrower check-then-use window in p8TerminatedUnsignalled:

1. Its entry isAlive sample is true.
2. p6Status returns a nonterminal snapshot such as S.
3. The pinned process exits after that snapshot.
4. The helper returns false solely because the snapshot is neither X nor Z; it performs no final liveness sample.

The caller then retains its original verification failure even though a fresh observation could establish that this pinned process now needs no signal. This is a source counterexample **candidate**, not proof that slot3 took it. There is also an intentional unknown-state branch: p6Status or liveness can throw, after which the helper returns false. That refusal is not a defect by itself and must not be converted to success.

The observed NoSuchElement surviving into the aggregate means the existing helper did not establish terminal state for that attempt. The public record cannot distinguish a genuinely live unverifiable process, a nonterminal-status/death ordering, a failed status probe, or unavailable liveness. Missing commandLine alone supplies none of those facts. Nothing here ties this to TEST001,009 timeout-origin behavior, model data, or any proven process-death race.

## Smallest legitimate next step

Keep the original collector/source frozen until it is terminal. Preserve failed credit and the six-full-class/two-day plan; no seventh full run, unchanged full retry, timebox reset or new native probe is recommended.

A small independently controlled regression can evaluate the source counterexample without claiming historical reproduction:

- A neutral, separately reviewed extraction of only this already-private classification function into one private overload using existing JDK BooleanSupplier/Supplier<String> would permit deterministic reads. The ordinary adapter still binds the same pinned handle.isAlive and existing p6Status(handle).state. No new public type, Clock/Port, observer, signal or shared framework is needed. This is a possible minimal test seam, not authored or approved code.
- One narrow fixture helper test supplies alive=true at entry; its status supplier supplies S and marks that fake handle dead before returning. Desired outcome: terminated-without-signal=true. The exact old classification must yield false and fail that assertion. Stage the neutral seam/test first, then prove a named assertion-red; setup/compiler/infrastructure/timeout failure is not red.
- In that same bounded test retain positive X/Z/dead outcomes and explicit guards: a continuously alive nonterminal process returns false; status failure returns false; unknown/throwing liveness returns false. No signal primitive is available to these suppliers. This is one deterministic classification regression with guards, not a process-test matrix.
- The narrow candidate correction would retain terminal X/Z handling and, only after a successful nonterminal status snapshot, take one final fresh liveness sample before returning false. Explicit fresh-dead can mean “send none”; a true or unavailable result remains false. Leave the unknown-status catch false. Do not turn this into retries or claim it eliminates every possible later transition.
- The actual p8 caller must still preserve the original exception on false, and actual release must still pass unchanged p6AwaitProcesses, native close, descriptors/restoration, producer/latch and sticky-cleanup checks. The controlled helper test does not prove those native effects. Any new named test/count and exact neutral extraction need root/QA review before entering the final pair.

This is the only source-level improvement direction supported here. It may reduce one safe false-unconfirmed window; it does not explain or automatically fix slot3. No implementation should be labeled “the slot3 fix” on this evidence.

## Exact missing public fact for cause attribution

Needed: the fallback outcome at this failed attempt—whether p6Status returned a terminal/nonterminal class or threw, and whether the pinned handle was explicitly dead, alive or unavailable at that decision. Those facts are not present in the closed record and an exception swallowed by p8TerminatedUnsignalled cannot be reconstructed from its caller's stack.

If root later authorizes observation on an existing case occurrence, the smallest added observation would reuse the existing closed numeric C6 receipt, storing only classification-stage codes and the already-required liveness/status outcomes. No raw command line, process arguments, identity, capture, new process query, extra clock/control decision or timed-path I/O is needed. Preserve decisions/errors exactly; unknown stays unknown. Do not inspect private C5/C212 data or attach a new observer programme.

Before any such new occurrence, a safe richer throwable-tree extraction from already-closed XML could associate public frames with their exact primary/suppressed node, without exporting messages. That can clarify cleanup association, but cannot reveal the swallowed status/liveness result and cannot establish death by itself. No additional execution is authorized by this assessment.

Current source and all authority/cleanup invariants remain unchanged. Default46/31/15 stays failed, incremental remains the original live job's result to collect, and no new gate/lifecycle/runtime credit is supplied. Shared USD500 ceiling; aggregate spend unknown.

