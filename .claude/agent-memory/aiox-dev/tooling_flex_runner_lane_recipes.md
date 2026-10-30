---
name: tooling-flex-runner-lane-recipes
description: STUDIO-FLEX-001 Lane B (studio-runner domain whitelist, egress proxy deleted, guided capacity) - test-fixture traps, which fixtures reds are pre-existing, run recipes
metadata:
  type: project
---

Done 2026-10-25. New module `studio-runner/src/allowedDomains.ts` (vectors-conformant); tests share `test/helpers/allowedDomains.ts` (`TEST_DOMAINS=['localhost','example.test']`, `FIXTURE_ORIGIN`, `LOCAL_DOMAIN`).

- **Fixture traps after the whitelist:** live pages must be reached as `localhost` (IP literal can never be an entry); Chromium then asks `/favicon.ico`, so every fixture server that counts visits/receipts must ignore it (observed-replay, guided-wire); a custom child module written by a test (`startChild(process, domains, {...})`) needs the domains arg; `.mjs` workers cannot import the TS helper; `createBrowserObservationSession` fakes need `page.url()`; launch requests need `allowedDomains` and, for `observedNavigateBlank`/adapter, `observedScope`.
- **Off-list page now waits 15 s in `observe()`** (RETURN_WINDOW_MS) and throws `OriginNotAllowed(host)` instead of in-page SCOPE_DENIED; a test that previously proved SCOPE_DENIED on a live off-list page now takes 15 s (secret-login approved-exclusion).
- **Pre-existing fixtures reds (not caused by this lane, same code path before/after):** guided-dataflow "former exact-rule page" (read profile exports business text), observed-authoring-snapshot `aria-labelledby` customer match, observed-replay-privacy `unresolved-name` READY vs REFUSED. observed-bootstrap-process-tree `LIVE_TREE_CHANGED` is a load flake (host load 16+), green alone.
- **pgrep/setsid on macOS:** vitest's title becomes `node (vitest)`, so `pgrep -f "vitest run"` misses it; wait on the PID from `ps -axo pid,etime,command | grep vitest`. No `setsid`, no `timeout`.
- **Fixtures tier side effects again:** 136 new untracked evidence files (native-fixtures/r1 and STUDIO-OBSERVED-NEXT/.../native-runs) + 22 rewritten tracked STUDIO-OBS-007/013 evidence JSON; snapshot `git status --short --untracked-files=all docs` before, delete the new ones after, `git checkout --` the rewritten evidence JSON.
- Deployment tier: `STUDIO_RUNNER_IMAGE=fb9b13073a52` gave 775/775 with Lane D's chart.
- Capacity fixture: `test/fixtures-tier/guided-capacity.test.ts` runs real `GuidedOwnership` with 3 Chromium + recorder; return-window fixture serves app on `localhost` and the "IdP" on `127.0.0.1` from one server.
