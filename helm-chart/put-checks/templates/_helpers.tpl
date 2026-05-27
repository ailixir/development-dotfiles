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
