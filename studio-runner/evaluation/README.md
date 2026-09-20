# Studio inference evaluation

Story10.26 implements a development CLI. It never enables production flags and always reports `releaseReady:false`. The example corpus is a smoke example, not the proposed release-sized or held-out corpus.

From `studio-runner/`:

```sh
npm run build
npm run evaluate -- validate-manifest evaluation/example-manifest.json
npm run evaluate -- oracle-self-test
npm run evaluate -- run /absolute/path/evaluation-config.json /new/evidence/directory
npm run evaluate -- summarize /absolute/path/evidence-bundle.json
```

`oracle-self-test` runs pure oracle checks, real Chromium mutation controls through the production validator/executor/adapter, and a scripted API lifecycle probe. It is not live-model evidence. Build first: the browser probe imports the current compiled runner. A wrong target, missing action, reversed assertion, weakened case, stale identity or contaminated trial cannot become a correct result merely because execution says PASS.

The live adapter requires real v2 API/schema cutover, enabled approved gateway and runner, trusted identities, permitted fixture destinations, and an approved gateway/quota evidence file. It does not replace missing inference with a script. Tokens come only from `STUDIO_EVAL_API_TOKEN` and `STUDIO_EVAL_FIXTURE_TOKEN`; never put them in arguments, source or manifests. Development/live evaluations of synthetic cases explicitly perform candidate confirmation and full execution through normal API routes.

Config fields: `tier:"live"`, `purpose:"development"`, `manifest` path, `apiBaseUrl` (ending `/api/v2/studio`), `executionApiBaseUrl` (ending `/api/v1/studio`), `fixtureControlUrl`, `csiId`, `environment`, `sourceCommit`, `dirtyBaselineDigest`, `pins:{validator,executor,playwright}`, `allowedTargetOrigins`, `approvedGatewayEvidence` path, `maxApiCalls`, `maxTransportCalls`, `maxElapsedMs`, `repetitions`, optional `concurrency`1–8, `orderSeed`, `split`, and execution `configuration`. The gateway evidence file must record `status:"PASS"`, accountable `approvedBy`, positive `quotaUsd` and `quotaEnforced:true`; Gage must verify that declaration against the actual gateway before use. This file is a trusted operator prerequisite, not proof manufactured by the CLI.

Transport reservations conservatively spend9 calls before every compile; baseline and edited requests both count. Total elapsed time bounds all HTTP and polling. Each treatment uses an isolated namespace and fresh full run. A pair builds and verifies its own baseline, resets the fixture, edits the stable IDs, requests FULL or AUTO, confirms, and executes every step. Records include baseline/final usage, actual mode, preservation, identities, runtime pins, outcomes and timings. Missing usage remains null. Evidence is a new immutable manifest, per-trial JSONL, summary and report; repeated IDs and missing trials cannot pass. Summaries group requested modes. Detailed stage metrics require backend telemetry; this harness does not invent unavailable timings.

Exit0 means the requested development checks passed,1 means behavioral checks failed,2 means incomplete evidence/prerequisites/budgets. Any incomplete baseline is retained as an incomplete trial. Intended failures require typed assertion-origin evidence; the current execution API does not expose that field, so such live cases cannot yet score correct. A same-step crash or transport error must never count as the intended assertion failure. Release-sized held-out evaluation, approved-image tests, agreed numeric targets and typed failure evidence remain open gates.

For local fixture hosting, set a synthetic `STUDIO_EVAL_FIXTURE_TOKEN` and run `node evaluation/fixture-server.mjs`. It binds target4100 and separately authenticated control4101 to loopback (override ports with `STUDIO_EVAL_TARGET_PORT`/`STUDIO_EVAL_CONTROL_PORT`). The model sees only the namespace-specific target URL. Reset/snapshot credentials and expected domain events never enter its prompt. The target requires login before saving and records exact account events. Shared environments need an approved equivalent deployment; do not loosen production target policy for this local server.
