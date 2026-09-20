---
name: local-studio-e2e-path
description: What it takes to click Run Test locally and get a real PASSED (WP2, 2026-09-18) — five independent blockers, plus dev.sh hazards for a shared machine
metadata:
  type: project
---

On `feat/studio-v1-harness` (WP2, 2026-09-18), the local UI path to a real run had five separate blockers. Any one alone leaves the UI looking broken for a different reason:

1. `checks.sources.UI_TEST` is false everywhere, so the Studio pages say "not available in this environment" even though the STUDIO feature is on.
2. With the LLM gateway off, every compile ends GATEWAY_UNAVAILABLE, so nothing is ever runnable. WP2 added the opt-in `LocalPassthroughGatewayClient` (local profile only), which accepts steps that are Playwright statements.
3. Local profile with no seed has zero CSIs (they come from Core, and there is no create route), so no test can be created. You need `--seed`.
4. Under `--seed`, the old structured `ui_tests.steps` made `GET /studio/tests` return 400 (fixed in WP2).
5. A non-default Vite port gets `403 Invalid CORS request` on every POST, because the proxy forwards Origin.

**Why:** each of these showed up only by running the UI. None of them was visible from the co-run, which stubs the gateway and seeds its own CSI.

**How to apply:** when verifying Studio locally on this machine, never run `dev.sh` on the default ports. The user's own backend and Vite already hold 8080 and 5173, `dev.sh` kills whatever is on those ports, and it also runs `gradlew --stop`. Use `DEV_BACKEND_PORT`, `DEV_FRONTEND_PORT` and `DEV_STUDIO_RUNNER_PORT`, and run a copy of the script with the `--stop` line removed. Also, `dev.sh` cleanup does not kill the bootRun JVM (the Gradle daemon is its parent) or Vite, so kill those by cwd afterwards. Related: [[fixture-schema-widening]], [[dev-seed-unexercised]].

Chart gap found and not fixed (it was out of WP2 scope): the API Deployment sets neither `STUDIO_CALLBACK_SERVICE_TOKEN` nor the runner URL and token it needs for compile validation.
