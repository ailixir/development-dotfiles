# STUDIO-OBS-009 W1 lane D3.0: StudioRunnerTls API receipt

- **Author:** Dex (@dev, backend). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No dist rebuild. No migration.
- **Scope kept:** API, test CA and API test only. The three runner clients are **not** wired to it (that is W2 lane D3). No production behaviour changed: the one main file is a new class nobody calls yet.
- **Legend:** [V] verified by running or reading; [I] inference, not run.

## Files (sha256 of the final bytes)

| File | sha256 | Lines |
|---|---|---|
| `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerTls.java` (new) | `9a4cd5655e5cb3b1f45872fbc71f70cacdec7dc4207ed8776a96d76530d3f6cf` | 329 |
| `backend/src/test/java/com/citi/put/checks/studio/support/RunnerTestTls.java` (new) | `d6722215d3d7d2ffd417e507eb5811970f24286a7984ac98df5e0cfddaaf1459` | 686 |
| `backend/src/test/java/com/citi/put/checks/studio/dispatch/StudioRunnerTlsTest.java` (new) | `298e7a372eb5055c75bbf3203b318233d6a7c169f5c1458a63ad75aa89db7c33` | 408 |

## IDS log

| Decision | Choice | Why |
|---|---|---|
| Dedicated `SSLContext` builder | CREATE | Nothing like it exists. `GuidedRunnerClient` already takes an `SSLContext` (REUSE the seam, no change). |
| Test certificates | CREATE `RunnerTestTls` using the JDK's own `keytool` | The older ITs shell out to `openssl` and use one self-signed cert for server, client and CA; ruling A4 and lane I need one CA with separate runner/backend identities and a rogue one. No crypto library is on the test classpath and none was added. |
| Server test double | ADAPT the `HttpsServer` pattern of `GuidedServiceTransportFaultIT`, then factored into `RunnerTestTls.serverContext` | One helper for D3's test and I's test. |
| Port-range / exclusive-bind logic | not in this lane | see I receipt |

## The API (what D3 and I code against)

`StudioRunnerTls` (`dispatch` package, final, immutable, thread-safe):

- `StudioRunnerTls.from(Settings)`: builds from files. `Settings(Path keyStore, Path keyStorePasswordFile, String keyStoreType, Path trustStore, Path trustStorePasswordFile, String trustStoreType)`; a blank type means `PKCS12`. Intended property keys (binding added in W2, not now): `studio.runner.tls.key-store`, `.key-store-password-file`, `.key-store-type`, `.trust-store`, `.trust-store-password-file`, `.trust-store-type`. I deliberately did **not** put `@ConfigurationProperties` on `Settings`, so nothing binds or becomes a bean until D3 does it.
- `StudioRunnerTls.fromStores(KeyStore, char[], KeyStore)`: same checks from in-memory stores.
- `sslContext()`, `sslParameters()` (a fresh copy each call: TLS 1.3 and 1.2 only, endpoint identification `HTTPS`), `configure(HttpClient.Builder)` (context plus parameters in one call, so a client cannot get the context without the host-name check), `clientCertificateSubject()`, `toString()` (subject only).
- Fails closed with `IllegalStateException` naming the `Settings` component: nothing configured, missing/empty password file, wrong password (`password rejected`), unreadable store, key store without exactly one private-key entry, client certificate expired / not yet valid / without `clientAuth` EKU, trust store holding a private key or no certificate. Messages carry paths, never a password, key or certificate body. Passwords are read once and zeroed.
- It never reads `javax.net.ssl.*` properties, `cacerts` or the platform default context: trust is only the configured trust store.

`RunnerTestTls` (`support` package), one test CA per JVM (`shared()`, about 2.6 s to generate [V], deleted at JVM exit) or per directory (`create(Path)`):

- Identities: `RUNNER` (serverAuth + clientAuth, SAN `localhost`, `127.0.0.1`, `::1`), `BACKEND` (clientAuth, CN `obs009-backend`), `ROGUE` (self-signed, not issued by the CA).
- Files per identity: `<name>.crt` (leaf then CA, PEM), `<name>.key` (PKCS#8 PEM, mode 0600), `<name>.p12` + `.p12.pass`; plus `ca.pem`, `truststore.p12` (CA only) and `rogue-truststore.p12` (rogue only), each with a `.pass` file.
- Helpers: `backendSettings()`, `settingsFor(identity, trust, trustPass)`, `backendTls()`, `fingerprint256(identity)` (the form Node prints: upper-case hex pairs joined by `:`), `serverContext(identity, trust, trustPass)`, `loadKeyStore`, `leaf`, `keyStorePassword` (test material, never log), `issueVariant(stem, eku, startDate, days)` (about 1.2 s) for negative cases.

## Verification [V]

Collector: `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py <label> --test-tasks test -- test --tests 'com.citi.put.checks.studio.dispatch.StudioRunnerTlsTest' --no-daemon`, under `PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`. Results are in `../execution/<label>-results.json` (sha256 of the file in the right column).

| Label | Total / passed / failed / skipped | sourceStable | distStable | results sha256 |
|---|---|---|---|---|
| `obs009-d3-api01` | 19 / 19 / 0 / 0 (exit 0) | true | true | `04f624d319b1bb3b02df91ee5745b42ff126ca5425b268ed5b01d322f53632e0` |
| `obs009-d3-api02` (final bytes, after I factored `serverContext` out) | 19 / 19 / 0 / 0 (exit 0) | true | true | `d134bc255b14bb94354c00318eca7edf36da1eb13e3a1c8385642eb9d9768c4a` |

`dist` digest before and after, both runs: `897182d5…` (unchanged; no rebuild).

What the 19 cases prove, with real handshakes (not mocks): mutual TLS succeeds and the server sees the backend certificate; the server refuses a client certificate the CA did not issue; the client refuses a server the CA did not issue; trust comes only from the configured store (a client holding only the rogue certificate refuses a CA-issued server); parameters are TLS 1.3/1.2 + `HTTPS` and cannot be weakened through the copy; `configure` applies both; no secret in `toString()`; every fail-closed case above including expired and wrong-EKU certificates; a source check that `StudioRunnerTls.java` contains no `SSLContext.getDefault`, `System.getProperty("javax.net.ssl`, `SSLContext.setDefault` or `HttpsURLConnection`.

Static gates [V], one Gradle run under the lock (log `../lint/obs009-w1-static-gates-gradle.log`): `./gradlew --no-daemon --continue spotlessCheck checkstyleMain checkstyleTest spotbugsMain` = BUILD SUCCESSFUL (spotless covers the whole project). Formatting was applied to my files with the google-java-format 1.22.0 CLI from the Gradle cache (`--skip-reflowing-long-strings`, the spotless setting); `spotlessApply` was not needed or run.

## Not proven / disclosed

- **Host-name mismatch is not proven by a handshake.** I assert that the parameters carry endpoint identification `HTTPS` and that a client built with `configure` has it [V]. That the JDK then rejects a certificate whose SANs do not cover the host is JDK behaviour I did not exercise: it would need a fourth certificate with the wrong SAN. [I]
- **Wiring is W2.** `GuidedRunnerClient` takes only an `SSLContext`, not `SSLParameters`. Passing `tls.sslContext()` to it relies on the JDK HTTP client's default of `HTTPS` endpoint identification when no parameters are set [I, not run]. D3 can add a parameters overload or accept the default; either is its call.

## Batons to W2 lane D3

1. **Tripwire baseline.** `grep -rn 'SSLContext.getDefault' backend/src/main/java/com/citi/put/checks/studio` returns **3** today [V]: `guided/session/GuidedSessionConfiguration.java:94` and `:111` (the two `GuidedRunnerClient` beans, as ruling A4 says) and `guided/translation/GuidedTranslationCoordinator.java:47`. The third is **not** in A4's list of three runner clients: it builds the `HttpClient` the coordinator uses for `controller-origin`, the backend's own API hop. A4's "= 0" cannot hold unless D3 also moves it onto a dedicated context or the ruling exempts it. That needs an @architect decision before D3 starts; I changed nothing.
2. `HttpRunnerDispatchClient` keeps its 3-argument constructor and gains the `@Autowired` TLS constructor (A4); `configure(...)` replaces the `HttpClient.newBuilder()` chain at `HttpRunnerDispatchClient.java` (the `.connectTimeout(...)` stays).
3. `studio.runner.tls.*` binding and `runner-origin` / `studio.runner.base-url` pointing at the runner's https URL are D3's, per A4.
4. The runner certificate must carry serverAuth + clientAuth and SANs covering the Service DNS name (D1.0 section 4, ruling A3/A4). The test CA mirrors that shape.


---

# STUDIO-OBS-009 W2 lane D3: backend fail-closed, `validate()`, DB canary, profile gates

- **Author:** Dex (@dev, backend). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No dist rebuild, no migration, no docker run. Legend: [V] verified by a run or a read, [I] inference.
- **Verdict: GREEN** for the local half of AC-2, AC-3, AC-4 (canary) and AC-5. Owed externally: AC-4 dev-Vault policy test (U5), reported as one named skip.

## Files (sha256 prefix before and after)

| File | before | after | lines |
|---|---|---|---|
| `main/java/com/citi/put/checks/studio/dispatch/StudioRunnerTls.java` | 9a4cd5655e5cb3b1 | aeb3973501558664 | 547 |
| `main/java/com/citi/put/checks/studio/dispatch/StudioRunnerProperties.java` | bc2dc656bac91818 | 47ac8e9f5ddb383c | 144 |
| `main/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClient.java` | 3109936e2729573d | 7eeaa3b49107bc14 | 294 |
| `main/java/com/citi/put/checks/studio/guided/session/GuidedSessionConfiguration.java` | 98e15aa0351c9644 | 183aa6b998f17e42 | 345 |
| `main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationConfiguration.java` | 3d0c1ac367dd50f7 | c06279a35213c8b1 | 166 |
| `main/java/com/citi/put/checks/studio/guided/session/GuidedSessionReaper.java` | 74264a5c4eec1907 | 886889ee7634bf67 | 51 |
| `main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationConfiguration.java` | 0f99e12b18a6f59e | b14e638d3dc0074c | 143 |
| `main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationCoordinator.java` | 54748de0a795e378 | d0e365d51ab5b612 | 204 |
| `main/resources/application.yml` | 272736619835ac43 | 8c7427ef9e53f341 | 449 |
| `main/resources/application-api.yml` | 13016a85f3676bfb | dc64f398da2c84d7 | 18 |
| `main/resources/application-worker.yml` | 5195d5d6e7734370 | bf0c42d16bfdfbb1 | 41 |
| `main/resources/application-prod.yml` | c6da466390874627 | 7e4f389822263caa | 24 |
| `main/resources/application-staging.yml` | 4f6319ec4f2236d7 | 533d530c57e47a98 | 22 |
| `main/resources/application-dev.yml` | b8aee7b549f99473 | 096248359497109d | 34 |
| `main/resources/application-local.yml` | 99fad72e13f1fd96 | e89396c3c714c441 | 97 |
| `main/resources/application-test.yml` | eec357d5cec8d7b8 | c99ac391f0a29211 | 62 |
| `test/java/com/citi/put/checks/studio/support/RunnerTestTls.java` | d6722215d3d7d2ff | ee3e35b7cde2df56 | 747 |
| `test/java/com/citi/put/checks/studio/dispatch/StudioRunnerPropertiesProfileTest.java` | new | e622272720f45a12 | 490 |
| `test/java/com/citi/put/checks/studio/dispatch/RunnerTlsClientCertIT.java` | new | 9537e1649e46fd7b | 848 |
| `test/java/com/citi/put/checks/studio/guided/GuidedScheduledBeansProfileTest.java` | new | 07bfefc019745e8a | 232 |
| `test/java/com/citi/put/checks/studio/secrets/DatabaseCanaryScanIT.java` | new | db530c4d35d17a13 | 454 |
| `test/java/com/citi/put/checks/studio/secrets/VaultPolicyIT.java` | new | 79725cad31982721 | 42 |

Full hashes: `shas.json` is in my scratch; the table above is 16 hex characters. Lane B's concurrent `GuidedEvidenceConfiguration` / `GuidedSessionEvidenceService` change was not touched.

## What changed

- **One identity, four clients.** `StudioRunnerTls` now also has `unconfigured()` (deny-all: no certificate, a trust manager that rejects everything; reads no JVM default), `resolve(...)`, `requireServerIdentity()` and a nested `Wiring` configuration (scanned) that binds `studio.runner.tls` and builds the bean. Dispatch client (`@Autowired` 4-arg ctor, 3-arg kept), validation client (`GuidedPublicationConfiguration`), guided bridge (`GuidedSessionConfiguration`, both the real and the placeholder bean) and the translation coordinator (`GuidedTranslationConfiguration`, 6-arg ctor, 5-arg kept) take it. `grep -rn 'SSLContext.getDefault' backend/src/main/java/com/citi/put/checks/studio` = **0** [V] (was 3).
- **Rule for contexts with no TLS settings (my call, AUTO-DECISION):** `local`/`test` get the deny-all identity and may use `http://`; any other profile (including none) with a configured runner hop (`studio.runner.base-url`, `studio.guided-authoring.runner-origin`, `translation.controller-origin`, or connector port) does not start without the four store/password keys. Partial settings fail in every profile. Reason: the ITs build hundreds of contexts with no runner; a hard requirement would break them, and deny-all fails closed at use.
- **`validate(Environment)`** (`StudioRunnerProperties`) refuses `http://` outside `local`/`test`; `plaintextAllowed(env)` is the one profile test. The old no-arg `validate()` is the unchanged shape check.
- **AC-2 chain:** `GuidedSessionConfiguration.MtlsChain` fails startup (outside local/test, when a guided hop is wired) naming each missing part: API role needs `mtls-required=true`, `service-public-key`, `service-issuer`, `connector.port`; any role with a runner hop needs `controller-token-file`; a controller hop needs `translation.controller-token-file`. A worker needs only the token files.
- **API-pod TLS connector (Gage 3.1):** `GuidedSessionConfiguration.GuidedTlsConnector` (`@Profile("!worker")`) adds a Tomcat HTTPS connector on `studio.guided-authoring.connector.port` (0 = none), `clientAuth` required, TLS 1.2/1.3, key store and trust store = the same `studio.runner.tls` files (one certificate, two roles; `requireServerIdentity()` demands `serverAuth`). `RunnerTestTls.BACKEND` now has `serverAuth,clientAuth`.
- **AC-5:** `@Profile("!api | worker")` on `GuidedSessionReaper` and on the coordinator `@Bean` method (the exact expression of `SchedulingCoordinator`). No `!worker` bean was widened.
- **yml:** `application.yml` gains `studio.runner.tls.*`, `studio.guided-authoring.{mtls-required,service-public-key,service-issuer,connector.port}`; `prod`/`staging`/`dev` set `mtls-required: true`; api/worker/local/test carry comments only.

## Names for D2 (chart) and the runbook

Env var -> property. Files must be mounted read-only; stores are **PKCS12** (type keys exist), passwords are **files**.

| Env var | Property |
|---|---|
| `STUDIO_RUNNER_TLS_KEY_STORE`, `_KEY_STORE_PASSWORD_FILE`, `_KEY_STORE_TYPE` | `studio.runner.tls.key-store`, `.key-store-password-file`, `.key-store-type` |
| `STUDIO_RUNNER_TLS_TRUST_STORE`, `_TRUST_STORE_PASSWORD_FILE`, `_TRUST_STORE_TYPE` | `studio.runner.tls.trust-store`, `.trust-store-password-file`, `.trust-store-type` |
| `STUDIO_RUNNER_BASE_URL` (now `https://`) | `studio.runner.base-url` |
| `STUDIO_GUIDED_AUTHORING_RUNNER_ORIGIN` (no yml placeholder on purpose: presence switches a bean on) | `studio.guided-authoring.runner-origin` |
| `STUDIO_GUIDED_AUTHORING_TRANSLATION_CONTROLLER_ORIGIN` (the API connector's `https://host:port`) | `studio.guided-authoring.translation.controller-origin` |
| `STUDIO_GUIDED_RUNNER_CONTROLLER_TOKEN_FILE`, `STUDIO_GUIDED_CONTROLLER_TOKEN_FILE` | `...controller-token-file`, `...translation.controller-token-file` |
| `STUDIO_GUIDED_MTLS_REQUIRED`, `STUDIO_GUIDED_SERVICE_PUBLIC_KEY` (PEM or base64 SPKI), `STUDIO_GUIDED_SERVICE_ISSUER` | `studio.guided-authoring.mtls-required`, `.service-public-key`, `.service-issuer` |
| `STUDIO_GUIDED_CONNECTOR_PORT` (API pods only; needs its container/Service port and the NetworkPolicy `callback-api` rule) | `studio.guided-authoring.connector.port` |

The backend certificate's SANs must cover the host in the runner's `GUIDED_CALLBACK_BASE_URL` and in `controller-origin`; the trust store must hold the issuer of the runner certificate and of the connector certificate.

## Verification

Collector `run-backend-tasked.py`, PATH N24, shared lock. Counts are total/passed/failed/skipped. Result files are in `../execution/<label>-results.json`.

| Label | Counts | Meaning | results sha256 |
|---|---|---|---|
| `obs009-d3-01` | 130/126/3/1 | red: 3 test-side defects (reflection overload, Tomcat 400 on plaintext, uppercase scheme) | `76ed74ad…` |
| `obs009-d3-02` | 130/129/0/1 | green (lane verify set + VaultPolicyIT) | `458f9ea5…` |
| `obs009-d3-03` | 139/139/0/0 | green regression set (profiles, wiring, dispatch, secrets IT); collector exit 2 = sourceStable:false only | `92440523…` |
| `obs009-d3-04` | 15/15/0/0 | green RunnerTlsClientCertIT incl. real-context connector test | `0791fa6c…` |
| `obs009-d3-05` | 131/130/0/1 | final lane set; collector exit 2 = sourceStable:false only (Gradle exit 0) | `6822a9e7…` |

Lane set: `StudioRunnerPropertiesProfileTest` 44, `RunnerTlsClientCertIT` 15 (12 + 3 in two `@Nested` real-context classes), `StudioRunnerTlsTest` 19, `GuidedScheduledBeansProfileTest` 34 (32 + the real `worker` and `api` contexts), `DatabaseCanaryScanIT` 2, `HttpRunnerDispatchClientTest` 16, `VaultPolicyIT` 1 skipped. [V] counts from `obs009-d3-05` (131 total).
Regression set (`obs009-d3-03`, 139 green): the 3 profile ITs, `ChecksApplicationTest`, translation/production/disabled wiring, `ObservedProfileDriftTest`, `NoRuntimeLlmTest`, dispatch unit tests, `DispatcherIT`, `AcceptanceIT`, `GuidedHttpSecurityIT`, `IdentityBypassProfileGuardTest` (reads the deployed yml), `SchedulingCoordinatorTest`, `StudioSecretsControllerIT`.
Static gates [V]: `spotlessCheck checkstyleMain checkstyleTest spotbugsMain` BUILD SUCCESSFUL (`obs009-d3-static-gates-gradle.log`). A first run failed `checkstyleMain` (WhitespaceAround on `factory -> {}`); fixed with a named no-op.
Tripwires [V]: `SSLContext.getDefault` = 0; `@Disabled` = 6 and `DEFERRED STUDIO-OBS-009` = 0 on the tree as it stands (I add none).

## What the tests prove (not mocks)

- Handshakes against real TLS peers that demand a client certificate: submission, cancel and bridge traffic succeed only with the CA-issued backend certificate and a CA-issued runner; no certificate, a rogue certificate, a rogue server, a certificate for another host (dispatch and bridge, closing D3.0's disclosed gap: `GuidedRunnerClient` via `sslContext()` alone does check the host name [V]), and plaintext in both directions are refused with the handler never reached; the bearer is still required (401 and no-send).
- The coordinator hop presents the backend certificate and the connector accepts it (one certificate, two roles).
- In a real application context all four clients hold the one context; Spring-managed dispatch and bridge reach the double over mTLS.
- In a real application context with `connector.port` set, the guided chain authenticates a call only with certificate plus RS256 JWT (422 from the controller), refuses it with a bad or missing JWT or on the plain port (401), and a client without a certificate cannot connect.
- `validate(Environment)` and context startup under prod/staging/dev/uat/none refuse `http://`; each refusal has a paired acceptance differing in one input.
- Role matrix over the real configuration classes and two real contexts: `worker` builds the reaper and coordinator graph and a reaper pass runs against PostgreSQL; `api` has neither.
- DB canary: after save (plus refused, duplicate and outage saves), accept, dispatch (value reaches the runner double and is erased), admission, STARTED, FINAL and the API read, every column of every `public` base table is empty of 15 forms of the canary (raw, URL, JSON-unicode, hex, Base64 x3 alignments x2 alphabets); coverage asserted (>30 tables, >200 columns, ledger/executions/secret-use audit present); a control table proves the scanner sees text, varchar, jsonb, bytea, text[] and encoded copies.

## Mutation spot-checks [V]

Each mutation applied to the live file under the lock, a focused test selection run, then the file restored byte for byte (sha matched). All 10 killed. Detail: `mutations.json`.

| Mutation | failed | first failing cases | restored |
|---|---|---|---|
| M1-strict-hop-without-tls-starts | 1 | aConfiguredRunnerHopOutsideLocalAndTestDoesNotStartWithoutTlsSettings( | True |
| M2-plaintext-url-accepted-everywhere | 15 | [1] profiles=[prod]; [2] profiles=[staging] | True |
| M3-reaper-profile-removed | 7 | reaper under api,prod: present=false; reaper under api,staging: present=false | True |
| M4-coordinator-profile-removed | 7 | coordinator under api,prod: present=false; coordinator under api,staging: present=false | True |
| M5-connector-accepts-no-client-certificate | 1 | theGuidedConnectorDemandsAClientCertificateAndServesTheBackendCertific | True |
| M6-issuer-not-required | 2 | [3] part=studio.guided-authoring.service-issuer, named=service-issuer; aWorkerNeedsTheTokenFilesButNotTheReceivingHalfOfTheChain() | True |
| M7-dispatch-client-ignores-tls | 1 | submissionAndCancelSucceedOnlyWithTheBackendCertificateAndTheRunnerIss | True |
| M8-coordinator-ignores-tls | 1 | theCoordinatorsControllerHopPresentsTheBackendCertificateAndRefusesASt | True |
| M10-validation-client-ignores-tls | 1 | allFourRunnerFacingClientsHoldTheOneConfiguredContext() | True |
| M9-scanner-blind-to-jsonb | 1 | theScannerReportsAPlantedCopyInEveryColumnTypeAndEveryEncoding() | True |

## ACs (local half)

AC-2 backend fail-closed: startup rule + negative tests (6 parts x API role, worker split) and per-request 401 unchanged (`GuidedHttpSecurityIT` green). AC-3: `validate()`, client certificate on all four clients, connector. AC-4 canary: done. AC-5: done. **Owed:** AC-4 dev-Vault policy test (U5, owner PUT Core/BFF); chart values, mounts, Service/NetworkPolicy port for the connector (D2); certificate issuance in PKCS12 form (Platform/SRE).

## Deviations and disclosures

- `VaultPolicyIT` is **one skipped case by name, no body** (no Vault image cached, pull not authorized, W0). Exact XML name: see `skips-d3-vaultpolicy.json`; QA finalizes entry 8 of `qa/approved-skips.json` from it. Skips via `Assumptions.abort`, not the disabling annotation.
- Red-first: the new classes could not compile before the main change, so there is no pre-change red run. Red evidence is run `obs009-d3-01` (3 failures, all fixed test-side) and the 10 mutations.
- The 3-arg `HttpRunnerDispatchClient` and 5-arg `GuidedTranslationCoordinator` constructors stay for existing tests; they build a client without `.sslContext(...)`, so the JDK applies its default there [I]. No deployed bean uses them. The coordinator's 5-arg form is used by `GuidedPlanningIntegrationTest` and `GuidedPublicationReplayIT`.
- `StudioRunnerConfiguration` (outside my write set) still calls the shape-only `validate()`; the profile rule runs from `StudioRunnerTls.Wiring` instead. Moving the call is optional.
- Not run: `GuidedPublicationReplayIT`, `GuidedPlanningIntegrationTest`, `GuidedBridge*`, `GuidedServiceTransportFaultIT` (heavy, lane I/S own them, see batons).

## Findings for root / @architect

1. The connector port serves the whole servlet app, not only `/internal/v2/studio/guided-sessions/**`; the gate is the client certificate from the private CA. Path scoping is not enforced. Needs a NetworkPolicy rule and an architect view.
2. Backend stores are PKCS12 + password files. PEM-only issuance (as the runner's mounts) needs cert-manager `keystores.pkcs12` or a conversion step (D2 / Platform).
3. D2 must give API pods a container/Service port for `connector.port`, extend egress `callback-api`, and set the https URLs; names above.

## Batons (F-merge / other lanes)

1. **Lane I/S:** `GuidedPublicationReplayIT` builds the Spring-managed `GuidedRunnerClient` against a real TLS runner and relied on `SSLContext.setDefault(TLS)`. It must now also set `studio.runner.tls.key-store`, `.key-store-password-file`, `.trust-store`, `.trust-store-password-file` (its `tls.p12`/`trust.p12`, password `fixture` in a file, or `RunnerTestTls.backendSettings()`), or the bridge calls fail closed. Not run by me. Any new Spring IT that dials a TLS runner needs the same four properties.
2. **QA:** approved-skips entry 8 name = the `name` in `skips-d3-vaultpolicy.json`.
3. **Lane F:** call `DatabaseCanaryScanIT.CanaryScan.hits(jdbc, canary)` after the guided co-run (guided path is not scanned here). Land together: `StudioRunnerTls`, `StudioRunnerProperties`, the four wiring files, the reaper, yml and `RunnerTestTls` (BACKEND now has `serverAuth`).
4. **D2:** names table above; guided-enabled API pods without `connector.port` or the token files now refuse to start outside local/test.
