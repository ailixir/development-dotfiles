# D2 final-image smoke — independent source review

**NOT_READY: two mandatory source/evidence fixes before execution.** Review binds immutable manifest605d9b20b3fc96d645a7f2f076a22ab9df8beda80139c301677d451180aca146. No smoke, Docker operation, listener, browser, module import, test or provider call ran. Allowed parse-only checks: `bash -n future-smoke.sh` exit0; Node24 `--check fixture.mjs` exit0. All five manifest artifacts and all declared preparation source dependencies rehash exactly. Final image/source/dist/context fields remain null; no result is credited.

| Priority / finding | Concrete problem | Bounded correction |
|---|---|---|
| **P1 D2-QA-01: active-session stop is not bound to stop boundary** | `future-smoke.sh:73–74` records active allocation/proc-fd facts, then runs both startup negatives at76–84 before stop86. The fixture's assignment expires120s after creation. If intervening commands delay, expiry/lease loss can stop the browser and deliver STORED before docker stop. The later checks accept any historical STORED and ordinary draining→drained with guidedClosed=true, so an idle drain can satisfy the claimed active-session proof. The current inspection also counts recording allocation/namespace descriptors, not a fresh live browser identity at stop. | Complete the two negatives before context creation; capture fresh owned browser/recording/lifecycle-active facts immediately before stop, with no unrelated work between. Refuse any pre-stop lifecycle/recording settlement and bind the one recording callback to the stop/drain boundary. Keep production CMD, source, TLS/auth, intervals and grace unchanged; no new scenario or framework is needed. |
| **P1 D2-QA-02: negative startup commands can hang indefinitely** | `future-smoke.sh:79` uses foreground docker run without a bound. `run-runner.py` also uses subprocess.run with no timeout. If a refusal guard regresses, the valid configured main may keep serving instead of exiting; the script never checks exit78 or reaches EXIT cleanup. This defeats the negative as a bounded falsification and can retain the sole heavy lane. | Run those same exact-owned negatives detached and poll exit within a fixed smoke-only bound, or use an existing bounded launcher. Missed refusal deadline is a recorded failure followed by exact-owned cleanup, never a pass/retry. Do not alter product startup/stop deadlines. |

The author/root received these findings before this report. Preserve the old candidate and findings; review an exact bounded successor before any runtime credit.

## Seven-obligation mapping and reviewed strengths

| Existing D2 step | Candidate mapping / disposition |
|---|---|
|1 fresh image/CMD | Consumes an immutable sha256 image and checks Linux/pwuser/no-entrypoint/exact production `sh -c 'ulimit -c 0 && exec node dist/main.js'`; compares before/after image facts. The earlier planned fresh build, pins and deployment receipt must bind that same measured ID. This script neither rebuilds nor retags. |
|2 read-only/init/health/PID | Positive production CMD uses --init/--read-only; exec health and production node PID>1/core limits are checked. Default UID/GID1001 is inspected. The short-lived controller is a separate local adapter, explicitly not a Kubernetes one-container proof. |
|3 no-init refusal | Intended exact exit78/LAUNCH_TREE/no-started negative is discriminating, but must receive D2-QA-02's command bound. |
|4 debug refusal | Intended exact exit78/DEBUG_ENV/no-started negative likewise needs the bound. No unsupported debugger, no-sandbox option or validation bypass is added. |
|5 active drain | Production SIGTERM/docker stop, ordered draining/drained, guidedClosed=true, exit0 and unchanged30s grace are checked. **Not adequately proved until D2-QA-01 is fixed.** |
|6 Linux assign/journal/recording | Fixture uses actual final-image contract/hash/policy/JWT modules, real locally signed RS256 controller/worker tokens, authorized mTLS and certificate pin. Assign200/OWNED fence1→validated claim202→context200→initialBlank bootstrap matches source interfaces; journal creation consumes both assignment and runtime records. Two nonempty journals/two owners, Linux recording namespace fd and allocation are checked. STORED callback/schema and post-drain allocation removal are checked, subject to the timing finding. No action/model/backend/staging call is substituted. |
|7 TLS permissions | Root-only setup container copies deliberately public TLS fixtures, assigns root:1001/0440 and read-only mount; main/controller retain pwuser. Inside main, key mode/gid/readability are checked without exporting key bytes. |

Disk-backed named volumes are explicitly disclosed as a variation from historical D2 tmpfs. The current chart's guided-tmp and journal emptyDir volumes are disk-backed; `/dev/shm` is separately memory-backed. Thus the local disk-backed surrogate is reasonable for journal fsync/read-only-root/Linux allocation, and correctly claims no memory sizing, emptyDir size-limit enforcement, PVC or Kubernetes security/deployment acceptance. No reason to require historical tmpfs silently or call both implementations identical.

The runner uses network none; the controller shares only its isolated loopback namespace. No host ports, bridge/service exposure, real credentials or provider access are selected. The callback verifies mTLS fingerprint, worker issuer/subject/audience/role and signed token, parses/validates the actual claim/bootstrap/lifecycle/recording schemas, and emits only closed event names/counts. The positive path preserves real server/journal/browser/recorder code. Filesystem inspection does not export raw journals, recordings, observations or credential material. Cleanup targets only the declared fresh names and temporary directory and records remaining resources; the missing command bound is still material because cleanup cannot run while foreground execution never returns.

## Immutable reviewed pins and future obligations

- `fixture.mjs`:2079981be2e517deca9acff148aa28d12b9dc72a59a2d4b9ea19c306ea5224bd.
- `future-smoke.sh`:8ba2b767edd9745ac21869b45204efb61a0d4a2f34a8f0f1d8b3c7582dd8c6b1.
- `assessment.md`:bb9affd627222d699a9329e935ac6ad86efabc0840f405f150cf1ad6be02e23f.
- `bindings.json`:0facec4397830fb73cefddcef312cce76730ad3a95e555f169141b3969d69a83.
- `future-command-and-bindings.json`:73953905c0e7b807b68b3011aacb4bd14e976ff2779f6dc298feefcd1ecee20b.

After source fixes, root must bind the actual accepted final source/test inputs/dist, exact minimal Docker context/build receipt, image pins and deployment722 receipt, configured reference and measured immutable image ID in a new execution binding. Recheck changed final dependencies rather than treating preparation hashes/currentD698/historical image as final. Then the one already-scoped smoke can establish runtime facts with exact exits, closed observations and owned cleanup. Neither this preparation nor its eventual local success establishes shared-platform TLS/issuer/Vault/ED05 acceptance, real provider evidence, a full Replay baton, story Done or release readiness.
