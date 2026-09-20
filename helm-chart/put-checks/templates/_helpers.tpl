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
*/}}
{{- define "put-checks.studioRunner.baseUrl" -}}
{{ printf "http://%s:%v" (include "put-checks.studioRunner.fullname" .) .Values.studioRunner.service.port }}
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

Deliberately a subset: the loader accepts thirty-six keys and the deployment sets the ones a
staging pod needs. What matters is that the list is closed at both ends —
`PLAYWRIGHT_BROWSERS_PATH` and `HOME` are on neither side, and there is no chart path that emits
them.
*/}}
{{- define "put-checks.studioRunner.acceptedEnvKeys" -}}
STUDIO_RUNNER_PORT STUDIO_RUNNER_HOST STUDIO_RUNNER_POOL_SIZE STUDIO_RUNNER_SCRATCH_DIR STUDIO_RUNNER_OBJECT_STORE_DIR STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS STUDIO_RUNNER_OBJECT_STORE_BACKOFF_MS STUDIO_RUNNER_ADMISSION_TIMEOUT_MS STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS STUDIO_RUNNER_VALIDATE_TIMEOUT_MS STUDIO_RUNNER_MAX_REQUEST_BODY_BYTES STUDIO_RUNNER_RETRY_AFTER_SECONDS STUDIO_RUNNER_DRAIN_TIMEOUT_MS STUDIO_RUNNER_RECORDING_WIDTH STUDIO_RUNNER_RECORDING_HEIGHT STUDIO_RUNNER_BROWSER_LAUNCH_TIMEOUT_MS STUDIO_RUNNER_STEP_TIMEOUT_MS STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS STUDIO_RUNNER_MAX_REPORT_STEPS STUDIO_RUNNER_MAX_REPORT_LOG_ENTRIES STUDIO_RUNNER_MAX_REPORT_LOG_ENTRY_LENGTH STUDIO_RUNNER_MAX_REPORT_BODY_BYTES STUDIO_RUNNER_OBJECT_STORE_PROVIDER STUDIO_RUNNER_OBJECT_STORE_BUCKET STUDIO_RUNNER_OBJECT_STORE_REGION STUDIO_RUNNER_OBJECT_STORE_CREDENTIALS_DIRECTORY
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
{{- if has $key (list "STUDIO_RUNNER_PORT" "STUDIO_RUNNER_SCRATCH_DIR" "STUDIO_RUNNER_OBJECT_STORE_DIR" "STUDIO_RUNNER_OBJECT_STORE_PROVIDER" "STUDIO_RUNNER_OBJECT_STORE_BUCKET" "STUDIO_RUNNER_OBJECT_STORE_REGION" "STUDIO_RUNNER_OBJECT_STORE_CREDENTIALS_DIRECTORY") }}
{{- fail (printf "%s is managed by the chart; use the service, scratch or objectStore values instead" $key) }}
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
{{- $runtime := div (int (default 120000 (get $env "STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS"))) 1000 -}}
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

{{/*
The Studio object-store properties the API and the worker both bind (`studio.storage.*`).

MERGE NOTE (Epic 10 fold): the wt/epic version of this helper also emitted STUDIO_RUNNER_BASE_URL,
STUDIO_RUNNER_SERVICE_TOKEN and STUDIO_CALLBACK_SERVICE_TOKEN into BOTH Deployments. The API and
worker templates already render those three themselves, with the reasoning for who gets which, so
the helper duplicated three env names per container and — because it is included by the worker too
— handed the worker the runner's CALLBACK identity key. `test/deployment/chart.test.ts` asserts the
worker is given the dispatch bearer only and never that key, so only the storage entries are left
here; the identities stay where each Deployment explains them.
*/}}
{{- define "put-checks.studio.backendEnv" -}}
{{- if .Values.studioRunner.enabled }}
- name: STUDIO_STORAGE_PROVIDER
  value: {{ .Values.objectStore.provider | quote }}
- name: STUDIO_STORAGE_BUCKET
  value: {{ .Values.objectStore.bucket | quote }}
- name: STUDIO_STORAGE_REGION
  value: {{ .Values.objectStore.region | quote }}
- name: STUDIO_STORAGE_CREDENTIALS_DIRECTORY
  value: {{ .Values.objectStore.mountPath | quote }}
{{- end }}
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
{{- if or (hasPrefix "springprofiles" $normalized) (has $normalized (list "springapplicationjson" "springconfigimport" "springconfiglocation" "springconfigadditionallocation")) -}}
{{- fail (printf "%s is managed by the chart; use dedicated profile values or configOverrides" .) -}}
{{- end -}}
{{- end -}}

{{/* Additional config outranks packaged ${ENV_ALIAS:default} placeholders. Keep chart-owned
     controls on their dedicated values/Secret path, including nested/relaxed key spellings. */}}
{{- define "put-checks.springConfig.validateProperties" -}}
{{- $protected := list
  "springprofilesactive" "springconfigimport" "springconfiglocation" "springconfigadditionallocation"
  "checkscorsallowedorigins" "checkscoreservicebaseurl"
  "checkssecuritybypasscoreservice" "checkssecuritybypassidentityheaders" "checkssecuritybypasscsiread"
  "studioexecutionenabled" "studioexecutiondispatcherenabled" "studioexecutionevidenceretention"
  "studioexecutioncallbackservicetoken" "studioexecutionsseheartbeat" "studioexecutionsselifetime"
  "studiorunnerbaseurl" "studiorunnerserviceidentitytoken"
  "studiostorageprovider" "studiostoragebucket" "studiostorageregion" "studiostoragecredentialsdirectory"
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
