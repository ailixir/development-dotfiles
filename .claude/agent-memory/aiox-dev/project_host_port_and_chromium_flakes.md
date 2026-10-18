---
name: host-port-and-chromium-flakes
description: Dev-host flake sources found in 012A run 4 - macOS port-0 allocator lands on loopback-specific listeners (Horizon client holds 127.0.0.1:49216), and Chrome for Testing can deadlock at startup (fork/atfork)
metadata:
  type: project
---

Host facts found during STUDIO-OBS-012A run-4 triage (2026-10-13), verified with live probes:

1. macOS here uses sequential TCP ephemeral ports (`net.inet.tcp.randomize_ports: 0`). A dual-stack wildcard bind to port 0 (Java `new ServerSocket(0)`, Zonky's port detection) can return a port that another process holds on ONE loopback address only. The Omnissa Horizon client holds `127.0.0.1:49216` (and 65358) all day. Zonky got 49216, the postmaster bound only ::1, and JDBC to `localhost` reached Horizon ("Gave up waiting for server to start after 10000ms"). A postmaster that binds `localhost:P` also shadows a Docker-published `*:P`, which produced `FATAL: role "test" does not exist`. Docker Desktop's own port allocation skips held ports.
2. Chrome for Testing 153 (Playwright chromium-1243) can deadlock at launch. The forked child blocks in `xpc_atfork_child` → pthread mutex, and the parent sits in `wait4`. The profile dir gets only the pre-written Preferences file, and the processes survive as orphans. In GuidedPlanningIntegrationTest this showed up as "callback never arrived in 10s".

**Why:** these look like product or load flakes but are host/third-party issues. Fix 1 lives in LocalEmbeddedPostgresConfig (ports 20000–32767, exclusive probe on both loopback addresses). Issue 2 has no repo fix, because bounding browser launch would be a product deadline change.

**How to apply:** for a "role does not exist", "Gave up waiting", or connection EOF on localhost, run `lsof -nP -iTCP:<port>` first. For a guided bootstrap timeout, run `ps` for orphan "Google Chrome for Testing" processes and check whether their `checks-guided-*` profile holds only Preferences. Related: [[tooling-replayit-diagnostics]], [[shared-scratch-and-gradle-lock]].
