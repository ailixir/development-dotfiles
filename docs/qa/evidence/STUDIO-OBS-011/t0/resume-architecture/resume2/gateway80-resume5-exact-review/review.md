# Gateway05 exact architecture review

**HOLD: five mandatory source findings block the proposed continuation.** Packet `607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab` preserves the narrow lsof fix and later phase policy, but the new capture violates disposition C4. No operational continuation, source release or closing authority is issued.

The reviewed subject is the existing unused Gateway label `obs009-gateway80-offtree03-20261019`, supplied PTY29815/wrapper3720/shell3749 and immutable Hfd58. Existing E is supplied as H-only, W absent and native/phase count0 after failed admission7843. Those are bound historical/public facts, not current runtime observations made by this review. Accepted C8 qualified resource closure14db carries no C8/source/main/IR/lane/lifecycle credit.

## Mandatory G05-ARCH-01 — qualify the live holder before any output

`capture-admission.py:capture()` calls `existing_hold()`, checks umask, then writes `admission-capture-attempt.json`. Only afterward does it build the proposal/custody bindings, obtain the core and call `held()`. `existing_hold()` checks immutable H content/mode, initial H-only namespace and direct parent PID; it does not freshly check original controller start/argv/parent chain, wrapper lock FD, lock identity or kernel-held state.

Consequently a failed first `held()` leaves an admission mutation despite the exact C4 requirement, “Before any continuation write,” and the saved dispatch's same requirement. Later HOLD is conservative about release but cannot undo this ordering violation. The independent guarded capture counterexample injects a first-holder rejection and observes the exclusive attempt write before rejection. No actual holder, process, FD or lock was queried.

Author33 contains a holder-changed case, but it asserts only that candidate/facts were not published. It does not require zero earlier writes, so all authored controls can pass while this requirement fails. A new immutable successor must perform the complete fresh prequalification before every output and add negative tests asserting zero output callbacks. Preserve sole-attempt semantics: even an actual prequalification failure does not authorize another invocation, deletion/reset or automatic retry. Original H/root01/failed status remain immutable.

## Additional reached-boundary findings

G05-ARCH-02: `held()` checks the returned inode but not returned PID. Actual held() accepts wrong/missing p fields with the expected i field in wholly fake tests. Require exact structured PID/descriptor/inode qualification, not merely inode membership.

G05-ARCH-03: later core AST, inherited baseline JSON and candidate metadata readers separately hash and reopen the path for interpretation. Their consumed bytes are not the verified buffers. The capture bootstrap does not close these reached reader gaps. Require verified same-buffer interpretation and guarded substitution negatives without touching the actual protected baseline.

G05-ARCH-04: the installed POSIX `subprocess.run(timeout=10)` calls kill on TimeoutExpired. The actual observation adapter delegates to this path. A fake Popen reproduction of the installed run function confirms the kill callback without any actual signal/process. Replace it with explicit no-signal, identity-accounted observation lifecycle; timeout remains live/UNKNOWN HOLD without fabricated wait or cleanup.

G05-ARCH-05: current scope still says generation4 and E never created while its admissionState says existing H-only E. Its immediate successor field still names03. Correct current metadata/prose and label historical authority fields explicitly; keep the same native label/holder.

These supplementary checks follow concrete reached-source concerns received from the concurrent QA review. They add8 finite cases (four actual-function fake tests, three AST reader checks and one JSON consistency check), without rerunning248 controls.

## Other affected design checks

The author controls all248 pass (121+70+24+33); the independent initial batch has7 actual-function fake cases. The driver AST differs from04 only in `held()`'s lsof argv: options `-F pfin` precede `--` and the exact lock filename. Strict status0/nonempty output/error handling remains; the old/new actual-function fake pair reproduces old rejection and new acceptance. The actual adapter is independently checked against nonzero, empty-output and error-output cases. No bank, fixture,95/48 identities, native argv,300s bounds, parent077/child022 or source guard policy changes were found.

The guard, exit gate and standalone final now bind generation05. Later final/gate functions and phase machinery remain unchanged and hash-bound through the reviewed packet. The distinct capture loads verified contract/scope/driver buffers without executing driver main or import fallback. Its manifest hash is supplied externally, avoiding a self-hash cycle. Current operational entry paths are generation05, but the scope metadata finding remains. Current generated proof hashes are owned by the final manifest; strict forward/reverse reconstruction covers the eleven declared non-generated deltas. Old93 members and seals remain unchanged.

C2/C3: a distinct continuation template requires explicit root authority, exact new packet/reviews, H/failure/accepted C8 closure and SAME controller PIDs; false native/workspace/retry/repair fields and integer capture cap1 are enforced. Old root01 is unchanged and not reused. The capture remains a separately reviewed source subject; nothing here adopts an actual continuation decision.

C5/C6/C7: initial H-only E, absent/nonlinked W, finite exclusive records, sourcef9/main506/dist238/Helm22/aux modes, tools/dependency inventory and fresh candidate/inherited/boundary checks are represented. Source guards bracket candidate/boundary observations and holder is repeated before publishing candidate/facts. Historical H alone supplies no freshness. The separate-buffer and timeout-signal findings block these reached obligations. These are source design checks; all actual tool versions, identities, custody/source/resource facts and root inspection remain owed. Sampled identities do not establish complete interval capture or global quiet. C4 remains failed despite these later checks.

C8/C9/CaptureCap1: successful capture stops with proposedAuthorization/authorized false and admission-only records. Separate actual status and root inspection/new rootauthorization remain required before guard setup. Actual negative1, separate status and SAME-holder proof still precede prepare. The five independent phase decisions, intended48 red/native1 plus47 filtered, fixed-copy installation,95 green/native0, complete archives, independent actual review/root adoption, standalone final0/status/inspection, separate permit, short fresh guarded exit0 and outer postclose remain owed. No phase or guard action is authorized here.

## Verification and boundaries

The sealed `checks.json` records exact source/member pins, guarded author control replay, strict reconstruction and independent actual-function fake cases. Real subprocess, lock, signal, native, source capture and private/runtime body paths were blocked. Tests never imported/executed actual runtime main, capture helper main or driver main. Source reads, public review/failure metadata and the permitted ownership-core source were the only input bodies; actual baseline/H bodies, runtime E/W enumeration, source capture and current process/tool/FD/kernel probes were not performed.

The first reviewer run completed121 boundary controls, then its audit blocked loading standard-library datetime bytecode outside the source whitelist as revision controls began. This was a reviewer harness issue, not a packet defect. Its actual1/chunk is preserved in `check-history.json`. The corrected run preloads the core's standard-library modules before enabling the same operational/read-scope audit. No failed actual admission or historical evidence was repaired.

Only this review directory was written. Conditional exact-source support is withheld pending the new successor and exact independent reviews. USD500 shared ceiling supplied; aggregate spend unknown. All prior source/main/generalW1/Replay/IR/F1/lane/baton/external/pilot/lifecycle holds remain.
