---
name: chart-envfrom-dotted-keys
description: put-checks Helm `configOverrides` renders dotted ConfigMap keys consumed via envFrom — Kubernetes drops them silently, so the mechanism has never worked
metadata:
  type: project
---

`helm-chart/put-checks/templates/configmap.yaml` renders every `configOverrides` entry as a
ConfigMap **key**, and the api/worker/frontend containers consume that ConfigMap with
`envFrom: configMapRef`. A ConfigMap key may contain dots; an environment variable name may not.
Kubernetes skips any key that fails `IsCEnvIdentifier`, emits an `InvalidVariableNames` event on the
pod, and **starts the pod anyway**.

So `spring.datasource.hikari.maximum-pool-size`, `checks.scheduling.*` and
`checks.executor.source-limits.*` — **15 keys per value set, 13 distinct, in all four value sets** —
have never reached a process. Measured by story 10.18b, not inferred.

**Why:** story 10.18b put deployed configuration at the centre of five security controls, so it made
the mechanism a check rather than an assumption (AC-18) — and the check is **left RED on purpose**
in `studio-runner/test/deployment/envfrom-keys.test.ts`. Allowlisting the keys would produce a guard
that cannot fail; converting them is a deployment behaviour change in database and scheduler
subsystems no Studio story owns. Owner **@devops (Gage)**; the mechanism choice (env-name conversion
vs a mounted config file vs `SPRING_APPLICATION_JSON`) is **@architect (Aria)**'s.

**The escalated set is FROZEN in the test** (`ESCALATED_KEYS`, 13 keys, 15 occurrences — two render
into both the api and the worker ConfigMap) **and equality is asserted both ways per value set.**
That is a QA repair, not the original design: the first version scoped its discrimination control by
a naming allowlist, and a probe key matching none of the prefixes changed **nothing** — the
already-red assertions absorbed it. A permanently red assertion cannot also be a detector
([[vacuous-guard-shapes]] #20).

**How to apply:** `npm run test:deployment` in `studio-runner/` is expected to report **4 failed**,
one per value set, out of 181, and `ci/stages.md` stage 9 says so in a box. **A second red there is a
real failure** — and if the *escalated-set equality* tests go red, a new invalid key has been added
and the escalation does **not** cover it. Before adding any chart values key that a container must actually receive, give it a
`[A-Za-z_][A-Za-z0-9_]*` name and render it as a container `env` entry, not as a `configOverrides`
key. Related: [[vacuous-guard-shapes]], [[backend-check-baseline]]
