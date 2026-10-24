# FULLCHECK-OWN-01 exact-diff architecture re-review

Aria, 2026-10-19. **FULLCHECK-OWN-01 is corrected in the reviewed draft; no remaining mandatory finding in this narrow re-review.** The corrected package is statically supported subject to the original terminal/native/root authorization and real full-check conditions. This does not authorize launch, open W1, credit runtime evidence or change any story/lifecycle/QA outcome.

## Reviewed bytes and method

- Corrected `t0/early/fullcheck-harness/resume2/harness.py`: `a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae`.
- Byte-identical original `plan.json`: `9f05e9417bb63abf21fb1c5740cec280b194556b8c6d403d9c1e405432686d2f`.
- Corrected `manifest.json`: `d8b4b0a200f2ca0666e756a96d838742da8c69f5fe3b92e71e9ebebcfec4c51d`.

I read the entire exact script diff, updated design, launch text, manifest, author checks and receipt; compared ASTs; independently checked actual artifact/current-input bytes; and executed only the five extracted actual ownership helpers in a fake Python namespace with fake census/ps/receipt facts. No harness module, top-level initialization, entrypoint, Popen, real subprocess/process observation, native orchestration or fault injection ran. The original seven artifacts and prior independent review remain hash exact. `audit.json` contains the mechanical results. These checks substantiate the bounded state transitions, not the future OS process lifetime behavior.

## Finding resolution

`owned_census_keys` computes ownership from the current direct child plus already known matching `(pid,start)` roots and their transitive descendants. `update_owned` has two distinct passes: it inserts every census-proven key with an uncertain current observation **before** calling `pid_text` or touching a sticky receipt flag, then attempts per-PID observations. A failure while reporting one observation cannot erase its already retained siblings.

`classify_owned` separates JAVA/NON_JAVA/UNKNOWN executable state, MATCHED/UNKNOWN identity observation and sticky `javaPreviouslyProved`. Missing/blank comm, missing/different start recheck and an observation exception cannot classify a newly uncertain identity as NON_JAVA. A reliably non-Java identity becomes UNKNOWN again when its next observation is unavailable. A Java identity cannot be downgraded by later missing or non-Java observations. This closes the original missing-comm=false/drop path.

`pending_owned` holds still-present matching-start Java or unresolved identities. `ownership_drain_decision` returns WAIT unless observation succeeded, the actual collector is terminal and no such identity remains. The actual `run_owned` finally drain invokes this decision. An uncertain identity resolves only through a reliable matching-start non-Java observation, or actual original identity absence/different start; a proved Java identity requires absence/different start. Actual collector polling/waiting remains mandatory, exceptions remain inside the repeated drain, and a sticky completeness flag alone cannot authorize release.

Reparented known roots retain ownership and can expose new descendants. PID reuse does not transfer old ownership to the new start or its children. Reliable same-start non-Java leftovers remain disclosed, never claimed cleaned up. The census does not make unrelated host processes owned. The new `ownedIdentityObservationGap` also participates in main's evidence-completeness calculation; a resolved uncertainty does not silently erase an observed gap. Normal absent ephemeral children resolve the pending wait by actual absence, without a global native identity scan or a global JVM wait. This conservative evidence qualification may make a future run incomplete if an actual gap occurs; mocks do not prove there will be no gaps.

## Independent transition checks

All18 independent checks passed. They cover every one of the author's13 advertised scenarios, with additional scope/reuse assertions:

1. Missing comm after the collector terminates retains UNKNOWN and waits; the completeness gap is sticky.
2. Missing start recheck retains the census identity and waits.
3. Reliable shell → UNKNOWN → Java promotes and waits.
4. Reparented proved Java and its newly observed unknown descendant remain owned and pending.
5. Proved Java with missing start recheck still waits.
6. Real original identity exit resolves.
7. A reused PID with a different start does not inherit ownership.
8. Reliable matching-start non-Java observation resolves an identity never proved Java.
9. A previously reliable non-Java observation becomes UNKNOWN when unavailable.
10. Observation exceptions retain UNKNOWN and wait.
11. A receipt-write exception leaves **all** census-owned keys retained and pending.
12. A failed poll or census observation cannot supply a terminal decision.
13. Proved Java never downgrades following a later non-Java observation.
14. Unowned global processes are neither observed through per-PID calls nor waited.
15. A changed start recheck remains uncertain against the old census until a new census proves the original absent/different.
16. A known same-start non-Java root retains descendant ownership closure after reparenting.
17. The replacement process tree after PID reuse inherits no old ownership.

The first item contains two separately asserted checks, giving18 in `audit.json`. These are extracted-helper mock results only, not an executed collector or native drain test.

## Unchanged scope and bindings

The exact diff adds four pure helpers, changes `update_owned` and the ownership portions of `run_owned`, and adds one sticky completeness flag in `main`. The other18 helpers, including `parent_lock`, `stable_inputs`, `diagnostic_terminal`, `assess_and_archive`, `boundary_inventory`, `archive_original`, `record` and file readers, are AST-identical. The unchanged plan was copied byte for byte, not recaptured. All seven corrected manifest members match. The authorization example remains false; the corrected runs directory and future root authorization file are absent.

All20 current quoted input hashes,22 Helm hashes and six helper/policy/baseline hashes still match. The plan lists literal1808-file S011 `061fc41f…` and238-file D009r `698a9365…`; their ordered digest recipes match. Dist has no byte drift. The sole source-byte drift remains the actual temporary diagnostic ReplayIT candidate; this review does not claim it is restored. Full-check source preflight must reject until restoration. Original independent review `fullcheck-harness/review.md` (`fbca3c60…`) remains authoritative for the unchanged areas.

The exact existing three-Test-task collector command, one invocation, no filter/exclusion/source write/retry, nine historical skips, Node24/Java21, actual parent lock descriptor/inode/kernel/start/argv binding, fresh unused label and final root SHA authorization are unchanged. So are the complete JOIN partition/cohort conditions, three required fresh nonempty exec artifacts, executed coverage tasks, actual original report mtime/internal session freshness, exclusive archives, and separate native/collector/outer completeness outcomes. Copy time cannot confer stale coverage credit; previous red/partial evidence remains retained. The six inherited identities retain their explicit non-cleanup status and are never signaled or globally waited. No quiet-host claim is introduced.

`t0-record.md` historical attribution and possible OBS-009 metadata updates remain explicitly outside these frozen source/20 quoted sets; root must separately record those facts and refresh the010 evidence binding where required. This unchanged plan does not silently accept modifications to any actually bound input. Such modifications require a reviewed plan-binding revision and new authorization.

## Remaining root and runtime conditions

- Establish actual diagnostic command and owned-process termination, original Replay bytes/mode restoration and successful original compile, with independent QA assessment of the real native/cohort/closed-ledger evidence. The still-live diagnostic and candidate source cannot be bypassed by this review.
- Preserve and explicitly dispose the diagnostic observer qualification. A focused green class is neither a causal resolution nor the user's owed full check.
- Only after those facts, root may issue an explicit authorization binding the corrected exact script/plan, this independent review, final diagnostic receipt and a never-used label. No authorization is inferred here and the original review cannot authorize new script bytes by itself.
- Execute the unchanged full check once under the real lock with held source/dist/quoted/Helm/helper inputs, then independently inspect actual task execution, full XML/case/skip sets, original exec provenance, complete JOIN cohorts, fresh coverage sessions/reports and outer completeness. Real failures or observation gaps remain qualified evidence, not retry authorization, automatic W1 opening or lane credit.

The shared declared ceiling is USD500; actual spend is unavailable. Only the exclusive review output directory was written. No external calls, actual source/frozen-input/plan/story changes, process signals, Git changes or subagent dispatch occurred in this re-review.
