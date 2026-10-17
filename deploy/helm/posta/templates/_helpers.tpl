{{- define "posta.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}{{ .Release.Name | trunc 40 | trimSuffix "-" }}
{{- else -}}{{ printf "%s-%s" .Release.Name .Chart.Name | trunc 40 | trimSuffix "-" }}{{- end -}}
{{- end -}}

{{- define "posta.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "posta.selector" -}}
app.kubernetes.io/name: {{ .root.Chart.Name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "posta.image" -}}
{{- if .Values.image.digest -}}{{ .Values.image.repository }}@{{ .Values.image.digest }}
{{- else -}}{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}{{- end -}}
{{- end -}}

{{/* The Secret every app process reads: the operator's own, or the one this chart renders. */}}
{{- define "posta.secretName" -}}
{{- default (printf "%s-env" (include "posta.fullname" .)) .Values.secret.existingSecret -}}
{{- end -}}

{{/* Host of a URL value: the ingress hosts follow APP_BASE_URL and PUBLIC_API_URL. */}}
{{- define "posta.host" -}}
{{- if . -}}{{ (urlParse .).host }}{{- end -}}
{{- end -}}

{{/*
The workloads to render, as a dict of name -> spec. "all" runs api, worker and
web in one container (PROCESS=all); "split" runs each on its own so they scale
and roll independently. smtp, docs and mx are always separate and opt-in.
Ports: web 3000, api 3001 (config.port), docs 3002, smtp config.smtpPort, mx 2525.
*/}}
{{- define "posta.components" -}}
{{- $v := .Values -}}
{{- $c := dict -}}
{{- if eq $v.mode "all" -}}
{{- $_ := set $c "app" (dict "process" "all" "values" $v.app "ports" (list (dict "name" "web" "port" 3000) (dict "name" "api" "port" (int $v.config.port))) "probe" "app") -}}
{{- else -}}
{{- $_ := set $c "web" (dict "process" "web" "values" $v.web "ports" (list (dict "name" "http" "port" 3000)) "probe" "web") -}}
{{- $_ := set $c "api" (dict "process" "api" "values" $v.api "ports" (list (dict "name" "http" "port" (int $v.config.port))) "probe" "api") -}}
{{- $_ := set $c "worker" (dict "process" "worker" "values" $v.worker "ports" (list) "probe" "") -}}
{{- end -}}
{{- if $v.smtp.enabled -}}
{{- $_ := set $c "smtp" (dict "process" "smtp" "values" $v.smtp "ports" (list (dict "name" "smtp" "port" (int $v.config.smtpPort))) "probe" "tcp") -}}
{{- end -}}
{{- if $v.docs.enabled -}}
{{- $_ := set $c "docs" (dict "process" "docs" "values" $v.docs "ports" (list (dict "name" "http" "port" 3002)) "probe" "docs") -}}
{{- end -}}
{{- if $v.mx.enabled -}}
{{- $_ := set $c "mx" (dict "process" "mx" "values" $v.mx "ports" (list (dict "name" "smtp" "port" 2525)) "probe" "tcp") -}}
{{- end -}}
{{- toYaml $c -}}
{{- end -}}

{{/* Number of worker processes: each divides the SES send rate by it (WORKER_REPLICAS). */}}
{{- define "posta.workerReplicas" -}}
{{- if eq .Values.mode "all" -}}{{ .Values.app.replicas }}{{- else -}}{{ .Values.worker.replicas }}{{- end -}}
{{- end -}}

{{/* Services the ingress and the MX address. One each in both modes; in "all" both select the one app pod. */}}
{{- define "posta.webService" -}}{{ include "posta.fullname" . }}-web{{- end -}}
{{- define "posta.apiService" -}}{{ include "posta.fullname" . }}-api{{- end -}}

{{- define "posta.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}{{ default (include "posta.fullname" .) .Values.serviceAccount.name }}
{{- else -}}{{ default "default" .Values.serviceAccount.name }}{{- end -}}
{{- end -}}

{{/* The pod-level and container-level hardening every workload shares (the compose file's cap_drop/read_only/no-new-privileges). */}}
{{- define "posta.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 999
runAsGroup: 999
fsGroup: 999
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "posta.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end -}}

{{/* Writable paths a read-only root filesystem still needs (the compose tmpfs list). */}}
{{- define "posta.scratchMounts" -}}
- { name: tmp, mountPath: /tmp }
- { name: web-cache, mountPath: /app/apps/web/.next/cache }
- { name: docs-cache, mountPath: /app/apps/docs/.next/cache }
- { name: docs-source, mountPath: /app/apps/docs/.source }
{{- end -}}

{{- define "posta.scratchVolumes" -}}
- { name: tmp, emptyDir: { sizeLimit: 1Gi } }
- { name: web-cache, emptyDir: { sizeLimit: 1Gi } }
- { name: docs-cache, emptyDir: { sizeLimit: 1Gi } }
- { name: docs-source, emptyDir: { sizeLimit: 1Gi } }
{{- end -}}

{{/*
Probes for one container: .port, and .path for HTTP (empty: a TCP connect). The
startup probe gives a first boot up to ten minutes, which covers boot-time
migrations when the pre-upgrade hook is off; readiness and liveness wait for it.
*/}}
{{- define "posta.probes" -}}
{{- $handler := ternary (dict "tcpSocket" (dict "port" (int .port))) (dict "httpGet" (dict "path" .path "port" (int .port))) (eq .path "") -}}
startupProbe:
  {{- toYaml $handler | nindent 2 }}
  periodSeconds: 5
  failureThreshold: 120
readinessProbe:
  {{- toYaml $handler | nindent 2 }}
  periodSeconds: 10
  timeoutSeconds: 3
livenessProbe:
  {{- toYaml $handler | nindent 2 }}
  periodSeconds: 20
  timeoutSeconds: 5
  failureThreshold: 3
{{- end -}}
