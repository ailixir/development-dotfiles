# STUDIO-OBS-009 pre-G9 rulings: F-A (replay child after runner SIGKILL) and pre-Ready `secretUse`

- **Author:** Aria (@architect). **Date:** 2026-10-18. **Mode:** YOLO, docs only. No source, test, chart or git change. `.aiox-core/core/permissions/dispatch-governance.js` untouched.
- **Legend:** [V] verified today by reading the file or the receipt; [I] inference.
- **Inputs:** `../f/receipt.md` (F-A, §9, §10 item 2), `../b/w3/receipt.md` (§3 ADJ-1, finding 3), story `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` AC-1 (and PID-1 a–d), AC-11 (and ADJ-1, j). Source read: `studio-runner/src/run/{child,childRuntime,launcher}.ts`, `studio-runner/src/server/{runCoordinator,config}.ts`, `studio-runner/Dockerfile`, `backend/.../studio/secrets/SecretAuditLifecycle.java`.

| Item | Ruling | Code change before G9 |
|---|---|---|
| F-A | **ACCEPT and CARRY** as `RUN-ORPHAN-01`, owner @dev (runner); in-pod check owner @devops | none |
| secretUse | **ACCEPT and DOCUMENT.** `UNKNOWN_OUTCOME` is conservative and allowed; carry `SEC-AUDIT-PREREADY-01`, owner @dev (runner) | none |

---

## 1. F-A: the replay child outlives a runner SIGKILL

### 1.1 Facts

- [V, F receipt] After a runner SIGKILL, the replay child and its browser tree live until the in-flight step ends: 30.1 s at a 30 s step timeout, 10.0 s and 10.0 s at 10 s. A guided browser dies with the runner in about 0.3 s.
- [V] `child.ts` binds only `message`. Nothing listens for `disconnect`, and nothing polls `ppid`. `launcher.ts` forks with `detached: true` (own process group) and an `ipc` stdio slot.
- [V] `STEP_TIMEOUT_MS` defaults to 30 000. `MAX_STEP_TIMEOUT_MS` defaults to 120 000, with a minimum of 120 000. So on a host the orphan can live for up to the clamped step timeout, which is 120 s or more.
- [I, Node semantics, not run] The child dies at its first `process.send` after the channel closes: Node emits `ERR_IPC_CHANNEL_CLOSED` as an `error` event on `process`, nothing handles it, and the process exits. The first send is `step-finished`, so the orphan does not begin a new step. Playwright's Chromium exits when its pipe to the dead Node closes. This explains why the lifetime equals the step timeout.
- [V, F receipt `runnerKill` and `restart`] The ledger row stays RUNNING, then recovery settles it `ERROR / STALE` after one send and one fork. The new runner process gets 0 admissions and 0 forks. The dead owner's callbacks are refused.
- [V] `Dockerfile:76` is `sh -c "ulimit -c 0 && exec node dist/main.js"`. The story's PID-1 facts say the chart sets `shareProcessNamespace: true`, which makes the pause container PID 1 in a pod.
- [I, @devops to check] In a pod, the runner is the container's main process. When it dies, the runtime ends the container, and for a container that does not own its PID namespace, runc SIGKILLs every process left in the container's cgroup. `detached: true` changes the process group, not the cgroup, so the child and Chromium are killed too. In a plain `docker run` without `--init` the runner is PID 1, and the kernel kills the whole namespace.

### 1.2 What the ACs require

- **AC-11, runner-kill leg:** zero repeated dispatches, unknown actions stop as `UNKNOWN_OUTCOME`, and no incorrectly published ready plan. All three are met [V, F receipt: 0 repeats in 39 runs, settled `STALE`, new process handed nothing]. AC-11 has no "no surviving process after runner death" clause for the replay path. AC-11 j (R10-OBS-1) is about the runner's own `kill()` path reaching the browser tree, not about the runner itself dying.
- **AC-1, one-process model:** this is about one runner process, image, Deployment and TLS listener serving runs, validation and the guided bridge. The replay child is a per-run fork that existed before and still exists under AC-1. Its lifetime after the parent dies is not part of AC-1.
- **Correctness and security in local ACs:**
  - [I] The orphan can only finish the action that was already dispatched before the kill. The backend already counts that action's effect as unknown (`STALE`). No new step starts, because the first send kills the child.
  - Residual [I, not checked]: if one observed step holds more than one browser action, the orphan could run the rest of that step's actions after the runner died. That is still inside the effect window the backend already treats as unknown, and nothing reports it as done.
  - The orphan holds the run's `Execute3` secret values in memory for at most the step timeout. It stays inside the same host or pod trust boundary, and it has no channel to the backend.
  - None of this breaks at-most-once dispatch, audit honesty or the canary results.

### 1.3 Ruling

**Not required in 009. Accept and carry it as `RUN-ORPHAN-01`.**

- Container teardown is the production control, and @devops still has to confirm it.
- On developer and CI hosts the risk is a bounded orphan, up to the clamped step timeout. F's §9 already states this honestly ("No claim that a runner SIGKILL leaves no browser").

Conditions on the acceptance:

1. **G9 wording.** G9 credits the AC-11 runner-kill leg for "zero repeats, settled STALE". It does not credit "no survivor". F's §9 stays as written.
2. **@devops in-pod check.** This rides with PID-1 d on the deployed stack:
   - In a guided-enabled runner pod, start a replay run with a step that never finishes.
   - `kill -9` the runner pid from a debug container that shares the PID namespace.
   - Record that no `node`, Chromium or `chrome-headless` process from that run is left in the pod's namespace or cgroup within 5 s, and that the container restarted.
   - If this check is not run, report it as "unrun, owner @devops", never as a pass.
   - If it shows survivors, `RUN-ORPHAN-01` becomes a GA blocker (GA plan §4.G), not a 009 blocker.
3. **@po placement.** @po places `RUN-ORPHAN-01` as a 009 residue that points to the next runner-hardening work, or to the GA plan §4.G item if no runner story is open.

### 1.4 Direction for the carry (not instructions for 009)

When `RUN-ORPHAN-01` is picked up:

- **Mechanism:**
  - Primary: in `child.ts` `startChild`, add `process.once('disconnect', …)`. It triggers the runtime's existing `stop('CANCELLED')`. Then a hard exit bound of no more than 2 s: `process.kill(-process.pid, 'SIGKILL')` (the child leads its own group because it is `detached`), then `process.exit`.
  - Fallback: a 1 s `process.ppid` poll that applies the same rule if the disconnect is missed.
  - Handle the `error` event on `process`, so the exit is by design rather than by accident.
- **Why an IPC disconnect rather than only a ppid poll:** the disconnect is the kernel closing the socket, so it is immediate and needs no polling. A ppid change can be late, and on Linux the orphan can be reparented to a subreaper.
- **Tests:**
  - A `childRuntime` unit test with a fake channel that fires `disconnect` while a step waits. It asserts that the stop happens, secret slots are cleared, and the exit happens within the bound.
  - A fixtures-tier test against real Chromium that SIGKILLs the parent mid-step and asserts that no process from the child's group is left within 3 s.
  - The F co-run `runnerKill` leg then gains a "no survivors within 3 s" invariant.
- **Trade-off:** small code, but it touches the kill path that AC-11 j and R10-OBS-1 already changed. Doing it before G9 would mean re-running the F and I lanes. Delay cost now is high and the risk is low, so carry it.

---

## 2. secretUse: a pre-Ready recorded revocation audits `UNKNOWN_OUTCOME`

### 2.1 Facts

- [V, B-W3 run 04] The real runner's pre-Ready FINAL for ADJ-1 is `AUTHORIZATION_REVOKED`, accepted on the first attempt. The terminal audit has one USAGE row, `UNKNOWN_OUTCOME`.
- [V] `runCoordinator.ts` sets `secretUse` only on the path where the child returned a result (`:745`). The pre-Ready `ObservedPreReadyFailure` path (`:631`) and `refuseIfCancelled` (`:461`) throw `RunFailure`, and the catch (`:767`) builds the outcome without `secretUse`.
- [V] `SecretAuditLifecycle.replayTerminal` maps every declared secret that is missing from the map to `UNKNOWN_OUTCOME`.
- [V] Secrets reach the child only in `Execute3`, which is sent after Ready. `Launch3` has none. So before Ready, no secret value was in the child and nothing could be typed. `NOT_USED` would be factually true.
- The W2 A1 report-boundary case asserts `NOT_USED` only because its synthetic report said so.

### 2.2 Is `UNKNOWN_OUTCOME` correct?

It is **less precise, but not wrong**.

- `UNKNOWN_OUTCOME` means "the runner did not attest to use". It never under-reports use, so it fails closed for an audit consumer.
- AC-11 and ADJ-1 ask for the `AUTHORIZATION_REVOKED` label on the pre-Ready revocation, and that is met. AC-11's audit requirement is the `REVOKED_MID_RUN` decision row for post-Ready revocation, which this does not touch. No 009 AC asks for `NOT_USED` here.
- There is no security defect: nothing was typed, and the audit does not claim it was.
- The cost is precision. A reviewer could read `UNKNOWN_OUTCOME` as "maybe typed" for a run that provably never had the value.

### 2.3 Who should attest `NOT_USED` (direction for the carry)

| Option | For | Against |
|---|---|---|
| **A. Runner sends it (recommended)** | The runner is the only witness, and it knows whether `Execute3` was sent. It matches the post-Ready path, where `secretUse` is the runner's attestation. The backend needs no change, because `replayTerminal` already accepts the map. | A runner change, plus a rule that it may send `NOT_USED` only when `Execute3` was never sent for the attempt. |
| B. Backend infers it | No runner change. The ledger knows that no `STARTED` was accepted. | A second source of truth for use. It infers a fact the runner is placed to state, and it would have to stay correct if the order of `STARTED` and `Execute3` ever changes. |

### 2.4 Ruling

**Accept and document it for 009. No change before G9.** Carry it as `SEC-AUDIT-PREREADY-01`, owner @dev (runner), with option A. When it lands:

- On every `RunFailure` raised before `Execute3` was sent, the runner adds `secretUse` with `NOT_USED` for every declared secret.
- After `Execute3` was sent, it keeps today's behaviour (missing map, so `UNKNOWN_OUTCOME`).
- The ADJ-1 joined IT then pins `NOT_USED`. It must stop accepting either value.

Notes for G9:

- @qa credits the ADJ-1 leg on the observed fact `UNKNOWN_OUTCOME`, with `AUTHORIZATION_REVOKED` labelled.
- The joined IT's either-value assertion (B-W3 deviation 4) is accepted for 009 only. It is named as weak, and the carry above tightens it.
- The W2 A1 `NOT_USED` case proves only the backend mapping of a runner-supplied value. It does not describe the real runner's pre-Ready behaviour.

---

## 3. Auto-decisions

- [AUTO-DECISION] Should 009 add parent-death handling? → No, carry it (reason: AC-11's runner-kill leg is about dispatch, settlement and recovery, and all of these are met. AC-1 is about topology. The orphan creates no new effect or audit error. A change would reopen the F and I lanes and delay G9).
- [AUTO-DECISION] Should the runner send `NOT_USED` before Ready, or should the backend infer it? → The runner should send it, later (reason: the attestation stays with the only witness, and the backend contract already exists).
- [AUTO-DECISION] Is the @devops in-pod check a G9 blocker? → No. It is reported with PID-1 d as "unrun, owner @devops" if it is not done; survivors would escalate it to GA §4.G.
