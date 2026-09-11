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


### Resolved runtime artifact set behind A1 (QA gate 10.5 MED-001)

Recorded so the spike verifies a known graph, not whatever `1.52.0` happens to drag in on the day.
`google-cloud-vertexai` ships a flattened POM, so its declared dependencies are the whole Google
build's union rather than what the httpjson transport needs. Measured on `runtimeClasspath`:
**186 artifacts before pruning, 159 after** (27 removed, none added).

**Excluded in `backend/build.gradle.kts`** — verified unreachable from the httpjson path, and the
48-test gateway suite re-run green after each exclusion group:

- `com.google.api.grpc:grpc-google-common-protos:2.67.0`
- `com.google.api.grpc:grpc-google-iam-v1:1.62.0`
- `com.google.genai:google-genai:1.47.0`
- `com.google.re2j:re2j:1.8`
- `com.squareup.okhttp3:okhttp:4.12.0`
- `com.squareup.okio:okio-jvm:3.6.0`
- `com.squareup.okio:okio:3.6.0`
- `io.grpc:grpc-alts:1.76.3`
- `io.grpc:grpc-auth:1.76.3`
- `io.grpc:grpc-core:1.76.3`
- `io.grpc:grpc-googleapis:1.76.3`
- `io.grpc:grpc-grpclb:1.76.3`
- `io.grpc:grpc-inprocess:1.76.3`
- `io.grpc:grpc-netty-shaded:1.76.3`
- `io.grpc:grpc-protobuf-lite:1.76.3`
- `io.grpc:grpc-protobuf:1.76.3`
- `io.grpc:grpc-services:1.76.3`
- `io.grpc:grpc-stub:1.76.3`
- `io.grpc:grpc-util:1.76.3`
- `io.grpc:grpc-xds:1.76.3`
- `io.perfmark:perfmark-api:0.27.0`
- `org.conscrypt:conscrypt-openjdk-uber:2.5.2`
- `org.java-websocket:Java-WebSocket:1.6.0`
- `org.jetbrains.kotlin:kotlin-stdlib-common:1.9.25`
- `org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.9.25`
- `org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.25`
- `org.jetbrains.kotlin:kotlin-stdlib:1.9.25`

**Kept deliberately, despite being gRPC:** `io.grpc:grpc-api` and `com.google.api:gax-grpc`.
`PredictionServiceStubSettings.createStub()` evaluates `instanceof GrpcTransportChannel` before it
reaches the httpjson branch, so removing either produces `NoClassDefFoundError` at client
construction. Proved by excluding them and watching every gateway test fail.

**Kept and now pinned by explicit `constraints`** (values are what 1.52.0 resolved and what was
tested; these are `require` constraints, so a higher version requested by a future Vertex pin still
wins — re-review this list whenever A1's version changes):

- `com.google.android:annotations:4.1.1.4`
- `com.google.api.grpc:proto-google-cloud-vertexai-v1:1.52.0`
- `com.google.api.grpc:proto-google-common-protos:2.67.0`
- `com.google.api.grpc:proto-google-iam-v1:1.62.0`
- `com.google.api:api-common:2.59.0`
- `com.google.api:gax-grpc:2.76.0`
- `com.google.api:gax-httpjson:2.76.0`
- `com.google.api:gax:2.76.0`
- `com.google.auth:google-auth-library-credentials:1.43.0`
- `com.google.auth:google-auth-library-oauth2-http:1.43.0`
- `com.google.auto.value:auto-value-annotations:1.11.0`
- `com.google.cloud:google-cloud-vertexai:1.52.0`
- `com.google.code.findbugs:jsr305:3.0.2`
- `com.google.code.gson:gson:2.10.1`
- `com.google.errorprone:error_prone_annotations:2.42.0`
- `com.google.guava:failureaccess:1.0.3`
- `com.google.guava:guava:33.5.0-jre`
- `com.google.guava:listenablefuture:9999.0-empty-to-avoid-conflict-with-guava`
- `com.google.http-client:google-http-client-gson:2.1.0`
- `com.google.http-client:google-http-client:2.1.0`
- `com.google.j2objc:j2objc-annotations:3.1`
- `com.google.protobuf:protobuf-java-util:4.33.2`
- `com.google.protobuf:protobuf-java:4.33.2`
- `com.networknt:json-schema-validator:1.4.0`
- `io.grpc:grpc-api:1.76.3`
- `io.grpc:grpc-context:1.76.3`
- `io.opencensus:opencensus-api:0.31.1`
- `io.opencensus:opencensus-contrib-http-util:0.31.1`
- `org.codehaus.mojo:animal-sniffer-annotations:1.24`
- `org.jspecify:jspecify:0.3.0`
- `org.threeten:threetenbp:1.7.0`

If the spike changes the Vertex version, re-measure this set before the flag is ever set true.

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
