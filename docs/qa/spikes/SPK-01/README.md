# SPK-01 — LLM gateway capability (R2D2 via the Vertex AI SDK)

**Status:** OPEN. This is the record hook created by story 10.5 (AC-16). Nothing here is verified
against R2D2 yet; every value below is what the stub-tested client currently assumes.

**Register entry:** [studio-staging-spikes.md](../../../architecture/studio-staging-spikes.md) §SPK-01
**Epic dependency:** EPIC-10 `external_dependencies: ED-01`
**Gates:** pilot use of story 10.5, the real compile path in 10.8, story 10.19

---

## Pilot-use gate

The gateway client shipped by story 10.5 is complete against a stub transport. It must not be
pointed at R2D2 — that is, `studio.compile.gateway.enabled` must not be set to `true` in any shared
environment — until every row in *Findings* below is filled in and signed by the accountable owner
(Architecture, with the R2D2 gateway owners).

`studio.compile.gateway.enabled` defaults to `false` in `application.yml`,
`application-local.yml` and `application-staging.yml`, so no action is needed to keep this gate; it
holds by default.

---

## Assumptions the stub-tested client makes

| # | Assumption | Where it lives | Verify by |
|---|---|---|---|
| A1 | SDK artifact `com.google.cloud:google-cloud-vertexai:1.52.0` authenticates to R2D2 from Java 21 / Spring Boot 3.3.5 | `backend/build.gradle.kts` (marked `unverified-against-R2D2`) | Question 1 |
| A2 | R2D2 is reachable as a Vertex REST (`httpjson`) endpoint at an arbitrary base URL, not only at `*-aiplatform.googleapis.com:443` | `VertexAiClientFactory` | Question 1 |
| A3 | 1.52.0 deprecates `com.google.cloud.vertexai.generativeai.GenerativeModel` in favour of the separate `com.google.genai:google-genai` artifact; `com.google.cloud.vertexai.genai.Client` in 1.52.0 exposes agent engines only, not models | `VertexLlmGatewayClient` (`@SuppressWarnings("deprecation")`) | Question 1 — decide which SDK R2D2 actually supports before pilot |
| A4 | A model identifier is addressable as `projects/{project}/locations/{location}/publishers/google/models/{model}` | `studio.compile.gateway.{project,location,model}` | Question 2 |
| A5 | `responseMimeType: application/json` is honoured, or at least not rejected | `VertexLlmGatewayClient.generationConfig` | Question 3 |
| A6 | `temperature: 0` is accepted and forwarded | `studio.compile.gateway.temperature` | Question 4 |
| A7 | gax retries can be disabled (`maxAttempts=1`, empty retryable codes) and are not re-added by the proxy | `VertexAiClientFactory.disableSdkRetries` | Question 5 |
| A8 | The proxy does not log request bodies | — | Question 6 |
| A9 | A slow call surfaces as a gax deadline/socket timeout, distinguishable from HTTP 503, so the client can refuse to retry it | `GatewayFailureClassifier` | Question 7 |
| A10 | HTTP 429 does not carry a usable `Retry-After` through the SDK's httpjson transport, so the client applies its own jittered backoff | `GatewayFailureClassifier.isRetryableStatus` | Question 7 |

---

## Findings

_Fill in during the spike. A negative result is a valid closure; record it and update the register
`Result` line and `ED-01` in EPIC-10._

| Question | Finding | Evidence file | Date | By |
|---|---|---|---|---|
| 1. SDK version, credential type, endpoint/project/location | | | | |
| 2. Reachable model identifiers, token/byte limits, quotas | | | | |
| 3. Structured-output passthrough | | | | |
| 4. `temperature: 0` behaviour and observed variance | | | | |
| 5. SDK auto-retry disablement | | | | |
| 6. Gateway-side logging policy | | | | |
| 7. Timeout and failure shapes | | | | |

**Credentials-issuance reference:** _(ticket id — the credential itself never appears here or in the
repository)_

**Recorded staging exchange:** _(headers redacted; use it to update the WireMock stub shape in
`VertexLlmGatewayClientTest`)_

**Owner sign-off:** _(name, date)_
