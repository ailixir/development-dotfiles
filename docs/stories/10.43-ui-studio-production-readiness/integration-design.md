# Epic 10 production integrations — implementation design

Status: approved by the user on 2026-09-21 for implementation under feature/provider flags.

## Decision

The application keeps the existing narrow ports and gains production adapters; provider selection
is configuration-only.

| Capability | Local/default provider | Real provider | Selection |
|---|---|---|---|
| Studio reference resolution | `none` throughout alpha; `fake` tests only | `hashicorp` Vault KV v2 | `studio.secrets.vault.provider` |
| Runner evidence writes | `local` filesystem | `s3` (Sonic-compatible) | `STUDIO_RUNNER_OBJECT_STORE_PROVIDER` |
| API video/manifest reads | `local` filesystem | `s3` (Sonic-compatible) | `studio.execution.video-store.provider` |
| LLM compilation | disabled/local passthrough | existing Vertex/R2D2 client | `studio.compile.gateway.enabled` |

The selected option is adapters behind existing ports. Alternatives rejected were replacing the
ports with vendor SDK types (couples domain code to integrations) and running local proxy services
(adds deployment state without improving the production path).

The frontend is a production alpha: it has no runtime MSW switch, browser mock worker, or scripted
execution seam. MSW handlers remain test fixtures imported directly by Vitest. Capabilities that
are not connected are shown as unavailable; Vault-backed secrets are disabled rather than mocked.

## Data flows

```text
execute -> VaultStudioReferenceResolver -> StudioVaultProvider
                                      |-> disabled (alpha default)
                                      |-> fake (tests only)
                                      `-> HashiCorp KV v2 GET (real flag)

runner -> ObjectStoreClient.put
                         |-> atomic filesystem write (default)
                         `-> Sonic/S3 PutObject (real flag)

API/reaper -> VideoObjectStore / ResultManifestStore
                                      |-> filesystem range/read (default)
                                      `-> Sonic/S3 ranged GetObject (real flag)
```

The runner remains write-only by type and credential. The API remains read-only by type and
credential. Neither side lists or deletes objects. Video reads request only the inclusive range
needed by the protected media route. Manifest reads are bounded and deserialized defensively.

## Configuration contract

Vault KV v2:

```yaml
studio:
  secrets:
    vault:
      provider: none # tests override to fake; hashicorp enables the future real client
      hashicorp:
        address: https://vault.example
        namespace: optional-enterprise-namespace
        mount: secret
        path-template: studio/{csiId}/{environment}/{kind}/{referenceName}
        value-key: value
        token-file: /var/run/secrets/vault/token
        request-timeout: 5s
```

Object storage:

```yaml
studio:
  execution:
    video-store:
      provider: local # s3 enables Sonic
      directory: /tmp/studio-runner-objects
      endpoint: https://sonic.example
      region: us-east-1
      bucket: put-checks-studio-evidence
      path-style-access: true
      access-key-id-file: /etc/studio/object-store/accessKeyId
      secret-access-key-file: /etc/studio/object-store/secretAccessKey
```

The runner exposes equivalent enumerated `STUDIO_RUNNER_OBJECT_STORE_*` keys. Credential values
are read from mounted files and are never accepted in URLs, jobs, logs, or callback bodies.

## Failure semantics and observability

- Missing or invalid real-provider configuration fails startup; it never falls back silently.
- Vault `404` means an unavailable reference; authorization, transport, timeout, malformed body,
  and server failures remain errors and never look like a missing secret.
- S3 `NoSuchKey` means absent evidence; transport and service failures remain unavailable errors.
- Startup and failure diagnostics name providers and configuration fields, never credential
  contents or resolved secret values.
- Local writes are atomic (`.partial` then rename); S3 retries overwrite the same deterministic
  key, preserving idempotency.

## Test strategy

- Unit/configuration tests for provider selection, default-local behavior, validation, key/path
  safety, Vault KV v2 response parsing, `404`, and redaction.
- Runner tests with a local S3-compatible HTTP double proving streamed file and byte uploads,
  headers, credentials, and failure classification.
- Backend tests with a local S3-compatible HTTP double proving bounded size probes, ranged `GET`,
  manifest parsing, missing keys, and unavailable-store handling.
- Local end-to-end wiring shares one filesystem directory between runner and backend so recorded
  evidence is immediately playable and recoverable. `dev.sh` shares one temporary directory;
  Helm local mode mounts one RWX PVC into API, worker and runner (or accepts an existing claim).
- Existing compile, dispatch, evidence, recovery, deployment, type, lint, and build suites remain
  regression gates.

## Production activation checklist

1. Supply the approved R2D2/Vertex endpoint, project, location, model, and workload credentials.
   The existing client does **not** consume a Gemini developer API token. It uses Vertex-style
   Google credentials: workload/Application Default Credentials with
   `STUDIO_GATEWAY_CREDENTIALS_MODE=application-default`, or a mounted service-account JSON with
   `service-account-file` plus `STUDIO_GATEWAY_CREDENTIALS_KEY_FILE`. Then set
   `STUDIO_GATEWAY_PROVIDER=vertex`, `STUDIO_GATEWAY_ENDPOINT`, `STUDIO_GATEWAY_PROJECT`,
   `STUDIO_GATEWAY_LOCATION`, and `STUDIO_GATEWAY_MODEL`. No credential-free mode exists.
2. Mount a Vault token file (or replace only the authentication supplier later), configure the KV
   v2 mount/path template, then select `hashicorp`.
3. Mount separate Sonic writer and reader credentials, configure endpoint/region/bucket, then
   select `s3` on runner and backend.
4. Apply the bucket lifecycle matching `studio.execution.evidence-retention` and verify real
   write/read/range/version-cleanup behavior in staging.
