---
name: local-guided-stack
description: How the local real-stack guided learn/replay was provisioned on 2026-10-24 without touching repo source (overlay launcher, token issuer, Core stand-in, policy seed)
metadata:
  type: project
---

Local guided stack (user decision 2026-10-24 "Provision locally, re-run") lives in the session scratchpad dir `.../scratchpad/guided/` (outside the repo): `relaunch.sh` (runs `dev-guided.sh`, a dev.sh copy that merges `runner-extra.json` into the runner's private env JSON and exports `SPRING_CONFIG_ADDITIONAL_LOCATION=backend-guided.yml`), `mint-tokens.mjs serve` (3 RS256 JWTs, 240 s, refreshed 30 s), `local-core.mjs` (:8081 stand-in for Core /users/me, cookie `put_session=local-dev-session`), `seed_guided.py` (tests + policy + SQL approval), `smoke_learn.py` / `smoke_replay.py`.

**Why:** dev.sh runs the runner via `env -i` plus a helper-generated env, so guided/observed keys cannot be injected by env vars; finalize/publication re-checks Core with the browser's put_session cookie, which does not exist locally; the embedded Postgres is recreated on every relaunch (tests/policy are lost).

**How to apply:** after any relaunch run `seed_guided.py` (needs the Zonky port from stack.log; policy approval is a SQL insert because the dev identity bb12345 is also the author). Trusted policy needs only structural discovery for link/button checks; example.com no longer has an h1 (2026-10-24), so heading assertions end BUDGET_EXCEEDED by design. Vertex shows 429 and 50 s TRANSPORT_STALL retries (learn took 284 s for 2 steps).

**Relaunch 2026-10-25 (proof = replay, V27/V28):** runner now requires `STUDIO_RUNNER_GUIDED_CAPACITY` (added to `gen-config.mjs`, value 1 = backend `max-concurrent-sessions`); without it the runner exits 78 at startup. `dev-guided.sh` runs `npm run build` itself, so the dist is rebuilt on each launch (use Node 24 PATH). The catalog `schemaBundleHash` must be regenerated via `gen-config.mjs` after any runner change; the hash quoted in a request can be stale, so compare against `studio-runner/dist/runtime-versions.json`. Local-core stand-in path is `/api/v1/users/me` (not `/users/me`). Parent pid is the `dev-guided.sh --seed` whose ppid is 1; stop it with SIGTERM on that exact pid (drained in about 5 s).

**Relaunch 2026-10-25 22:49 (allow-all-domains ON):** `gen-config.mjs` now pins `STUDIO_RUNNER_ALLOW_ALL_DOMAINS:'true'` and backend `allow-all-domains: true`. Relaunch with `nohup bash relaunch.sh > stack.log 2>&1 < /dev/null & disown` (no `setsid` on macOS). Runner stdout WARN lives in `$TMPDIR/put-checks-studio-runner.*/studio-runner.log` (path printed in stack.log). Runner :8090 does not answer plain http/https curl (health is checked by dev.sh); confirm via the `runner.started` JSON line. `guidedMain.js` pid 44737 (Oct 10) is another session's stale process, leave it.
