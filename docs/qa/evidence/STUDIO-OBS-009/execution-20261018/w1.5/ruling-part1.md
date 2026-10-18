# STUDIO-OBS-009 W1.5 (lane AR-W1), part 1: D1.0 review and the KL-015-D5 ruling

- **Author:** Aria (@architect). **Date:** 2026-10-18. **Mode:** YOLO, docs only.
- **Binding:** from now on, for lanes D1, D2, D3, I, R2 and F. Root applies the `lanes.json` edits in section 4. I did not edit `lanes.json`.
- **Inputs:**
  - `../d1/launch-contract.md` (sha256 `b94beadb…`, DRAFT) and `../d1/receipt.md`;
  - `../d1/devops-cosign.md` (Gage, same day; I read it because it raises items that are mine to rule);
  - `../pr-rt/receipt.md` and `../pr-rt/probe-results.json` (run 2, taken `2026-10-18T03:57:55Z`);
  - story `STUDIO-OBS-009.story.md`: AC-1 (`:28`), note A2.6 (`:57-69`), AC-3 (`:73`), AC-11 KL-015-D5 a–f (`:347-393`);
  - `../w0/decisions.md`;
  - my T0 rulings `../../prep-20261016/t0-rulings/ruling.md` (A2, A3, A4, A6, A13, C1, C2, §4 D5);
  - the 015 D4 records `STUDIO-OBS-015/execution-20261015/aria-d4-launch-deadline-ruling01/{ruling,ratification,ruling-15s-edge}.md`.
- **What I ran:** `cat -n`, `sed -n`, `awk` line printers, `grep`, `ls` and one `python3 -c` JSON reader over `lanes.json`, all read-only. No build, test, Gradle, install, signal or git command. No source, story or `lanes.json` change. I never opened `.aiox-core/core/permissions/dispatch-governance.js`.
- **Legend:** **[V]** verified today by reading the cited line (`file:line` is today's working tree); **[I]** inference; **[P→R]** a D1.0 proposal ratified; **[P→X]** a D1.0 proposal changed.

---

## 1. D1.0 review

### 1.1 Verdict

**ACCEPTED WITH CHANGES.** The contract is consistent with A2, A3 and A6. The changes are listed in 1.3 to 1.5. Once Dex re-issues the contract with them, it becomes binding for D2, D3, I and F. No second architect review is needed if the re-issue changes only what this file names. Gage's co-sign (`devops-cosign.md`) stands as conditional. Where his items needed a ruling from me, the ruling is in 1.5.

### 1.2 Names: every [P] ratified, none renamed

| # | Name (contract section) | Ruling |
|---|---|---|
| 1 | `STUDIO_RUNNER_TLS_KEY_FILE` (2.3) | **[P→R]** |
| 2 | `STUDIO_RUNNER_TLS_CERT_FILE` (2.3) | **[P→R]**. The probe pin is the **leaf** (the first certificate in the file) (1.5 item g). |
| 3 | `STUDIO_RUNNER_TLS_CA_FILE` (2.3) | **[P→R]** |
| 4 | `STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256` (2.3) | **[P→R]**: the form Node prints, 32 upper-case hex pairs joined by `:`. Any other form is refused, with no normalisation. The name matches the code field `controllerCertificateFingerprint256` [V `transport.ts:50`]. The "certificate as a file" variant Gage offers (§3.5) is **deferred**. Two ways to configure one pin is surface, not a choice. |
| 5 | `STUDIO_RUNNER_GUIDED_WORKER_ID` (2.4) | **[P→R]**. D2 renders it and the backend `translation.worker-id` from one values key (Gage §8 item 1). |
| 6 | `STUDIO_RUNNER_GUIDED_JOURNAL_DIR` (2.4) | **[P→R]**, with the volume ruling in 1.5 item b |
| 7 | `STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER` (2.4) | **[P→R]** |
| 8 | `STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT` (2.4) | **[P→R]** |
| 9 | `STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE` (2.4) | **[P→R]** |
| 10 | `STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL` (2.4) | **[P→R]**. The https-only check moves to startup, with the same predicate as `transport.ts:139` [V]. |
| 11 | `STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE` (2.4) | **[P→R]** (name only; the owner question is Q6) |
| — | "guided key" = every `STUDIO_RUNNER_GUIDED_*` name other than the switch (2.4) | **[P→R]**. A prefix test cannot drift. |
| — | Count 45 + 12 = **57** accepted keys (2.1) | **[P→R]**. D2 fixes the stale sentence at `_helpers.tpl:151`. |
| — | Exit 78 plus a `CONFIGURATION_DENIED <reason>` line (6) | **[P→R]**. Q2 gives the closed reasons. |
| — | Probe pin: the peer certificate's `fingerprint256` equals that of the probe's own certificate (5) | **[P→R]**, leaf only |
| — | A held guided slot is not shown on `/ready` or `/health` (7) | **[P→R]**. The reasoning is in D5 (§2.6). |
| — | `GUIDED_JOURNAL_DIR` disjoint from `SCRATCH_DIR` and `OBJECT_STORE_DIR` (2.4 rule 3) | **[P→R]** (Q3) |

### 1.3 Open questions Q1–Q10

| Q | Ruling | Owner |
|---|---|---|
| **Q1** Should a held slot affect `/ready`? | **No, neither `/ready` nor `/health`, and a held slot never ends the process.** The full reasoning is in §2.6. In short: with one replica (A2.6), a 503 on `/ready` would take the only runner out of the Service. That blocks both replay and the backend's teardown re-sends, which travel through the same Service. After D5, only a confirmed survivor or an unreadable process table can still hold the slot. Both are fail-closed states that an automatic restart loop would not fix. Visibility comes from existing signals: `409 CAPACITY` on `assign` [V `ownership.ts:123`], and the backend's WARN for teardowns still unacknowledged after the re-drive window [V `GuidedSessionService.java:1659-1672`]. | D1 (no code change; one test, §2.8 D1-T3) |
| **Q2** Exit code and text of the guided refusals | **78**, with exactly one stderr line `CONFIGURATION_DENIED <reason>`. The reason comes from the closed list `DEBUG_ENV` (step 3) and `LAUNCH_TREE` (step 5). It is value-free: no path, no variable value. `PROFILE_MISMATCH` (step 4) and a sweep failure (step 7) stay **exit 1** with the existing closed line `GUIDED_WORKER_UNAVAILABLE` [V today, `guidedMain.ts:42`]. **Added:** `main()` gets a top-level rejection handler. Today it is `void main(...)` with no catch (contract 3 step 8 [I]). The handler writes one closed line, `RUNNER_START_FAILED`, with no message, stack or path, and sets exit 1. This makes Gage's "one value-free stderr line per refusal" rule normative (§9 item 6), so `terminationMessagePolicy: FallbackToLogsOnError` is safe. | D1 code and test; D2 image smoke asserts both 78 lines (unrun without R5) |
| **Q3** Journal under the object-store volume? | **No.** The loader enforces that `GUIDED_JOURNAL_DIR` is disjoint, after `realpath`, from `SCRATCH_DIR` and `OBJECT_STORE_DIR`: neither contains the other. Same pattern as `validateObjectStore` [V per contract, `config.ts:537-547`]. Reason: `SCRATCH_DIR` is cleared at start and at the end of the drain [V `application.ts:174`, `:210`]. The object store is shared evidence storage, not per-process state. The journal volume is ruled in 1.5 item b. | D1 (loader); D2 (paths) |
| **Q4** Writable `TMPDIR` | **Gage's option (b), ratified:** a disk-backed `emptyDir` with a `sizeLimit` mounted at `/tmp`, and **no** `TMPDIR` variable. Both guided sites fall back to `os.tmpdir()` [V `browser.ts:544`, `recordingScratch.ts:56`]. Replay sets its child's `TMPDIR` itself (Gage §2.2, `launcher.ts:318-319`, read by him, not by me). D2 cites the size basis from the recorder's byte bound and does not guess it. Option (a) is rejected because it puts guided scratch next to a directory the drain clears. Option (c) is rejected because it is a source change that buys nothing. | D2; D1 contract text 2.5 |
| **Q5** Drain exit code and grace | **Exit 1 if any guided stop was unconfirmed, otherwise 0** (today's `guidedShutdown.ts:5` rule, folded into the one drain [V]). Replay's drain code does not change. **The drain runs the guided half and the replay half concurrently**, after `pool.beginDrain()` and before `server.close()` (`application.ts:184-214` [V]). The guided half is bounded by D5: close ≤ 14.5 s (§2.2), recording settle ≤ 15 s upload window plus 3 × 10 s callbacks plus 3 s back-off ≈ 48 s [V `evidence.ts:104`, `:272-280`, `transport.ts:167`; the window default per contract 2.3], so about 63 s in total [I, arithmetic]. That is below the replay term `derivedGraceSeconds` (≥ 170 s plus preStop plus extra [V `_helpers.tpl:188-197`]). **So there is no `closeGraceSeconds` values key** (Gage §6.4 is overruled on this one point). A key for a value set by constants would be a knob that can drift. D2 records the inequality and its arithmetic in `d2/` evidence instead. | D1 (drain); D2 (evidence only) |
| **Q6** Who writes `GUIDED_CALLBACK_TOKEN_FILE`? | **External. Not D1 or D2 in 009.** I co-sign Gage's refusal of every in-pod minting design (§5.2). A signing key in the pod that renders untrusted pages could also mint `backend-controller` tokens, because the backend verifies both roles against one key [V `GuidedInternalSecurity.java:49-51`, `:196-201`]. A sidecar breaks the one-container bound. A static Secret expires within 300 s [V `:205-210`]. The only design left is an external issuer that refreshes a Secret mounted as a **directory** (no `subPath`). The same issuer must also feed the backend's two controller token files (`application.yml:200`, `:202`, per Gage §5.1). So this is **one** external deliverable, "guided token issuer, three audience-scoped files". **Root registers it as a new prerequisite** (suggested id U21; owner Platform/SRE identity, not ED-02 until someone confirms ED-02). It is needed before G-1 and before any guided-enabled shared environment. It is not needed for the local 009 ACs. D2 makes the guided render `required`-fail on an empty token Secret name. | root (register); D2 (render guard) |
| **Q7** Listener timeouts | **One server-level set for the whole listener, today's guided values: `headersTimeout` 10 s, `requestTimeout` 15 s, socket `timeout` 30 s** [V `transport.ts:127`]. D1's per-request default does not work. `headersTimeout` and `requestTimeout` are server-level in Node, and the route is not known until the headers are parsed [I, Node semantics]. The values also suit replay. Its routes answer at once (health, ready, cancel, admission) or within the 15 s validate budget [V `routes.ts:141-157`, `:168`, `:172`, `:184`], and the bodies are ≤ 8 MiB [V `:161`]. The 30 s socket timeout stays as a backstop **above** the D5 bound, never as the bound (§2.3). | D1; test D1-T1 (§2.8) |
| **Q8** The four required listener keys break the minimal-env `loadConfig` tests | **D1's default, ratified in this form:** the listener keys and the guided keys are in `KEY_SPECS`/`ACCEPTED_KEYS` (so unknown-key refusal and the chart's ⊆ assertion hold). They are validated by two new pure subset loaders, `loadListenerConfig(env)` and `loadGuidedConfig(env)`, on the model of `loadEvidenceConfig` (`config.ts:603-656` per contract). `main` calls both right after `loadConfig`, and their problems are reported in the same `configuration rejected: <problem>` form with exit 78. `loadConfig` itself does not require them, so the existing tests keep passing unchanged. The cross-field rules of 2.4 live in `loadGuidedConfig`. | D1; F counts nothing extra |
| **Q9** `GUIDED_WORKER_ID` vs `INSTANCE_ID` | **Keep both.** Merging them would make the replay admission identity fixed per environment. | — |
| **Q10** The other eleven names | **All ratified** (1.2). | — |

### 1.4 The five gaps root named, each closed

| Gap | Decision | Owning lane |
|---|---|---|
| `CONFIGURATION_DENIED` is never written today [V `guidedMain.ts:42` swallows it] | Written as Q2 rules, by the folded `main`: exit 78, closed reason. The debug-env insists in `createGuidedServer` and `controllerRequest` [V `transport.ts:69`, `:138`] stay as defence in depth. They become unreachable after startup step 3. | **D1** (code, `guidedMode.test.ts` cases for both reasons); **D2** (smoke, unrun without R5) |
| No writable `TMPDIR` in the pod [V `values.yaml:481` read-only root, per contract] | Q4: a `/tmp` disk `emptyDir` with `sizeLimit`, no variable | **D2**; D1 contract text |
| No owner for the callback-token file | Q6: external issuer, one prerequisite for three files; render guard | **root** (register U21); **D2** (guard) |
| Journal dir must not sit under `SCRATCH_DIR` | Q3 loader rule, plus the volume ruling in 1.5 item b (its own `emptyDir`, journal in a subdirectory, never the mount root) | **D1** (loader); **D2** (volume) |
| Required listener keys break the minimal-env tests | Q8: subset loaders; `loadConfig` tests unchanged; `main` tests use one helper | **D1**; harness **I** already passes the keys (`../i/receipt.md` API table) |

### 1.5 Rulings on Gage's co-sign items that were addressed to me

- **a. Rollout strategy `Recreate` when guided is on:** **ratified** (Gage §6.2). RollingUpdate with one replica runs two Ready pods with the same worker id [I, Kubernetes default 25/25]. The cost (replay is also down for the rollout) is the same trade A2.6 d already discloses.
- **b. Journal volume, PVC or `emptyDir`:** **`emptyDir` (pod lifetime), not a PVC.** Gage's fallback condition, that "the backend fence and lease are the sole authority", holds by reading:
  - The backend creates **one** assignment per session, only while the session is `PREPARING`, owner `unclaimed`, with no actions; a repeat returns the same intent [V `GuidedAssignmentStore.java:32-47`].
  - The initial claim must carry the current fence, and another worker may claim only over an expired lease [V `GuidedSessionService.java:979-984`]. A replacement pod therefore replays an intent whose `expectedFence` is already stale once the first pod has claimed. If the first pod died before claiming, nothing ran (zero actions), so the re-claim is legitimate.
  - So the journal's `.owner` marker [V `journal.ts:26-29`] is in-process and restart-scope defence, not cross-pod authority [I, from the three facts above].
  - Disclosed for 010: after a pod replacement the journal is gone and the backend fence alone refuses stale owners.
  - If QA or @devops finds a journal duty that must outlive the pod, it comes back here. It is not assumed.
  - This also removes Gage's RWO-attach concern and the new PVC template.
- **c. One backend certificate in two roles** (Gage §3.1; `transport.ts:149`, `:155` pin the callback **server** with the same fingerprint [V]): **keep one pin in 009.** The backend's runner-facing certificate must carry `serverAuth` and `clientAuth`, with SANs for the API's guided TLS connector host. That host is the same one `GUIDED_CALLBACK_BASE_URL` and the coordinator's `controller-origin` use [I]. **D3:** `RunnerTestTls.BACKEND` gains `serverAuth` and the SANs `localhost`/`127.0.0.1`, so a test callback server can present it. `StudioRunnerTls`'s `clientAuth` check still passes. **D1:** contract section 4 states the dual role. Splitting the pin into two keys is deferred to GA. That needs a new key and a transport change, justified only if Platform PKI cannot issue one dual-EKU certificate (unknown, Platform/SRE).
- **d. Startup EKU self-check** (Gage §3.6): **ratified.** If `TLS_CERT_FILE`'s leaf has an EKU extension without `serverAuth` or without `clientAuth`, the runner refuses with `configuration rejected: …` and exit 78. A leaf with no EKU extension passes. **D1**, one `tlsListener.test.ts` case per branch.
- **e. Rotation** (Gage §3.5): **ratified as contract text.** A certificate rotation is a Secret update, a rollout restart and a fingerprint update in one release. The process reads the files once and the probe reads them on every exec.
- **f. Guided routes when guided is off:** not routed. They answer the replay 404 `{code:NOT_FOUND}` [V `routes.ts:189-190`] before any JWT work. **D1**, one case.
- **g. Probe pin on the leaf** (Gage §4): ratified (1.2 row 2).

---

## 2. KL-015-D5 ruling (AC-11 D5 a)

### 2.1 What the probe established, and why it changes the direction

| Fact | Source |
|---|---|
| With Chrome frozen by `SIGSTOP`, the runtime's `browser.close()` **resolved** in 30 034–30 061 ms on every path (i)–(iii), with 0 frozen processes alive at settle | [V `probe-results.json` `runtimeClose*`] |
| That 30 s is Playwright's `browserProcess.close = closeOrKill(DEFAULT_PLAYWRIGHT_TIMEOUT)`: it races graceful close against 30 000 ms, then `kill()` = process-group `SIGKILL` (`process.kill(-pid)`) and **waits for the leader's exit** | [V `node_modules/playwright-core/lib/coreBundle.js:4594`, `:39831-39848`, `:9409`, `:9430-9433`]. This upgrades PR-RT finding 1 from [I] to [V] for the mechanism. That this call is the one our `context.close()` reaches is [I], consistent with the 30 s figures. |
| The runner's socket `timeout = 30 000` ended the unanswered request with **no HTTP response** at 30 006–30 010 ms | [V `transport.ts:127`; `probe-results.json` `stop.afterSentMs` (i), `afterUnfreeze.start.afterSentMs` (ii, iii)] |
| Slot held 30 s (i), 31 s (iii), 41–42 s (ii) | [V `probe-results.json`] |
| (iv): every reply is pinned to the D4 backstop, launch + 15 035–15 065 ms | [V `probe-results.json` iv-a/b/c; `browser.ts:556`, `:687`] |
| The stop's reply already waits for the close **and** the lifecycle callback (≤ 10 s) | [V `runtime.ts:589-594`; `transport.ts:167` `10_000`] |
| Slot occupancy ends when `browserClosed` becomes true, which is **before** the lifecycle callback | [V `runtime.ts:592` before `:594`; `ownership.ts:47`; `runtime.ts:111`] |
| **Backend:** a stop send has its own 15 s ceiling. `teardownAttempt` re-sends up to 2 more times on `UNKNOWN_OUTCOME`, with the same idempotency key `teardown-<hash(body)>`. **Only a normal return after a validated runner 200 marks `teardownStatus CONFIRMED`.** Otherwise the row stays `PENDING` and the reaper re-drives it every 10 s for 15 min. | [V `GuidedRunnerClient.java:349-361`; `GuidedDispatchService.java:316-331`; `GuidedSessionService.java:29`, `:2741-2779`, `:1633-1652`; `GuidedSessionReaper.java:18-21`, `:36-41`]. I read these only to rule the reply rule. The D5 e record stays lane BL's. |
| On the runner, a re-sent stop with the same key **joins** the first stop's promise | [V `transport.ts:98`, `:113`] |

**Consequence.** "The close never settles" was not reproduced for this wedge. What does hold is a bound that is too long: Playwright's 30 s timeout, which collides with our own 30 s socket timeout. A wedge that `SIGKILL` cannot clear (a process in an uninterruptible state) was not produced. For that case the D4 survivor rule already fails closed. The direction recorded at T0 (§4 of the T0 ruling: "a bounded graceful close, then D4's `hardTeardown`") is confirmed. The bound is ours, set well below both 30 s timeouts. Playwright's own bound is not the one we rely on.

### 2.2 The close bound

**Rule D5-1: one two-stage close for a launched guided browser.**
1. **Graceful stage**, only for a session whose start **completed** (`startPhase === 'STARTED'`): `context.close()`, raced against the new constant `GUIDED_CLOSE_GRACE_MS = 3_000`.
2. **Terminate stage, always:** D4's `hardTeardown` on this launch. That is the argv-marker selection of direct children, deepest-first `SIGKILL`, a second listing, the survivor check ≤ 500 ms, and scratch removal [V `browser.ts:678-697`, `tree.ts:362-392`]. After a graceful close that resolved, this pass is the postcondition check. It costs two `ps` listings of about 15 ms each [V `tree.ts:67-71`] and kills a lingering direct child such as the video encoder.
3. **Survivors, or an unreadable process table:** the close rejects `CONTEXT_LOST`. `browserClosed` stays false, so the slot is held (D4 ratified, unchanged).

`GUIDED_CLOSE_GRACE_MS` is a constant, not a configuration key, for the same reason as D4's (a value set in configuration could drift).

**Bound.** "Settled" means the instant the close promise settles. With K = the terminate stage, K ≤ 1 500 ms on a readable table [I: two listings + ≤ 500 ms survivor poll + `rm`]:

| Path | Settles at most | Probe today |
|---|---|---|
| (i) started-session close (stop, expiry, lease loss, browser loss) | stop arrival + 3 000 + K ≤ **4 500 ms** | 30 039 ms |
| (ii) start failure after launch (`WITHHOLD`, `BLANK_MATCH`, `BOOTSTRAP_CALLBACK`; deadline or not) | failure instant + K. **No graceful stage.** Deadline path: ≤ start + 13 500 ms | start + 40 890 to 42 059 ms |
| (iii) non-deadline launch failure (the graceful `cleanup()` path) | failure instant + K. **No graceful stage:** the catch always takes `hardTeardown` | start + 30 996 ms |
| (iv) stop before spawn | **unchanged:** backstop (t0 + 15 000) + K | 15 035–15 065 ms |

**Why no graceful stage on (ii) and (iii):** it is D4's principle, extended. A start that failed has run no step, so its recording has no admitted step to lose [I]. Under D4 the start's 3 s reserve is for the teardown and the reply [V `guidedBrowser.ts:23-34`], and 3 s of grace would spend all of it. One rule ("graceful only after `STARTED`") needs no clock arithmetic.

**Why 3 s:**
- Replay's ordered-close grace is 5 s [V `config.ts:348-353`; `runCoordinator.ts:48`].
- Under the reply rule (2.4), the worst-case stop reply is G + K + 10 s for the lifecycle callback, which must stay below the backend's 15 s per send. With G = 3 s that is 14.5 s; with 5 s it would be 16.5 s. 3 s is the largest round value that fits.
- **Guard on the assumption:** a healthy recorded close must finish well inside G. R2 measures it (case H, §2.8). If the healthy maximum exceeds 1 500 ms on the fixtures host, R2 stops and returns here. A too-short grace would cut healthy recordings to `orderlyClose:false`.

### 2.3 Socket timeout versus close bound

**The close is capped below the socket timeout. The socket timeout is not raised.** It stays at 30 s (Q7).

**Invariant.** The longest guided handler that waits on a teardown must reply before 30 s. After D5 that handler is (iv): 15 000 + K + a lifecycle callback ≤ 10 000, so ≤ about 26.5 s [I, arithmetic]. Every other path replies within 14.5 s.

Raising the socket timeout was rejected. A reply after 15 s reaches a backend that has already given up on that send, so it buys nothing. It would also keep dead connections open on the one replica longer.

### 2.4 The reply rule, per path

**Rule D5-2: a stop, or a refused start, replies only after its close has settled. It is never sent before the teardown completes.**
- A **200 on `stop` means "confirmed dead".** The backend acts on exactly that meaning: only a validated runner 200 marks `teardownStatus CONFIRMED` [V `GuidedSessionService.java:2744-2773`]. Replying before the teardown would let the backend confirm over a browser that may still be running. That breaks D5 b's first constraint, transposed to the backend.
- This keeps the ordering the 15 s-edge ruling kept: close, then the lifecycle callback, then the reply (`ruling-15s-edge.md` §3, first row).

| Path | Request answered | Reply | Within the backend's 15 s? |
|---|---|---|---|
| (i) | `stop` | 200 after confirmed dead. 409 `CONTEXT_LOST` on a survivor (D4 ratified) | **Yes:** ≤ 4.5 s + callback (≤ 14.5 s worst) |
| (ii) | `context` (the start) | 409 `CONTEXT_LOST` after terminate + callback. A `stop` that arrives meanwhile joins `entry.stopping` [V `ownership.ts:163`] and gets the same settle. | **Yes** on the deadline path with a responsive controller: ≈ 12.0 s + K + callback. With a dead controller (`BOOTSTRAP_CALLBACK`), the lifecycle callback can push the reply past 15 s. The backend then sees plain `UNKNOWN_OUTCOME`, which it treats like `RUNNER_CONTEXT_CLOSED_REFUSAL` (`ruling-15s-edge.md` §2, ACCEPTED). The slot is already free by then (2.5). |
| (iii) | `context` | as (ii) | yes, failure + K + callback |
| (iv) | `context` and `stop` | **unchanged** (pinned to the backstop) | no for `context`, already ACCEPTED (`ruling-15s-edge.md` §1, case b). For `stop`, see 2.7. |

**No wire, schema, OpenAPI or vocabulary change.** `CONTEXT_LOST`, the `TIMEOUT`/`CANCELLED` causes and the four `GuidedLossReason` values are unchanged. The D4 budget, reserve and backstop are unchanged, and so is the backend's 15 s. D5 b holds as written.

### 2.5 Slot release against the backend's 15 s ceiling

**Rule D5-3: the slot is released exactly when the close is confirmed (`browserClosed = true` after terminate succeeds). It is never released at reply time, never earlier, and never on a survivor.** This keeps `runtime.ts:592`'s position before the lifecycle callback.

| Path | Released at most | Against the 15 s ceiling |
|---|---|---|
| (i) | stop + 4.5 s | well inside |
| (ii) deadline | start + 13.5 s | **inside**: a backend retry or the next session's `assign` after its own 15 s finds the slot free |
| (ii) non-deadline, (iii) | failure + 1.5 s | inside |
| (iv) | t0 + 15 s + K | at the ceiling (accepted, 2.7) |
| survivor / unreadable table | never: process end only | fail closed (D4) |

[I, not checked] What the backend does with a `409 CAPACITY` on `assign` is unchanged by this ruling. D5 only shortens the window in which it can happen.

### 2.6 Does a held slot affect `/ready`?

**No** (the Q1 answer).

- `/ready` stays "able to admit replay safely; false only while draining" [V `routes.ts:147-157`].
- A held slot never flips `/ready` or `/health` and never exits the process. With A2.6's one replica, a 503 would remove the only endpoint. The backend's teardown re-sends travel through that endpoint and would be cut off, together with all replay.
- Liveness must not become the mechanism by accident (Gage §4 item 5, agreed).
- What remains is a confirmed survivor, which an automatic restart does not cure, or an unreadable `ps`, which startup already guards [V `main.ts:98-102` per contract]. The operator route is a rollout restart.
- The SIGTERM drain then exits 1 (Q5).

### 2.7 The (iv) overshoot of about 60 ms past 15 s

**ACCEPT. No change**, because D5 b keeps the D4 backstop.

- **`/context` reply at launch + 15 054–15 065 ms:** this is exactly `ruling-15s-edge.md` case (b), already ACCEPTED. The backend's plain transport `UNKNOWN_OUTCOME` is handled like the runner's closed refusal on every start path (§2 there).
- **`stop` reply:** it overshoots its own 15 s only if the stop arrives in the first ~40–65 ms of the launch [V iv-a/b arithmetic: reply at 15 035/15 038 ms after launch entry]. The backend's first re-send, with the same key, joins the runner's pending stop and receives the 200 at the backstop instant [V `GuidedSessionService.java:2753-2762`, `transport.ts:113`]. So teardown is confirmed on attempt 2 of 3, and the slot is released at the backstop either way.
- **Rejected alternatives:**
  - reply before the slot is released (breaks 2.4);
  - shorten the backstop or the budget (D5 b; `ruling-15s-edge.md` §3, rows 3–4);
  - skip the late-launch wait when nothing has spawned (Playwright can still spawn Chrome until its own timeout [V `browser.ts:542`, `:682-687`]; releasing earlier could release over a Chrome that appears later).

### 2.8 Implementation instructions and tests

#### Lane R2 (runner; write set per `lanes.json`, plus `guidedBrowser.ts`, which this ruling needs)

**Code:**
1. `run/guidedBrowser.ts`:
   - Add `export const GUIDED_CLOSE_GRACE_MS = 3_000`, with a doc comment that cites this ruling, the 14.5 s reply arithmetic and "constant, not a knob".
   - Add to `GuidedBrowser`: `readonly terminate: () => Promise<void>` (hard teardown of this launch: kill, survivor check, scratch) and `readonly orderlyClosed: () => boolean` (true only if the graceful stage resolved within the grace). Internal types only.
2. `run/browser.ts`, in `launchGuidedBrowser`:
   - `terminate` = a memoised `hardTeardown(acquired)` (`teardown ??=`).
   - `close()` = memoised. It sets `closed = true`, races `acquired.close()` (settled outcome swallowed) against `GUIDED_CLOSE_GRACE_MS`, records `orderly`, then **always** `await terminate()`.
   - `disposeScratch` is memoised so it runs once (it is called from both stages).
   - The `catch` path (`:661-677`) **always** takes the `hardTeardown` branch. Delete the graceful `cleanup()` branch (`:673-676`), so (iii) is bounded. The `!acquired` case keeps D4's late-launch wait unchanged (it returns at once when the launch has already rejected [V `:686-691`]).
   - `handle.close()` and `handle.dispose()` go through the bounded `close()`.
3. `guided/runtime.ts`, in `closeResources`:
   - If `this.startPhase === 'STARTED'`, await `browser.close()`; otherwise await `browser.terminate()`.
   - `orderlyClose = browser !== null && browser.orderlyClosed()`.
   - `releaseWhenLaunchSettles` (`:603-609`) uses `late.terminate()`.
   - The order `browserClosed = true` → `await disposal` → lifecycle callback stays as it is (`:592-594`).
4. `guided/ownership.ts`: **no change** (the reply-after-settle and slot rules already hold through `stopEntry`/`occupied`). `tree.ts`: **no change** (R1 owns it; the selection is unchanged per D5 b).
5. `vitest.config.ts`: the A13 comment fix, unchanged from T0.

**Unit tier** (fake timers, as in D4; `runtime.test.ts`, `ownership.test.ts`, `browser.test.ts`):

| Id | Case | Assert |
|---|---|---|
| U1 | (i) graceful close never settles | `terminate` called exactly once, at t = 3 000. `stop` stays pending until `terminate` resolves, then resolves. Next `assign` is accepted. `orderlyClosed()` is false. |
| U2 | (i) graceful close resolves at 100 ms | `terminate` still runs (postcondition). Slot released. `orderlyClosed()` is true, so the recording settles orderly. |
| U3 | (i) `terminate` rejects (survivor, injected) | `stop` rejects `CONTEXT_LOST`. Next `assign` gets 409 `CAPACITY`. A repeat stop returns the same rejection. |
| U4 | (ii) × `WITHHOLD`, `BLANK_MATCH`, `BOOTSTRAP_CALLBACK` (deadline and non-deadline) | `close` never called, `terminate` called once. The start rejects `CONTEXT_LOST`. `startFailure.phase` is preserved (REL-001 line unchanged). |
| U5 | (iii) a throw inside the launch after the context exists | `GuidedLaunchFailure.close` is the hard teardown. `context.close()` is never awaited. |
| U6 | (iv) | the existing D4 instants (12 000 / 13 000 / 15 000) unchanged: no edit to those tests |

**Fixtures tier** (real Chromium, `SIGSTOP` on the group, new `test/fixtures-tier/guidedCloseBound.test.ts` plus `helpers/guidedLaunch.ts` lifted from the probe). Before/after `ps -axo pid,ppid,command | grep checks-guided` listings are read-only, and the test signals only its own children:

| Id | Case | Assert |
|---|---|---|
| F1 | (i) frozen after start, then `stop` | Close settles ≤ 4 500 ms after the stop. The stop **replies 200** in < 15 000 ms (with the stub controller, < 6 000). Next `assign` is accepted. 0 frozen processes alive. |
| F2 | (ii) frozen entering `WITHHOLD` (one phase is enough in this tier; all three are U4) | Close settles ≤ deadline + 1 500. `/context` 409 `CONTEXT_LOST` in < 15 000 ms. Slot free after. |
| F3 | (iii) the recording-`ready` throw used by the probe | Settles ≤ failure + 1 500. `/context` 409 in < 15 000 ms. |
| F4 | (iv) one variant (iv-a) | Stop reply at launch + 15 000 … 16 500. The slot is free after it. |
| H | healthy recorded close, 5 iterations, unfrozen, one navigation | Graceful close completes, `orderlyClosed()` is true, the webm has a header. **Record the max duration in `r2/`.** Assert max < 3 000 ms; if max > 1 500 ms, R2 returns to @architect (2.2 guard). |
| M | mutation checks (recorded, then reverted) | (M1) `close()` reverted to the unbounded graceful close → F1 red (≈ 30 s). (M2) graceful close restored on the start-failure path → F2 red. (M3) survivor check removed from `terminate` → U3 red. (M4) slot released at reply instead of at terminate → U3 red. |

**The probe file.** `guidedCloseProbe.test.ts` (about 4 min per fixtures run) is **replaced** by `guidedCloseBound.test.ts`.
- R2 **deletes** it in the same change set in which `guidedCloseBound.test.ts` first goes green, before R2's lane exit, not at F-merge.
- Its evidence stays under `pr-rt/` (the test's sha256 `281510cd…` is recorded in `pr-rt/receipt.md`).
- No exclusion mechanism is added in between. Any full fixtures-tier run before R2's exit pays the 4 min.

**D5 f:** KL-015-D5 stays reported **open** until R2's cases are green **and** the F-merge `dist` rebuild is recorded (AC-12 i).

#### Lane D1 (the fold)

- **D1-T1** (`tlsListener.test.ts`): the folded listener has `headersTimeout` 10 000, `requestTimeout` 15 000 and `timeout` 30 000 (Q7). One replay route and one guided route on the same server object.
- **D1-T2** (`drain.test.ts`): the guided half and the replay half drain concurrently. An unconfirmed guided stop gives exit code 1; a clean one gives 0 (Q5).
- **D1-T3** (`routes.test.ts` or `guidedMode.test.ts`): with a held guided slot (fake ownership with an occupied entry), `/ready` is 200 and `/health` is 200. The `/ready` body has exactly the four existing fields (Q1).
- Plus the 1.3/1.4/1.5 items: subset loaders, the two `CONFIGURATION_DENIED` reasons, `RUNNER_START_FAILED`, EKU check, journal disjointness, guided routes 404 when off.

#### Lane I (backend harness and ITs)

- **I-T1:** for guided-enabled runners the harness's SIGTERM grace is ≥ **65 s** (the Q5 guided drain arithmetic, about 63 s, rounded up). A guided IT's clean teardown asserts exit code 0 and `escalatedToForce == false`. A forced kill is recorded, never silently accepted.
- **I-T2** (joined, credited only on the F-merge `dist` digest; in `GuidedBridgeIntegrationTest`, or in lane F's `ObservedCoRunIT` if that class cannot reach the session teardown path; record which):
  - Start a guided session. Freeze its browser with a new harness method `freeze(pids)` (`SIGSTOP` only on pids from `survivingGuidedBrowsers()` of the harness's own tree; same safety rules as `kill9`). End the session through the backend's normal path.
  - Assert: the **first** stop send returns 200 within 15 s (no `UNKNOWN_OUTCOME`); `teardownStatus` is `CONFIRMED`; a second session's `assign` is accepted; `survivingGuidedBrowsers()` is empty; `teardownReport().assertNoSurvivors()`.
  - Not run against the old `dist`: it cannot start with the listener keys (`../i/receipt.md`, "Cross-checks").

### 2.9 Security

- No relaxation. A slot is released only after a confirmed kill, so D5 b holds and the slot never opens over a live browser.
- Kill selection is unchanged (direct children with this launch's markers; argv is never logged).
- Every bound shrinks. No wire or vocabulary change.
- One residual is stated, not new. After a graceful close **resolved**, the postcondition pass sees only direct children. A renderer orphaned by the leader's exit is outside D4's ratified selection. Playwright's own kill is process-group wide [V `coreBundle.js:9409`], but nothing of ours verifies the graceful branch. This is unchanged from today, where a resolved close is the only confirmation. Widening the selection is not ruled here (D5 b).

---

## 3. Trade-offs considered (D5)

| Option | Verdict | Why |
|---|---|---|
| **A. Two-stage close (3 s graceful after STARTED, then always terminate); start failures terminate at once** | **chosen** | Every path is bounded below 15 s except (iv), which was already accepted. Healthy sessions keep orderly video. One postcondition. No wire change. |
| B. Keep Playwright's 30 s and raise the socket timeout to 45 s | rejected | Replies still arrive after the backend's 15 s. The slot is held 30–42 s. It depends on a library default. |
| C. Always terminate, no graceful stage | rejected | Every normal session end loses orderly video (OBS-013 evidence). |
| D. Reply 200 on stop at once, tear down after | rejected | The backend would mark `CONFIRMED` over an unconfirmed browser (2.4). |
| E. A held slot flips `/ready` or exits the process | rejected | It cuts the only endpoint (A2.6) and restart-loops on survivors (2.6). |

---

## 4. `lanes.json` edits for root to apply (part 1 only)

- **R2 `writes`:** `studio-runner/src/run/guidedBrowser.ts` loses its "(only if the D5 ruling needs it)" qualifier; it needs it.
- **R2 `verify` (fixtures line):** replace `test/fixtures-tier/guidedCloseProbe.test.ts` with `test/fixtures-tier/guidedCloseBound.test.ts`. Add `exit` text: "probe file deleted; H max recorded".
- **D2 `writes`:** no PVC template; `values*.yaml` gain a `/tmp` and a journal `emptyDir`, and no `closeGraceSeconds`.
- **I `writes`:** unchanged. I-T2 is a case in `GuidedBridgeIntegrationTest`, already listed. `RunnerProcessHarness.java` gains `freeze` (same lane).
- **D3 `writes`:** `RunnerTestTls.java` (already listed) for `BACKEND` serverAuth+SANs (1.5 item c).

## 5. Not claimed

- No test, build or probe run by me. Every bound above is a ruled value plus [I] arithmetic. It becomes [V] only through R2's F/U cases and the H measurement.
- The Playwright mechanism is [V] for the code path. That our `context.close()` reaches that path is [I], consistent with the probe's 30.03–30.06 s.
- The backend teardown reading is mine, for this ruling only. Lane BL's D5 e record is still owed.
- One host, one wedge type (`SIGSTOP`), as PR-RT's limits state. A `SIGKILL`-proof wedge stays covered only by the fail-closed survivor rule.
