# Studio integration setup

Studio now uses the same configured runner URL and bearer identity for compile validation and
execution dispatch. The runner uses a separate bearer identity for API admission and reports.
The Helm chart derives both service URLs from the release and connects both ends to the same
identity Secret keys. Kubernetes probes use an authenticated loopback check that reads the
service token from the container environment; the token is never embedded in a command or URL.

## Local development

Each component has its own Node launcher (no Docker, no bash; Windows, macOS and Linux). Start them in this order,
each in its own terminal:

```sh
cd studio-runner && node scripts/dev.mjs   # builds and starts the runner on https://127.0.0.1:8090 (mutual TLS)
cd backend && node scripts/dev.mjs         # Spring Boot (local profile) on :8080 + Core stand-in
cd frontend && node scripts/dev.mjs        # Vite on :5173
```

In Git Bash, macOS or Linux, `./dev.sh` in each component runs the same launcher with the same flags.

The runner launcher installs the pinned Chromium when it is missing and writes the shared directory
`$PUT_CHECKS_LOCAL_DIR` (default `~/.put-checks/local`): local TLS, the two service identities, the guided tokens and
`backend.env`, which the backend launcher reads. The local backend profile runs the dispatcher and recovery schedules
itself. The runner receives an enumerated environment (`runner-environment.json`), without the backend's
Vertex/vault/database credentials. The existing frontend MSW configuration is unchanged.

The API and runner share the `objects/` directory of that shared directory, exported to the API as
`STUDIO_EVIDENCE_DIRECTORY`. It is outside `scratch/`, which the runner deletes at startup and shutdown. API video
reads use file ranges, and recovery deserializes the runner's result manifest from that same directory. Local storage
has logical API expiry but no automatic physical cleanup; remove old files when no longer needed.

When starting processes manually, set these matching values:

| API / local backend | Runner |
| --- | --- |
| `STUDIO_RUNNER_BASE_URL=http://127.0.0.1:8082` | `STUDIO_RUNNER_PORT=8082` |
| `STUDIO_RUNNER_SERVICE_TOKEN` | `STUDIO_RUNNER_SERVICE_IDENTITY` (same secret value) |
| `STUDIO_CALLBACK_SERVICE_TOKEN` | `STUDIO_RUNNER_CALLBACK_IDENTITY` (same secret value) |
| API listens on `8080` | `STUDIO_RUNNER_CALLBACK_BASE_URL=http://127.0.0.1:8080` |
| `STUDIO_EVIDENCE_PROVIDER=local` | `STUDIO_RUNNER_OBJECT_STORE_PROVIDER=local` |
| `STUDIO_EVIDENCE_DIRECTORY=/absolute/path/objects` | `STUDIO_RUNNER_OBJECT_STORE_DIR=/absolute/path/objects` |
| `STUDIO_DISPATCHER_ENABLED=true`, profile `local` | Scratch must be disjoint from objects |

Do not pass the complete backend environment to the runner: its `STUDIO_RUNNER_*` namespace is
strictly enumerated, and backend-only runner settings are intentionally not accepted there.

Compilation of free-form English needs the Vertex/R2D2 integration configured in the API. Set
`STUDIO_GATEWAY_PROVIDER=vertex`, `STUDIO_GATEWAY_ENDPOINT`, `STUDIO_GATEWAY_PROJECT`,
`STUDIO_GATEWAY_LOCATION`, `STUDIO_GATEWAY_MODEL`, and the appropriate
`STUDIO_GATEWAY_CREDENTIALS_MODE` (`application-default` or `service-account-file`).
For the latter, also set `STUDIO_GATEWAY_CREDENTIALS_KEY_FILE`. The backend launcher defaults
`STUDIO_GATEWAY_PROVIDER` to `disabled`, so Run Test answers that learning is unavailable until Vertex is
configured (in `backend/.env.local`). No live R2D2 credentials or model verification
are supplied by this change.

## Remote environments — provision later

All chart environments select AWS S3. The runner remains disabled by default. Before enabling it,
configure the following chart values; empty bucket/region values are rejected at application startup:

```yaml
studioRunner:
  enabled: true
  identity:
    secretName: checks-studio-runner-identity
    serviceIdentityKey: serviceIdentity
    callbackIdentityKey: callbackIdentity
  objectStore:
    credentialsSecret: checks-studio-runner-object-store
    keys: [accessKeyId, secretAccessKey]
objectStore:
  provider: s3
  bucket: YOUR_BUCKET
  region: YOUR_AWS_REGION
  credentialsSecret: checks-api-object-store
  keys: [accessKeyId, secretAccessKey]
  retention: 30d
```

These Secrets must already exist. The identity Secret holds two distinct random tokens; the chart
connects validation/dispatch to `serviceIdentity` and API callbacks to `callbackIdentity`.
The two object-store Secrets hold separate AWS principals: runner `s3:PutObject` on
`studio/*`, API/worker `s3:GetObject` on that prefix. Add `sessionToken` to the respective `keys`
lists when using temporary credentials. Mounted credential files are actually read by the adapters
and support rotation. No secrets are committed or created by this chart.

Outside the chart, leaving the storage credentials directory unset uses the AWS SDK default
credential chain. The current chart deliberately uses the existing separate credential mounts;
workload identity and its network policy need a separate deployment decision. SDK references:
[AWS Java credentials](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html)
and [AWS JavaScript S3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).

Provision the bucket, encryption/IAM/KMS permissions as applicable, approved network access, and
lifecycle expiration separately. `objectStore.retention` controls logical API expiry and the chart's
lifecycle declaration; the chart does **not** apply an S3 lifecycle policy. The API never exposes
bucket URLs or presigned links to the browser. S3 writes stream the video and share the evidence
upload deadline; API reads request only the requested byte range. Missing and inaccessible objects
remain different outcomes (without ListBucket permission, S3 can return 403 for a missing key;
this is treated conservatively as inaccessible).

## Remaining external integration work

- **Vertex/R2D2:** supply and verify the endpoint, model/project/location, credentials and quotas.
  Existing `backend.env` / `backend.envFromSecrets` accept its `STUDIO_GATEWAY_*` settings.
- **Trusted identity and vault:** Studio's only vault implementation remains `fake`, selected in
  local/dev/test. Staging/production deliberately fail startup without a supported configured
  provider. A real vault adapter and secret-use entitlement integration remain necessary; do not
  select the development fake to make remote deployment start.
- **AWS S3:** the clients and deployment wiring are implemented and tested with local fixtures;
  bucket/IAM/lifecycle provisioning and a credentialed smoke test are deferred.
- **Navigation and browser image:** fill in the domain whitelist (`studioNavigation.allowedDomains`,
  empty by default, which denies every navigation; `studioNavigation.allowAllDomains` is the switch that allows all domains, ON by default for now: set it `false` to enforce the list) and retain the sandbox requirements; target
  addresses are open and firewalls own reachability (runner runbook §2). Validate both in the target
  cluster before enabling executions.
- **Spring configuration delivery:** story 10.27 repairs the dotted-key chart defect with a
  mounted `application.yaml` for backend and worker. Their previously ineffective pool,
  scheduler, and executor overrides now take effect; review target-environment values before
  rollout. Canonical Spring environment properties retain precedence; chart-owned controls are rejected in
  `configOverrides` so they cannot replace packaged alias placeholders. See the runner runbook §11.

No remote services were configured or deployed as part of this integration repair.
