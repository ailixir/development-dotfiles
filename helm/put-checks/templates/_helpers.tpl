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
Backend selector labels.
*/}}
{{- define "put-checks.backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "put-checks.name" . }}-backend
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Frontend selector labels.
*/}}
{{- define "put-checks.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "put-checks.name" . }}-frontend
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Backend fullname.
*/}}
{{- define "put-checks.backend.fullname" -}}
{{ include "put-checks.fullname" . }}-backend
{{- end }}

{{/*
Frontend fullname.
*/}}
{{- define "put-checks.frontend.fullname" -}}
{{ include "put-checks.fullname" . }}-frontend
{{- end }}
