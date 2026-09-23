# UI Studio plain-English end-to-end validation

- Story: `UI-VALIDATION-20260921`
- Executed: 2026-09-21
- Local orchestration result: **PASS — 3 of 3**
- Real Vertex model result: **NOT RUN — deployment-owned project, endpoint, location, and workload identity are not available locally**
- Deployment target: **Google Gen AI Java SDK 1.72.0 in Vertex AI mode with Gemini 3.8 Flash**
- Scope: accessible, unauthenticated public sites; no restricted target URLs
- Method: created, edited, saved, and ran the tests through the visible Studio interface while monitoring application logs

## Product premise checked

A nontechnical user can describe a browser test in clear everyday language, save it, and run it without writing browser commands or handling implementation details.

For this local validation, Studio used exact recorded model results for the three approved English scenarios. These fixtures validate the authoring, save, variable-resolution, dispatch, browser, evidence, and result lifecycle. They do not substitute for evaluating the quality of the real model integration.

## Current results

| Studio test | Plain-English scenario | Saved and ready | Browser result |
|---|---|---:|---:|
| Example Domain URL Check | Open Example Domain and check the address | Pass | Pass |
| Wikipedia Home URL Check | Open Wikipedia and check the address | Pass | Pass |
| SauceDemo Username Variable | Open SauceDemo, type a reusable value into Username, and check the address | Pass | Pass |

The first two runs completed both steps successfully. The SauceDemo run completed all three steps successfully.

## Variable-backed scenario

The SauceDemo test saved this plain variable:

```text
FORM_TEXT = pipeline-variable-ok
```

The user-facing step was:

```text
Type "<var FORM_TEXT>" in the "Username" field
```

The run opened SauceDemo, entered the resolved value, checked the address, and passed. The author only needed the plain-English step, Save, and Run.

## Lifecycle evidence

- Saving prepared the exact saved version and made it runnable after validation.
- Run remained unavailable only while the saved test was being prepared.
- No preparation, candidate, confirmation, or revision controls were shown to the author. The optional Code tab displayed only the saved runnable source.
- All three executions were dispatched through the running Studio service and completed with `PASSED` results.
- Application startup identified the local model provider as a recorded fixture and did not represent it as a live model call.

## Remaining release gate

The shared-environment configuration must supply the real Vertex project, endpoint, supported location, and application-default workload identity. A release validation must then repeat representative free-form English scenarios against the configured Gemini Flash model. Until that environment-owned validation runs, the evidence above proves the complete local product lifecycle, not real-model quality.
