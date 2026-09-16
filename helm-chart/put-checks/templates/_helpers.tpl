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

Deliberately a subset: the loader accepts thirty-one keys and the deployment sets the ones a
staging pod needs. What matters is that the list is closed at both ends —
`PLAYWRIGHT_BROWSERS_PATH` and `HOME` are on neither side, and there is no chart path that emits
them.
*/}}
{{- define "put-checks.studioRunner.acceptedEnvKeys" -}}
STUDIO_RUNNER_PORT STUDIO_RUNNER_HOST STUDIO_RUNNER_POOL_SIZE STUDIO_RUNNER_SCRATCH_DIR STUDIO_RUNNER_OBJECT_STORE_DIR STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS STUDIO_RUNNER_OBJECT_STORE_BACKOFF_MS STUDIO_RUNNER_ADMISSION_TIMEOUT_MS STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS STUDIO_RUNNER_VALIDATE_TIMEOUT_MS STUDIO_RUNNER_MAX_REQUEST_BODY_BYTES STUDIO_RUNNER_RETRY_AFTER_SECONDS STUDIO_RUNNER_DRAIN_TIMEOUT_MS STUDIO_RUNNER_RECORDING_WIDTH STUDIO_RUNNER_RECORDING_HEIGHT STUDIO_RUNNER_BROWSER_LAUNCH_TIMEOUT_MS STUDIO_RUNNER_STEP_TIMEOUT_MS STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS STUDIO_RUNNER_MAX_REPORT_STEPS STUDIO_RUNNER_MAX_REPORT_LOG_ENTRIES STUDIO_RUNNER_MAX_REPORT_LOG_ENTRY_LENGTH STUDIO_RUNNER_MAX_REPORT_BODY_BYTES
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
