# STUDIO-OBS-009 D2: AC-2 inputs and rotation, for the OBS-010 runbook

- **Author:** Gage (@devops). **Date:** 2026-10-18. These are the inputs the chart now takes, who provides each, and what a rotation costs. Nothing here was exercised in a cluster. Provisioning is Platform/SRE's.
- **Legend:** [V] verified in the rendered manifest or source today; [K] general Kubernetes/JVM/Node behaviour; [U] unrun, owner named.

## 1. Inputs, by values key

| Key (`studioRunner.*`) | Default | Provider | Rendered into | Required |
|---|---|---|---|---|
| `tls.secretName` | `checks-studio-runner-tls` (per-environment names in the three env files) | Platform/SRE | runner pod: Secret volume `tls` at `tls.mountPath`, items `tls.key`, `tls.crt`, `ca.crt`, mode 0440, read-only, no `subPath` | every deployment (A3) |
| `tls.controllerCertificateFingerprint256` | **none** | Platform/SRE, from the backend certificate | `STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256` | every deployment; render fails without it or in any form but 32 upper-case hex pairs joined by `:` |
| `tls.rotationRevision` | empty | the release author | pod annotation `put.citi.com/tls-rotation-revision` | optional; bump to force a rollout |
| `backendTls.secretName` | `checks-studio-backend-runner-tls` (per-environment in the env files) | Platform/SRE | API and worker pods: Secret volume `runner-tls`; `studio.runner.tls.*` in the mounted `application.yaml` | every deployment with the runner enabled |
| `guided.enabled` | `false` everywhere | the release author | `STUDIO_RUNNER_GUIDED_ENABLED` and the guided set | n/a |
| `guided.workerId` | `worker-1` (the backend's own default) | the release author | runner `GUIDED_WORKER_ID` and backend `translation.worker-id`, one key | guided |
| `guided.token.issuer` | **none** | the external guided-token issuer (register U21) | runner `GUIDED_CONTROLLER_ISSUER` and backend `service-issuer` | guided |
| `guided.token.controllerSubject` | **none** | same | runner `GUIDED_CONTROLLER_SUBJECT` | guided |
| `guided.token.publicKey` | **none** | same (PEM, public, RSA at least 2048 bits) | ConfigMap `<fullname>-studio-guided-controller-key` (runner file) and backend `service-public-key`, one key | guided |
| `guided.callbackToken.secretName` | `checks-studio-guided-callback-token` | the external issuer refreshes it | runner pod: directory mount, file `token`, re-read on every callback | guided |
| `guided.backendTokens.secretName` | `checks-studio-guided-controller-tokens` | the external issuer refreshes it | API and worker pods: files `runner-controller-token` (aud `studio-guided-runner`) and `translation-controller-token` (aud `studio-guided-controller`) | guided |
| `guided.callbackBaseUrl` | empty: `https://<fullname>-api-guided-tls:8443` | the release author | runner `GUIDED_CALLBACK_BASE_URL` and backend `translation.controller-origin` | optional override, https only |
| `guided.tlsConnector.port` / `.servicePort` | 8443 / 8443 | the release author | API container port `guided-tls`, Service `<fullname>-api-guided-tls`, runner egress rule | guided |
| `studioAuditSiem.enabled`, `.sink.name`, `.podAnnotations` | off | Platform/SRE | pod annotations on API and worker; ConfigMap `<fullname>-studio-audit-siem` | optional |

Secrets that must exist **before** the release: `tls.secretName`, `backendTls.secretName`; with guided on also `guided.callbackToken.secretName` and `guided.backendTokens.secretName`. **UAT breaks on upgrade unless they exist first**: `values-uat.yaml` already has `studioRunner.enabled: true`, TLS is mandatory even with guided off, and without the Secret the pod stays in `ContainerCreating` [V, `values-uat.yaml`; K]. In the same release the backend and worker runner URL flips from `http` to `https` (`put-checks.studioRunner.baseUrl`). Runner and callers are not updated atomically, so dispatches during the rollout fail as ambiguous and are left to the reapers. That is the accepted cost of "single path, no compat"; plan the upgrade for a quiet window.

## 2. Certificate requirements (for whoever issues them)

- **Runner certificate** (`tls.secretName`): extended key usage `serverAuth` **and** `clientAuth` (the exec probe presents it as a client certificate), key usage `digitalSignature` (plus `keyEncipherment` for RSA). SANs: `<fullname>-studio-runner`, `<fullname>-studio-runner.<ns>`, `<fullname>-studio-runner.<ns>.svc`, and `.<ns>.svc.cluster.local` if the cluster domain is that (unknown). `127.0.0.1` is not needed: the probe pins instead of verifying the host name. The runner refuses an EKU extension that lacks either purpose (exit 78).
- **Backend certificate** (`backendTls.secretName`, one certificate in two roles, ruling part 1 1.5 c): `clientAuth` toward the runner **and** `serverAuth` for the API's guided connector. SANs must cover `<fullname>-api-guided-tls`, `.<ns>`, `.<ns>.svc` (the host in `GUIDED_CALLBACK_BASE_URL`). Its SHA-256 fingerprint is `tls.controllerCertificateFingerprint256`.
- **CA bundle** (`ca.crt` on the runner, the trust store on the backend): `TLS_CA_FILE` replaces Node's default roots [K], and the JVM trust store replaces `cacerts` (`StudioRunnerTls` never reads the platform default). Each must contain exactly the issuer(s) of the other side's certificate.
- Lifetime and renewal cadence are Platform/SRE's call and unknown to this lane. The test fixture certificate is valid to 2036 and says nothing about production.

## 3. Rotation procedures

| What rotates | Procedure | Why |
|---|---|---|
| Runner certificate or key | Update the `tls` Secret, bump `tls.rotationRevision`, release. If the backend's trust store pins the issuer, update it in the same release. | The runner reads key, certificate and CA **once**; the exec probe re-reads them on **every** run. Without a restart the probe would present the new certificate while the process serves the old one, the pin fails, and liveness restarts the container at an arbitrary moment, mid-session (co-sign 3.5). |
| Backend certificate | Update the `backendTls` Secret, set the new `tls.controllerCertificateFingerprint256`, bump `rotationRevision`, release. API and worker pods are restarted by their checksum or by the same release. | One value pins the inbound client and the outbound callback server. A renewed certificate with an unchanged pin means every inbound call is refused. |
| Guided token key or issuer | Drain sessions, change `guided.token.issuer` and `guided.token.publicKey` **together with** the external issuer's signing key, release. The public-key ConfigMap checksum rolls the runner pod. | `GuidedInternalSecurity`: "rotate by draining sessions, updating the configured key/issuer together and restarting controllers/workers". Strategy `Recreate` makes the runner restart exact. |
| Guided token files (every <= 60 s) | Not a release: the external issuer rewrites the Secret. Tokens live at most 300 s; the kubelet can lag tens of seconds to minutes behind a Secret update [K]. | The files are directory mounts, so updates propagate [K]; a `subPath` mount would go stale and every callback would 401 after five minutes. |

## 4. The token issuer is outside this repository (register U21)

Nothing in the chart or the code mints the three guided token files. A signing key inside the runner pod could also mint `backend-controller` tokens (the backend verifies both roles against one key), a sidecar would break the one-container bound, and a static Secret expires within 300 s. So a guided-enabled shared environment is **blocked** until Platform/SRE delivers an external issuer that refreshes three audience-scoped files. The chart makes this fail closed: an empty token Secret name, issuer, subject or public key fails the render.

## 5. Not claimed

- No certificate was issued, no Secret created, no pod started. The kubelet propagation delay and the effective file modes (`0440` with `fsGroup: 1001`) are [U], owner @devops in a cluster.
- Whether the cluster has a mutating webhook or auto-instrumentation that injects `NODE_OPTIONS` or a sidecar into this pod is unknown (Platform/SRE). The runner fails closed on `NODE_OPTIONS`, and a sidecar would break the one-container bound.
