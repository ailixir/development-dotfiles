---
name: tooling-hash-parity-probe
description: Check Java GuidedContracts.hash against runner contracts.hash with no Gradle run; known C0-control escape divergence; stage sync-point cutovers as patch files
metadata:
  type: project
---

To compare backend and runner canonical hashes without Gradle:
- Java: a single-file `Parity.java` run with the toolchain JDK 21 (`~/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home/bin/java`). Classpath: `backend/build/classes/java/main`, `backend/build/resources/main`, and the jackson-core/databind/annotations 2.17.2 jars from `~/.gradle/caches/modules-2`. Call `GuidedContracts.hash/canonical`. Check that the class is newer than the source (`stat`) before you trust it.
- Runner: run `studio-runner/node_modules/.bin/vite-node <script.mts>` with an absolute import of `src/guided/contracts.ts`.

Found in STUDIO-OBS-014 R14 (2026-10-13): the two sides disagree on C0 controls whose `\uXXXX` escape has a hex letter. Jackson writes `\u001F` and JSON.stringify writes `\u001f`. ASCII and non-ASCII text otherwise matched.

**Why:** AR-2 S-5 makes any backend/runner policy-hash mismatch a stop, and it must be fixed at the contract, not on one side.

**How to apply:** include a control-character vector in every new shared hash vector set, and raise any mismatch to the C lane.

Related process lesson: the parallel lanes share one working tree, and root rebuilds `dist/` at earlier sync points (S1/S2) that backend guided ITs spawn. So a cutover ruled "atomic at S3" goes in as a `git apply`-able patch under the lane's evidence dir, verified in a scratch copy with the contract change simulated. It does not go into the tree early. See [[tooling-runner-tiers-coverage]] for `--coverage.reportOnFailure=true`, which keeps the coverage table when an unrelated file fails.
