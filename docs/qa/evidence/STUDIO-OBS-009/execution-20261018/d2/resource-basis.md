# STUDIO-OBS-009 D2: resource, volume and drain basis for a guided-enabled runner pod

- **Author:** Gage (@devops). **Date:** 2026-10-18. **Rule (A2.6 a):** pod resources are sized for one replay browser plus one guided browser. The basis is recorded here; **the measurement is owed** (GA plan G-4, owner @devops/@qa in a cluster). Every number below is a STARTING VALUE.
- **Legend:** [V] read from source or from a rendered manifest; [I] inference; [U] unmeasured.

## 1. Pod resources (`studioRunner.guided.resources`, `studioRunner.guided.devShm`)

They replace `studioRunner.resources` and `studioRunner.devShm` only while `guided.enabled` is true (`studio-runner-deployment.yaml`). The rule applied: the single-browser value set of that environment, doubled, because the pod can run one replay browser and one guided browser at once.

| Value set | Single browser (requests / limits / `/dev/shm`) | Guided pod (requests / limits / `/dev/shm`) | Basis |
|---|---|---|---|
| `values.yaml` | 500m, 1Gi / 2, 2Gi / 1Gi | 1, 2Gi / 3, 4Gi / 2Gi | doubled memory and shm, limit CPU 2 to 3 |
| `values-dev.yaml` | 250m, 512Mi / 1, 1Gi / 512Mi | 500m, 1Gi / 2, 2Gi / 1Gi | doubled |
| `values-uat.yaml` | 500m, 1Gi / 2, 2Gi / 1Gi | 1, 2Gi / 3, 4Gi / 2Gi | doubled |
| `values-prod.yaml` | 1, 2Gi / 2, 4Gi / 2Gi | 2, 4Gi / 4, 8Gi / 4Gi | doubled |

- `/dev/shm` is memory-backed and counts against the container memory limit [K]. The chart test keeps it below the limit in every value set (`chart.test.ts`, "sizes a guided pod for a replay browser plus a guided browser").
- UAT's old single-browser pairing, a 2Gi limit with a 1Gi memory-backed `/dev/shm`, looked tight for two browsers [I]. That is why the guided pod raises both.
- **Unmeasured:** actual resident memory of two concurrent Chromium instances under the benchmark load, CPU saturation, and the exec probe's cost on a busy pod. Owner @devops/@qa, in a cluster, in G-4.

## 2. `/tmp` (`studioRunner.guided.tmp.sizeLimit` = 1Gi)

- Holds the guided browser's profile (`mkdtemp(join(os.tmpdir(), 'checks-guided-'))`, `run/browser.ts:544`) and the recording scratch (`.checks-guided-recordings`, `run/recordingScratch.ts:56`). The chart sets **no** `TMPDIR` (ruling Q4, option b), so both resolve to `/tmp` through `os.tmpdir()` [K].
- Disk-backed (`emptyDir` without `medium: Memory`), because a memory-backed volume would count against the 4Gi container limit next to Chromium and `/dev/shm`.
- **The recorder has no byte bound.** Its bounds are attempts, windows and back-off (`evidenceBoundsFrom`, `run/objectStoreFactory.ts:57`), all time. Aria asked this lane to "cite the recorder's byte bound"; there is none to cite. The nominal bound is therefore: `maxSessionSeconds` default 600 s (`GuidedSessionProperties.java:13`) times Playwright's video target bitrate `-b:v 1M` (`playwright-core/lib/coreBundle.js:37095`, version 1.63.0) = about 75 MB for one session's webm [V sources, I arithmetic]. Capacity is one session at a time (A2.6).
- 1Gi is that nominal 75 MB with a wide margin for the Chromium profile and disk cache, which are **unmeasured**.

## 3. Journal volume (`studioRunner.guided.journal`, 256Mi)

- An `emptyDir`, not a PVC (ruling part 1 1.5 b). The path is a subdirectory of the mount (`/var/lib/studio-guided/journal`), never the mount root, and is disjoint from the scratch directory the drain clears (render rule, tested).
- Basis: one journal file plus a permanent `.owner` marker per session, both small and data-free (`guided/journal.ts`, read today) [I]. The `.owner` marker is never removed, so the directory grows by two small files per session over the pod's life. 256Mi is a starting value.
- Disclosed for 010 (ruling part 1 1.5 b): after a pod replacement the journal is gone, and the backend fence alone refuses stale owners.

## 4. Drain: the inequality, recorded (ruling Q5, no `closeGraceSeconds` key)

The guided half of the SIGTERM drain runs concurrently with the replay half, after `pool.beginDrain()` and before `server.close()` (ruling part 1 Q5). Its bound is made of runner constants, which is why Aria ruled out a values key for it:

| Term | Seconds | Source |
|---|---|---|
| Guided close (stop arrival, 3 s graceful, terminate stage) | 14.5 (worst case with the lifecycle callback) | ruling part 1 section 2.2, 2.4 |
| Recording settle: upload window | 15 | `STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS` default, rendered `15000` |
| Recording settle: callbacks | 3 x 10 = 30 | `MAX_RECORDING_CALLBACK_ATTEMPTS = 3` (`guided/evidence.ts:104`), 10 s each (`transport.ts:167`) |
| Back-off | 3 | ruling part 1 Q5 |
| **Guided total** | **62.5, about 63** | arithmetic [I] |

The pod grace is `terminationGracePeriodSeconds` = runtime 120 + stop 15 + delivery 30 + upload 15 + preStop 5 + extra 30 = **215 s** in every shipped value set [V, rendered]. Concurrent, so the binding term is the larger one: 215 is at least 63 + 5 preStop = 68, with 147 s to spare.

`chart.test.ts` ("keeps the guided close inside the pod grace period") asserts, on the rendered pod for every value set, `terminationGracePeriodSeconds - 5 >= 62.5` and `>= STUDIO_RUNNER_DRAIN_TIMEOUT_MS / 1000`. The 62.5 is restated there from the table above, which is the one place the arithmetic lives.

Lane I's harness uses a SIGTERM grace of at least 65 s for the same sum (ruling part 1 I-T1).

## 5. Not claimed

- No measurement of any value in this file. No container was run and no cluster used.
- The 63 s is arithmetic over ruled bounds. It becomes a measurement only through R2's fixtures cases and lane I's I-T2.
