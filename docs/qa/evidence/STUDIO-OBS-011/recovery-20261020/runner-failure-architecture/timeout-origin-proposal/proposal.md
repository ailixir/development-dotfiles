# Startup timeout-origin proposal — pending009 only

Recommendation: a small, separately reviewed009 behavioral fix is justified by a deterministic source counterexample. It is **not** a diagnosis of either historical fixture failure. No source is applied and no test/compiler/parser/process/provider/Git operation ran for this proposal.

## Evidence and decision

The completed observed diagnostic passed with nine complete records: its timer and catch sampled1ms after deadline, await-selected=false, and the caller saw one scratch directory before disposal. It did not reproduce the suspected path and does not clear either failed full RT tier.

The source nevertheless has an inconsistent handoff: boundedStartup can irrevocably reject from its selected whole-start timer, while the launcher catch uses a later independent wall-clock sample to choose cleanup-before-response. A below-deadline later sample makes that already-terminal timeout behave like an ordinary launch error. Testing that counterexample deliberately is legitimate; pretending the controlled result reproduces a historical run is not.

Use private origin metadata, bound to the same absolute deadline. Do not rearm/recheck a timer, skip cleanup, or use message-based classification. A private WeakMap is smaller than a new Error subtype, mutable public field, global sink, clock abstraction or transport schema.

## Exact change scope

Product paths: only src/run/observedBootstrap.ts and the existing import/catch condition in src/run/browser.ts. Tests: append the controlled regression and one cap-negative guard to the existing fixtures-tier/guided-start-deadline.test.ts; extend the existing observedBootstrap unit cases with cap/identity checks as needed. Preserve every existing case/assertion and all original1000/1500/1800/3000/12000/15000ms values.

product-design.ts.txt specifies the proposed code. It is an exact design buffer, not an applied/generated/compiled patch or a request to reformat the surrounding files.

- Keep a module-private WeakMap<Error,number>.
- The private marker function accepts and returns the same freshly constructed Error, storing its absolute deadline.
- Export one narrow internal predicate accepting unknown error plus the captured deadline. It recognizes only the same Error identity/deadline pair.
- Mark the helper's own entry-expiry and late-success-expiry errors.
- For the timer, capture the existing delay-selection wall sample once as remaining=deadline-Date.now(). Keep the same max(1,min(maxMs,remaining)) scheduling expression. Mark its new TIMEOUT error only when remaining<=maxMs, meaning the absolute boundary selected that timer. Equality means both boundaries coincide. A strictly earlier maxMs cap stays unmarked even if the callback itself executes late.
- Do not mark or wrap a rejected work error, including an ordinary Error('TIMEOUT'). Keep cancellation handling and abort-reason normalization exactly as they are.
- Browser catch starts the same memoized hard teardown, then waits only when not aborted, not the helper's recognized same-deadline absolute timeout, and its existing wall sample is before deadline. The absolute-timeout case hands the same failure.close capability to the caller. Unrecognized errors retain the original wall-clock check and cleanup-before-response path.

The new predicate short-circuits the catch wall read only for authenticated terminal expiry; that is the intended behavior change. All other original abort/ordinary-error samples keep their short circuit. No timer is rearmed, no deadline changes, and no new wait or retry occurs. This avoids extending the start transport wait because a wall clock moved backwards. Existing teardown/backstop clock behavior remains unchanged; this proposal makes no broader wall-clock robustness guarantee.

Error constructor, message, cause object and error identity stay intact; the WeakMap adds no own property or wire capability, and weak keys do not retain abandoned errors. Construct new Error at the original rejection sites, then mark/return that exact object. No subclass, string tag or error reconstruction.

## Genuine red before implementation

primary-regression.ts.txt is a proposed new fixture case using only existing public launchGuidedBrowser/GuidedLaunchFailure APIs, existing Chromium pending-promise mock, and Vitest's existing timer facilities. It imports no future predicate and can be installed before product code.

Only that new case fakes setTimeout/clearTimeout and holds Date.now below its supplied one-second deadline. After the mocked launch has actually been entered, advance the scheduled timer by exactly1000ms and allow one existing setImmediate barrier for microtasks. This is deliberately controlled timer/wall disagreement, not observation or scheduler reproduction. No original native case is altered or made fake.

The meaningful old-behavior assertion-red is expect(replied).toBe(true), actually false: the old catch is awaiting teardown while the mocked launch remains pending. Compilation/setup/empty-suite/timeout failures are not red credit. The assertion must fail by name and value against pinned old product code before the marker implementation is added.

After green, require the exact existing public failure/cause/PROCESS phase, one retained scratch directory, a close promise that remains unsettled while the original launch remains pending, then launch rejection, confirmed close, repeated close and an empty scratch parent. These check response/cleanup ordering and retained authority, not WeakMap contents.

Its finally always rejects that same pending launch, awaits the original launch outcome and memoized close, then restores timers/mocks. Thus the intentional red must not abandon teardown. No stand-in/browser is spawned in this controlled case; the existing native ownership and late-spawn cases remain the proof of actual killing. Source-only review predicts the assertion counterexample; no red/green is claimed yet.

## Small guard set, no new matrix

The primary regression alone could be satisfied incorrectly by a blanket TIMEOUT exemption. Add one narrowly targeted cap-negative case using the same existing pending-launch pattern: held wall sample, explicit60000ms deadline (already used by existing abort cases), unchanged default maxMs30000. Advance exactly30000ms in virtual timers. Response must still be pending while launch is pending; only after rejecting that launch may the failure return, with scratch already removed and repeated close resolved. A blanket TIMEOUT exemption or tagging every helper timer fails this observable guard. No real30-second delay or existing timeout increase is needed.

Extend the already existing asynchronous-failure unit case to reject a supplied Error('TIMEOUT') and assert the exact same object is returned. Extend the existing sequential-deadline unit coverage with a pending operation whose cap precedes its absolute deadline; assert it is TIMEOUT at the cap and never accepts a subsequently completed value. These are public error/timing outcomes, not map lookups. There is no current explicit maxMs regression in the inspected bootstrap unit file, so do not claim one already ran.

Run the existing observedBootstrap cases for cancellation, absolute expiry, sequential work and late-success refusal, the original guided-start-deadline cases (including abort reasons, real freeze/video, unchanged late-spawn and survivor rejection), guidedCloseBound F3 for ordinary-error cleanup and the other existing F1-F4/H close/ownership guards. Existing guided runtime/ownership tests protect retained worker slot and failed-launch-close handoff. Do not delete, skip or modify these controls to obtain green.

Focused static/type/lint and controlled red/green can precede native execution; root schedules later original native guards/full gates in the single heavy lane. No additional diagnostic/full-tier retry is authorized by this proposal. If a cap/ordinary/cancellation guard fails, correct the narrow defect before broader work. No six-slot backend plan change is proposed.

## Pins and009/011 separation

Original source SHA256:

| Path under studio-runner/ | SHA256 |
|---|---|
| src/run/observedBootstrap.ts | bbb3436035c9fcbe2fd787412ccb2a039dae3152a902dd4d1f3bbeeb533728d5 |
| src/run/browser.ts | 0a1b85fcb121d21f2d4c4c0b262cce3216d4a86097c459a6d82ffa8755f2e1c0 |
| test/run/observedBootstrap.test.ts | 07d9a14d9752bb698cbdacdaeb18872f64450dfd5ce10fc00d95b39122273675 |
| test/fixtures-tier/guided-start-deadline.test.ts | 17b59ff7ad67f2249697c059c266453300f658dc0b9e1846438a34da01fcaef5 |

Unchanged native guard/constant pins: guidedCloseBound.test.ts16aaebe6db8386b06aedbc58b347bb57b3ff937989afa49db0eb8f4b4d99a588; guidedBrowser.ts63f899ef688df31f3608c4a0b10f86ea5e63b710410bb32eb7f4d374cd2d63ae. Observed diagnostic receipt SHA0b928af8f1a7474cd234cd96ab072a4f43a6a7db9f7c4f797fce2c986e2e6ae2.

Bind implementation/red/green to pending009, update its file list/evidence when actually applied, and retain historical failures/non-reproduction unchanged. The behavioral files are disjoint from011's six code-reformat paths; nevertheless the runner's complete source and emitted dist inputs change. The current RT sandbox, accepted old f726... dist, seven candidate preimages and six-file token/AST proof remain historical and held.

After a009 fix earns its own evidence, rebuild a reviewed RT successor from that accepted009 base; rebind aggregate source/dependency inventories, independently repeat six-file token/AST proof against that base, capture actual before/after emit inventories, root-accept any resulting dist difference, then run appropriate unit/type/lint and final native/full gates on the actual composed inputs. Preserve both failed RT full runs. Do not count an old proof as a new gate, copy old dist over new behavior, or relabel this behavioral change as token-neutral cleanup.

Risks are false origin classification, a mismatched deadline, altered ordinary/cap handoff, controlled-test cleanup leakage, and assuming controlled behavior establishes historical cause. Exact identity/deadline binding, cap-negative/identity checks, unchanged cancellation/ownership controls and honest source/emit rebinding address those risks. No deployment/release/lifecycle credit follows. Shared USD500 ceiling, aggregate spend unknown.

