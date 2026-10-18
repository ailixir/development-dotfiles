# STUDIO-OBS-009 D2: AC-11 d alert specification (A15, R8.2 deferral d)

- **Author:** Gage (@devops). **Date:** 2026-10-18. **Status:** specification only. No alert is rendered, deployed or fired. The monitoring stack is not named anywhere in this repository, so per ruling A15 this is platform-neutral until Platform/SRE names it.
- **Legend:** [V] verified by reading the cited line today; [I] inference; [U] unrun, owner named.

## 1. What is alerted on

The runner's terminal-report client abandons a terminal result in exactly two places. Both write one error-level JSON line to stdout and increment the in-memory counter `runner.report.terminal_abandoned`:

| Event (`event` field) | Where | Meaning |
|---|---|---|
| `report.terminal_rejected` | `studio-runner/src/reporting/reportClient.ts:220` [V] | The API answered a terminal report with a non-retryable outcome (a 4xx other than 409). The runner stops retrying at once. Extra fields: `status` (HTTP status) or `reason` (`kind` of the non-response), `attempts`. |
| `report.terminal_abandoned` | `reportClient.ts:237` [V] | The retryable window or the attempt budget ran out. Extra field: `attempts`. |

Both carry the run identity fields `executionId`, `attemptId`, `admissionId`, `runnerInstanceId`, `runnerSequence` (`identityFieldsOf`, `server/logging.ts` `RunIdentity`) [V]. Nothing else about the run is allowed in a line, and the redactor runs on the serialized string [V `logging.ts:110`].

**Not in this alert:** `report.ownership_lost` (level warn, counter `runner.report.ownership_lost`, `reportClient.ts:161`) [V]. A 409 means the API says this runner no longer owns the attempt. That is not a lost terminal result, and alerting on it would page on every cancel race.

**There is no metrics endpoint.** The counters are in memory and are not exported: `grep` for `/metrics` and a Prometheus client in `studio-runner/src/server/` finds nothing [V, searched 2026-10-18]. So the alert source is the log line. A counter-based alert would first need a runner change (an endpoint or an exporter), which is outside 009 [I].

## 2. The rule

| Field | Value |
|---|---|
| Source | stdout of the container `studio-runner` in the runner pods. Selector available from the chart: pod label `app.kubernetes.io/component=studio-runner`, container name `studio-runner` [V, rendered manifest]. |
| Match | JSON log line whose `event` is `report.terminal_rejected` or `report.terminal_abandoned`. |
| Condition | at least 1 matching line in any 5-minute window |
| Group by | `executionId`, `runnerInstanceId`, namespace, pod |
| De-duplication | one notification per `executionId` per 15 minutes |
| Severity | production: page the Studio on-call (these are lost terminal results; the user sees a run settle through the reaper instead of the runner's own report). Staging: ticket. |
| Message must carry | the event name, `status` or `reason`, `attempts`, `executionId`, `attemptId`, pod. It must not carry anything else from the line. |
| Auto-resolve | when no matching line has been seen for 30 minutes |

A log-derived metric is an equivalent form. The platform defines `studio_runner_terminal_abandoned_total{event}` as the count of matching lines and alerts on `increase(...[5m]) >= 1`. The metric name is a suggestion, not something this repository emits.

## 3. What the alert does not prove, and the companion check

An alert firing says the runner gave up delivering a terminal. It does not say the run was settled. That is the **companion check, AC-11 e**: on the live stack, a rejected terminal report is settled by the reaper within `start_deadline` + one recovery poll. `start-deadline` defaults to 30 s (`STUDIO_START_DEADLINE:30s`, `backend/src/main/resources/application.yml:287`) [V]. The poll interval is the reaper's. Owner for the live check: @qa with @devops once a shared environment exists [U].

## 4. Owed, with owners

| Item | Owner | State |
|---|---|---|
| Name the monitoring stack and render the rule in its form | @devops with Platform/SRE | owed |
| Fire the alert on a synthetic rejected terminal (for example the API refusing the callback token, giving a 4xx) in a non-production environment | @devops/@qa | `UNRUN, no environment` |
| Page routing and on-call target | Platform/SRE | owed |
| Log forwarding of runner stdout to the stack | Platform/SRE | owed (the same forwarder as the SIEM stream, `studioAuditSiem`, if the platform uses one) |

## 5. Not claimed

- No alert rule exists in any chart template. The chart changes in this lane do not render one, because the stack is unknown.
- Nothing here was fired. The line shapes are read from source, not captured from a running runner.
