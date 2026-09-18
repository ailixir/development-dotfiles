---
name: vertex-sdk-r2d2-constraints
description: Non-obvious constraints of google-cloud-vertexai 1.52.0 when pointing it at the Citi/R2D2 proxy — endpoint, retries and the deprecated generative-model surface
metadata:
  type: project
---

Findings from story 10.5, verified by spike against a WireMock stub (not against real R2D2 — ED-01
still open as of 2026-09-10):

- `VertexAI.Builder.setApiEndpoint(x)` formats the value as `x:443` and has no hook to disable gax
  retries. To target a custom base URL (including plain `http://` for a stub) and to switch retries
  off, build `PredictionServiceClient` from `PredictionServiceSettings.newHttpJsonBuilder()` and
  inject it via `setPredictionClientSupplier`. `setLlmClientSupplier` must also be set or
  `VertexAI.close()` tries to create an LlmUtilityServiceClient and demands ADC.
- gax's httpjson `normalizeEndpoint` prefixes `https://` only when the value has no `://`, so
  `http://localhost:PORT` works for stubs.
- The REST path is
  `/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`.
- `RetrySettings.setLogicalTimeout` does bound a slow call and surfaces as a timeout distinguishable
  from HTTP 503 — so "never retry a timeout" is implementable.
- `ApiException` from the httpjson transport does **not** carry response headers, so HTTP 429's
  `Retry-After` is unavailable; the message is a short status phrase like "Bad Request", not the
  gateway's body.
- 1.52.0 **deprecates** `com.google.cloud.vertexai.generativeai.GenerativeModel` / `ResponseHandler`.
  The replacement is the separate `com.google.genai:google-genai` artifact;
  `com.google.cloud.vertexai.genai.Client` in this artifact exposes agent engines only, not models.

- The POM is **flattened**: `google-cloud-vertexai` declares the union of the whole Google build
  (~45 artifacts — full gRPC stack, shaded Netty, xDS, Conscrypt, `google-genai`, okhttp, kotlin),
  not what the httpjson transport needs. Most of it can be excluded by group/module (story 10.5 cut
  runtimeClasspath 186 → 159). **But `io.grpc:grpc-api` and `com.google.api:gax-grpc` cannot** —
  `PredictionServiceStubSettings.createStub()` evaluates `instanceof GrpcTransportChannel` *before*
  it reaches the httpjson branch, so removing either is a `NoClassDefFoundError` at client
  construction. Everything else, including `google-genai`, is safely excludable: every
  `com.google.genai` reference in the jar is confined to the unused
  `com.google.cloud.vertexai.genai.*` package.

**Why:** architecture §4.1 mandates the Vertex AI SDK rather than a bespoke HTTP client, which makes
these API limits load-bearing design constraints rather than trivia.

**How to apply:** when touching `studio/compile/gateway/` or picking an SDK for R2D2, start from
these constraints instead of re-spiking. Confirm all of them against real R2D2 via SPK-01
(`docs/qa/spikes/SPK-01/README.md`) before anything sets `studio.compile.gateway.enabled=true`.
