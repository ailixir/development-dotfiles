{{/*
The shared local evidence claim. A supplied claim wins; otherwise the chart-created name is stable.
*/}}
{{- define "put-checks.objectStore.localClaim" -}}
{{- default (printf "%s-studio-object-store-local" (include "put-checks.fullname" .)) .Values.objectStore.local.existingClaim -}}
{{- end }}

{{/*
Chart name truncated to 63 chars.
*/}}
{{- define "put-checks.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name (release + chart), truncated to 63 chars.
*/}}
{{- define "put-checks.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "put-checks.labels" -}}
helm.sh/chart: {{ include "put-checks.name" . }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: put-platform
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
API component helpers.
*/}}
{{- define "put-checks.api.fullname" -}}
{{ include "put-checks.fullname" . }}-api
{{- end }}

{{- define "put-checks.api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "put-checks.name" . }}-api
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Worker component helpers.
*/}}
{{- define "put-checks.worker.fullname" -}}
{{ include "put-checks.fullname" . }}-worker
{{- end }}

{{- define "put-checks.worker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "put-checks.name" . }}-worker
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Frontend component helpers.
*/}}
{{- define "put-checks.frontend.fullname" -}}
{{ include "put-checks.fullname" . }}-frontend
{{- end }}

{{- define "put-checks.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "put-checks.name" . }}-frontend
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "put-checks.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "put-checks.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Studio runner component helpers (story 10.18a; ADR-001 §3, §9).

The runner is the one component in this chart whose environment is **enumerated rather than
mapped**. `backend`, `worker` and `frontend` all render `{{- range $key, $val := .Values.X.env }}`
and will therefore emit any key an operator writes into a values file — which is how
`PLAYWRIGHT_BROWSERS_PATH` or `HOME` would reach the runner pod and repoint its browser (SEC-2).
The runner's own configuration loader has always been fail-closed by enumeration; this is the
deployment half of the same property.
*/}}
{{- define "put-checks.studioRunner.fullname" -}}
{{ include "put-checks.fullname" . }}-studio-runner
{{- end }}

{{/*
The runner's in-cluster address, rendered from its own Service name and port. The API
(POST /v1/validate) and the worker (POST /v1/runs) both use this one derivation (AC-1).

`https` since STUDIO-OBS-009 (ruling A3): the runner has one TLS listener and no plaintext one in any
configuration, and `StudioRunnerProperties.validate()` rejects `http://` outside local/test. The
Service host is the one the runner certificate's SANs must cover.
*/}}
{{- define "put-checks.studioRunner.baseUrl" -}}
{{ printf "https://%s:%v" (include "put-checks.studioRunner.fullname" .) .Values.studioRunner.service.port }}
{{- end }}

{{/*
Where the runner posts admission and progress: the API's own Service, derived rather than written
as a literal. The literal `http://put-checks-api:8080` was right only for a release named
`put-checks`; any other release name pointed every callback at a Service that does not exist.
`studioRunner.callbackBaseUrl` still overrides it for a deployment that fronts the API differently.
*/}}
{{- define "put-checks.studioRunner.callbackBaseUrl" -}}
{{- if .Values.studioRunner.callbackBaseUrl -}}
{{ .Values.studioRunner.callbackBaseUrl }}
{{- else -}}
{{ printf "http://%s:%v" (include "put-checks.api.fullname" .) .Values.backend.service.port }}
{{- end -}}
{{- end }}

{{- define "put-checks.studioRunner.selectorLabels" -}}
app.kubernetes.io/name: {{ include "put-checks.name" . }}-studio-runner
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: studio-runner
{{- end }}

{{/*
The runner's **dedicated** service account (ADR-001 §9: "should get its own service account when
RBAC differs … decided in 10.18"). Never the chart's shared one: the runner's RBAC is "nothing",
and sharing an account with the API is how "nothing" silently becomes "whatever the API has".
*/}}
{{- define "put-checks.studioRunner.serviceAccountName" -}}
{{- if .Values.studioRunner.serviceAccount.create }}
{{- default (include "put-checks.studioRunner.fullname" .) .Values.studioRunner.serviceAccount.name }}
{{- else }}
{{- required "studioRunner.serviceAccount.name is required when create is false" .Values.studioRunner.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
**The closed environment key list.** Every name here is an accepted key of the runner's own
`ACCEPTED_KEYS` loader (`studio-runner/src/server/config.ts`); a rendered name that is not one
would be a startup failure in the pod, and a values key that is not one fails the render below.

Deliberately a subset: the loader accepts four more keys than this list names (`INSTANCE_ID`,
`SERVICE_IDENTITY`, `CALLBACK_IDENTITY`, `CALLBACK_BASE_URL`); they are rendered directly by the
runner Deployment or left to the runner, and are not reachable through `runnerEnv`. The
`STUDIO_RUNNER_OBSERVED_*` keys, `STUDIO_RUNNER_GUIDED_CAPACITY`, `STUDIO_RUNNER_ALLOWED_DOMAINS` and
`STUDIO_RUNNER_ALLOW_ALL_DOMAINS` are on the list because the Deployment renders them (from
`studioObserved.*`, `studioRunner.guided.capacity`, `studioNavigation.allowedDomains` and
`studioNavigation.allowAllDomains`); they are chart-managed below,
so no `runnerEnv` value reaches them.
What matters is that the list is closed at both ends —
`PLAYWRIGHT_BROWSERS_PATH` and `HOME` are on neither side, and there is no chart path that emits
them.
*/}}
{{- define "put-checks.studioRunner.acceptedEnvKeys" -}}
STUDIO_RUNNER_PORT STUDIO_RUNNER_HOST STUDIO_RUNNER_POOL_SIZE STUDIO_RUNNER_SCRATCH_DIR STUDIO_RUNNER_OBJECT_STORE_DIR STUDIO_RUNNER_OBJECT_STORE_PROVIDER STUDIO_RUNNER_OBJECT_STORE_ENDPOINT STUDIO_RUNNER_OBJECT_STORE_REGION STUDIO_RUNNER_OBJECT_STORE_BUCKET STUDIO_RUNNER_OBJECT_STORE_FORCE_PATH_STYLE STUDIO_RUNNER_OBJECT_STORE_ACCESS_KEY_ID_FILE STUDIO_RUNNER_OBJECT_STORE_SECRET_ACCESS_KEY_FILE STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS STUDIO_RUNNER_OBJECT_STORE_BACKOFF_MS STUDIO_RUNNER_ADMISSION_TIMEOUT_MS STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS STUDIO_RUNNER_VALIDATE_TIMEOUT_MS STUDIO_RUNNER_MAX_REQUEST_BODY_BYTES STUDIO_RUNNER_RETRY_AFTER_SECONDS STUDIO_RUNNER_DRAIN_TIMEOUT_MS STUDIO_RUNNER_RECORDING_WIDTH STUDIO_RUNNER_RECORDING_HEIGHT STUDIO_RUNNER_BROWSER_LAUNCH_TIMEOUT_MS STUDIO_RUNNER_STEP_TIMEOUT_MS STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS STUDIO_RUNNER_MAX_REPORT_STEPS STUDIO_RUNNER_MAX_REPORT_LOG_ENTRIES STUDIO_RUNNER_MAX_REPORT_LOG_ENTRY_LENGTH STUDIO_RUNNER_MAX_REPORT_BODY_BYTES STUDIO_RUNNER_OBJECT_STORE_CREDENTIALS_DIRECTORY STUDIO_RUNNER_TLS_KEY_FILE STUDIO_RUNNER_TLS_CERT_FILE STUDIO_RUNNER_TLS_CA_FILE STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 STUDIO_RUNNER_GUIDED_ENABLED STUDIO_RUNNER_GUIDED_WORKER_ID STUDIO_RUNNER_GUIDED_JOURNAL_DIR STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE STUDIO_RUNNER_GUIDED_CAPACITY STUDIO_RUNNER_ALLOWED_DOMAINS STUDIO_RUNNER_ALLOW_ALL_DOMAINS STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED STUDIO_RUNNER_OBSERVED_CATALOG_FILE STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST
{{- end }}

{{/*
Renders the runner's environment, failing the render on any key outside the closed list.

`fail` rather than "skip the unknown key": a silently dropped key is how an operator concludes the
setting took effect. SEC-2's attack is an operator-shaped one — a values key is the mechanism a
deployment can be repointed with — so the deployment must refuse it loudly.
*/}}
{{- define "put-checks.studioRunner.env" -}}
{{- $accepted := splitList " " (include "put-checks.studioRunner.acceptedEnvKeys" .) -}}
{{- range $key, $val := .Values.studioRunner.runnerEnv }}
{{- if has $key (list "STUDIO_RUNNER_PORT" "STUDIO_RUNNER_SCRATCH_DIR" "STUDIO_RUNNER_OBJECT_STORE_DIR" "STUDIO_RUNNER_OBJECT_STORE_PROVIDER" "STUDIO_RUNNER_OBJECT_STORE_ENDPOINT" "STUDIO_RUNNER_OBJECT_STORE_BUCKET" "STUDIO_RUNNER_OBJECT_STORE_REGION" "STUDIO_RUNNER_OBJECT_STORE_FORCE_PATH_STYLE" "STUDIO_RUNNER_OBJECT_STORE_ACCESS_KEY_ID_FILE" "STUDIO_RUNNER_OBJECT_STORE_SECRET_ACCESS_KEY_FILE" "STUDIO_RUNNER_OBJECT_STORE_CREDENTIALS_DIRECTORY") }}
{{- fail (printf "%s is managed by the chart; use the service, scratch or objectStore values instead" $key) }}
{{- end }}
{{- /* The TLS listener and guided keys are chart-managed too (STUDIO-OBS-009): a values override of
       a key file, the controller fingerprint, the worker id or any guided path would be a second
       derivation of a fact that has one owner, and a guided key set while the switch is off is the
       "half configuration" the runner refuses. Prefix test, so a future guided key is covered. */ -}}
{{- if or (hasPrefix "STUDIO_RUNNER_GUIDED_" $key) (hasPrefix "STUDIO_RUNNER_TLS_" $key) (eq $key "STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256") }}
{{- fail (printf "%s is managed by the chart; use studioRunner.tls.* or studioRunner.guided.* values instead" $key) }}
{{- end }}
{{- /* The observed-replay keys are chart-managed as well (B5 item 3): the flags, the catalog file
       and the image digest are single-sourced from `studioObserved.*`, which also feeds the
       backend. A `runnerEnv` value would be a second, hand-maintained copy of the catalog. Prefix
       test, so a future observed key is covered. */ -}}
{{- if hasPrefix "STUDIO_RUNNER_OBSERVED_" $key }}
{{- fail (printf "%s is managed by the chart; use studioObserved.* values instead" $key) }}
{{- end }}
{{- /* The domain whitelist is single-sourced from `studioNavigation.allowedDomains`, which also feeds
       the backend: a second copy here is how the two images would come to disagree. */ -}}
{{- if eq $key "STUDIO_RUNNER_ALLOWED_DOMAINS" }}
{{- fail "STUDIO_RUNNER_ALLOWED_DOMAINS is managed by the chart; use studioNavigation.allowedDomains (one list for the runner and the backend)" }}
{{- end }}
{{- /* Likewise the allow-all option: one value for both images, or the backend could admit a
       navigation the runner refuses. */ -}}
{{- if eq $key "STUDIO_RUNNER_ALLOW_ALL_DOMAINS" }}
{{- fail "STUDIO_RUNNER_ALLOW_ALL_DOMAINS is managed by the chart; use studioNavigation.allowAllDomains (one switch for the runner and the backend)" }}
{{- end }}
{{- /* The exec probe always dials 127.0.0.1 (launch contract section 5). A HOST that is neither
       0.0.0.0 nor 127.0.0.1 would leave the pod Running and never Ready. */ -}}
{{- if and (eq $key "STUDIO_RUNNER_HOST") (not (has (toString $val) (list "0.0.0.0" "127.0.0.1"))) }}
{{- fail (printf "studioRunner.runnerEnv.STUDIO_RUNNER_HOST must be 0.0.0.0 or 127.0.0.1 (got %q): the exec probe dials 127.0.0.1, so any other bind address leaves the pod Running and never Ready" (toString $val)) }}
{{- end }}
{{- if not (has $key $accepted) }}
{{- fail (printf "studioRunner.runnerEnv carries %q, which is not an accepted STUDIO_RUNNER_* key. The runner's environment is enumerated, not mapped: no values key may introduce a browser path, a HOME, or any credential the runner must not hold (story 10.18a AC-4a, architecture §9.2/§9.3)." $key) }}
{{- end }}
- name: {{ $key }}
  value: {{ $val | quote }}
{{- end }}
{{- end }}

{{/*
The runner's own runtime seconds, read back out of the enumerated environment.

**One derivation, not two** (AC-6). The termination grace period is arithmetic over the values the
pod actually receives, so a deployment cannot raise the browser runtime cap and leave the grace
period behind — which kills admitted work mid-run and is strictly worse than not hardening at all.
*/}}
{{- define "put-checks.studioRunner.derivedGraceSeconds" -}}
{{- $env := .Values.studioRunner.runnerEnv -}}
{{- $runtime := div (int (default 300000 (get $env "STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS"))) 1000 -}}
{{- $stop := div (int (default 5000 (get $env "STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS"))) 1000 -}}
{{- $delivery := div (int (default 30000 (get $env "STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS"))) 1000 -}}
{{- $upload := div (int (default 15000 (get $env "STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS"))) 1000 -}}
{{- $preStop := int .Values.studioRunner.drain.preStopSleepSeconds -}}
{{- $extra := int .Values.studioRunner.drain.extraGraceSeconds -}}
{{- add $runtime $stop $delivery $upload $preStop $extra -}}
{{- end }}

{{/*
The runner's scratch directory: a plain directory **inside** the mounted emptyDir, never the mount
point itself. See the comment in `values.yaml`; the runner's `clearAll()` removes and recreates
this path on start-up, and removing a mount point needs a writable parent, which
`readOnlyRootFilesystem: true` deliberately does not provide.
*/}}
{{- define "put-checks.studioRunner.scratchDir" -}}
{{ printf "%s/%s" (trimSuffix "/" .Values.studioRunner.scratch.mountPath) .Values.studioRunner.scratch.directory }}
{{- end }}

{{/*
------------------------------------------------------------------------------------------------
STUDIO-OBS-009: the one TLS listener, guided mode as a mode of the one process, and the backend's
side of the chain. Nothing below renders a second Deployment.
------------------------------------------------------------------------------------------------
*/}}

{{/* "true" when guided mode is on for a runner that renders, empty otherwise. */}}
{{- define "put-checks.studioRunner.guidedEnabled" -}}
{{- if and .Values.studioRunner.enabled .Values.studioRunner.guided.enabled -}}true{{- end -}}
{{- end }}

{{/*
The mode of every Secret file the pod mounts, in DECIMAL (0440 octal = 288). A constant, not a key:
a values override to 0644 would hand a private key to every user in the container. 0440 plus
`fsGroup: 1001` is enough for the process and for the exec probe, which runs as the same user.
*/}}
{{- define "put-checks.studioRunner.secretFileMode" -}}288{{- end }}

{{/* "true" when two absolute paths are the same or one is inside the other. */}}
{{- define "put-checks.pathsRelated" -}}
{{- $a := printf "%s/" (trimSuffix "/" .a) -}}
{{- $b := printf "%s/" (trimSuffix "/" .b) -}}
{{- if or (hasPrefix $a $b) (hasPrefix $b $a) -}}true{{- end -}}
{{- end }}

{{/* The API-side Service that exposes ONLY the guided TLS connector (the general API Service is untouched). */}}
{{- define "put-checks.studioRunner.guidedTlsServiceName" -}}
{{ include "put-checks.api.fullname" . }}-guided-tls
{{- end }}

{{/*
Where the runner calls back for the guided claim and lifecycle (launch contract 2.4). Its own key
(A2.2): never derived from the replay `callbackBaseUrl`. Empty means this release's guided TLS
Service, whose host the backend certificate's SANs must cover.
*/}}
{{- define "put-checks.studioRunner.guidedCallbackBaseUrl" -}}
{{- if .Values.studioRunner.guided.callbackBaseUrl -}}
{{ .Values.studioRunner.guided.callbackBaseUrl }}
{{- else -}}
{{ printf "https://%s:%v" (include "put-checks.studioRunner.guidedTlsServiceName" .) .Values.studioRunner.guided.tlsConnector.servicePort }}
{{- end -}}
{{- end }}

{{/*
**Render-time guards for the runner's TLS inputs**, applied whenever the runner renders (TLS is
required in every deployment, A3). `fail` with a named key, because the alternative is a pod that
exits 78 in a CrashLoopBackOff nobody connects to a missing values key.
*/}}
{{- define "put-checks.studioRunner.tlsGuard" -}}
{{- if .Values.studioRunner.enabled -}}
{{- $t := .Values.studioRunner.tls -}}
{{- $_ := required "studioRunner.tls.secretName is required: the runner has one TLS listener and no plaintext one (ruling A3)" $t.secretName -}}
{{- $_ := required "studioRunner.backendTls.secretName is required: the API and worker present a client certificate to the runner (ruling A3/A4)" .Values.studioRunner.backendTls.secretName -}}
{{- $pin := required "studioRunner.tls.controllerCertificateFingerprint256 is required and has no default: it is the backend client certificate the runner pins (set it per environment, in the form Node prints: 32 upper-case hex pairs joined by ':')" $t.controllerCertificateFingerprint256 -}}
{{- if not (regexMatch "^([0-9A-F]{2}:){31}[0-9A-F]{2}$" (toString $pin)) -}}
{{- fail "studioRunner.tls.controllerCertificateFingerprint256 must be 32 upper-case hex byte pairs joined by ':' (the form Node prints); the runner refuses any other form without normalising it" -}}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
**The one-replica guided guard** (A2.6, devops co-sign 6.1, PID-1 b). `fail` rather than a values
schema: the chart has none, a schema would validate every component's values for one runner guard,
and a rendered-value `fail` carries a message that names the key and what to set. Called first in
the runner Deployment and again from the API Deployment, so `guided.enabled` with
`studioRunner.enabled: false` cannot silently render nothing.

Every shipped values file sets `replicaCount: 2`; an environment enabling guided mode overrides it
to 1 as well. The default is deliberately not changed.
*/}}
{{- define "put-checks.studioRunner.guidedGuard" -}}
{{- $r := .Values.studioRunner -}}
{{- $g := $r.guided -}}
{{- if $g.enabled -}}
{{- if not $r.enabled -}}
{{- fail "studioRunner.guided.enabled is true but studioRunner.enabled is false: guided mode is a mode of the runner and has no pod of its own. Set studioRunner.enabled: true, or studioRunner.guided.enabled: false" -}}
{{- end -}}
{{- if ne (int $r.replicaCount) 1 -}}
{{- fail (printf "studioRunner.guided.enabled requires studioRunner.replicaCount: 1 (got %v): guided mode runs only on a one-pod runner Deployment (A2.6). The worker holds sessions in memory and a second pod could only produce CONTEXT_LOST refusals. Set studioRunner.replicaCount: 1" $r.replicaCount) -}}
{{- end -}}
{{- if $r.autoscaling.enabled -}}
{{- fail "studioRunner.guided.enabled requires studioRunner.autoscaling.enabled: false: a ScaledObject owns the replica count and guided mode runs only on exactly one pod (A2.6)" -}}
{{- end -}}
{{- if not $r.shareProcessNamespace -}}
{{- fail "studioRunner.guided.enabled requires studioRunner.shareProcessNamespace: true (PID-1 b): without it node is PID 1 in the pod, the launch-tree guard refuses the guided start (CONFIGURATION_DENIED) and the pod crash-loops" -}}
{{- end -}}
{{- $_ := required "studioRunner.guided.workerId is required" $g.workerId -}}
{{- $capacity := toString $g.capacity -}}
{{- if or (not (regexMatch "^[1-8]$" $capacity)) -}}
{{- fail (printf "studioRunner.guided.capacity must be a whole number from 1 to 8 (got %v): it is the runner's STUDIO_RUNNER_GUIDED_CAPACITY and the backend's studio.guided-authoring.max-concurrent-sessions" $g.capacity) -}}
{{- end -}}
{{- $_ := required "studioRunner.guided.token.issuer is required when guided mode is on: it is the iss the runner and the backend both pin (rotation input)" $g.token.issuer -}}
{{- $_ := required "studioRunner.guided.token.controllerSubject is required when guided mode is on" $g.token.controllerSubject -}}
{{- $key := required "studioRunner.guided.token.publicKey is required when guided mode is on: the pinned RSA public key (PEM) that verifies the guided tokens" $g.token.publicKey -}}
{{- if not (hasPrefix "-----BEGIN PUBLIC KEY-----" (trim (toString $key))) -}}
{{- fail "studioRunner.guided.token.publicKey must be a PEM public key beginning -----BEGIN PUBLIC KEY-----" -}}
{{- end -}}
{{- $_ := required "studioRunner.guided.callbackToken.secretName is required when guided mode is on: no token source means no guided callback can ever authenticate (the issuer is external, register U21)" $g.callbackToken.secretName -}}
{{- $_ := required "studioRunner.guided.backendTokens.secretName is required when guided mode is on" $g.backendTokens.secretName -}}
{{- if $g.callbackBaseUrl -}}
{{- if not (hasPrefix "https://" $g.callbackBaseUrl) -}}
{{- fail "studioRunner.guided.callbackBaseUrl must be an https:// URL: the runner refuses any other scheme at start-up" -}}
{{- end -}}
{{- end -}}
{{- if not (and (kindIs "string" $g.journal.directory) (ne $g.journal.directory "") (not (hasPrefix "/" $g.journal.directory))) -}}
{{- fail "studioRunner.guided.journal.directory must be a relative subdirectory name: the journal path is a subdirectory of its mount, never the mount root" -}}
{{- end -}}
{{- /* The journal volume must stay disjoint from every other writable or secret mount: scratch is
       cleared at start and at drain (it would erase the journal), the object store is shared
       evidence storage, and /tmp holds the browser profile. */ -}}
{{- $journal := $g.journal.mountPath -}}
{{- range $other := list $r.scratch.mountPath "/tmp" $.Values.objectStore.localDirectory $r.objectStore.mountPath $r.tls.mountPath $g.controllerPublicKey.mountPath $g.callbackToken.mountPath -}}
{{- if include "put-checks.pathsRelated" (dict "a" $journal "b" $other) -}}
{{- fail (printf "studioRunner.guided.journal.mountPath (%s) must be disjoint from %s: scratch is cleared at start and drain, and the journal must survive both" $journal $other) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
------------------------------------------------------------------------------------------------
Studio navigation: the domain whitelist (STUDIO-FLEX-001 item 1). One list,
`studioNavigation.allowedDomains`, feeds BOTH images: the backend's `studio.navigation.allowed-domains` and the runner's
`STUDIO_RUNNER_ALLOWED_DOMAINS`. Empty denies every navigation. One boolean,
`studioNavigation.allowAllDomains` (default false), feeds both images the same way: the backend's
`studio.navigation.allow-all-domains` and the runner's `STUDIO_RUNNER_ALLOW_ALL_DOMAINS`.
------------------------------------------------------------------------------------------------
*/}}

{{/* The allow-all switch as the string both images read: "true" or "false". Unset (the key removed) is
     "true", the same default `values.yaml` ships (ON for now, user decision 2026-10-25). */}}
{{- define "put-checks.studioNavigation.allowAllDomains" -}}
{{- $nav := .Values.studioNavigation | default dict -}}
{{- if and (hasKey $nav "allowAllDomains") (not (kindIs "invalid" $nav.allowAllDomains)) -}}
{{- if not (kindIs "bool" $nav.allowAllDomains) -}}
{{- fail (printf "studioNavigation.allowAllDomains must be the boolean true or false, not %s %q" (kindOf $nav.allowAllDomains) (toString $nav.allowAllDomains)) -}}
{{- end -}}
{{- end -}}
{{- if or (not (hasKey $nav "allowAllDomains")) (kindIs "invalid" $nav.allowAllDomains) -}}
true
{{- else -}}
{{- ternary "true" "false" $nav.allowAllDomains -}}
{{- end -}}
{{- end }}

{{/* The list as the comma-separated string both images read. Empty list, empty string. */}}
{{- define "put-checks.studioNavigation.allowedDomains" -}}
{{- $nav := .Values.studioNavigation | default dict -}}
{{- join "," ($nav.allowedDomains | default list) -}}
{{- end }}

{{/*
Fails the render on an entry the backend and the runner would refuse at start-up, so a bad list dies
with the entry named instead of as a crash-looping pod: not a lower-case ASCII (punycode) domain name
(this covers wildcards, schemes, ports, paths, trailing dots, upper case and IPv6 literals), an IPv4
literal or any name ending in an all-digit label, more than 32 entries, and overlapping entries (one
equal to, or a subdomain of, another: exactly one read grant must match a page). Called from the API
Deployment (it renders without a runner) and from the runner Deployment.
*/}}
{{- define "put-checks.studioNavigation.guard" -}}
{{- $nav := .Values.studioNavigation | default dict -}}
{{- $_ := include "put-checks.studioNavigation.allowAllDomains" . -}}
{{- $domains := $nav.allowedDomains | default list -}}
{{- if not (kindIs "slice" $domains) -}}
{{- fail "studioNavigation.allowedDomains must be a list of domain names (an empty list denies every navigation)" -}}
{{- end -}}
{{- if gt (len $domains) 32 -}}
{{- fail (printf "studioNavigation.allowedDomains has %d entries; at most 32 are accepted" (len $domains)) -}}
{{- end -}}
{{- range $i, $entry := $domains -}}
{{- if not (kindIs "string" $entry) -}}
{{- fail (printf "studioNavigation.allowedDomains[%d] must be a string, not %s" $i (kindOf $entry)) -}}
{{- end -}}
{{- if or (gt (len $entry) 253) (not (regexMatch "^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$" $entry)) -}}
{{- fail (printf "studioNavigation.allowedDomains[%d] %q is not an accepted entry: use a lower-case domain name (punycode for IDN) with no wildcard, scheme, port, path, trailing dot or IP literal" $i $entry) -}}
{{- end -}}
{{- if regexMatch "(^|[.])[0-9]+$" $entry -}}
{{- fail (printf "studioNavigation.allowedDomains[%d] %q ends in an all-digit label, which is how an IP literal looks: IP literals are not accepted" $i $entry) -}}
{{- end -}}
{{- range $j, $other := $domains -}}
{{- if and (ne $i $j) (or (eq $entry $other) (hasSuffix (printf ".%s" $other) $entry)) -}}
{{- fail (printf "studioNavigation.allowedDomains[%d] %q overlaps [%d] %q: no entry may equal or be a subdomain of another (list only the shorter one)" $i $entry $j $other) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
------------------------------------------------------------------------------------------------
Observed replay (STUDIO-OBS-009 residue; architect ruling OI-06, B5). One top-level `studioObserved`
block feeds BOTH images, because the backend and the runner must hold the SAME catalog entry: the
runner's `STUDIO_RUNNER_OBSERVED_*` keys, and the backend's `studio.observed-replay.catalog-json`.
Without it a chart-deployed runner answers 503 to every Studio run and the backend answers 409 RUNTIME_INCOMPATIBLE to every publication.
------------------------------------------------------------------------------------------------
*/}}

{{/* "true" when either observed flag is on, empty otherwise. The guard below keeps both bool. */}}
{{- define "put-checks.studioObserved.enabled" -}}
{{- if or .Values.studioObserved.validationEnabled .Values.studioObserved.replayEnabled -}}true{{- end -}}
{{- end }}

{{/* The ConfigMap that carries the runner's catalog.json (public hashes, not secrets). */}}
{{- define "put-checks.studioObserved.configMapName" -}}
{{ include "put-checks.fullname" . }}-studio-observed-trust
{{- end }}

{{/*
Fails the render unless `.build` is a well-formed BuildIdentity (`replay-profile.schema.json`
`#/definitions/BuildIdentity`: five required keys, no others; the four hashes and the image digest are
64 lower-case hex characters, with no "sha256:" prefix). `.path` names the value in the message.
Hashes must be YAML STRINGS: an all-digit hash written unquoted is a number, and loses digits.
*/}}
{{- define "put-checks.studioObserved.buildGuard" -}}
{{- $path := .path -}}
{{- $b := .build -}}
{{- if not (kindIs "map" $b) -}}
{{- fail (printf "%s.build must be a map with exactly profileHash, schemaBundleHash, referenceBundleHash, executableImageDigest and chromiumBuild" $path) -}}
{{- end -}}
{{- $want := "chromiumBuild,executableImageDigest,profileHash,referenceBundleHash,schemaBundleHash" -}}
{{- if ne (join "," (keys $b | sortAlpha)) $want -}}
{{- fail (printf "%s.build must have exactly the keys profileHash, schemaBundleHash, referenceBundleHash, executableImageDigest and chromiumBuild (got: %s)" $path (join ", " (keys $b | sortAlpha))) -}}
{{- end -}}
{{- range $k := list "profileHash" "schemaBundleHash" "referenceBundleHash" "executableImageDigest" -}}
{{- $v := get $b $k -}}
{{- if not (and (kindIs "string" $v) (regexMatch "^[a-f0-9]{64}$" $v)) -}}
{{- fail (printf "%s.build.%s must be a quoted string of 64 lower-case hex characters, without a sha256: prefix (BuildIdentity pattern ^[a-f0-9]{64}$)" $path $k) -}}
{{- end -}}
{{- end -}}
{{- $chromium := get $b "chromiumBuild" -}}
{{- if not (and (kindIs "string" $chromium) (ge (len $chromium) 1) (le (len $chromium) 256)) -}}
{{- fail (printf "%s.build.chromiumBuild must be a string of 1 to 256 characters" $path) -}}
{{- end -}}
{{- end }}

{{/*
Lists, one per line, every key in a (possibly nested) map whose normalised spelling is one of the
backend's observed catalog input. Same normalisation as `springConfig.validateProperties`
(lower-case, alphanumerics only), so relaxed spellings and nested maps are caught. Both the Spring
property names and the environment aliases `application.yml` reads are reserved.
*/}}
{{- define "put-checks.studioObserved.overrideHits" -}}
{{- $reserved := list "studioobservedreplaycatalogjson" "studioobservedcatalogjson" -}}
{{- range $key, $value := .values -}}
{{- $path := printf "%s.%s" $.path $key | trimPrefix "." -}}
{{- $normalized := regexReplaceAll "[^a-z0-9]" (lower $path) "" -}}
{{- if has $normalized $reserved -}}
{{- $path }}{{ "\n" }}
{{- end -}}
{{- if kindIs "map" $value -}}
{{- include "put-checks.studioObserved.overrideHits" (dict "values" $value "path" $path) -}}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
**The observed-replay render guards** (B5 item 8), called first from the API Deployment (so
`enabled` with the runner off cannot silently render nothing) and from the runner Deployment. Each
is a `fail` naming the key and what to set.

- G-O1: either flag on requires `studioRunner.enabled`.
- G-O2: either flag on requires a well-formed `catalog` (exactly `build` and `profile`; the
  BuildIdentity shape), and well-formed `additionalBackendCatalog` entries.
- G-O3: the catalog list the backend reads stays within the BACKEND's bounds (`ObservedReplayPins`:
  at most 16 entries, at most 65,536 bytes of JSON).
- G-O4: either flag on forbids a second source for the backend's catalog in `configOverrides` or
  `env` on either component, so the two images cannot drift apart.

Before the four, and always: the flags must be real booleans. `--set-string` would give the string
"false", which is truthy in a template and would switch the feature on while the manifest said off.
*/}}
{{- define "put-checks.studioObserved.guard" -}}
{{- $o := .Values.studioObserved -}}
{{- range $flag := list "validationEnabled" "replayEnabled" -}}
{{- if not (kindIs "bool" (get $o $flag)) -}}
{{- fail (printf "studioObserved.%s must be a boolean (true or false), not %s: a string \"false\" is truthy and would switch observed replay on" $flag (kindOf (get $o $flag))) -}}
{{- end -}}
{{- end -}}
{{- if include "put-checks.studioObserved.enabled" . -}}
{{- /* G-O1 */ -}}
{{- if not .Values.studioRunner.enabled -}}
{{- fail "studioObserved.validationEnabled or studioObserved.replayEnabled is true but studioRunner.enabled is false: observed replay is a mode of the runner and has no pod of its own. Set studioRunner.enabled: true, or turn both studioObserved flags off" -}}
{{- end -}}
{{- /* G-O2 */ -}}
{{- $catalog := $o.catalog -}}
{{- if not (kindIs "map" $catalog) -}}
{{- fail "studioObserved.catalog must be a map with exactly the keys build and profile: the runner image's own catalog entry, generated by CI from the pushed image (supply it with -f observed-catalog.<digest>.yaml)" -}}
{{- end -}}
{{- if ne (join "," (keys $catalog | sortAlpha)) "build,profile" -}}
{{- fail "studioObserved.catalog must have exactly the keys build and profile and no default: it is the runner image's own catalog entry, generated by CI from the pushed image (supply it with -f observed-catalog.<digest>.yaml)" -}}
{{- end -}}
{{- if not (kindIs "map" $catalog.profile) -}}
{{- fail "studioObserved.catalog.profile must be a map (the replay profile)" -}}
{{- end -}}
{{- include "put-checks.studioObserved.buildGuard" (dict "build" $catalog.build "path" "studioObserved.catalog") -}}
{{- if not (kindIs "slice" $o.additionalBackendCatalog) -}}
{{- fail "studioObserved.additionalBackendCatalog must be a list of catalog entries" -}}
{{- end -}}
{{- range $i, $entry := $o.additionalBackendCatalog -}}
{{- $where := printf "studioObserved.additionalBackendCatalog[%d]" $i -}}
{{- if not (and (kindIs "map" $entry) (eq (join "," (keys $entry | sortAlpha)) "build,profile") (kindIs "map" $entry.profile)) -}}
{{- fail (printf "%s must be a map with exactly the keys build and profile" $where) -}}
{{- end -}}
{{- include "put-checks.studioObserved.buildGuard" (dict "build" $entry.build "path" $where) -}}
{{- end -}}
{{- /* G-O3 */ -}}
{{- $backendCatalog := prepend $o.additionalBackendCatalog $catalog -}}
{{- if gt (len $backendCatalog) 16 -}}
{{- fail (printf "studioObserved.catalog plus additionalBackendCatalog is %d entries; the backend accepts at most 16 (ObservedReplayPins)" (len $backendCatalog)) -}}
{{- end -}}
{{- if gt (len (toJson $backendCatalog)) 65536 -}}
{{- fail (printf "studioObserved.catalog plus additionalBackendCatalog is %d bytes as JSON; the backend accepts at most 65536 (ObservedReplayPins)" (len (toJson $backendCatalog))) -}}
{{- end -}}
{{- /* G-O4 */ -}}
{{- range $label, $map := dict "backend.configOverrides" (.Values.backend.configOverrides | default dict) "worker.configOverrides" (.Values.worker.configOverrides | default dict) "backend.env" (.Values.backend.env | default dict) "worker.env" (.Values.worker.env | default dict) -}}
{{- $hits := include "put-checks.studioObserved.overrideHits" (dict "values" $map "path" "") | trim -}}
{{- if $hits -}}
{{- fail (printf "%s sets %s while studioObserved is on: the backend's catalog is rendered from studioObserved.catalog and additionalBackendCatalog (one source for the backend and the runner). Remove it from %s" $label (replace "\n" ", " $hits) $label) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
The backend's (API and worker) side of the runner TLS chain: the Secret holding its key store, trust
store and their password FILES (read-only, mode 0440, directory mount with no `subPath`), and with
guided mode on the Secret of the two backend-to-runner bearer files. Separate Secrets from the
runner's own on purpose: the runner pod must never hold the backend's private key, nor the backend
the runner's.
*/}}
{{- define "put-checks.backend.runnerMounts" -}}
{{- if .Values.studioRunner.enabled }}
- name: runner-tls
  mountPath: {{ .Values.studioRunner.backendTls.mountPath }}
  readOnly: true
{{- if include "put-checks.studioRunner.guidedEnabled" . }}
- name: guided-controller-tokens
  mountPath: {{ .Values.studioRunner.guided.backendTokens.mountPath }}
  readOnly: true
{{- end }}
{{- end }}
{{- end }}

{{- define "put-checks.backend.runnerVolumes" -}}
{{- if .Values.studioRunner.enabled }}
{{- $t := .Values.studioRunner.backendTls }}
- name: runner-tls
  secret:
    secretName: {{ $t.secretName }}
    defaultMode: {{ include "put-checks.studioRunner.secretFileMode" . }}
    items:
      - key: {{ $t.keyStoreKey }}
        path: {{ $t.keyStoreKey }}
      - key: {{ $t.keyStorePasswordKey }}
        path: {{ $t.keyStorePasswordKey }}
      - key: {{ $t.trustStoreKey }}
        path: {{ $t.trustStoreKey }}
      - key: {{ $t.trustStorePasswordKey }}
        path: {{ $t.trustStorePasswordKey }}
{{- if include "put-checks.studioRunner.guidedEnabled" . }}
{{- $b := .Values.studioRunner.guided.backendTokens }}
- name: guided-controller-tokens
  secret:
    secretName: {{ $b.secretName }}
    defaultMode: {{ include "put-checks.studioRunner.secretFileMode" . }}
    items:
      - key: {{ $b.runnerTokenKey }}
        path: {{ $b.runnerTokenKey }}
      - key: {{ $b.translationTokenKey }}
        path: {{ $b.translationTokenKey }}
{{- end }}
{{- end }}
{{- end }}

{{/*
The studio audit stream's routing guard (STUDIO-OBS-009 AC-5). Enabled routing must name its sink.
*/}}
{{- define "put-checks.studioAuditSiem.guard" -}}
{{- if .Values.studioAuditSiem.enabled -}}
{{- $_ := required "studioAuditSiem.sink.name is required when studioAuditSiem.enabled is true: a deployment may not claim routing to a sink it did not name (sink provisioning is Platform/SRE's)" .Values.studioAuditSiem.sink.name -}}
{{- end -}}
{{- end }}

{{/*
The Spring properties the CHART owns on the API and worker pods, merged over `configOverrides` into
the one mounted `application.yaml` (story 10.27: canonical dotted names, never environment
spelling). Returns a YAML map. The names below are reserved in `validateProperties`, so a
`configOverrides` entry for any of them fails the render.

Property names for `studio.runner.tls.*` are `StudioRunnerTls.Settings`'s (D3.0 receipt). The
connector port is `studio.guided-authoring.connector.port`, the name the backend reads
(`GuidedSessionConfiguration`, lane D3; architect ruling 4(iv), pre-F-merge). The connector hard-codes
`clientAuth` as required, so the chart renders no client-auth knob.

role is "api" or "worker". The API verifies guided tokens and terminates the guided connector; the
worker only calls out (runner dispatch, stop re-drives, the translation coordinator).
*/}}
{{- define "put-checks.backend.springProperties" -}}
{{- $root := .root -}}
{{- $component := ternary $root.Values.backend $root.Values.worker (eq .role "api") -}}
{{- $props := deepCopy ($component.configOverrides | default dict) -}}
{{- /* The domain whitelist, rendered in every deployment (empty string = deny all) from the one list
       the runner also reads. */ -}}
{{- $_ := set $props "studio.navigation.allowed-domains" (include "put-checks.studioNavigation.allowedDomains" $root) -}}
{{- $_ := set $props "studio.navigation.allow-all-domains" (include "put-checks.studioNavigation.allowAllDomains" $root) -}}
{{- if $root.Values.studioRunner.enabled -}}
{{- /* The replay run deadline is the runner's own value: one fact, read back out of `runnerEnv` (the
       map the runner Deployment renders its environment from), never restated. */ -}}
{{- $runnerEnv := $root.Values.studioRunner.runnerEnv | default dict -}}
{{- if hasKey $runnerEnv "STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS" -}}
{{- $_ := set $props "studio.execution.total-runtime" (printf "%dms" (int64 (get $runnerEnv "STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS"))) -}}
{{- end -}}
{{- $t := $root.Values.studioRunner.backendTls -}}
{{- $mount := trimSuffix "/" $t.mountPath -}}
{{- $_ := set $props "studio.runner.tls.key-store" (printf "%s/%s" $mount $t.keyStoreKey) -}}
{{- $_ := set $props "studio.runner.tls.key-store-password-file" (printf "%s/%s" $mount $t.keyStorePasswordKey) -}}
{{- $_ := set $props "studio.runner.tls.key-store-type" $t.storeType -}}
{{- $_ := set $props "studio.runner.tls.trust-store" (printf "%s/%s" $mount $t.trustStoreKey) -}}
{{- $_ := set $props "studio.runner.tls.trust-store-password-file" (printf "%s/%s" $mount $t.trustStorePasswordKey) -}}
{{- $_ := set $props "studio.runner.tls.trust-store-type" $t.storeType -}}
{{- end -}}
{{- if include "put-checks.studioRunner.guidedEnabled" $root -}}
{{- $g := $root.Values.studioRunner.guided -}}
{{- $tokens := trimSuffix "/" $g.backendTokens.mountPath -}}
{{- $_ := set $props "studio.guided-authoring.runner-origin" (include "put-checks.studioRunner.baseUrl" $root) -}}
{{- $_ := set $props "studio.guided-authoring.controller-token-file" (printf "%s/%s" $tokens $g.backendTokens.runnerTokenKey) -}}
{{- $_ := set $props "studio.guided-authoring.translation.controller-token-file" (printf "%s/%s" $tokens $g.backendTokens.translationTokenKey) -}}
{{- $_ := set $props "studio.guided-authoring.translation.controller-origin" (include "put-checks.studioRunner.guidedCallbackBaseUrl" $root) -}}
{{- $_ := set $props "studio.guided-authoring.translation.worker-id" $g.workerId -}}
{{- $_ := set $props "studio.guided-authoring.max-concurrent-sessions" (int $g.capacity) -}}
{{- if eq $.role "api" -}}
{{- $_ := set $props "studio.guided-authoring.service-issuer" $g.token.issuer -}}
{{- $_ := set $props "studio.guided-authoring.service-public-key" $g.token.publicKey -}}
{{- $_ := set $props "studio.guided-authoring.mtls-required" true -}}
{{- $_ := set $props "studio.guided-authoring.connector.port" (int $g.tlsConnector.port) -}}
{{- end -}}
{{- end -}}
{{- if include "put-checks.studioObserved.enabled" $root -}}
{{- /* One source for both images (B5 item 7). The runner's own entry is FIRST: `selected()` takes the
       first element, and the rest are older builds the backend may still accept for retained
       artifacts. The runner never sees `additionalBackendCatalog`. */ -}}
{{- $o := $root.Values.studioObserved -}}
{{- $_ := set $props "studio.observed-replay.catalog-json" (toJson (prepend $o.additionalBackendCatalog $o.catalog)) -}}
{{- end -}}
{{- toYaml $props -}}
{{- end }}

{{/*
Studio SSE edge helpers (story 10.18b; architecture §5.5, SSE assessment).

**The idle timeout is derived, not restated.** `proxy-read-timeout` is the bound that decides
whether an idle stream survives its heartbeat; `STUDIO_SSE_LIFETIME` is the bound that decides how
long the application keeps the stream open. They are one fact with two consumers, and this epic's
most-repeated defect is one fact written down twice. The timeout is therefore computed from the
lifetime plus a stated margin, so a deployment that lengthens the lifetime cannot leave the proxy
behind.

It is deliberately **not** computed from the heartbeat. AC-13a's falsification is "raise the
heartbeat above the timeout and watch the comparison go red"; a timeout that rose with the
heartbeat could never be observed to fail, which is a guard that cannot fire — the shape this
epic has catalogued nineteen times.

There is also deliberately **no `fail` guard here** for heartbeat >= timeout. A render that died
would pre-empt the assertion that is supposed to discriminate, and the test would then be green
because the render never produced a manifest to check. That is catalogued shape 8, "an assertion
whose discriminating mechanism is pre-empted by a different guard". The relation is asserted on
the rendered manifest instead, where a reviewer can watch it fail.
*/}}
{{- define "put-checks.studioSse.idleTimeoutSeconds" -}}
{{- add (int .Values.studioSse.lifetimeSeconds) (int .Values.studioSse.idleTimeoutMarginSeconds) -}}
{{- end }}

{{/*
The two browser-facing streaming paths, as nginx regular expressions.

`{id}` is a UUID in the contract; `[^/]+` is deliberately looser than a UUID pattern, because a
path that failed to match would send a live stream through the buffered default location and the
symptom would be "SSE sometimes does not work". The looseness is bounded by the segment separator:
neither expression can match an ordinary REST path, which is asserted by running real URLs against
the rendered expressions rather than by comparing the expressions to strings.
*/}}
{{- define "put-checks.studioSse.eventsPath" -}}
/api/v1/studio/executions/[^/]+/events
{{- end }}

{{- define "put-checks.studioSse.videoPath" -}}
/api/v1/studio/executions/[^/]+/video
{{- end }}

{{/*
Annotation names this chart owns on the streaming Ingress. `extraAnnotations` may not name any of
them: a collision is a second derivation of a bound that has one owner, and silently letting
either side win is how a timeout ends up disagreeing with the heartbeat it was supposed to exceed.
*/}}
{{- define "put-checks.studioSse.managedAnnotations" -}}
nginx.ingress.kubernetes.io/use-regex nginx.ingress.kubernetes.io/proxy-buffering nginx.ingress.kubernetes.io/proxy-request-buffering nginx.ingress.kubernetes.io/proxy-read-timeout nginx.ingress.kubernetes.io/proxy-send-timeout
{{- end }}

{{/* The mounted Spring source is mandatory and cannot be replaced by an env/secret entry. */}}
{{- define "put-checks.springConfig.validate" -}}
{{- include "put-checks.springConfig.validateProperties" (dict "values" .configOverrides "path" "") -}}
{{- if regexMatch "(^|,)\\s*(local|test)\\s*(,|$)" (lower .springProfile) -}}
{{- fail "local and test profiles are not deployable; select the component's remote springProfile" -}}
{{- end -}}
{{- range $key, $_ := .env -}}
{{- include "put-checks.springConfig.validateEnvironmentKey" $key -}}
{{- end -}}
{{- range .envFromSecrets -}}
{{- range .keys -}}
{{- include "put-checks.springConfig.validateEnvironmentKey" . -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Environment selectors are reserved too: they can bypass the validated mounted source. */}}
{{- define "put-checks.springConfig.validateEnvironmentKey" -}}
{{- $normalized := regexReplaceAll "[^a-z0-9]" (lower .) "" -}}
{{- /* The mounted application.yaml outranks the packaged ${ENV_ALIAS:default} placeholders, so an env
       value for these would be silently ignored: refuse it where the one source is named. */ -}}
{{- if eq $normalized "studioalloweddomains" -}}
{{- fail (printf "%s is managed by the chart; use studioNavigation.allowedDomains (one list for the backend and the runner)" .) -}}
{{- end -}}
{{- if eq $normalized "studioallowalldomains" -}}
{{- fail (printf "%s is managed by the chart; use studioNavigation.allowAllDomains (one switch for the backend and the runner)" .) -}}
{{- end -}}
{{- if eq $normalized "studiototalruntime" -}}
{{- fail (printf "%s is managed by the chart; it renders from studioRunner.runnerEnv.STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS (one run deadline for the runner and the backend)" .) -}}
{{- end -}}
{{- if or (hasPrefix "springprofiles" $normalized) (has $normalized (list "springapplicationjson" "springconfigimport" "springconfiglocation" "springconfigadditionallocation")) -}}
{{- fail (printf "%s is managed by the chart; use dedicated profile values or configOverrides" .) -}}
{{- end -}}
{{- end -}}

{{/* Additional config outranks packaged ${ENV_ALIAS:default} placeholders. Keep chart-owned
     controls on their dedicated values/Secret path, including nested/relaxed key spellings. */}}
{{- define "put-checks.springConfig.validateProperties" -}}
{{/* Current studio.gateway facts emitted from studioGateway.* are reserved together with the
     credentials placeholder alias; the old compile spellings remain denied below. */}}
{{- $protected := list
  "springprofilesactive" "springconfigimport" "springconfiglocation" "springconfigadditionallocation"
  "checkscorsallowedorigins" "checkscoreservicebaseurl"
  "checkssecuritybypasscoreservice" "checkssecuritybypassidentityheaders" "checkssecuritybypasscsiread"
  "studioexecutionenabled" "studioexecutiondispatcherenabled" "studioexecutionevidenceretention"
  "studioexecutioncallbackservicetoken" "studioexecutionsseheartbeat" "studioexecutionsselifetime"
  "studiorunnerbaseurl" "studiorunnerserviceidentitytoken"
  "studiostorageprovider" "studiostoragebucket" "studiostorageregion" "studiostoragecredentialsdirectory"
  "studiostoragedirectory"
  "studioexecutionvideostoreprovider" "studioexecutionvideostoredirectory" "studioexecutionvideostorebucket"
  "studioexecutionvideostoreendpoint" "studioexecutionvideostoreregion" "studioexecutionvideostorepathstyleaccess"
  "studioexecutionvideostoreaccesskeyidfile" "studioexecutionvideostoresecretaccesskeyfile"
  "studioexecutionvideostoreconnecttimeout" "studioexecutionvideostorerequesttimeout"
  "studiosecretsvaultprovider" "studiosecretsvaulthashicorpaddress" "studiosecretsvaulthashicorpnamespace"
  "studiosecretsvaulthashicorpmount" "studiosecretsvaulthashicorppathtemplate" "studiosecretsvaulthashicorpvaluekey"
  "studiosecretsvaulthashicorptokenfile" "studiosecretsvaulthashicorpconnecttimeout"
  "studiosecretsvaulthashicorprequesttimeout" "studiosecretsvaulthashicorpmaxresponsebytes"
  "studiogatewayprovider" "studiogatewayendpoint" "studiogatewayproject"
  "studiogatewaylocation" "studiogatewaymodel" "studiogatewaycredentialsmode"
  "studiogatewaycredentialsserviceaccountkeyfile" "studiogatewaycredentialskeyfile"
  "studiocompilegatewayprovider" "studiocompilegatewayendpoint" "studiocompilegatewayproject"
  "studiocompilegatewaylocation" "studiocompilegatewaymodel" "studiocompilegatewaycredentialsmode"
  "studiocompilegatewaycredentialsserviceaccountkeyfile"
  "studiorunnertlskeystore" "studiorunnertlskeystorepasswordfile" "studiorunnertlskeystoretype"
  "studiorunnertlstruststore" "studiorunnertlstruststorepasswordfile" "studiorunnertlstruststoretype"
  "studioguidedauthoringrunnerorigin" "studioguidedauthoringcontrollertokenfile"
  "studioguidedauthoringtranslationcontrollertokenfile" "studioguidedauthoringtranslationcontrollerorigin"
  "studioguidedauthoringtranslationworkerid" "studioguidedauthoringserviceissuer"
  "studioguidedauthoringservicepublickey" "studioguidedauthoringmtlsrequired"
  "studioguidedauthoringconnectorport" "studioguidedauthoringmaxconcurrentsessions"
  "studionavigationalloweddomains" "studionavigationallowalldomains" "studioexecutiontotalruntime"
-}}
{{- range $key, $value := .values -}}
{{- $path := printf "%s.%s" $.path $key | trimPrefix "." -}}
{{- $normalized := regexReplaceAll "[^a-z0-9]" (lower $path) "" -}}
{{- if or (has $normalized $protected) (hasPrefix "springprofiles" $normalized) (eq $normalized "springapplicationjson") -}}
{{- fail (printf "configOverrides property %s is managed by the chart; use its dedicated values or Secret references" $path) -}}
{{- end -}}
{{- if kindIs "map" $value -}}
{{- include "put-checks.springConfig.validateProperties" (dict "values" $value "path" $path) -}}
{{- end -}}
{{- end -}}
{{- end -}}
