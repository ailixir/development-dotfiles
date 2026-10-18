# STUDIO-OBS-015 authority-tier ruling

Reviewer: Quinn (@qa), independent. Date 2026-10-15. This is a read-only ruling. No test, build, JVM, Node, DB, Docker or network command ran, and no source was modified. It is a ruling on test-tier interpretation, not formal story QA, and it changes no lifecycle.

## Question

The JOIN tests use these stand-ins:
- an in-JVM `com.sun.net.httpserver.HttpServer` as "Core" (`/api/v1/users/me`, counted by `CORE_CALLS`; ReplayIT:1256-1304);
- `FakeStudioVaultProvider`/`CountedLoginVault` as "Vault" (ReplayIT:850-852, 1890-1894, 16398);
- Testcontainers `postgres:15-alpine` (ReplayIT:846).

The question: are the tier phrases in use ("actual Core", "test Vault", "private authority", "native") satisfiable by these in-repo fixtures, or do they require real Citi Core/COIN or real HashiCorp Vault?

## Ruling

**No STUDIO-OBS-015 obligation requires a real external Core, COIN or HashiCorp Vault.** All of them are satisfiable locally with Docker (Testcontainers PG) plus the real studio-runner and Chromium. Conditions T1 to T5 apply, and the disclosures below are mandatory.

## Basis (exact text)

1. **Original ledger and acceptance inventory.** I read all 86 `acceptanceCases` in `validation-ledger.json` and the architect `acceptance-inventory.json`. The word "Core" appears in none of them (0 matches), and "COIN" appears 0 times. "Vault" appears exactly once, at ledger index 28, `IncrementalRelearnIT.secretPrefixPreservesOBS007Oracles`, tier **"REAL JOINED password fixture + test Vault"**. No original tier says "actual Core", "real Vault" or "private authority". Those phrases come only from derived planning and review artifacts (current-gap-plan01, handoffs, earlier QA reviews).
2. **Story testing scope.** `STUDIO-OBS-015.story.md` §Testing (line 106): "joined ITs on Testcontainers with the guided mode and Chromium (as `GuidedPublicationReplayIT`) for AC-6". AC-6 (line 36) says "Joined test on the real stack". The story itself defines that stack as Testcontainers plus GuidedPublicationReplayIT. No AC-1 to AC-6 text mentions Core, COIN or Vault. AC-3, AC-6 and ledger 28 require "OBS-007 `secretRef` rules/oracles … unchanged", and those oracles are themselves the in-repo fixtures in this same class.
3. **The product does not connect real Core secret policy or Vault on this branch.**
   - `ConfiguredSecretUseAuthorization.java:8-13`: "PUT Core owns the production secret-use policy (V6, CON-2), and the platform Vault's own token policy is `ED-02`'s. Neither is connected on this branch".
   - `StudioVaultProvider.java:14-15`: "The production alpha selects the explicit no-call provider `none`; tests alone select test doubles".
   - `application.yml:269`: "Tests override the provider with the fake."
   - `guided/session/README.md:203`: OBS-007 `AccountAccess` "does not imply production account connectivity".

   A real-Core or real-Vault run would therefore exercise code paths the product under review does not use. It cannot be an 015 obligation.
4. **Core's role in the auth model.** Core is reached only through the production `CoreServiceClient` (`security/CoreServiceClient.java:40,48`, `/api/v1/users/me`, 401 handling) using Core-propagated identity. The in-JVM server serves that contract over real loopback HTTP, including the 401 response for a bad cookie.

## Tier-by-tier

| Tier phrase (where it appears) | Satisfiable in-repo? | What it must mean to earn credit |
|---|---|---|
| "test Vault" (ledger 28 tier; requirement-map B2a "real Spring/PG/test-Vault") | **YES, by its own words** | Only the `StudioVaultProvider` leaf is a test double. The production resolver, secret-use check, audit lifecycle, redaction and PG remain real (T1). Fault, revocation and rotation injection at the fake provider is the legitimate seam. |
| "actual Core" (ReplayIT `actualCore*` method names; review prose "Core/Vault/PG authority") | **YES** | The production `CoreServiceClient` makes a real HTTP call to the in-JVM Core contract fixture, which returns `/users/me` identity and `csi_ownership` and returns 401 otherwise. Disclose that this is not proof of real Citi Core/COIN contract fidelity (T2). |
| "private authority" (requirement-map `privateAuthority15`, B3a/B3b) | **YES** | Rows are written by production code into real Testcontainers PG and read back by production repository code. The callbacks are authenticated owning-worker/controller HTTP with test-issued JWT/mTLS, verified by production verifier code. Node declared/synthetic authority, mock JDBC, planted rows or SQL-refusal-only do **not** qualify (T3). This matches requirement-map `currentLimits`. |
| "native" / "REAL JOINED … Chromium" / "actual recording" (ledger 23-30, 49; IPC P03/N01) | **YES** | Real studio-runner launcher/child, real local Chromium and real recorder/media with local ffmpeg decode/seek. Runner unit fixtures or controlled frames alone do not qualify for a JOIN tier (T4). |
| "Real Spring+PG+runner", "HTTP+Postgres", "Java + Postgres", "Flyway Postgres15" | **YES** | Testcontainers PG15 with the production Spring context. |

## Conditions on in-repo credit

- **T1.** Only leaf external adapters may be doubles: Core HTTP endpoint, `StudioVaultProvider`, model PROVIDER endpoint. Everything between them and PG must be production code. One disclosure is required: ReplayIT replaces `StudioSecretUseAuthorization` with the `controlledLoginEntitlement` fixture lambda (ReplayIT:1936-1947). This is the same tier as production's `ConfiguredSecretUseAuthorization`, which is itself a development entitlement map and not Core policy. It must be reported as a fixture entitlement, never as Core policy.
- **T2.** Every report citing "actual Core" must state "in-JVM Core contract fixture; real Citi Core/COIN not exercised".
- **T3.** Private-authority credit requires production-written rows. Seeding a state the product cannot reach, or a `pending=true` spy, voids credit.
- **T4.** Native credit requires actual native invocation and media evidence from the run's own fresh artifacts.
- **T5.** These rulings do not lower any other requirement. The 86, 24, 55, 15 and 35 counts, the final source-frozen gates and item85 OPEN all stand.

## Obligations that would need real external systems

**For 015 closure: none.** For completeness, these are outside 015 and **not** required by any 015 AC or ledger subject:

- **E1.** Fidelity of real PUT Core `/api/v1/users/me` (COIN-backed identity and `csi_ownership` semantics) against the fixture. This is a platform/deployment integration concern.
- **E2.** Real HashiCorp Vault KV v2 behaviour through `HashicorpStudioVaultProvider`. Production default is `none`. Unit-level coverage exists against a loopback HTTP server (`HashicorpStudioVaultProviderTest`), and this ruling does not credit or re-review it.
- **E3.** The Core-owned production secret-use policy (V6/CON-2) and the platform Vault token policy (ED-02). These are not connected in the product, so no environment could test them for 015.

If the user wants E1, E2 or E3 as an 015 gate, that would be a scope change requiring the user's explicit decision. It is not a silent gap.

The runner image `docker build` network access and row 85 are separate items, not authority tiers. They remain as stated in the resume plan §6.
