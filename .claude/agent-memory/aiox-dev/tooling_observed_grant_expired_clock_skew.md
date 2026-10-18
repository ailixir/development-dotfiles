---
name: tooling-observed-grant-expired-clock-skew
description: Trigger error "observed execution grant expired" (studio_observed_execution_guard line 82) in a long gate means a JVM-vs-Docker-VM clock skew after host sleep, not a cached or aged grant
metadata:
  type: project
---

Diagnosed in STUDIO-OBS-012A authz-grant lane (2026-10-13). StudioAuthorizationIT failed 26/27 in root's full check with `JpaSystemException ... observed execution grant expired ... studio_observed_execution_guard() line 82`. The cached-grant hypothesis was false.

Discriminator: `acceptCore -> ObservedReplayAuthorization.bind -> check()` refuses a grant whose expiresAt is not after the JVM clock, in Java (`GuidedSessionException AUTHORIZATION_EXPIRED`), ms before the INSERT. So a grant that really aged never reaches the trigger. A trigger-side "expired" means Postgres `clock_timestamp()` (Docker Desktop VM clock) disagreed with the JVM (host clock). Line 82 also fires when `issuedAt > clock_timestamp()`, i.e. the DB clock is behind.

Cause: the laptop slept 12:36:53-12:50:01Z (`pmset -g log`), and the class started 5 s after DarkWake. The probe reproduced the exact signature with the authorizer clock at +2 s and at +788 s.

**Why:** chasing fixture caching wastes hours. Grants are minted per `authorize()` call, and no test caches one.

**How to apply:**
- Line up the class start timestamps (sorted XML `timestamp`) against `pmset` Sleep/DarkWake. A multi-minute hole right before the failing class is the tell.
- Guest-stamped logs are in `~/Library/Containers/com.docker.docker/Data/log/vm/01-docker.log*`.
- Do not relax the trigger or the TTL.
- Recommend re-running the gate under `caffeinate`.
- Related: [[tooling-replayit-diagnostics]] item 6, [[shared-scratch-and-gradle-lock]].

Update 2026-10-13 15:32Z (dex-r8): two ProgressCallbackIT fixture INSERTs (`observedReportOwner` -> `publishedRetry`) tripped line 82 with NO pmset Sleep/Wake entry that hour, and the VM clock matched the host at 1 s resolution. Rerun 2 min later was 21/21 green. The fixture mints `issuedAt=Instant.now()` and inserts at once, so a few ms of DB-clock lag is enough (inference, not measured at ms resolution — busybox `date` has no %N). Rerun before attributing.

Update 2026-10-13 (dex-r9, ruling R9): grants are now minted and judged on the DB clock (`DatabaseClock`, `SELECT clock_timestamp()`) in both observed factories, and the test fixtures mint from `GuidedPublicationMigrationTest.databaseNow(jdbc)`. After R9, a line-82 refusal on the accept path means a Prepared/binding not produced by the factories, or a fixture still using `Instant.now()`. JVM skew is no longer the cause. Pinned by `ObservedGrantClockIT`.
