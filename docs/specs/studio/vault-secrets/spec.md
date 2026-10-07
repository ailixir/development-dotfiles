# Spec: Studio secrets go to Vault, test-scoped

> **Story ID:** studio-vault-secrets
> **Complexity:** not assessed (phases 2, 3 skipped by request)
> **Generated:** 2026-09-22
> **Status:** Draft (rev 2: @qa critique auto-fixes applied 2026-09-22, see `critique.json`; @architect phase-6 rulings in §9.1, plan in `implementation.yaml`)
> **Inputs:** `requirements.json` (same folder). Every item below cites an FR/NFR/CON/ASM or a code location.

---

## 1. Overview

Right now a Studio secret is saved as plaintext in the DB `secrets` table (`SecretsService.java:42`), but the run path reads only Vault (`VaultStudioReferenceResolver`). So a saved secret can never be resolved at run time. This spec makes Vault the only store. Secrets are scoped by CSI, environment and test id. The save path, the list and the run-time lookup all use one path template. Everything stays off by default (`provider: none`).

### 1.1 Goals
- Save writes the value to Vault only. Drop the DB table and remove its code (FR-1, FR-5).
- The Vault path includes `{testId}`. Save, list, preflight and resolve use the same path (FR-2, FR-3, FR-4).
- Remove the `resolve-secret` stub (FR-6).
- With provider `none`, fail clearly with 503. Connecting Vault needs env vars only (FR-7, FR-8).
- The frontend picker is test-scoped and stores the secret **name** as `secretId` (FR-9).

### 1.2 Non-Goals
- Production secret-use policy (V6, PUT Core). The platform Vault connection and token policy (V7, platform / ED-02). Both are CON-2.
- Rotating, replacing or deleting a secret from Studio (OQ-1). Cleaning up the Vault subtree when a test is deleted (OQ-2).
- Migrating existing DB rows or legacy `secretId` values (ASM-3, edge case in requirements).
- Turning on `STUDIO_CAPABILITIES.vaultSecrets` (CON-1).

---

## 2. Requirements Summary

| ID | Requirement | P |
|----|-------------|---|
| FR-1 | Value goes to Vault KV v2 only. Never stored in the DB. | P0 |
| FR-2 | Path = csi / env / testId / kind / name. Save and run use the same path. | P0 |
| FR-3 | Create is test-scoped. CSI and env come from the persisted test row. | P0 |
| FR-4 | List = KV v2 metadata LIST under the test prefix. Returns names only. | P0 |
| FR-5 | V25 drops `secrets`. Remove the `com.citi.put.checks.secrets` package. | P0 |
| FR-6 | Remove `POST /api/v1/internal/resolve-secret`. | P0 |
| FR-7 | Provider `none` → 503 `VAULT_NOT_CONFIGURED`. No fallback. | P0 |
| FR-8 | Env-var-only activation. Startup validation for the new template. | P0 |
| FR-9 | Frontend picker is test-scoped and stores the name as `secretId`. | P0 |
| FR-10 | Fix misleading comments and docs. | P1 |

| ID | NFR |
|----|-----|
| NFR-1 | Value is never logged, returned, persisted outside Vault, or put in a URI. |
| NFR-2 | `char[]` end to end, erased on every exit path. Serialized body buffer zeroed after send. Residual is stated. |
| NFR-3 | Write needs `canWrite` on the test's CSI. List needs `canRead`. Absent test = unauthorized = 403. |
| NFR-4 | Reuse the existing bounded transport: timeouts, max bytes, no redirects, token file. |
| NFR-5 | Not-configured, outage and absent are three different answers. |

Constraints: CON-1 … CON-7. Assumptions: ASM-1 … ASM-4 (see `requirements.json`).

---

## 3. Technical Approach

### 3.1 Code findings this design rests on

| # | Finding | Location |
|---|---------|----------|
| F1 | The compile step declares a secret reference as `secretId ?? name`. The resolver passes that string to Vault as `referenceName`. | `CompileInputs.java:67`, `VaultStudioReferenceResolver.java:68-74,99-104` |
| F2 | The `<secret ID>` token grammar is `[A-Za-z0-9_.-]{1,64}`. It matches a declaration by `secretId`, then by `name`. | `VariableReferenceValidator.java:38,91` |
| F3 | Today `SecretInput` stores the DB UUID (`created.id`) as `secretId`. That value can never match a Vault key the resolver looks up. | `SecretInput.tsx:52-58`, `SecretDto.java` |
| F4 | The Vault segment guard rejects `/`, `\`, `.` and `..`. | `HashicorpStudioVaultProvider.segment` |
| F5 | A secret with no valid `allowedOrigins` cannot be filled anywhere. | `SecretOrigins`, `HashicorpStudioVaultProvider.read` |
| F6 | Acceptance calls `references.preflight(test.getCsiId(), test.getEnvironment(), …)` and has the `test` row. The dispatcher calls `references.resolve(csiId, environment, …)` and has `testId` from the execution row. | `StudioAcceptanceService.java:230`, `StudioDispatcher.java:264,311` |
| F7 | `application-dev.yml:30` and `application-local.yml:79` hard-code `provider: none`. That overrides `${STUDIO_VAULT_PROVIDER:none}` in `application.yml:203`. | same |
| F8 | `CsiOwnershipEvaluator.canRead/canWrite` exist. `StudioService.requireRead/requireWrite` apply them, and an absent test is answered with the same 403. | `CsiOwnershipEvaluator.java:24,36`, `StudioService.java:127-153` |
| F9 | `IdempotencyFilter` covers `/api/v1/studio/**` and caches **response** bodies only. `RateLimitFilter` buffers request bodies only for bulk routes. | `IdempotencyFilter.java`, `RateLimitFilter.java:102` |
| F10 | `VAULT_UNAVAILABLE` (503) already has a handler. `StudioValidationException` maps to 400 `{error, message}`. | `ChecksExceptionHandler.java:177-185,198` |
| F11 | The frontend has no global MSW handler for secrets. Only test-local handlers exist. The capability flag says "Disabled means unavailable, never simulated". | `SecretInput.test.tsx:18`, `pageSaveAndStop.test.tsx:57`, `studioCapabilities.ts` |
| F12 | The wizard renders `SecretInput` without checking `vaultSecrets`. The Studio page does check it. | `UiTestConfig.tsx:136`, `ChecksStudioPage.tsx:1236,1250` |
| F13 | `ui_tests.environment` is NOT NULL. | `UITest.java:67-68` |
| F14 | The repeatable seed inserts 2 rows into `secrets`. The `dev` profile and `StudioSeedIT` apply `db/seed` after the versioned migrations, so after V25 that INSERT fails on every fresh database. | `db/seed/R__sample_data.sql:315-328`, `application-dev.yml:9-12`, `StudioSeedIT.java:50` |
| F15 | A test entity maps `@Table(name = "secrets")`. There is no `@EntityScan`, so every `@SpringBootTest` scans it under `ddl-auto: validate`. Two smoke tests also pin the table and its indexes. | `smoke/entity/SecretSmokeEntity.java:11`, `application.yml:11`, `SchemaSmokeTest.java:88-91`, `IndexCatalogTest.java:50-51` |
| F16 | `StudioContractTest` requires every springdoc `/api/v1/studio/**` operation to be declared in `docs/specs/studio/openapi.yaml`. It pins the declared operation count (21) and each operation's status set. Existing Studio routes name the path variable `{id}`. | `StudioContractTest.java:90-101,330-362,732-755`, `StudioController.java:73-211` |
| F17 | The Helm chart pins the **old** template and always passes it to the api and worker pods as `STUDIO_VAULT_PATH_TEMPLATE`. | `helm-chart/put-checks/values.yaml:643`, `templates/deployment.yaml:140-141,524-525` |
| F18 | The platform `ObjectMapper` has `FAIL_ON_UNKNOWN_PROPERTIES` disabled. `@JsonIgnoreProperties(ignoreUnknown = false)` alone does not reject unknown fields. Strict boundaries parse with a mapper copy that enables the feature. | `StrictInternalBodyReader.java:13-29`, `StudioAuthoringValidation.java:29-30` |
| F19 | The frontend `apiClient` logs every request's `config.data` when `APP_CONFIG.debugMode` is on. `.env.development:4` turns it on, and `window.__CHECKS_CONFIG__.debugMode` can turn it on at runtime. A normalized error keeps `error.response`, whose `config.data` is the request body. GETs are retried twice on 5xx. | `apiClient.ts:30-35,85-105`, `appConfig.ts:42-50` |

### 3.2 Decisions

| # | Decision | Trace |
|---|----------|-------|
| D1 | **Path template** default: `studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}`. For a secret this renders `studio/60406/Production/<testUuid>/secrets/LOGIN_PW`. `{kind}` is kept so the existing `ReferenceKind` split does not collide variables with secrets. | FR-2, user V3 |
| D2 | **Startup validation** requires the `{csiId}`, `{environment}`, `{testId}`, `{kind}` and `{referenceName}` placeholders, and the template must **end with** `/{referenceName}`, with that placeholder appearing once. The list prefix is the template minus the last segment. The existing relative-path, https and token-file checks stay. | FR-8, FR-4 |
| D3 | **Secret name = `secretId`.** A name must match `^[A-Za-z0-9_.-]{1,64}$` and must not be `.` or `..`. Both the backend and the frontend enforce this. There is no separate label field. | F1–F4, CON-4, FR-9 |
| D4 | **Write semantics: create-only.** `POST {addr}/v1/{mount}/data/{path}` with body `{"options":{"cas":0},"data":{"<valueKey>":"…","allowedOrigins":"<normalized, comma-joined>"}}`. If Vault answers 400, the provider reads `/v1/{mount}/metadata/{path}`. If the metadata exists → `SecretAlreadyExistsException` (409). Otherwise → `VaultProviderUnavailableException`. Success returns `data.version`. | FR-1, ASM-1, OQ-1 |
| D5 | **`allowedOrigins` is required on create.** It is a JSON array in the request. Each entry is normalized through `SecretOrigins.parse(String.join(",", list))`. The result must be non-empty, at most 16 entries and at most 512 chars each. The normalized list is stored in the exact comma-joined form the reader parses. | F5, CON-5 |
| D6 | **Value bounds:** 1–8192 chars, of any content. [AUTO-DECISION] Upper bound? → 8192 (reason: 8192 UTF-16 units ≤ 24 KiB of UTF-8, plus up to 16×512 origin chars, stays under the 64 KiB `max-response-bytes` that the same entry must pass through on read, NFR-4). Vault's JSON encoder can escape a character to 6 bytes (`<`). Even then, 8192×6 + 16×512 + envelope ≈ 57 KiB < 64 KiB. If an operator lowers `STUDIO_VAULT_MAX_RESPONSE_BYTES`, stored secrets can become unreadable, and the runbook entry says so. | NFR-4 |
| D7 | **List:** `LIST {addr}/v1/{mount}/metadata/{prefix}` (sent as `GET …?list=true`, the documented equivalent of the LIST verb). Vault 404 → empty list. Keys ending in `/` are skipped. Keys that fail the D3 name rule are skipped, because a step cannot reference them. The result is sorted. It uses the same bounded read as `read`. | FR-4, NFR-4, ASM-1 |
| D8 | **Provider seam:** add `record VaultScope(String csiId, String environment, String testId)`. `read(kind, scope, name)` replaces the 4-arg form. Add `create(VaultScope, String name, char[] value, List<String> origins) → String version` and `listSecretNames(VaultScope) → List<String>`. `DisabledStudioVaultProvider`: `read` → empty (unchanged behaviour); `create`/`list` → throw the new `VaultNotConfiguredException`. | FR-2, FR-7, NFR-5 |
| D9 | **Resolver:** `StudioReferenceResolver.preflight/resolve` gain a `testId` parameter. Acceptance passes `test.getId()`. The dispatcher passes the execution row's `test_id` (F6). `StudioSecretUseAuthorization.mayUse` stays keyed `principal|csi|environment` (CON-1: dev config unchanged). A declared secret id that fails the D3 name rule (e.g. a legacy `vault://…` or UUID-with-slashes value) is refused **before** the provider is called: `UnknownReferenceException` at acceptance and `ReferenceUnavailableException` at dispatch. Without this, `HashicorpStudioVaultProvider.segment` turns it into 503 `VAULT_UNAVAILABLE`, which wrongly reads as an outage (NFR-5). | FR-2, V4, CON-4, NFR-5 |
| D10 | **Endpoints**: new `StudioSecretsController` (`@Profile("!worker")`, `/api/v1/studio/tests/{id}/secrets`; the path variable is named `{id}`, like every other Studio route, so the contract paths match springdoc (F16)) and `StudioSecretsService` in `studio.secrets`. Authorization reuses the F8 pattern: load the test through the visibility-restricted `findById` (the same one save/delete use), then `canRead` (list) or `canWrite` (create). An absent test or a denied CSI → `StudioAccessDeniedException` (403). CSI, env and testId come from the row only. | FR-3, NFR-3, CON-6 |
| D11 | **Errors**: 503 `VAULT_NOT_CONFIGURED` (new handler), 503 `VAULT_UNAVAILABLE` (existing), 409 `SECRET_ALREADY_EXISTS`, 400 `INVALID_SECRET_REQUEST` / `INVALID_SECRET_NAME` / `INVALID_SECRET_VALUE` / `INVALID_SECRET_ORIGINS` (via `StudioValidationException`). No message carries the value, and parser messages are **not** echoed: `INVALID_SECRET_REQUEST` has a fixed message. **Strict body:** the controller takes the POST body as `byte[]` and does not let Spring bind it. The service authorizes first (D10), then parses the bytes with a mapper copy that enables `FAIL_ON_UNKNOWN_PROPERTIES` (the `StrictInternalBodyReader` pattern, F18). It parses from the bytes directly, never through `new String(...)`. Malformed JSON, or an old client body with `label`/`scope`, becomes 400 `INVALID_SECRET_REQUEST`, not a silent partial. An annotation alone would not do this (F18). | FR-7, NFR-1, NFR-3, NFR-5, F10, F18 |
| D12 | **Value handling**: `record CreateStudioSecretRequest(String name, char[] value, List<String> allowedOrigins)` with `toString()` overridden to omit the value. The service zero-fills the received body `byte[]` and `value` in `finally`. The provider serializes the Vault body with a Jackson generator (writing `char[]`) into a buffer it owns (not a plain `ByteArrayOutputStream`, whose internal array would be a second, unerased copy), sends it with `BodyPublishers.ofByteArray`, and zero-fills that buffer in `finally`. The residual (Jackson recycled buffers, servlet/HttpClient transient buffers) is stated in javadoc, as `Resolved` does (AC-15 note). | NFR-2 |
| D13 | **Response never echoes the value.** Because of that, caching by `IdempotencyFilter` is safe (F9). That filter caches 5xx responses as well as 2xx. A client that retries a 503 with the **same** `Idempotency-Key` gets the cached 503 back. `SecretInput` sends no `Idempotency-Key`. | NFR-1 |
| D14 | **Config (V7)**: `application-dev.yml` and `application-local.yml` change to `provider: ${STUDIO_VAULT_PROVIDER:none}`. `application-test.yml` stays `none`. The default stays `none` everywhere. Required env vars to connect: `STUDIO_VAULT_PROVIDER=hashicorp`, `STUDIO_VAULT_ADDRESS`, `STUDIO_VAULT_TOKEN_FILE`; optional: `STUDIO_VAULT_NAMESPACE`, `STUDIO_VAULT_MOUNT`, `STUDIO_VAULT_PATH_TEMPLATE`, `STUDIO_VAULT_VALUE_KEY`. **Helm (F17):** `values.yaml` `studioVault.pathTemplate` changes to the D1 template. If it kept the old one, D2 would refuse to start every deployed pod the moment `provider: hashicorp` is set. `studioVault.provider` stays `none` in every values file. | FR-8, F7, F17, CON-1 |
| D15 | **Frontend picker**: `SecretInput` gets a `testId: string \| null` prop. When `null`, the select is disabled with the helper text "Save the test before adding secrets" (page) or "Select a Studio test first" (wizard). The list is fetched per `testId`. The dialog fields are **Name**, **Value** (password) and **Allowed origins** (one per line, or comma-separated). **Label**, **Scope** and **last4** are removed. On 201 the component selects `{id: name}` and clears the value state. Error text is keyed on `error` code: `VAULT_NOT_CONFIGURED` → "Vault is not connected for this environment."; `SECRET_ALREADY_EXISTS` → "A secret with this name already exists for this test." **No value in logs (F19, NFR-1):** `createSecret` sends a request-config flag (e.g. `redactBody: true`) that `apiClient` honors. The debug request log then omits `data`, and the normalized error for that request drops `response.config.data`. The list call sets `__doNotRetry`, so a 503 `VAULT_NOT_CONFIGURED` is not retried. | FR-9, D3, D5, D11, NFR-1 |
| D16 | **Wiring**: the page passes its persisted test id (`selectedScenario`, i.e. `params.id` once saved) and `null` for an unsaved draft. The wizard passes `formData.uiTestId`. The wizard's "Secret" option **and** any existing `kind: 'secret'` row's picker are gated by `STUDIO_CAPABILITIES.vaultSecrets`, the same as the page (F12). With the flag off, an existing secret row renders the page's "unavailable" text instead of `SecretInput`. The flag stays `false`. | FR-9, CON-1, F12 |
| D17 | **No global MSW handler** for the new routes. Tests use local handlers (F11). The flag is off, so dev mode never calls these routes. | F11, CON-1 |
| D18 | **Environment is read at write time from the row.** If the author later changes the test's environment, secrets written under the old environment are not visible and do not resolve. This is intended scoping, and the UI list reflects it (F13, edge case). | FR-2, FR-3 |

### 3.3 Endpoint shapes

```
GET  /api/v1/studio/tests/{id}/secrets
  auth: canRead(test.csiId)
  200 {"data":[{"name":"LOGIN_PW"},{"name":"SSO_TOTP_SEED"}]}
  401 | 403 STUDIO_ACCESS_DENIED | 503 VAULT_NOT_CONFIGURED | 503 VAULT_UNAVAILABLE

POST /api/v1/studio/tests/{id}/secrets
  auth: canWrite(test.csiId)
  body {"name":"LOGIN_PW","value":"…","allowedOrigins":["https://login.app.example"]}
  201 {"name":"LOGIN_PW","version":"1","allowedOrigins":["https://login.app.example"]}
      (no Location header: there is no single-secret GET to point at)
  400 INVALID_SECRET_REQUEST | INVALID_SECRET_NAME | INVALID_SECRET_VALUE | INVALID_SECRET_ORIGINS
  401 | 403 STUDIO_ACCESS_DENIED | 409 SECRET_ALREADY_EXISTS
  503 VAULT_NOT_CONFIGURED | 503 VAULT_UNAVAILABLE

REMOVED: GET/POST /api/v1/secrets, POST /api/v1/internal/resolve-secret
```

Both operations are added to `docs/specs/studio/openapi.yaml` with exactly these status sets and a `StudioSecret` schema whose properties equal `StudioSecretDto`'s record components. `StudioContractTest`'s expected map and operation count (21 → 23) move with them (F16; ruling: OQ-5).

Order of checks on POST: authorization (403) first, then body parsing and validation (400), then the provider (503/409). This order holds only because the body is parsed after authorization (D11). With Spring binding a typed `@RequestBody`, a malformed body would be a 400 before authorization ran. An unauthorized caller therefore learns nothing about name validity or Vault state (NFR-3).

### 3.4 Data flow

```
Author ──POST name,value[],origins──▶ StudioSecretsController
  ▶ StudioSecretsService: load test (visibility) → canWrite(csi) → validate → VaultScope(csi, env, testId)
  ▶ StudioVaultProvider.create ──KV v2 POST cas=0──▶ Vault  {mount}/data/studio/csi/env/testId/secrets/NAME
  ◀ version            (value[] and body byte[] zeroed in finally)
Variables dialog stores {name: <var>, kind: secretRef, secretId: NAME}
Compile → revision.references.secrets = [NAME]                            (F1)
Execute → StudioAcceptanceService.preflight(csi, env, test.id, …)          ─┐ same VaultScope
Dispatch → StudioDispatcher.resolve(csi, env, execution.test_id, …)        ─┘ → read(SECRET, scope, NAME)
```

---

## 4. Dependencies

| Dependency | Purpose | Verified |
|------------|---------|----------|
| HashiCorp Vault KV v2 HTTP API (data POST with `cas`, metadata LIST/GET) | write, list, collision check | ⚠️ ASM-1, from public docs, not checked against the platform Vault |
| Vault token policy: `create` on `{mount}/data/studio/*`, `list`+`read` on `{mount}/metadata/studio/*` | connected mode | ⚠️ ASM-2, externally blocked (V7) |
| `CsiOwnershipEvaluator`, `StudioRepository.findById` | authz | ✅ F8 |
| `SecretOrigins` | origin normalization | ✅ F5 |

---

## 5. Files

### 5.1 New
| Path | Purpose |
|------|---------|
| `backend/src/main/resources/db/migration/V25__drop_plaintext_secrets.sql` | `DROP TABLE IF EXISTS secrets;` The indexes go with it; no FK references it (checked with grep across migrations). |
| `backend/.../studio/secrets/StudioSecretsController.java` | D10, §3.3 |
| `backend/.../studio/secrets/StudioSecretsService.java` | authz, validation, erase |
| `backend/.../studio/secrets/CreateStudioSecretRequest.java`, `StudioSecretDto.java` | D12, §3.3 |
| `backend/.../studio/secrets/VaultScope.java` | D8 |
| `backend/.../studio/secrets/VaultNotConfiguredException.java`, `SecretAlreadyExistsException.java` | D8, D11 |
| `backend/src/test/.../studio/secrets/StudioSecretsControllerTest.java`, `StudioSecretsServiceTest.java` | §6 |
| `frontend/src/components/checks/wizard/configs/UiTestConfig.test.tsx` | D16 (flag gate, `uiTestId` scoping) |

### 5.2 Modified
| Path | Change | Risk |
|------|--------|------|
| `studio/secrets/StudioVaultProvider.java` | D8 seam | Med (many callers) |
| `studio/secrets/HashicorpStudioVaultProvider.java` | `{testId}`, create, list (D4, D7, D12) | Med |
| `studio/secrets/DisabledStudioVaultProvider.java` | create/list throw (D8) | Low |
| `studio/secrets/StudioSecretsProperties.java` | D1 default | Low |
| `studio/secrets/StudioVaultConfiguration.java` | D2 validation | Low |
| `studio/secrets/VaultStudioReferenceResolver.java`, `dispatch/StudioReferenceResolver.java` | D9 `testId` | Med |
| `dispatch/StudioAcceptanceService.java` (~230), `dispatch/StudioDispatcher.java` (~311) | pass `testId` | Med |
| `config/ChecksExceptionHandler.java` | `VAULT_NOT_CONFIGURED` 503, `SECRET_ALREADY_EXISTS` 409 | Low |
| `studio/secrets/ConfiguredSecretUseAuthorization.java` | javadoc: drop the `secrets`-table rationale; say the policy is dev config pending PUT Core (V6) | Low |
| `application.yml` (129 comment, 201-203 comment), `application-dev.yml`, `application-local.yml` | FR-10, D14 | Low |
| Tests: `FakeStudioVaultProvider`, `StudioSecretFixtures`, `HashicorpStudioVaultProviderTest`, `VaultProviderSelectionTest`, `SecretUseAuthorizationTest`, `ExternallyGatedCriteriaTest` (skip text), `dispatch/*IT`, `JobBodyLeakTest`, `RevocationRotationIT`, `StudioKillSwitchWiringTest`, `compile/CompilePipelineIT`, and any other `read(...)`/`preflight`/`resolve` callers or `StudioReferenceResolver` doubles | signature + testId dimension | Med (mechanical, wide) |
| `backend/src/main/resources/db/seed/R__sample_data.sql` | delete section "10. Secrets" (the `INSERT INTO secrets`), F14. Its checksum changes, so existing dev DBs re-apply it once, harmlessly | High if missed (every fresh dev DB and `StudioSeedIT` fail) |
| `backend/src/test/.../smoke/SchemaSmokeTest.java`, `smoke/IndexCatalogTest.java` | drop `secrets` from the table list (14 → 13) and `idx_secrets_owner/scope` from the expected indexes, F15 | Low |
| `docs/specs/studio/openapi.yaml`, `backend/src/test/.../studio/StudioContractTest.java` | declare the two operations, the `StudioSecret` schema and the error codes; expected map + count 21 → 23 (§3.3, F16) | Med (frozen contract, OQ-5) |
| `helm-chart/put-checks/values.yaml` (643), `studio-runner/test/deployment/integrations.test.ts` | `studioVault.pathTemplate` → D1 template; assert the rendered `STUDIO_VAULT_PATH_TEMPLATE` contains `{testId}` (D14, F17) | High if missed (hashicorp activation cannot start) |
| `frontend/src/services/api/apiClient.ts` | honor `redactBody`: no `data` in the debug log, no `response.config.data` on the normalized error (D15, F19) | Low |
| `docs/runbooks/studio-runner.md` (Vault section, ~38) | required token policy (api: `create`+`read` on data, since acceptance preflight reads, and `list`+`read` on metadata; worker: `read` on data only), new template, `max-response-bytes` caveat | Low |
| `studio/secrets/HashicorpStudioVaultProvider.java` class javadoc | no longer "read-only" | Low |
| `ARCH.md` §`secrets` (~line 470) | replace the table DDL with a Vault path description | Low |
| `frontend/src/services/api/secretsApi.ts` | `listSecrets(testId)`, `createSecret(testId, {name, value, allowedOrigins})` | Low |
| `frontend/src/components/studio/SecretInput.tsx` | D15 | Med |
| `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` (~1251) | pass `testId` (D16) | Low |
| `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx` (~124-140) | flag gate + `testId` (D16) | Low |
| `frontend/.../SecretInput.test.tsx`, `pageSaveAndStop.test.tsx` | new routes/shape | Low |

### 5.3 Deleted
`backend/src/main/java/com/citi/put/checks/secrets/` (the whole package: `SecretsController`, `SecretsService`, `SecretsRepository`, `entity/Secret`, `dto/CreateSecretRequest`, `dto/SecretDto`).
`backend/src/test/java/com/citi/put/checks/smoke/entity/SecretSmokeEntity.java` (F15: left in place, it fails Hibernate schema validation in every `@SpringBootTest` context once V25 runs).

---

## 6. Testing Strategy

Backend (JUnit 5; narrowest first: `./gradlew test --tests 'com.citi.put.checks.studio.secrets.*'`, then the dispatch ITs, then `./gradlew check`):

| Test | Covers |
|------|--------|
| `HashicorpStudioVaultProviderTest` (+ existing `HttpServer` stub): create sends POST to `/v1/secret/data/studio/{csi}/{env}/{testId}/secrets/NAME` with `options.cas=0`, value key and `allowedOrigins`. The token header is present. The canary is absent from the URI. | FR-1, FR-2, NFR-1 |
| … create on 400 + metadata 200 → `SecretAlreadyExistsException`; 400 + metadata 404 → unavailable; 403/5xx/timeout → unavailable | D4, NFR-5 |
| … list: `?list=true` on the metadata prefix; 404 → `[]`; folder and invalid keys skipped; sorted; oversize/stall bounded | FR-4, D7, NFR-4 |
| … the request `char[]` and the body `byte[]` are zeroed after success and after failure | NFR-2 |
| `VaultProviderSelectionTest`: a template without `{testId}` is rejected, a template not ending in `/{referenceName}` is rejected, and the old default is rejected | FR-8, D2 |
| `StudioSecretsServiceTest` / `StudioSecretsControllerTest`: owner 201; reader POST 403; reader GET 200; non-member and absent id 403 with the same body; the body cannot override CSI/env; validation codes; provider `none` → 503 `VAULT_NOT_CONFIGURED`; log capture and response carry no canary; an unknown JSON field (`label`) → 400 `INVALID_SECRET_REQUEST`, sent **as raw bytes**, through the real platform `ObjectMapper` configuration, not a hand-built record (F18); a non-member sending a malformed body → 403, not 400 (§3.3 order); the received body `byte[]` is zeroed | FR-3, FR-7, NFR-1, NFR-2, NFR-3, D11 |
| Resolver/dispatch (`FakeStudioVaultProvider` keyed with testId): a secret under test A with the same CSI/env is `UNKNOWN_REFERENCE` for test B at acceptance and `REFERENCE_UNAVAILABLE` at dispatch; a declared id `vault://studio/pilot-pw` is `UNKNOWN_REFERENCE` / `REFERENCE_UNAVAILABLE` and the provider is never called (D9) | FR-2, V3, V4, D9 |
| Flyway IT (Testcontainers): after V25, `to_regclass('secrets') IS NULL`; context starts under `ddl-auto: validate`; `StudioSeedIT` (migration + seed) stays green; `SchemaSmokeTest`/`IndexCatalogTest` pass with the table removed | FR-5, F14, F15 |
| `StudioContractTest`: both new operations are declared with the §3.3 status sets; schema/record field parity for `StudioSecret` | F16 |
| Helm render (`integrations.test.ts`): the default chart renders `STUDIO_VAULT_PATH_TEMPLATE` containing `{testId}` and `STUDIO_VAULT_PROVIDER=none` | FR-8, D14, F17 |
| MockMvc (authenticated caller): `POST /api/v1/internal/resolve-secret` and `GET/POST /api/v1/secrets` → 404 | FR-5, FR-6 |

Frontend (Vitest + test-local MSW; `pnpm vitest run src/components/studio/SecretInput.test.tsx src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx`, plus a `UiTestConfig` test):

| Test | Covers |
|------|--------|
| `testId=null` → disabled, no request sent | D15 |
| list GETs `/studio/tests/{id}/secrets`; create POSTs `{name, value, allowedOrigins[]}`; the selection is `{id: name}`; the value field is empty after create; nothing is written to localStorage | FR-9, NFR-1 |
| with `APP_CONFIG.debugMode = true`, `console.log`/`console.error` spies never receive the canary value on a successful create or on a 409/503 create; the rejected error object carries no `config.data` | NFR-1, D15, F19 |
| 503 `VAULT_NOT_CONFIGURED` / 409 → mapped messages; invalid name blocks submit | D11, D15 |
| Wizard: the Secret option is hidden when `vaultSecrets=false`; the picker is disabled without `uiTestId` | D16 |

---

## 7. Acceptance Criteria (per issue)

**V1 — plaintext in DB**
- AC-V1-1: After V25, no `secrets` table exists and no JPA entity maps to it, in main **or test** sources (`SecretSmokeEntity` removed). The app starts with `ddl-auto: validate`. The dev seed (`R__sample_data.sql`) applies cleanly on a fresh database.
- AC-V1-2: A create request with a canary value leaves the canary in no DB table, log line or response (it is found only in the stub Vault's received body).
- AC-V1-3: The `com.citi.put.checks.secrets` package is gone. `GET/POST /api/v1/secrets` answer 404.

**V2 — nothing writes to Vault**
- AC-V2-1: With `hashicorp` selected, `POST /api/v1/studio/tests/{id}/secrets` performs exactly one KV v2 data write (`cas=0`) and returns 201 `{name, version, allowedOrigins}` without a value.
- AC-V2-2: Creating an existing name returns 409 `SECRET_ALREADY_EXISTS`, and the Vault version does not change.

**V3 — no test id in path**
- AC-V3-1: The default template is `studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}`.
- AC-V3-2: Startup fails if the template lacks `{testId}` or does not end with `/{referenceName}`.
- AC-V3-3: Preflight and resolve read `…/{testId}/secrets/{name}` using the test's id (acceptance) or the execution's `test_id` (dispatch).

**V4 — save and run don't meet**
- AC-V4-1: A secret created through the endpoint for test T resolves at T's acceptance and dispatch (fake provider IT, same scope object on both sides).
- AC-V4-2: `GET …/secrets` for T lists exactly the names created for T, and none from another test with the same CSI/env.
- AC-V4-3: The frontend stores the created/selected **name** as `secretId`. The compiled revision's `references.secrets` contains that name.

**V5 — no CSI scoping**
- AC-V5-1: CSI and environment in every Vault path come from the persisted `ui_tests` row. A request body cannot influence them: unknown fields are rejected with 400 `INVALID_SECRET_REQUEST` by the strict parse of D11.

**V6 — dev-only secret-use permission (externally blocked, PUT Core)**
- AC-V6-1: `ConfiguredSecretUseAuthorization` and `studio.secrets.entitlements` are unchanged in behaviour. No new policy model is added.
- AC-V6-2: Its javadoc no longer justifies itself by the dropped table. It names PUT Core as owner of the production policy. `ExternallyGatedCriteriaTest` skips remain skipped, with updated text.

**V7 — provider `none` by default (externally blocked, platform Vault)**
- AC-V7-1: The default is still `none` in `application.yml`, `-dev`, `-local` and `-test`. `-dev` and `-local` read `${STUDIO_VAULT_PROVIDER:none}`.
- AC-V7-2: With `none`, list and create return 503 `VAULT_NOT_CONFIGURED`, and no other store is touched.
- AC-V7-3: Setting only `STUDIO_VAULT_PROVIDER=hashicorp`, `STUDIO_VAULT_ADDRESS` and `STUDIO_VAULT_TOKEN_FILE` (readable file, https or loopback) starts the context with the hashicorp provider and logs `Studio vault provider selected: hashicorp`. The Helm chart's default `studioVault.pathTemplate` passes D2 validation.

**V8 — REDACTED stub**
- AC-V8-1: `POST /api/v1/internal/resolve-secret` returns 404. No code path returns the literal `REDACTED` for a secret.

**Frontend / docs**
- AC-FE-1: `SecretInput` with no test id is disabled and sends no request.
- AC-FE-2: The create dialog requires a valid name, a non-empty value and at least one origin. It sends no `label`/`scope`. The value never reaches the browser console, even with `debugMode` on.
- AC-FE-3: The wizard hides the Secret option while `vaultSecrets` is false.
- AC-DOC-1: `application.yml:129` no longer says `SecretsService` returns REDACTED. `ARCH.md` no longer documents the `secrets` table as the store.

---

## 8. Risks

| Risk | P | I | Mitigation |
|------|---|---|------------|
| KV v2 behaviour (CAS 400, LIST 404) differs on the platform Vault version (ASM-1) | M | M | Isolated in the provider. The stub-server tests pin today's assumption. Re-verify when V7 connects. |
| Platform token lacks `create`/`list` capability (ASM-2) | H | H (feature unusable) | A 403 from Vault surfaces as 503 `VAULT_UNAVAILABLE`. List the required policy in the runbook entry. |
| Signature change to `read`/`preflight`/`resolve` touches many tests (§5.2) | H | M | Mechanical change. Run the dispatch ITs and corun explicitly. Keep one PR. |
| Existing drafts carry UUID or `vault://…` `secretId`s that no longer resolve | M | L | Provider is `none`, so nothing resolves today anyway. With `hashicorp`, D9's name check turns them into `UNKNOWN_REFERENCE` naming the id, instead of the provider's path-safety 503. OQ-3 covers fixtures. |
| A test's `environment` is free text (≤ 50 chars, no format check). A value containing `/` or equal to `.`/`..` fails `segment()`, so create/list answer 503 `VAULT_UNAVAILABLE` | L | L | Accepted. The message is generic and leaks nothing. Revisit if environments become an enum. |
| Environment change orphans secrets (D18) | M | L | The list reflects the current environment. Documented behaviour. |
| Test deletion leaves the Vault subtree behind (OQ-2) | M | L | Out of scope. Vault owner can purge by prefix. |
| No rotate/delete from Studio (OQ-1) | M | M | Fix in Vault directly, or create a new name. Revisit. |
| Transient buffers retain a value copy (NFR-2 residual) | L | M | Stated residual, same stance as `Resolved`. |

## 9. Open Questions

| ID | Question | Blocking | To |
|----|----------|----------|----|
| OQ-1 | Rotate/replace/delete from Studio? | No | @pm |
| OQ-2 | Delete the Vault subtree on test delete? | No | @architect |
| OQ-3 | Replace `vault://studio/pilot-pw` in `docs/specs/studio/openapi.yaml:202` and the MSW `fixtures.ts:62` / `compileFixtures.ts:90` with a plain name? | No | @architect |
| OQ-4 | Keep the wizard check-level secret override, given the backend does not consume it (ASM-4)? | No | @po |
| OQ-5 | Rule the frozen-contract change: two new operations under `/tests/{id}/secrets` (count 21 → 23) and the new error codes. `StudioContractTest` treats unruled movement as drift. | No for the spec; **yes before merge** | @architect |

### 9.1 Rulings (@architect, 2026-09-22, Spec Pipeline phase 6)

Plan: `implementation.yaml` (same folder). Where a ruling amends §3.3 or §5, the ruling wins.

**OQ-5: RULED, authorized.** This is a Class C amendment (routes, public surface) under ADR-002 §12. Under §19 the architect authorizes it here and the implementing story makes the edit. That story also records it as ADR-002 §32 plus a §13 row (`AUTHORIZED, NOT YET LANDED` until the edit lands).
- R-5.1 Path `/tests/{id}/secrets`. The path variable is named `{id}` through `$ref: '#/components/parameters/TestId'`, as on every other draft route. Tag `tests`; no new tag; document-level security. operationIds: `listTestSecrets`, `createTestSecret`.
- R-5.2 Status sets: `GET` = `200,400,401,403,503`; `POST` = `201,400,401,403,409,503`. **This amends §3.3.** GET gains `400` because a malformed UUID path variable is a `400` before any handler runs, the same reason `GET /tests/{id}` declares it. `401` → `SessionUnauthorized`; `403` → `Forbidden`; `503` → `ErrorResponse` with `VAULT_NOT_CONFIGURED` / `VAULT_UNAVAILABLE` examples (the `executeTest` precedent; §25's backend-wide envelope question stays separate). The `409` carries `x-conflict-codes: [SECRET_ALREADY_EXISTS]`, as the document requires of every `409`. The `400` description lists the four `INVALID_SECRET_*` codes and states that `403` is decided first.
- R-5.3 Operation count 21 → 23. `StudioContractTest` changes both `hasSize` pins, the expected map and the drift message, in the same PR.
- R-5.4 Schemas: `StudioSecretName {name}` (list item), `StudioSecretList {data}`, `StudioSecret {name, version, allowedOrigins}` (201), and `CreateStudioSecretRequest {name, value, allowedOrigins}` (closed, `value` is `writeOnly`). **This amends §3.3/§5.1:** the list item and the 201 body are different records (`StudioSecretNameDto`, `StudioSecretDto`, plus `StudioSecretListDto`). One record would either emit `"version": null` in the list or fail schema parity. Every schema is added to `theFrozenSchemasAndTheJavaTypesShareTheSameFieldNames`.
- R-5.5 **Digest re-anchor (a finding the spec lacked).** `studio-runner/test/run/confinement.test.ts` pins the SHA-256 of `openapi.yaml`, currently `c6b89138…1088`. The same PR re-anchors it to the value `shasum -a 256` prints once the document is final (ADR-002 §19).

**OQ-3: RULED, split.** In `openapi.yaml:202`, change the example `secretId: vault://studio/pilot-pw` to `LOGIN_PW` in this PR: D9 now refuses that id, and the file is re-anchored anyway. The MSW fixtures (`fixtures.ts:62`, `compileFixtures.ts:90`, `pageSaveAndStop.test.tsx:251`) and `compileStates.test.tsx:301` stay as they are. They never reach the resolver, the flag is off, and changing them is a follow-up.

**OQ-2: RULED out of scope (follow-up).** Test deletion does not touch Vault in this story. Recommendation for the follow-up: purge on **hard** purge or retention, not on soft delete, because a soft-deleted draft keeps its execution history and may be restored. KV v2 has no recursive delete, so the purge is LIST, then `DELETE /metadata/…` per key, which needs `delete` on metadata. That widens the token policy, and that policy belongs to ED-02.

**OQ-1:** out of scope; stays with @pm (spawn instruction; §1.2). **OQ-4:** stays with @po. D16's gate is the only wizard change.

**Other implementation-blocking points, ruled:**
- R-3 The resolver takes `UUID testId` (`preflight/resolve(csiId, environment, testId, principal, declarations)`). `VaultScope` is built inside `VaultStudioReferenceResolver`, because `dispatch` must not import `studio.secrets`. Acceptance passes `test.getId()`; the dispatcher passes the execution row's `test_id`.
- R-4 The D3 name rule (`^[A-Za-z0-9_.-]{1,64}$`, not `.`/`..`) is defined once, as `StudioVaultProvider.isValidSecretName`, and the endpoint, the resolver (D9) and the fake all use it.
- R-6 The POST body is `@RequestBody(required = false) byte[]`, with no `consumes`. Otherwise an empty body (400) or a non-JSON content type (415) would be answered before authorization, which breaks §3.3's order and the declared status set. A null, empty or >64 KiB body is `400 INVALID_SECRET_REQUEST` **after** authorization.
- R-7 On create, a Vault `400` **or `403`** triggers the metadata read: metadata `200` → `409`, anything else → `503 VAULT_UNAVAILABLE`. This is an inference from HashiCorp's docs, not verified against a live Vault: with a `create`-only policy, a duplicate `cas=0` write can come back as `403` rather than `400`. It amends D4.
- R-8 Test naming: the Docker-backed endpoint test is `StudioSecretsControllerIT` (repo convention), not `…ControllerTest`. The pure unit test stays `StudioSecretsServiceTest`.
- R-9 Frontend and studio-runner verification use `pnpm exec vitest run …` / `pnpm exec tsc --noEmit`. Both packages have npm lockfiles; `pnpm exec` installs nothing and writes no lockfile. §6's `pnpm vitest run` is replaced by this form. Never `pnpm install` there.
- R-10 `SecretInput.testId` is a **required** `string | null` prop, so the compiler enforces D16 at both call sites.
